import { createClient } from 'gremlin'
import config from './config.json'
import neo4j from 'neo4j-driver'
import * as throttle from 'promise-parallel-throttle'
import url from 'url'
import { DocumentClientWrapper as DocumentClient } from 'documentdb-q-promises'

import redis from 'redis'
import bluebird from 'bluebird'
bluebird.promisifyAll(redis.RedisClient.prototype)

// Graph client
const graphEndpoint = url.parse(config.cosmosDB.endpoint).hostname.replace('.documents.azure.com',
    '.graphs.azure.com')
const gremlinClient = createClient(443, graphEndpoint,
    {
        'session': false,
        'ssl': true,
        'user': `/dbs/${config.cosmosDB.database}/colls/${config.cosmosDB.collection}`,
        'password': config.cosmosDB.authKey
    })

// DocumentDB client
const documentClient = new DocumentClient(config.cosmosDB.endpoint,
    { masterKey: config.cosmosDB.authKey })
const databaseLink = `dbs/${config.cosmosDB.database}`

// Redis client
const redisClient = redis.createClient({url: config.redisUrl})

const vertexIndexKey = 'vertexIndex'
const edgeIndexKey = 'edgeIndex'

const migrateData = async () => {
    if (process.argv[2] === 'restart') {
        await startFresh()
    }

    await createCosmosCollectionIfNeeded()
    await createVertexes()
    await createEdges()
}

const startFresh = async () => {
    console.log('starting fresh ...')

    try {
        await documentClient.deleteDatabaseAsync(databaseLink)
    } catch (err) {
        console.log(`Database ${config.cosmosDB.database} does not exist`)
    }

    await redisClient.flushdbAsync()
}

const createCosmosCollectionIfNeeded = async () => {
    try {
        await documentClient.createDatabaseAsync({ id: config.cosmosDB.database })
    } catch(err) {
        console.log(`Database ${config.cosmosDB.database} already exists`)
    }

    try {
        await documentClient.createCollectionAsync(databaseLink, 
            { id: config.cosmosDB.collection }, 
            {offerThroughput: config.cosmosDB.offerThroughput})            
    } catch (err) {
        console.log(`Collection ${config.cosmosDB.collection} already exists`)
    }
}

const executeGremlin = query => {
    console.log(query)

    const promise = new Promise((resolve, reject) =>
        gremlinClient.execute(query,
            (err, results) => {
                if (err && !err.message.includes('Resource with specified id or name already exists')) {
                    reject(err)
                    return
                }
                
                resolve(results)
            },
        ))

    return promise
}

const createVertexes = async () => {
    const vertexIndex = await redisClient.getAsync(vertexIndexKey)
    let index = vertexIndex ? Number.parseInt(vertexIndex) : 0
    let neoVertexes = await readNeoVertexes(index)

    while (neoVertexes.length > 0) {
        const promises = neoVertexes.map(neoVertex => async () => {
            const cacheKey = neoVertex.identity.toString()
            
            if (await redisClient.existsAsync(cacheKey)) {
                console.log(`Skipping vertex ${cacheKey}`)
            }
            else {
                await executeGremlin(toGremlinVertex(neoVertex))
                redisClient.set(cacheKey, '')
            }
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        redisClient.set(vertexIndexKey, ++index)
        const nextIndex = index * config.pageSize
        console.log(nextIndex)
        neoVertexes = await readNeoVertexes(nextIndex)
    }
}

const elapsedSeconds = start => {
    return ((end[0] * 1e9) + end[1]) / 1e9
}

const readNeoVertexes = async index => {
    const driver = await createNeo4jDriver()
    const session = driver.session()

    const vertexQuery = `MATCH (n) RETURN n ORDER BY ID(n) SKIP ${index} LIMIT ${config.pageSize}`
    const vertexes = await session.run(vertexQuery)

    session.close()
    driver.close()

    return vertexes.records.map(record => record.get('n'))
}

const createNeo4jDriver = async () => {
    return await neo4j.driver(config.neo4j.bolt,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.pass))
}

const toGremlinVertex = neoVertex => {
    let vertex = `g.addV('${neoVertex.labels[0]}')`
    vertex += `.property('id', '${neoVertex.identity}')`

    for (const key of Object.keys(neoVertex.properties)) {
        const propValue = neoVertex.properties[key].toString().replace(/['’`"“”]/g, '')
        vertex += `.property('${key}', '${propValue}')`
    }

    return vertex
}

const createEdges = async () => {
    const edgeIndex = await redisClient.getAsync(edgeIndexKey)
    let index = edgeIndex ? Number.parseInt(edgeIndex) : 0
    let neoEdges = await readNeoEdges(index)

    while (neoEdges.length > 0) {
        const promises = neoEdges.map(neoEdge => async () => {
            const cacheKey = `${neoEdge.start}_${neoEdge.type}_${neoEdge.end}`

            if (await redisClient.existsAsync(cacheKey)) {
                console.log(`Skipping edge ${cacheKey}`)
            } else {
                await executeGremlin(toGremlinEdge(neoEdge))            
                redisClient.set(cacheKey, '')
            }            
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        redisClient.set(edgeIndexKey, ++index)
        const nextIndex = index * config.pageSize
        console.log(nextIndex)
        neoEdges = await readNeoEdges(nextIndex)
    }
}

const readNeoEdges = async (index) => {
    const driver = await createNeo4jDriver()
    const session = driver.session()

    const edgeQuery = `MATCH (a)-[r]->(b) RETURN r ORDER BY ID(r) SKIP ${index} LIMIT ${config.pageSize}`

    const edges = await session.run(edgeQuery)

    session.close()
    driver.close()

    return edges.records.map(record => record.get('r'))
}

const toGremlinEdge = neoEdge => {
    let edge = `g.V('${neoEdge.start}')`
    edge += `.addE('${neoEdge.type}')`
    for (const key of Object.keys(neoEdge.properties)) {
        const propValue = neoEdge.properties[key].toString().replace(/['’`"“”]/g, '')
        edge += `.property('${key}', '${propValue}')`
    }
    edge += `.to(g.V('${neoEdge.end}'))`
    return edge
}

migrateData().then(_ => closeApp()).catch(error => {    
    console.error(error)
    closeApp()
})

const closeApp = () => {
    redisClient.quit()
    process.exit()
}