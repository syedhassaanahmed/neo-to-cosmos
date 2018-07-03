import { Logger } from "winston";
import { Client } from "documentdb-typescript";
import { promisifyAll } from "bluebird";
import * as BulkImportSproc from "./bulkImport.js";

export default class Cosmos {
    private readonly logger: Logger;

    private readonly database: string;
    private readonly collection: string;

    private readonly databaseLink: string;
    private readonly collectionLink: string;

    private readonly client: Client;
    private documentClient: any;

    constructor(logger: Logger) {
        this.logger = logger;

        this.database = process.env.COSMOSDB_DATABASE;
        this.collection = process.env.COSMOSDB_COLLECTION;

        this.databaseLink = `dbs/${this.database}`;
        this.collectionLink = `${this.databaseLink}/colls/${this.collection}`;

        this.client = new Client(process.env.COSMOSDB_ENDPOINT, process.env.COSMOSDB_KEY);
        this.client.consistencyLevel = "Eventual";
    }

    initialize = async () => {
        await this.client.openAsync();
        this.documentClient = promisifyAll(this.client.documentClient);
    }

    private createDatabaseIfNeeded = async () => {
        try {
            await this.documentClient.createDatabaseAsync({
                id: this.database
            });
        } catch (err) {
            this.logger.info(`Database ${this.database} already exists`);
        }
    }

    createCollectionIfNeeded = async () => {
        await this.createDatabaseIfNeeded();

        try {
            // Lazy indexing boosts the write performance and lowers RU charge of each insert
            // and is ideal for bulk ingestion scenarios for primarily read-heavy collections
            await this.documentClient.createCollectionAsync(this.databaseLink, {
                id: this.collection,
                indexingPolicy: { indexingMode: "lazy" }
            },
                { offerThroughput: process.env.COSMOSDB_RU || "400" });
        } catch (err) {
            this.logger.info(`Collection ${this.collection} already exists`);
        }

        this.createStoredProcedureIfNeeded();
    }

    deleteCollection = async () => {
        try {
            await this.documentClient.deleteCollectionAsync(this.collectionLink);
        } catch (err) {
            this.logger.info(`Collection ${this.collection} does not exist`);
        }
    }

    private createStoredProcedureIfNeeded = async () => {
        try {
            await this.documentClient.createStoredProcedureAsync(this.collectionLink, BulkImportSproc);
        } catch (err) {
            this.logger.info(`Sproc '${BulkImportSproc.id}' already exist`);
        }
    }

    bulkImport = async (docs: any[]) => {
        // This is to avoid unnecessary serialization of document batches in case of level "info"
        if (this.logger.level === "debug")
            this.logger.debug(JSON.stringify(docs));

        const bulkImportSprocLink = `${this.collectionLink}/sprocs/${BulkImportSproc.id}`;

        // Sprocs don't support array arguments so we have to wrap it in an object
        await this.documentClient.executeStoredProcedureAsync(bulkImportSprocLink, { docs });
    }
}