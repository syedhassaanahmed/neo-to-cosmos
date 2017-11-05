import { LoggerInstance } from "winston";
import { v1 as Neo4j } from "neo4j-driver";

export default class Neo {
    private readonly config: any;
    private readonly logger: LoggerInstance;

    constructor(config: any, logger: LoggerInstance) {
        this.config = config;
        this.logger = logger;
    }

    async getTotalNodes() {
        return await this.executeCypher("MATCH (n) RETURN COUNT(n)",
            records => records[0].get(0));
    }

    async getTotalRelationships() {
        return await this.executeCypher("MATCH (a)-[r]->(b) RETURN COUNT(r)",
            records => records[0].get(0));
    }

    async getNodes(index: number) {
        const nodeQuery = `MATCH (n) RETURN n ORDER BY ID(n) SKIP ${index} LIMIT ${this.config.pageSize}`;
        return await this.executeCypher(nodeQuery,
            records => records.map(record => record.get("n")));
    }

    async getRelationships(index: number) {
        const relationshipQuery = `MATCH (a)-[r]->(b) RETURN labels(a), r, labels(b) ORDER BY ID(r) SKIP ${index} LIMIT ${this.config.pageSize}`;
        return await this.executeCypher(relationshipQuery,
            records => records.map(record => {
                return {
                    a: record.get("labels(a)")[0],
                    r: record.get("r"),
                    b: record.get("labels(b)")[0]
                };
            }));
    }

    private async executeCypher(query: string, getResult: (records: Neo4j.Record[]) => any) {
        this.logger.debug(query);

        const driver = await Neo4j.driver(this.config.neo4j.bolt,
            Neo4j.auth.basic(this.config.neo4j.user, this.config.neo4j.pass));

        const session = driver.session();
        const records = (await session.run(query)).records;

        session.close();
        driver.close();

        return getResult(records);
    }
}