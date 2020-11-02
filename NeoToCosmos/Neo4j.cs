using Neo4j.Driver;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Neo4jRelationship
    {
        public IRelationship Relationship { get; set; }
        public string SourceLabel { get; set; }
        public string SinkLabel { get; set; }
        public object SourcePartitionKey { get; set; }
        public object SinkPartitionKey { get; set; }        
    }

    public class Neo4j : IDisposable
    {
        private readonly Serilog.ILogger _logger;        
        private readonly IDriver _driver;

        public Neo4j(Serilog.ILogger logger)
        {
            _logger = logger;

            var (endpoint, username, password) = GetConfiguration();
            _driver = GraphDatabase.Driver(endpoint, AuthTokens.Basic(username, password));
            _logger.Information(endpoint);
        }

        private static (string, string, string) GetConfiguration()
        {
            var endpoint = Environment.GetEnvironmentVariable("NEO4J_ENDPOINT");
            if (string.IsNullOrEmpty(endpoint))
            {
                throw new ArgumentNullException(nameof(endpoint));
            }

            var username = Environment.GetEnvironmentVariable("NEO4J_USERNAME") ?? "neo4j";
            var password = Environment.GetEnvironmentVariable("NEO4J_PASSWORD");
            if (string.IsNullOrEmpty(password))
            {
                throw new ArgumentNullException(nameof(password));
            }

            return (endpoint, username, password);
        }

        public async Task<long> GetTotalNodesAsync()
        {
            var records = await RunAsync("MATCH (n) RETURN COUNT(n)");
            return records.Single()[0].As<long>();
        }

        public async Task<long> GetTotalRelationshipsAsync()
        {
            var records = await RunAsync("MATCH ()-[r]->() RETURN COUNT(r)");
            return records.Single()[0].As<long>();
        }

        public async Task<IEnumerable<INode>> GetNodesAsync(long index, int pageSize)
        {
            var records = await RunAsync($"MATCH (n) RETURN n ORDER BY ID(n) SKIP {index} LIMIT {pageSize}");
            return records.Select(r => r["n"].As<INode>());
        }

        public async Task<IEnumerable<Neo4jRelationship>> GetRelationshipsAsync(long index, int pageSize, string partitionKey)
        {
            var records = await RunAsync($"MATCH (a)-[r]->(b) RETURN labels(a)[0], r, labels(b)[0], a.{partitionKey}, b.{partitionKey} ORDER BY ID(r) SKIP {index} LIMIT {pageSize}");

            return records.Select(r => new Neo4jRelationship
            {
                Relationship = r["r"].As<IRelationship>(),
                SourceLabel = r["labels(a)[0]"].As<string>(),
                SinkLabel = r["labels(b)[0]"].As<string>(),
                SourcePartitionKey = r[$"a.{partitionKey}"],
                SinkPartitionKey = r[$"b.{partitionKey}"]
            });
        }

        private async Task<List<IRecord>> RunAsync(string cypherQuery)
        {
            _logger.Information(cypherQuery);

            var session = _driver.AsyncSession();
            try
            {
                var result = await session.RunAsync(cypherQuery);
                return await result.ToListAsync();
            }
            finally
            {
                await session.CloseAsync();
            }
        }

        public void Dispose()
        {
            _driver?.Dispose();
        }
    }
}
