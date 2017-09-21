# neo-to-cosmos
This project is an x-plat port of the great work **Brian Sherwin** has done [in this C# repo](https://github.com/bsherwin/neo2cosmos). 

## Get Started
To get started please follow the instructions in Brian's repo with the following exceptions. 

- Instead of `app.config`, use `config.json` with [this schema](https://github.com/syedhassaanahmed/neo-to-cosmos/blob/master/sampleConfig.json).
- Setup a Redis server and specify `redisUrl` in above config. Redis allows us to resume an incomplete data migration without consuming Cosmos DB `RUs`. The fastest way to setup Redis is to use docker. 
```
docker run --name neo2cosmos-redis -d redis
```

## Run the tool
`npm start` and watch your data being copied. If for some reason you couldn't transfer the data completely, simply rerun the command. If you would like to start fresh use `npm start -- restart`.