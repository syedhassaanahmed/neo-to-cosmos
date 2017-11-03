# CHANGE THESE VALUES!!!
INSTANCES=5
NEO2COSMOS_NAME=syahneo2cosmos # This name is used for all resources. Use storage account naming convention!
NEO2COSMOS_LOCATION=westeurope
NEO_BOLT=bolt://13.81.53.236:7687
NEO_USER=neo4j
NEO_PASS=syah-neo4j

# Create resource group
az group create -l $NEO2COSMOS_LOCATION -n $NEO2COSMOS_NAME --debug

# Deploy Cosmos, Redis and Storage Account with ARM template
#az group deployment create -g $NEO2COSMOS_NAME --template-file deploy-resources.json --debug

# Fetch auth keys
COSMOS_KEY=$(az cosmosdb list-keys -n $NEO2COSMOS_NAME -g $NEO2COSMOS_NAME -o tsv | cut -f1)
REDIS_KEY=$(az redis list-keys -n $NEO2COSMOS_NAME -g $NEO2COSMOS_NAME -o tsv | cut -f1)
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