using CommandLine;
using Microsoft.Azure.CosmosDB.BulkExecutor.Graph.Element;
using Neo4j.Driver.V1;
using Newtonsoft.Json;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Program
    {
        private static CommandLineOptions _commandLineOptions;
        private static Serilog.ILogger _logger;
        private static CosmosDb _cosmosDb;
        private static Neo4J _neo4j;
        private static Cache _cache;

        private static readonly string[] _cosmosDbSystemProperties = { "id", "_rid", "_self", "_ts", "_etag" };

        public static async Task Main(string[] args)
        {
            var commandLineParser = Parser.Default.ParseArguments<CommandLineOptions>(args);
            if (commandLineParser.Tag != ParserResultType.Parsed)
                return;

            _commandLineOptions = ((Parsed<CommandLineOptions>)commandLineParser).Value;

            _logger = CreateLogger(_commandLineOptions);
            _logger.Information("{@commandLineOptions}", _commandLineOptions);

            _cosmosDb = new CosmosDb(_logger);
            await _cosmosDb.InitializeAsync(_commandLineOptions.ShouldRestart);

            _neo4j = new Neo4J(_logger);
            var (startNodeIndex, startRelationshipIndex, endNodeIndex, endRelationshipIndex) = 
                await GetDataBoundsAsync();

            _cache = new Cache(_commandLineOptions.ShouldRestart);
            await CreateVerticesAsync(startNodeIndex, endNodeIndex);
            await CreateEdgesAsync(startRelationshipIndex, endRelationshipIndex);
        }

        private static Serilog.ILogger CreateLogger(CommandLineOptions commandLineOptions)
        {
            return new LoggerConfiguration()
                .WriteTo.Console(restrictedToMinimumLevel: commandLineOptions.LogLevel)
                .WriteTo.File("logs/neo-to-cosmos.log")
                .CreateLogger();
        }

        private static async Task<(long, long, long, long)> GetDataBoundsAsync()
        {
            var totalNodes = (double)await _neo4j.GetTotalNodesAsync();
            var totalRelationships = (double)await _neo4j.GetTotalRelationshipsAsync();

            _logger.Information($"Nodes = {totalNodes}, Relationships = {totalRelationships}");
            var instanceId = _commandLineOptions.InstanceId;
            var totalInstances = _commandLineOptions.TotalInstances;

            var startNodeIndex = (long)Math.Floor(totalNodes / totalInstances) * instanceId;
            var startRelationshipIndex = (long)Math.Floor(totalRelationships / totalInstances) * instanceId;

            var endNodeIndex = (long)Math.Ceiling(totalNodes / totalInstances) * (instanceId + 1);
            var endRelationshipIndex = (long)Math.Ceiling(totalRelationships / totalInstances) * (instanceId + 1);

            _logger.Information($"startNodeIndex = {startNodeIndex}, startRelationshipIndex = {startRelationshipIndex}");
            _logger.Information($"endNodeIndex = {endNodeIndex}, endRelationshipIndex = {endRelationshipIndex}");

            return (startNodeIndex, startRelationshipIndex, endNodeIndex, endRelationshipIndex);
        }

        private static async Task CreateVerticesAsync(long startNodeIndex, long endNodeIndex)
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

        private static object ToCosmosDBVertex(INode node)
        {
            var vertex = new GremlinVertex(WebUtility.UrlEncode(node.Id.ToString()), node.Labels.First());

            foreach (var nodeProperty in node.Properties)
            {
                var propertyName = nodeProperty.Key;
                if (_cosmosDbSystemProperties.Contains(propertyName))
                {
                    propertyName = "prop_" + propertyName;
                }

                var propertyValue = nodeProperty.Value;
                if (propertyValue is IEnumerable<object>)
                {
                    propertyValue = JsonConvert.SerializeObject(propertyValue);
                }

                vertex.AddProperty(propertyName, propertyValue);
            }

            return vertex;
        }

        private static async Task CreateEdgesAsync(long startRelationshipIndex, long endRelationshipIndex)
        {
            var relationshipIndexKey = $"relationshipIndex_{_commandLineOptions.InstanceId}";
            var indexString = _cache.Get(relationshipIndexKey);
            var index = !string.IsNullOrEmpty(indexString) ? long.Parse(indexString) : startRelationshipIndex;
            var relationships = Enumerable.Empty<dynamic>();

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

        private static object ToCosmosDBEdge(dynamic relationshipData)
        {
            var relationship = (IRelationship)relationshipData.Relationship;

            /* DO NOT use Neo4j's relationship.Id as edgeId
            Cosmos DB stores both vertices and edges in the same collection 
            and if Neo4j Node and Relationship Ids are the same, documents will be overwritten.*/
            var edgeId = WebUtility.UrlEncode($"{relationship.StartNodeId}_{relationship.Type}_{relationship.EndNodeId}");

            var edge = new GremlinEdge
            (
                edgeId: edgeId, 
                edgeLabel: relationship.Type,
                outVertexId: WebUtility.UrlEncode(relationship.StartNodeId.ToString()),
                inVertexId: WebUtility.UrlEncode(relationship.EndNodeId.ToString()),
                outVertexLabel: relationshipData.SourceLabel,
                inVertexLabel: relationshipData.SinkLabel,
                outVertexPartitionKey: relationshipData.SourcePartitionKey,
                inVertexPartitionKey: relationshipData.SinkPartitionKey
            );

            foreach (var edgeProperty in relationship.Properties)
            {
                var propertyName = edgeProperty.Key;
                if (_cosmosDbSystemProperties.Contains(propertyName))
                {
                    propertyName = "prop_" + propertyName;
                }

                edge.AddProperty(propertyName, edgeProperty.Value);
            }

            return edge;
        }
    }
}
