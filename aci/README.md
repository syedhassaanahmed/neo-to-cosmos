# Scaling out Neo2Cosmos with Azure Container Instances
Copying large volume of data from Neo4j to CosmosDB using a single instance of the app may not be entirely feasible, even with maxed out [RUs](https://docs.microsoft.com/en-us/azure/cosmos-db/request-units) and a Redis layer in between.

Hence we've created a small script to orchestrate deployment of the required resources (Cosmos DB, Redis and Storage Account), as well as spin up N number of `Azure Container Instances`, each performs a portion of data migration. Container instances are perfect for our scenario as they're billed by the second and you're charged only for compute used while the migration task is running.

## Prereqs
Install [latest Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)

## Run the script
`./deploy.sh 5 neo2cosmos westeurope bolt://<BOLT_ENDPOINT>:7687 neo4j`

> This will deploy 5 container instances, all resources named 'neo2cosmos' in Western Europe. It takes ~5-10min to provision all resources for the first time.

## How it works
Here are the steps we perform in the script;

> **Note:** For simplicity, we've chosen `$NEO2COSMOS_NAME` for the resource group as well as all resources inside. Hence it's important to follow Azure Storage Account [naming convention](https://docs.microsoft.com/en-us/azure/architecture/best-practices/naming-conventions).

- Create resource group in specified region.
- Deploy Cosmos DB, Redis and Storage account using [this ARM template](https://github.com/syedhassaanahmed/neo-to-cosmos/blob/master/aci/deploy-resources.json).
- Fetch auth keys for newly created  resources.
- Create `config.json` with above auth keys.
- Create an Azure File Share and upload config.json. This file share will be volume mounted on each container instance (specified in next template).
- Deploy N number of instances with [this ARM template](https://github.com/syedhassaanahmed/neo-to-cosmos/blob/master/aci/deploy-aci.json). The template creates containers with environment variables `TOTAL` and `INSTANCE`, which are then [passed to the app](https://github.com/syedhassaanahmed/neo-to-cosmos/blob/master/Dockerfile). The app is aware of how to interpret them and distribute the load accordingly.