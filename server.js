import config from './config.json'
import cosmos from './cosmos.js'
import neo from './neo.js'
import * as throttle from 'promise-parallel-throttle'
import cache from './cache.js'
import Log from 'log'

const log = new Log(config.logLevel)

const nodeIndexKey = 'nodeIndex'
const relationshipIndexKey = 'relationshipIndex'

const migrateData = async () => {
    await handleRestart()
    await cosmos.createCollectionIfNeeded()
    await createVertexes()
    await createEdges()
}

const handleRestart = async () => {
    if (process.argv[2] === 'restart') {
        log.info('starting fresh ...')

        await Promise.all([
            cosmos.deleteCollection(),
            cache.flush()
        ])
    }
}

const createVertexes = async () => {
    const nodeIndex = await cache.get(nodeIndexKey)
    let index = nodeIndex ? Number.parseInt(nodeIndex) : 0
    let neoNodes = []

    do {
        log.info('Node: ' + index)

        neoNodes = await neo.getNodes(index)
        if (neoNodes.length === 0)
            break

        const promises = neoNodes.map(neoNode => async () => {
            const cacheKey = neoNode.identity.toString()

            if (await cache.exists(cacheKey)) {
                log.info(`Skipping Node ${cacheKey}`)
            }
            else {
                await cosmos.executeGremlin(toGremlinVertex(neoNode))
                cache.set(cacheKey, '')
            }
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        index += config.pageSize
        cache.set(nodeIndexKey, index)

    } while (true)
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
    let neoRelationships = []

    do {
        log.info('Relationship: ' + index)

        neoRelationships = await neo.getRelationships(index)
        if (neoRelationships.length === 0)
            break

        const promises = neoRelationships.map(neoRelationship => async () => {
            const cacheKey = `${neoRelationship.start}_${neoRelationship.type}_${neoRelationship.end}`

            if (await cache.exists(cacheKey)) {
                log.info(`Skipping Relationship ${cacheKey}`)
            } else {
                await cosmos.executeGremlin(toGremlinEdge(neoRelationship))
                cache.set(cacheKey, '')
            }
        })

        await throttle.all(promises, {
            maxInProgress: config.threadCount, // we get 'Request rate too large' if this value is too large
            failFast: true
        })

        index += config.pageSize
        cache.set(relationshipIndexKey, index)

    } while (true)
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