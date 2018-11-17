using Neo4j.Driver.V1;
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

            var (boltUrl, username, password) = GetConfiguration();
            _driver = GraphDatabase.Driver(boltUrl, AuthTokens.Basic(username, password));
            _logger.Information(boltUrl);
        }

        private static (string, string, string) GetConfiguration()
        {
            var boltUrl = Environment.GetEnvironmentVariable("NEO4J_BOLT");
            if (string.IsNullOrEmpty(boltUrl))
            {
                throw new ArgumentNullException(nameof(boltUrl));
            }

            var username = Environment.GetEnvironmentVariable("NEO4J_USERNAME");
            if (string.IsNullOrEmpty(username))
            {
                throw new ArgumentNullException(nameof(username));
            }

            var password = Environment.GetEnvironmentVariable("NEO4J_PASSWORD");
            if (string.IsNullOrEmpty(password))
            {
                throw new ArgumentNullException(nameof(password));
            }

            return (boltUrl, username, password);
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
            var partitionProperties = !string.IsNullOrEmpty(partitionKey) ? $", a.{partitionKey}, b.{partitionKey}" : "";
            var records = await RunAsync($"MATCH (a)-[r]->(b) RETURN labels(a)[0], r, labels(b)[0] {partitionProperties} ORDER BY ID(r) SKIP {index} LIMIT {pageSize}");

            return records.Select(r => new Neo4jRelationship
            {
                Relationship = r["r"].As<IRelationship>(),
                SourceLabel = r["labels(a)[0]"].As<string>(),
                SinkLabel = r["labels(b)[0]"].As<string>(),
                SourcePartitionKey = !string.IsNullOrEmpty(partitionKey) ? r[$"a.{partitionKey}"] : null,
                SinkPartitionKey = !string.IsNullOrEmpty(partitionKey) ? r[$"b.{partitionKey}"] : null
            });
        }

        private async Task<List<IRecord>> RunAsync(string cypherQuery)
        {
            _logger.Information(cypherQuery);

            using (var session = _driver.Session())
            {
                var result = await session.RunAsync(cypherQuery);
                return await result.ToListAsync();
            }
        }

        public void Dispose()
        {
            _driver?.Dispose();
        }
    }
}
