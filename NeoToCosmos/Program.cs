using CommandLine;
using Serilog;
using System;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var commandLineParser = Parser.Default.ParseArguments<CommandLineOptions>(args);
            if (commandLineParser.Tag != ParserResultType.Parsed)
                return;

            var commandLineOptions = ((Parsed<CommandLineOptions>)commandLineParser).Value;
            if (commandLineOptions.InstanceId >= commandLineOptions.TotalInstances)
            {
                throw new ArgumentException(
                    $"InstanceId: {commandLineOptions.InstanceId} is invalid. Cannot exceed total instances {commandLineOptions.TotalInstances}");
            }

            var logger = CreateLogger(commandLineOptions);
            logger.Information("{@commandLineOptions}", commandLineOptions);

            var neo4j = new Neo4j(logger);
            var cache = new Cache(commandLineOptions.ShouldRestart);
            var cosmosDb = new CosmosDb(logger);

            using var migrator = new Migrator(commandLineOptions, logger, neo4j, cache, cosmosDb);
            await migrator.MigrateAsync();
        }

        private static ILogger CreateLogger(CommandLineOptions commandLineOptions)
        {
            return new LoggerConfiguration()
                .WriteTo.Console(restrictedToMinimumLevel: commandLineOptions.LogLevel)
                .WriteTo.File("logs/neo-to-cosmos.log")
                .CreateLogger();
        }
    }
}
