& $env:ProgramFiles\Docker\DockerCli.exe -SwitchDaemon

$COSMOSDB_PORT=8081
$env:COSMOSDB_ENDPOINT = "https://localhost:${COSMOSDB_PORT}"
$env:COSMOSDB_AUTHKEY = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
$env:COSMOSDB_DATABASE = "testdb"
$env:COSMOSDB_COLLECTION = "testcoll"
$env:COSMOSDB_OFFERTHROUGHPUT = "10000"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "Neo4j"

$NEO4J_CONTAINER="neo4j-got"
$NEO4J_BOLT_PORT=7687
$env:NEO4J_BOLT = "bolt://localhost:${NEO4J_BOLT_PORT}"
$NEO4J_HTTP_PORT=7474

# Start Neo4j container
try { docker rm -f $NEO4J_CONTAINER } catch {}
docker run --name $NEO4J_CONTAINER -d `
    -p ${NEO4J_BOLT_PORT}:${NEO4J_BOLT_PORT} `
    -p ${NEO4J_HTTP_PORT}:${NEO4J_HTTP_PORT} `
    -e NEO4J_AUTH=$env:NEO4J_USERNAME/$env:NEO4J_PASSWORD `
    syedhassaanahmed/neo4j-game-of-thrones

# Download, install and run Cosmos DB emulator
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$COSMOSDB_EMULATOR=".\cosmosdb-emulator.msi"
Invoke-WebRequest -OutFile $COSMOSDB_EMULATOR https://aka.ms/cosmosdb-emulator
Start-Process "msiexec.exe" -ArgumentList "/i", "$COSMOSDB_EMULATOR", "/qn", "/norestart" -Wait -NoNewWindow
Remove-Item "$COSMOSDB_EMULATOR"
$COSMOSDB_CMD=".\startCosmosDb.cmd"
Set-Content -Value '"$env:ProgramFiles\Azure Cosmos DB Emulator\CosmosDB.Emulator.exe" /NoUI /NoExplorer /NoFirewall' -Path $COSMOSDB_CMD
Start-Process -FilePath $COSMOSDB_CMD

docker logs $NEO4J_CONTAINER

dotnet run --project .\NeoToCosmos\NeoToCosmos.csproj --no-launch-profile
Remove-Item cache -Recurse -Force
Remove-Item logs -Recurse -Force
Remove-Item $COSMOSDB_CMD