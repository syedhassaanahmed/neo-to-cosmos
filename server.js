import { createClient } from "gremlin";
import config from "./config.json";
import neo4j from "neo4j-driver";
import * as throttle from "promise-parallel-throttle";
import url from "url";
import { DocumentClientWrapper as DocumentClient } from "documentdb-q-promises";

const graphEndpoint = url
  .parse(config.cosmosDB.endpoint)
  .hostname.replace(".documents.azure.com", ".graphs.azure.com");

const gremlinClient = createClient(443, graphEndpoint, {
  session: false,
  ssl: true,
  user: `/dbs/${config.cosmosDB.database}/colls/${config.cosmosDB.collection}`,
  password: config.cosmosDB.authKey
});

let cleanupTime, vertexesTime, edgesTime;
let pageSize = 100;

const migrateData = async () => {
  const start = process.hrtime();

  await cleanupCosmosData();
  await createVertexes();
  await createEdges();

  console.log(`Cleanup time: ${cleanupTime} sec`);
  console.log(`Vertexes time: ${vertexesTime} sec`);
  console.log(`Edges time: ${edgesTime} sec`);
  console.log(`Total time: ${elapsedSeconds(start)} sec`);
};

const cleanupCosmosData = async () => {
  const start = process.hrtime();

  const documentClient = new DocumentClient(config.cosmosDB.endpoint, {
    masterKey: config.cosmosDB.authKey
  });

  const databaseLink = `dbs/${config.cosmosDB.database}`;

  try {
    await documentClient.deleteDatabaseAsync(databaseLink);
  } catch (err) {
    console.log(`Database ${config.cosmosDB.database} does not exist`);
  }

  await documentClient.createDatabaseAsync({ id: config.cosmosDB.database });
  await documentClient.createCollectionAsync(databaseLink, {
    id: config.cosmosDB.collection
  });

  cleanupTime = elapsedSeconds(start);
};

const executeGremlin = query => {
  //   console.log(query);

  const promise = new Promise((resolve, reject) =>
    gremlinClient.execute(
      query,
      (err, results) => (err ? reject(err) : resolve(results))
    )
  );

  return promise;
};

const createVertexes = async () => {
  console.log("Create Vertexes");
  const start = process.hrtime();
  let index = 0;
  let neoVertexes = await readNeoVertexes(index);
  while (neoVertexes.length > 0) {
    const neopromises = neoVertexes.map(v => () =>
      executeGremlin(toGremlinVertex(v))
    );

    await throttle.all(neopromises, {
      maxInProgress: 2, // we get 'Request rate too large' on a higher value
      failFast: true
    });
    index += 1;
    const nextIndex = index * pageSize;
    console.log(nextIndex);
    neoVertexes = await readNeoVertexes(nextIndex);
  }
  vertexesTime = elapsedSeconds(start);
};

const elapsedSeconds = start => {
  const end = process.hrtime(start);
  return (end[0] * 1e9 + end[1]) / 1e9;
};

const readNeoVertexes = async index => {
  let driver = await createNeo4jDriver();
  let session = driver.session();
  let vertexQuery = "MATCH (n) RETURN n skip " + index + " limit " + pageSize;
  let vertexes = await session.run(vertexQuery);
  session.close();
  driver.close();

  return vertexes.records.map(record => record.get("n"));
};

const createNeo4jDriver = async () => {
  return await neo4j.driver(
    config.neo4j.bolt,
    neo4j.auth.basic(config.neo4j.user, config.neo4j.pass)
  );
};

const toGremlinVertex = neoVertex => {
  let vertex = `g.addV('${neoVertex.labels[0]}')`;
  vertex += `.property('id', '${neoVertex.identity}')`;

  for (const key of Object.keys(neoVertex.properties)) {
    const propValue = neoVertex.properties[key].toString().replace(/'/g, "");
    vertex += `.property('${key}', '${propValue}')`;
  }

  return vertex;
};

const createEdges = async () => {
  console.log("Create Edges");
  const start = process.hrtime();

  let index = 0;
  let neoEdges = await readNeoEdges(index);
  while (neoEdges.length > 0) {
    const neopromises = neoEdges.map(v => () =>
      executeGremlin(toGremlinEdge(v))
    );
    await throttle.all(neopromises, {
        maxInProgress: 2,
        failFast: true
    });
    index += 1;
    const nextIndex = index * pageSize;
    console.log(nextIndex);
    neoEdges = await readNeoEdges(nextIndex);
  }
  edgesTime = elapsedSeconds(start);
};

const readNeoEdges = async (index) => {
  let driver = await createNeo4jDriver();
  let session = driver.session();

  let edgeQuery =
    "MATCH (a)-[r]->(b) RETURN r SKIP " + index + " LIMIT " + pageSize;

  const edges = await session.run(edgeQuery);

  session.close();
  driver.close();

  return edges.records.map(record => record.get("r"));
};

const toGremlinEdge = neoEdge => {
  let edge = `g.V('${neoEdge.start}')`;
  edge += `.addE('${neoEdge.type}')`;
  for (const key of Object.keys(neoEdge.properties)) {
    const propValue = neoEdge.properties[key].toString().replace(/'/g, "");
    edge += `.property('${key}', '${propValue}')`;
  }
  edge += `.to(g.V('${neoEdge.end}'))`;
  return edge;
};

migrateData()
  .then(_ => process.exit())
  .catch(error => {
    console.error(error);
    process.exit();
  });
