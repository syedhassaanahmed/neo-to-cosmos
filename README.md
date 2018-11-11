# neo-to-cosmos
[![Docker Pulls](https://img.shields.io/docker/pulls/syedhassaanahmed/neo2cosmos.svg)](https://hub.docker.com/r/syedhassaanahmed/neo2cosmos/)

This app takes a Neo4j database snapshot and copies all contents to an Azure Cosmos DB Graph database.

## Credits
This is an x-plat continuation of the great work **Brian Sherwin** has done [in this C# repo](https://github.com/bsherwin/neo2cosmos).

## Disclaimer
- The app is **NOT intended to synchronize a live production database**.
- Node or Relationship property names which are [system reserved in Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/sql-api-resources#system-vs-user-defined-resources) will be appended with `_prop`, i.e. `id` will become `id_prop`.
- Due to the possibility of bulk import using Stored Procedures, `DocumentDB` APIs were preferred over `Gremlin`. The internal JSON Document representation of `Vertices` and `Edges` is [explained in detail here](https://github.com/LuisBosquez/azure-cosmos-db-graph-working-guides/blob/master/graph-backend-json.md).
- This project is **NOT officially supported by Microsoft**. It is an independent effort, although we appreciate you to submit PRs to improve it.

## Get Started
The first thing you'll need is a Neo4j database. Docker is the quickest way to get started!

If you're on Windows, make sure you've configured Hyper-V, and installed [Docker for Windows](https://docs.docker.com/docker-for-windows/). Also make sure to use Linux containers.

Once you have Docker up and running, spin up a copy of Neo4j:

```
docker run --name neo2cosmos-neo4j -p 7474:7474 -p 7687:7687 -v $HOME/neo4j/data:/data -d neo4j
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
COSMOSDB_PARTITIONKEY=someProperty
COSMOSDB_OFFERTHROUGHPUT=1000

NEO4J_BOLT=bolt://<BOLT_ENDPOINT>:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<NEO4J_PASSWORD>

# optional settings
REDIS_HOST=<REDIS_NAME>.redis.cache.windows.net
REDIS_PORT=6380
REDIS_KEY=<REDIS_KEY>
REDIS_SSL=true

PAGE_SIZE=1000
LOG_LEVEL=info
```

### Step 1: Get Your Cosmos DB Endpoint.
<img src="images/azure-cosmos-keys.png"/>

Select the Keys tab of your Cosmos DB account and you'll see the "URI". Copy that value to  `COSMOSDB_ENDPOINT`.

### Step 2: Get Your Cosmos DB AuthKey.
Either primary or secondary key can be used as `COSMOSDB_AUTHKEY`
> Hint: Use the copy button. Its way easier than trying to select it with a mouse!!!

### Step 3: Neo4j config
If you used the defaults, you should only need to set `NEO4J_PASSWORD` to whatever you changed it to when you first logged in.

### Step 4 (Optional): Set up a Redis Server
Set up a local or remote Redis server and specify an optional environment variable `REDIS_HOST`. Redis allows us to resume an incomplete data migration without consuming Cosmos DB RUs. The fastest way to set up Redis is to use docker. 
```
docker run --name neo2cosmos-redis -p 6379:6379 -d redis
```

## Run the tool
`npm start` and watch your data being copied. If for some reason you couldn't transfer the data completely, simply rerun the command. For fresh clean start, do `npm start -- -r`.

### Docker
Here is how to run the containerized version of the tool in development environment.
```
docker run -it --rm -v ${pwd}/.env:/app/.env syedhassaanahmed/neo2cosmos
```
- `-v ${pwd}/.env:/app/.env` takes `.env` file in current directory and volume mounts it inside the container.
- Add `--network "host"` in order to access local Redis and/or Neo4j.

# Scaling out with Azure Container Instances
[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

Copying large volume of data from Neo4j to CosmosDB using a single instance of the app may not be entirely feasible, even with maxed out [RUs](https://docs.microsoft.com/en-us/azure/cosmos-db/request-units) and a Redis layer in between.

Hence we've created an [ARM template](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-manager-create-first-template) to orchestrate deployment of the required resources - Cosmos DB, Redis as well as spin up N number of `Azure Container Instances`, each performs a portion of data migration. Container instances are perfect for our scenario as they're billed by the second and you're charged only for compute used while the migration task is running.

To deploy using latest [Azure CLI 2.0](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest);
```
az group deployment create -g <RESOURCE_GROUP> --template-file azuredeploy.json --parameters neo4jBolt=bolt://<BOLT_ENDPOINT>:7687 neo4jPassword=<NEO4J_PASSWORD>
```