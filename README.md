# neo-to-cosmos
[![Docker Build Status](https://img.shields.io/docker/build/syedhassaanahmed/neo-to-cosmos.svg?logo=docker)](https://hub.docker.com/r/syedhassaanahmed/neo-to-cosmos/builds/) [![MicroBadger Size](https://img.shields.io/microbadger/image-size/syedhassaanahmed/neo-to-cosmos.svg?logo=docker)](https://hub.docker.com/r/syedhassaanahmed/neo-to-cosmos/tags/) [![Docker Pulls](https://img.shields.io/docker/pulls/syedhassaanahmed/neo-to-cosmos.svg?logo=docker)](https://hub.docker.com/r/syedhassaanahmed/neo-to-cosmos/)

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

This app takes a Neo4j database snapshot and copies all content to an Azure Cosmos DB Graph database.

## Disclaimer
- The app is **NOT intended to synchronize a live production database**.
- Node or Relationship property names which are [system reserved in Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/sql-api-resources#system-vs-user-defined-resources) will be prepended with `prop_`, i.e. `id` will become `prop_id`.
- Because Cosmos DB stores vertices and edges in the same collection, Neo4j Relationship Ids will be appended with `edge_` in order to avoid conflicts with Node Ids.
- This project is **NOT officially supported by Microsoft**. It is an independent effort, although we really appreciate if submit PRs to improve it.

## Get Started
The first thing you'll need is a Neo4j database. Docker is the quickest way to get started. If you're looking for Neo4j docker images with pre-populated Graph datasets, we've [got you covered](https://github.com/syedhassaanahmed/neo4j-datasets/blob/master/azuredeploy.json#L8)! e.g. The following will spin up a container of [Game of Thrones dataset](https://github.com/syedhassaanahmed/neo4j-datasets/tree/master/game-of-thrones):

```
docker run --name neo4j-got -p 7474:7474 -p 7687:7687 -d syedhassaanahmed/neo4j-game-of-thrones
```

Browse the data by pointing to http://localhost:7474. Initial Neo4j login/password will be "neo4j/neo4j".

## Configuration
Before you run the app, you'll need to supply environment variables which contain settings to your Neo4j and Cosmos DB databases.

```
COSMOSDB_ENDPOINT=https://<COSMOSDB_ACCOUNT>.documents.azure.com:443/
COSMOSDB_AUTHKEY=<COSMOSDB_AUTHKEY>
COSMOSDB_DATABASE=graphdb
COSMOSDB_COLLECTION=graphcollz
COSMOSDB_PARTITIONKEY=someProperty # mandatory for unlimited collections
COSMOSDB_OFFERTHROUGHPUT=1000 # default is 400 for fixed and 1000 for unlimited collections

NEO4J_BOLT=bolt://<BOLT_ENDPOINT>:7687
NEO4J_USERNAME=neo4j # default is 'neo4j'
NEO4J_PASSWORD=<NEO4J_PASSWORD>

CACHE_PATH=<PATH_TO_CACHE_DIRECTORY> #default is 'cache'
```

## Run the tool
`dotnet NeoToCosmos.dll` and watch your data being copied. If for some reason you couldn't transfer the data completely, simply rerun the command. For fresh clean start, add `-r` switch.

Here is how to run the containerized version of the tool.
```
docker run -d -e <ENVIRONMENT_VARIABLES> syedhassaanahmed/neo-to-cosmos
```
- Add `--network "host"` in order to access local Neo4j in dev environment.

## Scale out
Copying large volume of data from Neo4j to CosmosDB using a single instance of the app may not be entirely feasible, even with maxed out [RUs](https://docs.microsoft.com/en-us/azure/cosmos-db/request-units) and a cache layer. Hence we've provided an [ARM template](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-manager-create-first-template) to orchestrate deployment of Cosmos DB and N number of [Azure Container Instances](https://docs.microsoft.com/en-us/azure/container-instances/container-instances-restart-policy), each performs a portion of data migration.

In order to achieve resilience during the migration, we also persist a [RocksDB](https://github.com/facebook/rocksdb) cache on an [emptyDir volume](https://docs.microsoft.com/en-us/azure/container-instances/container-instances-volume-emptydir#emptydir-volume). An `emptyDir` can survive container crashes.

To deploy the template using latest [Azure CLI 2.0](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest);
```
az group deployment create -g <RESOURCE_GROUP> \
    --template-file azuredeploy.json \
    --parameters \
        neo4jBolt=bolt://<BOLT_ENDPOINT>:7687 \
        neo4jPassword=<NEO4J_PASSWORD>
```

## Credits
This work builds upon the great effort **Brian Sherwin** has done [in this repo](https://github.com/bsherwin/neo2cosmos).