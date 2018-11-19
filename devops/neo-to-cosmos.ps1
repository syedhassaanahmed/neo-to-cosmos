$COSMOSDB_PORT=8081
$env:COSMOSDB_ENDPOINT = "https://localhost:$COSMOSDB_PORT"
$env:COSMOSDB_AUTHKEY = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
$env:COSMOSDB_DATABASE = "testdb"
$env:COSMOSDB_COLLECTION = "testcoll"
$env:COSMOSDB_OFFERTHROUGHPUT = "10000"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "Neo4j"

$CONTAINER_NAME="neo4j-got"
$NEO4J_BOLT_PORT=7687
$env:NEO4J_BOLT = "bolt://localhost:$NEO4J_BOLT_PORT"
$NEO4J_HTTP_PORT=7474

try { docker rm -f $CONTAINER_NAME } catch {}

docker run --platform=linux --name $CONTAINER_NAME -d `
    -p ${NEO4J_BOLT_PORT}:${NEO4J_BOLT_PORT} `
    -p ${NEO4J_HTTP_PORT}:${NEO4J_HTTP_PORT} `
    -e NEO4J_AUTH=$env:NEO4J_USERNAME/$env:NEO4J_PASSWORD `
    syedhassaanahmed/neo4j-game-of-thrones

& 'C:\Program Files\Azure Cosmos DB Emulator\CosmosDB.Emulator.exe' /noui

function Test-Http ($endpoint) {
    $response = try { (Invoke-WebRequest -Uri $endpoint -ErrorAction Stop).BaseResponse } 
        catch [System.Net.WebException] {}
    
    return [int]$response.BaseResponse.StatusCode
}

do {
    Write-Host "waiting for Neo4j server to start..."
    Start-Sleep 3
} until((Test-Http "http://localhost:$NEO4J_HTTP_PORT") -ne 200)

do {
    Write-Host "waiting for Cosmos DB emulator to start..."
    Start-Sleep 3
} until((Test-Http "https://localhost:$COSMOSDB_PORT") -ne 401)

dotnet run --project .\NeoToCosmos\NeoToCosmos.csproj