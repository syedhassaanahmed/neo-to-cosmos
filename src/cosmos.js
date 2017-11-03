import {
    DocumentClientWrapper as DocumentClient
} from 'documentdb-q-promises'
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
            await documentClient.deleteStoredProcedureAsync(collectionLink, bulkImportSproc)
        } catch (err) {
            log.info(`Sproc '${bulkImportSproc.id}' does not exist`)
        }

        await documentClient.createStoredProcedureAsync(collectionLink, bulkImportSproc)
    }

    module.bulkImport = async docs => {
        log.debug(util.inspect(docs, false, null))

        // Sprocs don't support array arguments so we have to wrap it in an object
        await documentClient.executeStoredProcedureAsync(bulkImportSprocLink, {docs})
    }

    return module
}