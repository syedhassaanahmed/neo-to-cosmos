import Arguments from "./arguments";
import { LoggerInstance } from "winston";
import Logger from "./logger";
import Cosmos from "./cosmos";
import { v1 as Neo4j } from "neo4j-driver";
import Neo from "./neo";
import Cache from "./cache";
import { v4 as Uuid } from "uuid";

if (process.env.NODE_ENV !== "production") {
    const dotenv: any = require("dotenv");
    dotenv.config();
}

const args = Arguments();

// Create Logger
const logger: LoggerInstance = Logger();
logger.info(args);

const pageSize = Number.parseInt(process.env.PAGE_SIZE || "100");

const cosmos = new Cosmos(logger);
const neo = new Neo(pageSize, logger);
const cache = new Cache();

const migrateData = async () => {
    await cosmos.initialize();
    await handleRestart();
    await cosmos.createCollectionIfNeeded();

    await distributeLoad();
    await createVertexes();
    await createEdges();
};

const handleRestart = async () => {
    if (args.restart) {
        await Promise.all([
            cosmos.deleteCollection(),
            cache.flush()
        ]);
    }
};

let startNodeIndex = 0,
    startRelationshipIndex = 0,
    endNodeIndex = 0,
    endRelationshipIndex = 0;

const distributeLoad = async () => {
    const totalNodes = await neo.getTotalNodes();
    const totalRelationships = await neo.getTotalRelationships();

    logger.info(`Nodes = ${totalNodes}, Relationships = ${totalRelationships}`);

    startNodeIndex = Math.floor(totalNodes / args.total) * args.instance;
    startRelationshipIndex = Math.floor(totalRelationships / args.total) * args.instance;

    endNodeIndex = Math.ceil(totalNodes / args.total) * (args.instance + 1);
    endRelationshipIndex = Math.ceil(totalRelationships / args.total) * (args.instance + 1);

    logger.info(`startNodeIndex = ${startNodeIndex}, startRelationshipIndex = ${startRelationshipIndex}`);
    logger.info(`endNodeIndex = ${endNodeIndex}, endRelationshipIndex = ${endRelationshipIndex}`);
};

const nodeIndexKey = `nodeIndex_${process.env.COSMOSDB_COLLECTION}_${args.instance}`;
const createVertexes = async () => {
    const indexString = await cache.get(nodeIndexKey);
    let index = indexString ? Number.parseInt(indexString) : startNodeIndex;
    let nodes: Neo4j.Node[] = [];

    while (true) {
        logger.info(`Node: ${index}`);

        nodes = await neo.getNodes(index);
        if (nodes.length === 0 || index > endNodeIndex)
            break;

        const documentVertices = nodes.map((node: Neo4j.Node) => toDocumentDBVertex(node));
        await cosmos.bulkImport(documentVertices);

        index += pageSize;
        cache.set(nodeIndexKey, index.toString());
    }
};

const toDocumentDBVertex = (node: Neo4j.Node) => {
    const vertex = {
        id: node.identity.toString(10),
        label: node.labels[0]
    };

    addVertexProperties(vertex, node.properties);
    return vertex;
};

const systemProperties = ["id", "_rid", "_self", "_ts", "_etag"];
const addVertexProperties = (propertyBag: any, properties: any) => {
    for (let key in properties) {
        const propertyValues = properties[key];

        if (systemProperties.indexOf(key.toLowerCase()) > -1)
            key += "_prop";

        propertyBag[key] = [];

        // Sometimes the value is itself an array
        if (Array.isArray(propertyValues)) {
            for (const propertyValue of propertyValues)
            addVertexPropertyValue(propertyBag[key], propertyValue);
        } else {
            addVertexPropertyValue(propertyBag[key], propertyValues);
        }
    }
};

const addVertexPropertyValue = (property: any[], propertyValue: any) => {
    property.push({
        id: Uuid(),
        _value: propertyValue.toString()
    });
};

const relationshipIndexKey = `relationshipIndex_${process.env.COSMOSDB_COLLECTION}_${args.instance}`;
const createEdges = async () => {
    const indexString = await cache.get(relationshipIndexKey);
    let index = indexString ? Number.parseInt(indexString) : startRelationshipIndex;
    let relationships = [];

    while (true) {
        logger.info(`Relationship: ${index}`);

        relationships = await neo.getRelationships(index);
        if (relationships.length === 0 || index > endRelationshipIndex)
            break;

        const documentEdges = relationships.map((relationship: any) => toDocumentDBEdge(relationship));
        await cosmos.bulkImport(documentEdges);

        index += pageSize;
        cache.set(relationshipIndexKey, index.toString());
    }
};

const toDocumentDBEdge = (relationship: any) => {
    const r: Neo4j.Relationship = relationship.r;

    const edge = {
        label: r.type,
        _isEdge: true,
        _vertexId: r.start.toString(10),
        _vertexLabel: relationship.a,
        _sink: r.end.toString(10),
        _sinkLabel: relationship.b
    };

    addEdgeProperties(edge, r.properties);
    return edge;
};

const addEdgeProperties = (propertyBag: any, properties: any) => {
    for (let key in properties) {
        const propertyValue = properties[key].toString();

        if (systemProperties.indexOf(key.toLowerCase()) > -1)
            key += "_prop";

        propertyBag[key] = propertyValue;
    }
};

migrateData().then(_ => {
    logger.info(`Migration completed for instance ${args.instance}`);
    process.exit();
}).catch(error => {
    logger.error(error);
    process.exit();
});