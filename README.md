# neo-to-cosmos
This project is an x-plat port of the great work **Brian Sherwin** has done [in this C# repo](https://github.com/bsherwin/neo2cosmos). To get started please follow the instructions in Brian's repo with these notable exceptions in **Final steps**.

- App configuration is read from `config.json` with below schema.
- `Database` and `Collection` must be created prior to running this app.
- `endpoint` field must not contain `https` or `443` and it should be `*.graphs.azure.com` instead of `*.documents.azure.com`.
- `npm start` and watch your data being copied!

```json
{
    "cosmosDB": {
        "endpoint": "mycosmosdb.graphs.azure.com",
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
