using Microsoft.Azure.CosmosDB.BulkExecutor.Graph.Element;
using Neo4j.Driver;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Migrator : IDisposable
    {
        private readonly CommandLineOptions _commandLineOptions;
        private readonly Serilog.ILogger _logger;        
        private readonly Neo4j _neo4j;
        private readonly Cache _cache;
        private readonly CosmosDb _cosmosDb;

        private static readonly string[] _cosmosDbSystemProperties = { "id", "_rid", "_self", "_ts", "_etag" };

        public Migrator(CommandLineOptions commandLineOptions, Serilog.ILogger logger,
            Neo4j neo4j, Cache cache, CosmosDb cosmosDb)
        {
            _commandLineOptions = commandLineOptions;
            _logger = logger;
            _neo4j = neo4j;
            _cache = cache;
            _cosmosDb = cosmosDb;
        }

        public async Task MigrateAsync()
        {
            var totalNodes = await _neo4j.GetTotalNodesAsync();
            var totalRelationships = await _neo4j.GetTotalRelationshipsAsync();

            _logger.Information($"Nodes = {totalNodes}, Relationships = {totalRelationships}");

            var (startNodeIndex, endNodeIndex, startRelationshipIndex, endRelationshipIndex) =
                GetDataBounds(totalNodes, totalRelationships);

            _logger.Information($"startNodeIndex = {startNodeIndex}, endNodeIndex = {endNodeIndex}");
            _logger.Information($"startRelationshipIndex = {startRelationshipIndex}, endRelationshipIndex = {endRelationshipIndex}");

            await _cosmosDb.InitializeAsync(_commandLineOptions.ShouldRestart);

            await CreateVerticesAsync(startNodeIndex, endNodeIndex);
            await CreateEdgesAsync(startRelationshipIndex, endRelationshipIndex);
        }

        public (long, long, long, long) GetDataBounds(double totalNodes, double totalRelationships)
        {
            var instanceId = _commandLineOptions.InstanceId;
            var totalInstances = _commandLineOptions.TotalInstances;

            var startNodeIndex = (long)Math.Ceiling(totalNodes / totalInstances * instanceId);
            var endNodeIndex = (long)Math.Floor(totalNodes / totalInstances * (instanceId + 1));

            var startRelationshipIndex = (long)Math.Ceiling(totalRelationships / totalInstances * instanceId);
            var endRelationshipIndex = (long)Math.Floor(totalRelationships / totalInstances * (instanceId + 1));

            return (startNodeIndex, endNodeIndex, startRelationshipIndex, endRelationshipIndex);
        }

        private async Task CreateVerticesAsync(long startNodeIndex, long endNodeIndex)
        {
            var nodeIndexKey = $"nodeIndex_{_commandLineOptions.InstanceId}";
            var indexString = _cache.Get(nodeIndexKey);
            var index = !string.IsNullOrEmpty(indexString) ? long.Parse(indexString) : startNodeIndex;
            var nodes = Enumerable.Empty<INode>();

            while (index < endNodeIndex)
            {
                nodes = await _neo4j.GetNodesAsync(index, _commandLineOptions.PageSize);
                if (!nodes.Any())
                    break;

                var cosmosDbVertices = nodes.Select(node => ToCosmosDBVertex(node));
                await _cosmosDb.BulkImportAsync(cosmosDbVertices);

                index += _commandLineOptions.PageSize;
                _cache.Set(nodeIndexKey, index.ToString());
            }
        }

        private static GremlinVertex ToCosmosDBVertex(INode node)
        {
            var vertex = new GremlinVertex(node.Id.ToString(), node.Labels.First());
            AddProperties(node.Properties, (n, v) => vertex.AddProperty(n, v));

            return vertex;
        }

        public static void AddProperties(IReadOnlyDictionary<string, object> properties, Action<string, object> addProperty)
        {
            foreach (var property in properties)
            {
                var propertyName = property.Key;
                if (_cosmosDbSystemProperties.Contains(propertyName))
                {
                    propertyName = "prop_" + propertyName;
                }

                var propertyValue = property.Value;
                if (propertyValue is IEnumerable<object>)
                {
                    propertyValue = JsonConvert.SerializeObject(propertyValue);
                }

                addProperty(propertyName, propertyValue);
            }
        }

        private async Task CreateEdgesAsync(long startRelationshipIndex, long endRelationshipIndex)
        {
            var relationshipIndexKey = $"relationshipIndex_{_commandLineOptions.InstanceId}";
            var indexString = _cache.Get(relationshipIndexKey);
            var index = !string.IsNullOrEmpty(indexString) ? long.Parse(indexString) : startRelationshipIndex;
            var relationships = Enumerable.Empty<Neo4jRelationship>();

            while (index < endRelationshipIndex)
            {
                relationships = await _neo4j.GetRelationshipsAsync(index, _commandLineOptions.PageSize, _cosmosDb.PartitionKey);
                if (!relationships.Any())
                    break;

                var cosmosDbEdges = relationships.Select(relationship => ToCosmosDBEdge(relationship));
                await _cosmosDb.BulkImportAsync(cosmosDbEdges);

                index += _commandLineOptions.PageSize;
                _cache.Set(relationshipIndexKey, index.ToString());
            }
        }

        private static GremlinEdge ToCosmosDBEdge(Neo4jRelationship relationshipData)
        {
            var relationship = relationshipData.Relationship;

            /* DO NOT use Neo4j's relationship.Id directly as edgeId
            Cosmos DB stores both vertices and edges in the same Container 
            and if Neo4j Node and Relationship Ids are the same, documents will be overwritten.*/

            var edge = new GremlinEdge
            (
                edgeId: $"edge_{relationship.Id}",
                edgeLabel: relationship.Type,
                outVertexId: relationship.StartNodeId.ToString(),
                inVertexId: relationship.EndNodeId.ToString(),
                outVertexLabel: relationshipData.SourceLabel,
                inVertexLabel: relationshipData.SinkLabel,
                outVertexPartitionKey: relationshipData.SourcePartitionKey,
                inVertexPartitionKey: relationshipData.SinkPartitionKey
            );

            AddProperties(relationship.Properties, (n, v) => edge.AddProperty(n, v));
            return edge;
        }

        public void Dispose()
        {
            _cache.Dispose();
            _neo4j.Dispose();
            _cosmosDb.Dispose();
        }
    }
}
