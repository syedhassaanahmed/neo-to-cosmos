# neo-to-cosmos
This tool is an x-plat port of the great work **Brian Sherwin** has done [in this C# repo](https://github.com/bsherwin/neo2cosmos). The tool takes snapshot of your data from `Neo4j` and migrates it to `Azure Cosmos DB`. Its **NOT supposed to run on production database**.

## Get Started
To get started please follow the instructions in Brian's repo with the following exceptions. 

- Instead of `app.config`, use `config.json` with [this schema](https://github.com/syedhassaanahmed/neo-to-cosmos/blob/master/sampleConfig.json).
- Setup a Redis server and specify `redisUrl` in above config. Redis allows us to resume an incomplete data migration without consuming Cosmos DB `RUs`. The fastest way to setup Redis is to use docker. 
```
docker run --name neo2cosmos-redis -p 6379:6379 -d redis
```

## Run the tool
`npm start` and watch your data being copied. If for some reason you couldn't transfer the data completely, simply rerun the command. If you would like to start fresh use `npm start -- restart`.

> Note: This project is not supported by Microsoft in any way and may become non-functional at any time. This is an independent project and I would love for you to submit pull requests for anything you think could be better. This will not work with the Cosmos DB emulator as this interfaces with the Graph (gremlin) API and this is not currently supported in the emulator at this time.