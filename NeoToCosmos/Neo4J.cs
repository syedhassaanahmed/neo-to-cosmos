using Neo4j.Driver.V1;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Neo4J : IDisposable
    {
        private readonly Serilog.ILogger _logger;        
        private readonly IDriver _driver;

        public Neo4J(Serilog.ILogger logger)
        {
            _logger = logger;

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

            _driver = GraphDatabase.Driver(boltUrl, AuthTokens.Basic(username, password));
            _logger.Information(boltUrl);
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
            return records.Select(r => r.As<INode>());
        }

        private async Task<List<IRecord>> RunAsync(string cypherQuery)
        {
            _logger.Debug(cypherQuery);

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
