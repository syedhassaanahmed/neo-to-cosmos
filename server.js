import { createClient } from 'gremlin'
import config from './config.json'
import neo4j from 'neo4j-driver'
import * as throttle from 'promise-parallel-throttle'
import url from 'url'
import {DocumentClientWrapper as DocumentClient} from 'documentdb-q-promises'

const graphEndpoint = url.parse(config.cosmosDB.endpoint).hostname.replace('.documents.azure.com', 
    '.graphs.azure.com')

const gremlinClient = createClient(443, graphEndpoint,
    {
        'session': false,
        'ssl': true,
        'user': `/dbs/${config.cosmosDB.database}/colls/${config.cosmosDB.collection}`,
        'password': config.cosmosDB.authKey
    })

let cleanupTime, vertexesTime, edgesTime

const migrateData = async () => {
    const start = process.hrtime()

    await cleanupCosmosData()
    await createVertexes()
    await createEdges()

    console.log(`Cleanup time: ${cleanupTime} sec`)
    console.log(`Vertexes time: ${vertexesTime} sec`)
    console.log(`Edges time: ${edgesTime} sec`)
    console.log(`Total time: ${elapsedSeconds(start)} sec`)
}

const cleanupCosmosData = async () => {
    const start = process.hrtime()

    const documentClient = new DocumentClient(config.cosmosDB.endpoint, 
        {masterKey: config.cosmosDB.authKey})

    const databaseLink = `dbs/${config.cosmosDB.database}`

    try {
        await documentClient.deleteDatabaseAsync(databaseLink)
    } catch (err) {
        console.log(`Database ${config.cosmosDB.database} does not exist`)
    }

    await documentClient.createDatabaseAsync({ id: config.cosmosDB.database })
    await documentClient.createCollectionAsync(databaseLink, { id: config.cosmosDB.collection })

    cleanupTime = elapsedSeconds(start)
}

const executeGremlin = query => {
    console.log(query)

    const promise = new Promise((resolve, reject) =>
        gremlinClient.execute(query,
            (err, results) => (err ? reject(err) : resolve(results)),
        ))

    return promise
}

const createVertexes = async () => {
    const start = process.hrtime()

    const neoVertexes = await readNeoVertexes()
    const promises = neoVertexes.map(v => () => executeGremlin(toGremlinVertex(v)))

    await throttle.all(promises, {
        maxInProgress: 2, // we get 'Request rate too large' on a higher value
        failFast: true
    })

    vertexesTime = elapsedSeconds(start)
}

const elapsedSeconds = start => {
    const end = process.hrtime(start)
    return ((end[0] * 1e9) + end[1]) / 1e9
}

const readNeoVertexes = async () => {
    let driver = await createNeo4jDriver()
    let session = driver.session()

    const vertexes = await session.run('MATCH (n) RETURN n')

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
        const propValue = neoVertex.properties[key].toString().replace(/'/g, '')
        vertex += `.property('${key}', '${propValue}')`
    }

    return vertex
}

const createEdges = async () => {
    const start = process.hrtime()

    const neoEdges = await readNeoEdges()
    const promises = neoEdges.map(e => () => executeGremlin(toGremlinEdge(e)))

    await throttle.all(promises, {
        maxInProgress: 2, // we get 'Request rate too large' on a higher value
        failFast: true
    })

    edgesTime = elapsedSeconds(start)
}

const readNeoEdges = async () => {
    let driver = await createNeo4jDriver()
    let session = driver.session()

    const edges = await session.run('MATCH (a)-[r]->(b) RETURN r')

    session.close()
    driver.close()

    return edges.records.map(record => record.get('r'))
}

const toGremlinEdge = neoEdge => {
    let edge = `g.V('${neoEdge.start}')`
    edge += `.addE('${neoEdge.type}')`
    for (const key of Object.keys(neoEdge.properties)) {
        const propValue = neoEdge.properties[key].toString().replace(/'/g, '')
        edge += `.property('${key}', '${propValue}')`
    }
    edge += `.to(g.V('${neoEdge.end}'))`
    return edge
}

migrateData().then(_ => process.exit()).catch(error => {
    console.error(error)
    process.exit()
})