# neo-to-cosmos
This project is an x-plat port of the great work **Brian Sherwin** has done [in this C# repo](https://github.com/bsherwin/neo2cosmos). To get started please follow the instructions in Brian's repo, except use `config.json` (schema below).

`npm start` and watch your data being copied!

```json
{
    "cosmosDB": {
        "endpoint": "https://mycosmosdb.documents.azure.com:443/",
        "authKey": "<copy primary key from Azure portal>",
        "database": "<database name>",
        "collection": "<collection name>"
    },
    "neo4j": {
        "bolt": "bolt://localhost:7687",
        "user": "<neo4j user>",
        "pass": "<neo4j password>"
    }
}
```
