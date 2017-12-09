#!/bin/bash

if [ -z "$1" ]; then echo "Number of instances was not supplied"; exit 1; fi
INSTANCES=$1

if [ -z "$2" ]; then echo "Name was not supplied"; exit 1; fi
NEO2COSMOS_NAME=$2 # This name is used for all resources. Use storage account naming convention!

if [ -z "$3" ]; then echo "Location was not supplied"; exit 1; fi
NEO2COSMOS_LOCATION=$3

if [ -z "$4" ]; then echo "Bolt url was not supplied"; exit 1; fi
NEO_BOLT=$4

if [ -z "$5" ]; then echo "Neo4j username was not supplied"; exit 1; fi
NEO_USER=$5

read -s -p "Neo4j Password:" NEO_PASS
echo

# Login if necessary
if [[ $(az account show) != *tenantId* ]]; then az login; fi

# Select Azure subscription if you have multiple of them
# az account set --subscription <SUBSCRIPTION_ID>

# Create resource group
az group create -l $NEO2COSMOS_LOCATION -n $NEO2COSMOS_NAME --debug

# Deploy Cosmos, Redis and Storage Account with ARM template
az group deployment create -g $NEO2COSMOS_NAME --template-file deploy-resources.json --debug

# Fetch auth keys
COSMOS_KEY=$(az cosmosdb list-keys -n $NEO2COSMOS_NAME -g $NEO2COSMOS_NAME --query "primaryMasterKey" -o tsv)
REDIS_KEY=$(az redis list-keys -n $NEO2COSMOS_NAME -g $NEO2COSMOS_NAME --query "primaryKey" -o tsv)
STORAGE_KEY=$(az storage account keys list -n $NEO2COSMOS_NAME -g $NEO2COSMOS_NAME --query "[0].value" -o tsv)

# Create config.json from template (use comma as sed expression separator because of urls)
cat config.template.json | sed \
    -e "s,\${NEO2COSMOS_NAME},$NEO2COSMOS_NAME,g" \
    -e "s,\${COSMOS_KEY},$COSMOS_KEY,g" \
    -e "s,\${NEO_BOLT},$NEO_BOLT,g" \
    -e "s,\${NEO_USER},$NEO_USER,g" \
    -e "s,\${NEO_PASS},$NEO_PASS,g" \
    -e "s,\${REDIS_KEY},$REDIS_KEY,g" \
> config.json

# Create file share and upload config.json
ACI_SHARE=acishare
az storage share create -n acishare --quota 1 --account-name $NEO2COSMOS_NAME --debug
az storage file upload --share-name $ACI_SHARE --source config.json --account-name $NEO2COSMOS_NAME --debug

# Deploy N number of Azure container instances with ARM template (config.json is volume mounted)
az group deployment create -g $NEO2COSMOS_NAME --template-file deploy-aci.json --debug \
    --parameters totalInstances=$INSTANCES storageAccountKey=$STORAGE_KEY shareName=$ACI_SHARE