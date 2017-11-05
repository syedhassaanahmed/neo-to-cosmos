import { ArgumentParserOptions, ArgumentParser } from "argparse";

export default function() {
    const argParseOptions: ArgumentParserOptions = { addHelp: true };
    const argsParser = new ArgumentParser(argParseOptions);

    argsParser.addArgument(
        ["-c", "--config"], {
            defaultValue: "../config.json",
            help: "Provide path to config.json file"
        });
    argsParser.addArgument(
        ["-r", "--restart"], {
            nargs: 0,
            help: "Restarts data transfer by deleting Cosmos DB collection and flushing Redis cache"
        });
    argsParser.addArgument(
        ["-t", "--total"], {
            defaultValue: 1,
            type: "int",
            help: "Total number of instances in case of distributed load"
        });
    argsParser.addArgument(
        ["-i", "--instance"], {
            defaultValue: 0,
            type: "int",
            help: "Instance ID in case of distributed load"
        });

    return argsParser.parseArgs();
}