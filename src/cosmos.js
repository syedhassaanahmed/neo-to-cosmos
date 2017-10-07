import {
    createClient
} from 'gremlin'
import {
    DocumentClientWrapper as DocumentClient
} from 'documentdb-q-promises'
import url from 'url'

export default function (config, log) {
    let module = {}

    const documentClient = new DocumentClient(config.cosmosDB.endpoint, {
        masterKey: config.cosmosDB.authKey
    })

    const databaseLink = `dbs/${config.cosmosDB.database}`
    const collectionLink = `${databaseLink}/colls/${config.cosmosDB.collection}`

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
            await documentClient.createCollectionAsync(databaseLink, {
                id: config.cosmosDB.collection
            }, {
                offerThroughput: config.cosmosDB.offerThroughput
            })
        } catch (err) {
            log.info(`Collection ${config.cosmosDB.collection} already exists`)
        }
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

    return module
}