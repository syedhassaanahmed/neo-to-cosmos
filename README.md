# neo-to-cosmos
[![Docker Build Status](https://img.shields.io/docker/build/syedhassaanahmed/neo-to-cosmos.svg?logo=docker)](https://hub.docker.com/r/syedhassaanahmed/neo-to-cosmos/builds/) [![MicroBadger Size](https://img.shields.io/microbadger/image-size/syedhassaanahmed/neo-to-cosmos.svg?logo=docker)](https://hub.docker.com/r/syedhassaanahmed/neo-to-cosmos/tags/) [![Docker Pulls](https://img.shields.io/docker/pulls/syedhassaanahmed/neo-to-cosmos.svg?logo=docker)](https://hub.docker.com/r/syedhassaanahmed/neo-to-cosmos/)

This app takes a Neo4j database snapshot and copies all content to an Azure Cosmos DB Graph database.

## Disclaimer
- The app is **NOT intended to synchronize a live production database**.
- Node or Relationship property names which are [system reserved in Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/sql-api-resources#system-vs-user-defined-resources) will be prepended with `prop_`, i.e. `id` will become `prop_id`.
- Because Cosmos DB stores vertices and edges in the same collection, Neo4j Relationship Ids will be appended with `edge_` in order to avoid conflicts with Node Ids.
- This project is **NOT officially supported by Microsoft**. It is an independent effort, although we appreciate you to submit PRs to improve it.

## Get Started
The first thing you'll need is a Neo4j database. Docker is the quickest way to get started!

If you're on Windows, make sure you've installed [Docker for Windows](https://docs.docker.com/docker-for-windows/) and are using Linux containers.

Once you have Docker up and running, spin up a copy of Neo4j:

```
docker run --name neotocosmos-neo4j -p 7474:7474 -p 7687:7687 -v $HOME/neo4j/data:/data -d neo4j
```

If you don't already have Neo4j image loaded, it will automatically be downloaded. Then, Docker will start up the image and set up both Neo4j bolt on port 7687 and Neo4j browser on port 7474. Finally, it will store all data in your user home directory under neo4j/data. This way, your data will survive container reboots.

Next, spin up Neo4j data browser by pointing to http://localhost:7474. The initial login/password will be "neo4j/neo4j" and you'll have to change the password. This password will go in the environment variables later. Start one of the code walkthroughs to load up some data.

```
:play write-code
```

<img src="images/neo-play-write-code.png"/>

```
:play movie-graph
```
or
```
:play northwind-graph
```
Walkthrough enough to completely load the data. Be careful... last step of the movie-graph will have you deleting all your new data!

## Get Your Cosmos DB ready
If you don't have Cosmos DB set up yet, head over to this documentation and follow the instructions to [Create a Database Account](
https://docs.microsoft.com/en-us/azure/cosmos-db/create-graph-dotnet).
You don't need to create a graph, because the app will do it for you.

## Configuration
Before you run the app, you'll need to supply environment variables which contain settings to your Neo4j and Cosmos DB databases, as well as an optional Redis cache to facilitate resume scenario.

```
COSMOSDB_ENDPOINT=https://<COSMOSDB_ACCOUNT>.documents.azure.com:443/
COSMOSDB_AUTHKEY=<COSMOSDB_AUTHKEY>
COSMOSDB_DATABASE=graphdb
COSMOSDB_COLLECTION=graphcollz
COSMOSDB_PARTITIONKEY=someProperty # mandatory for unlimited collections
COSMOSDB_OFFERTHROUGHPUT=1000 # default is 400 for fixed and 1000 for unlimited collections

NEO4J_BOLT=bolt://<BOLT_ENDPOINT>:7687
NEO4J_USERNAME=<NEO4J_USERNAME> # default is 'neo4j'
NEO4J_PASSWORD=<NEO4J_PASSWORD>

CACHE_PATH=<PATH_TO_CACHE_DIRECTORY> #default is 'cache'
```

### Step 1: Get Your Cosmos DB Endpoint.
<img src="images/azure-cosmos-keys.png"/>

Select the Keys tab of your Cosmos DB account and you'll see the "URI". Copy that value to  `COSMOSDB_ENDPOINT`.

### Step 2: Get Your Cosmos DB AuthKey.
Either primary or secondary key can be used as `COSMOSDB_AUTHKEY`
> Hint: Use the copy button. Its way easier than trying to select it with a mouse!!!

### Step 3: Neo4j config
If you used the defaults, you should only need to set `NEO4J_PASSWORD` to whatever you changed it to when you first logged in.

## Run the tool
`dotnet NeoToCosmos.dll` and watch your data being copied. If for some reason you couldn't transfer the data completely, simply rerun the command. For fresh clean start, add `-r` switch.

### Docker
Here is how to run the containerized version of the tool in development environment.
```
docker run -it --rm -e <ENVIRONMENT_VARIABLES> syedhassaanahmed/neo-to-cosmos
```
- Add `--network "host"` in order to access local Neo4j.

# Scaling out with Azure Container Instances
[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

Copying large volume of data from Neo4j to CosmosDB using a single instance of the app may not be entirely feasible, even with maxed out [RUs](https://docs.microsoft.com/en-us/azure/cosmos-db/request-units) and a cache layer in between.

Hence we've created an [ARM template](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-manager-create-first-template) to orchestrate deployment of Cosmos DB and N number of `Azure Container Instances`, each performs a portion of data migration. Container instances are perfect for our scenario as they're billed by the second and you're charged only for compute used while the migration task is running.

To deploy using latest [Azure CLI 2.0](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest);
```
az group deployment create -g <RESOURCE_GROUP> --template-file azuredeploy.json --parameters neo4jBolt=bolt://<BOLT_ENDPOINT>:7687 neo4jPassword=<NEO4J_PASSWORD>
```

## Credits
This work builds upon the great effort **Brian Sherwin** has done [in this repo](https://github.com/bsherwin/neo2cosmos).