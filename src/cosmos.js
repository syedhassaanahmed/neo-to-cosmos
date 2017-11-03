import {
    createClient
} from 'gremlin'
import {
    DocumentClientWrapper as DocumentClient
} from 'documentdb-q-promises'
import url from 'url'
import util from 'util'
import bulkImportSproc from './bulkImport.js'

export default function (config, log) {
    let module = {}

    const documentClient = new DocumentClient(config.cosmosDB.endpoint, {
        masterKey: config.cosmosDB.authKey
    })

    const databaseLink = `dbs/${config.cosmosDB.database}`
    const collectionLink = `${databaseLink}/colls/${config.cosmosDB.collection}`
    const bulkImportSprocLink = `${collectionLink}/sprocs/${bulkImportSproc.id}`

    module.deleteCollection = async() => {
        try {
            await documentClient.deleteCollectionAsync(collectionLink)
        } catch (err) {
            log.info(`Collection ${config.cosmosDB.collection} does not exist`)
        }
    }

    module.createCollectionIfNeeded = async() => {
        try {
            await documentClient.createDatabaseAsync({
                id: config.cosmosDB.database
            })
        } catch (err) {
            log.info(`Database ${config.cosmosDB.database} already exists`)
        }

        try {
            // Lazy indexing boosts the write performance and lowers RU charge of each insert 
            // and is ideal for bulk ingestion scenarios for primarily read-heavy collections
            await documentClient.createCollectionAsync(databaseLink, {
                id: config.cosmosDB.collection,
                indexingPolicy: {
                    indexingMode: 'lazy'
                }
            }, {
                offerThroughput: config.cosmosDB.offerThroughput
            })
        } catch (err) {
            log.info(`Collection ${config.cosmosDB.collection} already exists`)
        }

        await createStoredProcedure()
    }

    const createStoredProcedure = async() => {
        try {
            await documentClient.createStoredProcedureAsync(collectionLink, bulkImportSproc)
        } catch (err) {
            log.info(`Sproc '${bulkImportSproc.id}' already exists`)
        }
    }

    module.bulkImport = async docs => {
        log.debug(util.inspect(docs, false, null))

        // Sprocs don't support array arguments so we have to wrap it in an object
        await documentClient.executeStoredProcedureAsync(bulkImportSprocLink, {docs})
    }

    const graphEndpoint = url.parse(config.cosmosDB.endpoint).hostname.replace('.documents.azure.com',
        '.graphs.azure.com')

    const gremlinClient = createClient(443, graphEndpoint, {
        'session': true,
        'ssl': true,
        'user': '/' + collectionLink,
        'password': config.cosmosDB.authKey
    })

    module.executeGremlin = query => {
        log.debug(query)

        const promise = new Promise((resolve, reject) =>
            gremlinClient.execute(query,
                async(err, results) => {
                    if (err && !err.message.includes('Resource with specified id or name already exists')) {

                        //Retry in case of RU throttle
                        if (err.message.includes('Request rate is large')) {
                            log.debug('Request rate is large, retrying...')
                            await module.executeGremlin(query)
                        } else {
                            reject(err)
                            return
                        }
                    }

                    resolve(results)
                },
            ))

        return promise
    }

    return module
}