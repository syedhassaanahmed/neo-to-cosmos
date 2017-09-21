# neo-to-cosmos
This project is an x-plat port of the great work **Brian Sherwin** has done [in this C# repo](https://github.com/bsherwin/neo2cosmos). 

## Get Started
To get started please follow the instructions in Brian's repo with the following exceptions. 

- Instead of `app.config`, use `config.json` with this schema;
```json
{
    "cosmosDB": {
        "endpoint": "https://mycosmosdb.documents.azure.com:443/",
        "authKey": "<copy primary key from Azure portal>",
        "database": "<database name>",
        "collection": "<collection name>",
        "offerThroughput": "400"        
    },
    "neo4j": {
        "bolt": "bolt://localhost:7687",
        "user": "<neo4j user>",
        "pass": "<neo4j password>"
    },
    "threadCount": 3,
    "redisUrl": "redis://localhost:6379/"
}
```
- Setup a Redis server and specify `redisUrl` in above config. Redis allows us to resume an incomplete data migration without consuming Cosmos DB `RUs`. The fastest way to setup Redis is to use docker. 
```
docker run --name neo2cosmos-redis -d redis
```

## Run the tool
`npm start` and watch your data being copied. If for some reason you couldn't transfer the data completely, simply rerun the command. If you would like to start fresh use `npm start -- restart`.