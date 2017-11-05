import * as Winston from "Winston";
import Cosmos from "./cosmos";
import Neo from "./neo";
import { v1 as Neo4j } from "neo4j-driver";
import Cache from "./cache";
import { v4 as uuid } from "uuid";
import * as ArgParse from "argparse";

// Parse cli arguments
const argParseOptions: ArgParse.ArgumentParserOptions = { addHelp: true };
const argsParser = new ArgParse.ArgumentParser(argParseOptions);
argsParser.addArgument(
    ["-c", "--config"], {
        defaultValue: "../config.json",
        help: 'Provide config json file relative to the "src" folder'
    });
argsParser.addArgument(
    ["-r", "--restart"], {
        nargs: 0,
        help: "Restarts data transfer by deleting Cosmos DB collection and flushing Redis cache"
    });
argsParser.addArgument(
    ["-t", "--total"], {
        defaultValue: 1,
        type: "int",
        help: "Total number of instances in case of distributed load"
    });
argsParser.addArgument(
    ["-i", "--instance"], {
        defaultValue: 0,
        type: "int",
        help: "Instance ID in case of distributed load"
    });
const args = argsParser.parseArgs();

// Set config defaults
const config = require(args.config);
config.logLevel = config.logLevel || "info";
config.pageSize = config.pageSize || 100;

const logger = new (Winston.Logger)({
    level: config.logLevel,
    transports: [
        new (Winston.transports.Console)(),
        new (Winston.transports.File)({ filename: "neo2cosmos.log" })
    ]
});
logger.info(args);
logger.info(config);

const cosmos = new Cosmos(config, logger);
const neo = new Neo(config);
const cache = new Cache(config);

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

const nodeIndexKey = `nodeIndex_${args.instance}`;
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

        index += config.pageSize;
        cache.set(nodeIndexKey, index.toString());
    }
};

const toDocumentDBVertex = (node: Neo4j.Node) => {
    const vertex = {
        id: node.identity.toString(10),
        label: node.labels[0]
    };

    addProperties(vertex, node.properties);
    return vertex;
};

const addProperties = (propertyBag: any, properties: any) => {
    for (const key of Object.keys(properties)) {
        // Some Neo4j datasets have 'id' as a property in addition to node.id()
        if (key.toLowerCase() === "id")
            continue;

        const propertyValues = properties[key];
        propertyBag[key] = [];

        // Sometimes the value is itself an array
        if (Array.isArray(propertyValues)) {
            for (const propertyValue of propertyValues)
                addPropertyValue(propertyBag[key], propertyValue);
        } else {
            addPropertyValue(propertyBag[key], propertyValues);
        }
    }
};

const addPropertyValue = (property: any[], propertyValue: any) => {
    property.push({
        id: uuid(),
        _value: propertyValue.toString()
    });
};

const relationshipIndexKey = `relationshipIndex_${args.instance}`;
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

        index += config.pageSize;
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

    addProperties(edge, r.properties);
    return edge;
};

migrateData().then(_ => logger.info(`Migration completed for instance ${args.instance}`))
    .catch(error => {
        logger.error(error);
        process.exit();
    });