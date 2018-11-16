using Serilog;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Cache
    {
        private readonly ILogger _logger;

        public Cache(ILogger logger)
        {
            _logger = logger;
        }

        public async Task<string> GetAsync(string key)
        {
            return null;
        }

        public async Task SetAsync(string nodeIndexKey, string v)
        {
            
        }
    }
}
