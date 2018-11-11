using CommandLine;
using Serilog;

namespace NeoToCosmos
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var commandLineParser = Parser.Default.ParseArguments<CommandLineOptions>(args);
            if (commandLineParser.Tag != ParserResultType.Parsed)
                return;

            var commandLineOptions = ((Parsed<CommandLineOptions>)commandLineParser).Value;

            var logger = CreateLogger(commandLineOptions);
            logger.Information("{@commandLineOptions}", commandLineOptions);
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
