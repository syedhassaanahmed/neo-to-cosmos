using CommandLine;
using Serilog;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class Program
    {
        private static ILogger _logger;

        public static async Task Main(string[] args)
        {
            var commandLineParser = Parser.Default.ParseArguments<CommandLineOptions>(args);
            if (commandLineParser.Tag != ParserResultType.Parsed)
                return;

            var commandLineOptions = ((Parsed<CommandLineOptions>)commandLineParser).Value;

            _logger = CreateLogger(commandLineOptions);
            _logger.Information("{@commandLineOptions}", commandLineOptions);

            var cosmosDb = new CosmosDb(_logger);
            await cosmosDb.InitializeAsync(commandLineOptions.ShouldRestart);
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
