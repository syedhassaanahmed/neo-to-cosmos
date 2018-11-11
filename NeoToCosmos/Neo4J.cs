using Neo4j.Driver.V1;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Neo4J : IDisposable
    {
        private readonly IDriver _driver;

        public Neo4J()
        {
            var bolt = Environment.GetEnvironmentVariable("NEO4J_BOLT");
            if (string.IsNullOrEmpty(bolt))
            {
                throw new ArgumentNullException(nameof(bolt));
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

            _driver = GraphDatabase.Driver(bolt, AuthTokens.Basic(username, password));
        }

        private async Task<List<IRecord>> RunAsync(string cypherQuery)
        {
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
