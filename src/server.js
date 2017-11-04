import Log from 'log'
import Cosmos from './cosmos.js'
import Neo from './neo.js'
import Cache from './cache.js'
import uuidv4 from 'uuid/v4'
import {
    ArgumentParser
} from 'argparse'

// Parse cli arguments
let argsParser = new ArgumentParser({
    addHelp: true
})
argsParser.addArgument(
    ['-c', '--config'], {
        defaultValue: '../config.json',
        help: 'Provide config json file relative to the "src" folder'
    })
argsParser.addArgument(
    ['-r', '--restart'], {
        nargs: 0,
        help: 'Restarts data transfer by deleting Cosmos DB collection and flushing Redis cache'
    })
argsParser.addArgument(
    ['-t', '--total'], {
        defaultValue: 1,
        type: 'int',
        help: 'Total number of instances in case of distributed load'
    })
argsParser.addArgument(
    ['-i', '--instance'], {
        defaultValue: 0,
        type: 'int',
        help: 'Instance ID in case of distributed load'
    })
const args = argsParser.parseArgs()

// Set config defaults
const config = require(args.config)
config.logLevel = config.logLevel || 'info'
config.pageSize = config.pageSize || 100

const log = new Log(config.logLevel)
log.info(args)
log.info(config)

const cosmos = Cosmos(config, log)
const neo = Neo(config)
const cache = Cache(config)

const migrateData = async() => {
    await handleRestart()
    await cosmos.createCollectionIfNeeded()

    await distributeLoad()
    await createVertexes()
    await createEdges()
}

const handleRestart = async() => {
    if (args.restart) {
        await Promise.all([
            cosmos.deleteCollection(),
            cache.flush()
        ])
    }
}

let startNodeIndex = 0,
    startRelationshipIndex = 0,
    endNodeIndex = 0,
    endRelationshipIndex = 0

const distributeLoad = async() => {
    const totalNodes = await neo.getTotalNodes()
    const totalRelationships = await neo.getTotalRelationships()

    log.info(`Nodes = ${totalNodes}, Relationships = ${totalRelationships}`)

    startNodeIndex = Math.floor(totalNodes / args.total) * args.instance
    startRelationshipIndex = Math.floor(totalRelationships / args.total) * args.instance

    endNodeIndex = Math.ceil(totalNodes / args.total) * (args.instance + 1)
    endRelationshipIndex = Math.ceil(totalRelationships / args.total) * (args.instance + 1)

    log.info(`startNodeIndex = ${startNodeIndex}, startRelationshipIndex = ${startRelationshipIndex}`)
    log.info(`endNodeIndex = ${endNodeIndex}, endRelationshipIndex = ${endRelationshipIndex}`)
}

const nodeIndexKey = `nodeIndex_${args.instance}`
const createVertexes = async() => {
    const indexString = await cache.get(nodeIndexKey)
    let index = indexString ? Number.parseInt(indexString) : startNodeIndex
    let nodes = []

    while (true) {
        log.info(`Node: ${index}`)

        nodes = await neo.getNodes(index)
        if (nodes.length === 0 || index > endNodeIndex)
            break

        const documentVertices = nodes.map(node => toDocumentDBVertex(node))
        await cosmos.bulkImport(documentVertices)

        index += config.pageSize
        cache.set(nodeIndexKey, index)
    }
}

const toDocumentDBVertex = node => {
    let vertex = {
        id: node.identity.toString(),
        label: node.labels[0]
    }

    addProperties(vertex, node.properties)
    return vertex
}

const addProperties = (propertyBag, properties) => {
    for (const key of Object.keys(properties)) {
        // Some Neo4j datasets have 'id' as a property in addition to node.id()
        if (key.toLowerCase() === 'id')
            continue

        const propertyValues = properties[key]
        propertyBag[key] = []

        // Sometimes the value is itself an array
        if (Array.isArray(propertyValues)) {
            for (const propertyValue of propertyValues)
                addPropertyValue(propertyBag[key], propertyValue)
        } else {
            addPropertyValue(propertyBag[key], propertyValues)
        }
    }
}

const addPropertyValue = (property, propertyValue) => {
    property.push({
        id: uuidv4(),
        _value: propertyValue.toString()
    })
}

const relationshipIndexKey = `relationshipIndex_${args.instance}`
const createEdges = async() => {
    const indexString = await cache.get(relationshipIndexKey)
    let index = indexString ? Number.parseInt(indexString) : startRelationshipIndex
    let relationships = []

    while (true) {
        log.info(`Relationship: ${index}`)

        relationships = await neo.getRelationships(index)
        if (relationships.length === 0 || index > endRelationshipIndex)
            break

        const documentEdges = relationships.map(relationship => toDocumentDBEdge(relationship))
        await cosmos.bulkImport(documentEdges)

        index += config.pageSize
        cache.set(relationshipIndexKey, index)
    }
}

const toDocumentDBEdge = relationship => {
    let edge = {
        label: relationship.r.type,
        _isEdge: true,
        _vertexId: relationship.r.start.toString(),
        _vertexLabel: relationship.a,
        _sink: relationship.r.end.toString(),
        _sinkLabel: relationship.b
    }

    addProperties(edge, relationship.r.properties)
    return edge
}

migrateData().then(_ => log.info(`Migration completed for instance ${args.instance}.`))
    .catch(error => {
        log.error(error)
        process.exit()
    })