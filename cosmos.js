import config from './config.json'
import { createClient } from 'gremlin'
import url from 'url'
import { DocumentClientWrapper as DocumentClient } from 'documentdb-q-promises'
import Log from 'log'

const log = new Log(config.logLevel)

// DocumentDB client
const documentClient = new DocumentClient(config.cosmosDB.endpoint,
    { masterKey: config.cosmosDB.authKey })

const databaseLink = `dbs/${config.cosmosDB.database}`

exports.deleteCollection = async () => {
    try {
        const collectionLink = `${databaseLink}/colls/${config.cosmosDB.collection}`
        await documentClient.deleteCollectionAsync(collectionLink)
    } catch (err) {
        log.info(`Collection ${config.cosmosDB.collection} does not exist`)
    }
}

exports.createCollectionIfNeeded = async () => {
    try {
        await documentClient.createDatabaseAsync({ id: config.cosmosDB.database })
    } catch (err) {
        log.info(`Database ${config.cosmosDB.database} already exists`)
    }

    try {
        await documentClient.createCollectionAsync(databaseLink,
            { id: config.cosmosDB.collection },
            { offerThroughput: config.cosmosDB.offerThroughput })
    } catch (err) {
        log.info(`Collection ${config.cosmosDB.collection} already exists`)
    }
}

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

exports.executeGremlin = query => {
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