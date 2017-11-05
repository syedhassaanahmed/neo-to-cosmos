import * as Winston from "winston";
import * as DocumentDB from "documentdb-typescript";
import * as Bluebird from "bluebird";
import * as BulkImportSproc from "./bulkImport.js";
import * as Util from "util";

export default class Cosmos {
    private readonly config: any;
    private readonly logger: Winston.LoggerInstance;

    private readonly databaseLink: string;
    private readonly collectionLink: string;

    private readonly client: DocumentDB.Client;
    private documentClient: any;

    constructor(config: any, logger: Winston.LoggerInstance) {
        this.config = config;
        this.logger = logger;

        this.databaseLink = `dbs/${config.cosmosDB.database}`;
        this.collectionLink = `${this.databaseLink}/colls/${config.cosmosDB.collection}`;

        this.client = new DocumentDB.Client(config.cosmosDB.endpoint, config.cosmosDB.authKey);
        this.client.consistencyLevel = "Eventual";
    }

    async initialize() {
        await this.client.openAsync();
        this.documentClient = Bluebird.promisifyAll(this.client.documentClient);
    }

    private async createDatabaseIfNeeded() {
        try {
            await this.documentClient.createDatabaseAsync({
                id: this.config.cosmosDB.database
            });
        } catch (err) {
            this.logger.info(`Database ${this.config.cosmosDB.database} already exists`);
        }
    }

    async createCollectionIfNeeded() {
        await this.createDatabaseIfNeeded();

        try {
            // Lazy indexing boosts the write performance and lowers RU charge of each insert
            // and is ideal for bulk ingestion scenarios for primarily read-heavy collections
            await this.documentClient.createCollectionAsync(this.databaseLink, {
                id: this.config.cosmosDB.collection,
                indexingPolicy: { indexingMode: "lazy" }
            },
                { offerThroughput: this.config.cosmosDB.offerThroughput });
        } catch (err) {
            this.logger.info(`Collection ${this.config.cosmosDB.collection} already exists`);
        }

        this.createStoredProcedureIfNeeded();
    }

    async deleteCollection() {
        try {
            await this.documentClient.deleteCollectionAsync(this.collectionLink);
        } catch (err) {
            this.logger.info(`Collection ${this.config.cosmosDB.collection} does not exist`);
        }
    }

    private async createStoredProcedureIfNeeded() {
        try {
            await this.documentClient.createStoredProcedureAsync(this.collectionLink, BulkImportSproc);
        } catch (err) {
            this.logger.info(`Sproc '${BulkImportSproc.id}' already exist`);
        }
    }

    async bulkImport(docs: any[]) {
        this.logger.debug(Util.inspect(docs, false, undefined));
        const bulkImportSprocLink = `${this.collectionLink}/sprocs/${BulkImportSproc.id}`;

        // Sprocs don't support array arguments so we have to wrap it in an object
        await this.documentClient.executeStoredProcedureAsync(bulkImportSprocLink, { docs });
    }
}