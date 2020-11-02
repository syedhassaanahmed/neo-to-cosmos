using CommandLine;
using Serilog.Events;

namespace NeoToCosmos
{
    public class CommandLineOptions
    {
        [Option('r', "restart", Required = false, Default = false,
            HelpText = "Restarts data transfer by re-creating Cosmos DB Container and flushing the cache.")]
        public bool ShouldRestart { get; set; }

        [Option('t', "total", Required = false, Default = 1,
            HelpText = "Total number of instances.")]
        public int TotalInstances { get; set; }

        [Option('i', "instance", Required = false, Default = 0,
            HelpText = "Current (zero-indexed) Instance Id.")]
        public int InstanceId { get; set; }

        [Option('p', "page-size", Required = false, Default = 1000,
            HelpText = "Number of documents to read from Neo4j and write to Cosmos DB.")]
        public int PageSize { get; set; }

        [Option('l', "log-level", Required = false, Default = LogEventLevel.Information,
            HelpText = "Logging level.")]
        public LogEventLevel LogLevel { get; set; }
    }
}
