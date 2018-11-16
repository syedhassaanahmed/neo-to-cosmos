using CommandLine;
using Microsoft.Azure.CosmosDB.BulkExecutor.Graph.Element;
using Neo4j.Driver.V1;
using Newtonsoft.Json;
using Serilog;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
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
                await GetDataBoundariesAsync();

            _cache = new Cache(_logger);
            await CreateVerticesAsync(startNodeIndex, endNodeIndex);
        }

        private static async Task CreateVerticesAsync(long startNodeIndex, long endNodeIndex)
        {
            var nodeIndexKey = $"nodeIndex_{_commandLineOptions.InstanceId}";
            var indexString = await _cache.GetAsync(nodeIndexKey);
            var index = !string.IsNullOrEmpty(indexString) ? long.Parse(indexString) : startNodeIndex;
            var nodes = Enumerable.Empty<INode>();

            while (true)
            {
                _logger.Information($"Node: {index}");

                nodes = await _neo4j.GetNodesAsync(index, _commandLineOptions.PageSize);
                if (!nodes.Any() || index > endNodeIndex)
                    break;

                var cosmosDbVertices = nodes.Select(node => ToCosmosDBVertex(node));
                await _cosmosDb.BulkImportAsync(cosmosDbVertices);

                index += _commandLineOptions.PageSize;
                await _cache.SetAsync(nodeIndexKey, index.ToString());
            }
        }

        private static object ToCosmosDBVertex(INode node)
        {
            var vertex = new GremlinVertex(node.Id.ToString(), node.Labels.First());

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

        private static async Task<(long, long, long, long)> GetDataBoundariesAsync()
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

        private static Serilog.ILogger CreateLogger(CommandLineOptions commandLineOptions)
        {
            return new LoggerConfiguration()
                .WriteTo.Console(restrictedToMinimumLevel: commandLineOptions.LogLevel)
                .WriteTo.File("logs/neo-to-cosmos.log")
                .CreateLogger();
        }
    }
}
