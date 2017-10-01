import { createClient } from 'gremlin'
import config from './config.json'
import neo from './neo.js'
import * as throttle from 'promise-parallel-throttle'
import url from 'url'
import { DocumentClientWrapper as DocumentClient } from 'documentdb-q-promises'
import cache from './cache.js'
import Log from 'log'

const log = new Log(config.logLevel)

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

const nodeIndexKey = 'nodeIndex'
const relationshipIndexKey = 'relationshipIndex'

const migrateData = async () => {
    await handleRestart()
    await createCosmosCollectionIfNeeded()
    await createVertexes()
    await createEdges()
}

const handleRestart = async () => {
    if (process.argv[2] === 'restart') {
        log.info('starting fresh ...')
        
        try {
            const collectionLink = `${databaseLink}/colls/${config.cosmosDB.collection}`
            await documentClient.deleteCollectionAsync(collectionLink)
        } catch (err) {
            log.info(`Collection ${config.cosmosDB.collection} does not exist`)
        }

        await cache.flush()
    }
}

const createCosmosCollectionIfNeeded = async () => {
    try {
        await documentClient.createDatabaseAsync({ id: config.cosmosDB.database })
    } catch(err) {
        log.info(`Database ${config.cosmosDB.database} already exists`)
    }

    try {
        await documentClient.createCollectionAsync(databaseLink, 
            { id: config.cosmosDB.collection }, 
            {offerThroughput: config.cosmosDB.offerThroughput})
    } catch (err) {
        log.info(`Collection ${config.cosmosDB.collection} already exists`)
    }
}

const executeGremlin = query => {
    log.debug(query)

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
    const nodeIndex = await cache.get(nodeIndexKey)
    let index = nodeIndex ? Number.parseInt(nodeIndex) : 0
    let neoNodes = await neo.getNodes(index)

    while (neoNodes.length > 0) {
        const promises = neoNodes.map(neoNode => async () => {
            const cacheKey = neoNode.identity.toString()
            
            if (await cache.exists(cacheKey)) {
                log.info(`Skipping Node ${cacheKey}`)
            }
            else {
                await executeGremlin(toGremlinVertex(neoNode))
                cache.set(cacheKey, '')
            }
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        cache.set(nodeIndexKey, ++index)
        const nextIndex = index * config.pageSize
        log.info('Node: ' + nextIndex)
        neoNodes = await neo.getNodes(nextIndex)
    }
}

const toGremlinVertex = neoNode => {
    let vertex = `g.addV('${neoNode.labels[0]}')`
    vertex += `.property('id', '${neoNode.identity}')`

    for (const key of Object.keys(neoNode.properties)) {
        const propValue = getPropertyValue(neoNode.properties[key])
        vertex += `.property('${key}', '${propValue}')`
    }

    return vertex
}

const getPropertyValue = property => {
    return property.toString()
        .replace(/[']/g, '\\\'')
        .replace(/[’]/g, '\\\’')
        .replace(/[`]/g, '%60')
        .replace(/["]/g, '\\\"')
        .replace(/[“]/g, '\\\“')
        .replace(/[”]/g, '\\\”')
}

const createEdges = async () => {
    const relationshipIndex = await cache.get(relationshipIndexKey)
    let index = relationshipIndex ? Number.parseInt(relationshipIndex) : 0
    let neoRelationships = await neo.getRelationships(index)

    while (neoRelationships.length > 0) {
        const promises = neoRelationships.map(neoRelationship => async () => {
            const cacheKey = `${neoRelationship.start}_${neoRelationship.type}_${neoRelationship.end}`

            if (await cache.exists(cacheKey)) {
                log.info(`Skipping Relationship ${cacheKey}`)
            } else {
                await executeGremlin(toGremlinEdge(neoRelationship))
                cache.set(cacheKey, '')
            }            
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        cache.set(relationshipIndexKey, ++index)
        const nextIndex = index * config.pageSize
        log.info('Relationship: ' + nextIndex)
        neoRelationships = await neo.getRelationships(nextIndex)
    }
}

const toGremlinEdge = neoRelationship => {
    let edge = `g.V('${neoRelationship.start}')`
    edge += `.addE('${neoRelationship.type}')`
    for (const key of Object.keys(neoRelationship.properties)) {
        const propValue = getPropertyValue(neoRelationship.properties[key])
        edge += `.property('${key}', '${propValue}')`
    }
    edge += `.to(g.V('${neoRelationship.end}'))`
    return edge
}

migrateData().then(_ => process.exit()).catch(error => {
    log.error(error)
    process.exit()
})