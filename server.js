import { createClient } from 'gremlin'
import config from './config.json'
import neo4j from 'neo4j-driver'
import * as throttle from 'promise-parallel-throttle'
import url from 'url'
import { DocumentClientWrapper as DocumentClient } from 'documentdb-q-promises'
import Log from 'log'
import redis from 'redis'
import bluebird from 'bluebird'
bluebird.promisifyAll(redis.RedisClient.prototype)

var log = new Log(config.logLevel);

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

let vertexesTime, edgesTime
const pageSize = 100

const migrateData = async () => {
    const start = process.hrtime()

    if (process.argv[2] === 'restart') {
        await startFresh()
    }

    await createCosmosCollectionIfNeeded()
    await createVertexes()
    await createEdges()

    log.info(`Vertexes time: ${vertexesTime} sec`)
    log.info(`Edges time: ${edgesTime} sec`)
    log.info(`Total time: ${elapsedSeconds(start)} sec`)
}

const startFresh = async () => {
    log.info('starting fresh ...')

    try {
        await documentClient.deleteDatabaseAsync(databaseLink)
    } catch (err) {
        log.error(`Database ${config.cosmosDB.database} does not exist`)
    }

    await redisClient.flushdbAsync()
}

const createCosmosCollectionIfNeeded = async () => {
    try {
        await documentClient.createDatabaseAsync({ id: config.cosmosDB.database })
    } catch(err) {
        log.error(`Database ${config.cosmosDB.database} already exists`)
    }

    try {
        await documentClient.createCollectionAsync(databaseLink, 
            { id: config.cosmosDB.collection }, 
            {offerThroughput: config.cosmosDB.offerThroughput})            
    } catch (err) {
        log.error(`Collection ${config.cosmosDB.collection} already exists`)
    }
}

const executeGremlin = query => {
    log.info(query)

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
    const start = process.hrtime()

    let index = 0
    let neoVertexes = await readNeoVertexes(index)

    while (neoVertexes.length > 0) {
        const promises = neoVertexes.map(neoVertex => async () => {
            const cacheKey = neoVertex.identity.toString()
            
            if (await redisClient.existsAsync(cacheKey)) {
                log.info(`Skipping vertex ${cacheKey}`)
            }
            else {
                await executeGremlin(toGremlinVertex(neoVertex))
                await redisClient.setAsync(cacheKey, '')
            }
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        const nextIndex = ++index * pageSize
        log.notice(nextIndex)
        neoVertexes = await readNeoVertexes(nextIndex)
    }

    vertexesTime = elapsedSeconds(start)
}

const elapsedSeconds = start => {
    const end = process.hrtime(start)
    return ((end[0] * 1e9) + end[1]) / 1e9
}

const readNeoVertexes = async index => {
    const driver = await createNeo4jDriver()
    const session = driver.session()

    const vertexQuery = `MATCH (n) RETURN n skip ${index} limit ${pageSize}`
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
    const start = process.hrtime()

    let index = 0
    let neoEdges = await readNeoEdges(index)

    while (neoEdges.length > 0) {
        const promises = neoEdges.map(neoEdge => async () => {
            const cacheKey = `${neoEdge.start}_${neoEdge.type}_${neoEdge.end}`

            if (await redisClient.existsAsync(cacheKey)) {
                log.info(`Skipping edge ${cacheKey}`)
            } else {
                await executeGremlin(toGremlinEdge(neoEdge))            
                await redisClient.setAsync(cacheKey, '')
            }            
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        const nextIndex = ++index * pageSize
        log.notice(nextIndex)
        neoEdges = await readNeoEdges(nextIndex)
    }

    edgesTime = elapsedSeconds(start)
}

const readNeoEdges = async (index) => {
    const driver = await createNeo4jDriver()
    const session = driver.session()

    const edgeQuery = `MATCH (a)-[r]->(b) RETURN r SKIP ${index} LIMIT ${pageSize}`

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
    log.error(error)
    closeApp()
})

const closeApp = () => {
    redisClient.quit()
    process.exit()
}