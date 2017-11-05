import * as Winston from "winston";

export default function(config: any) {
    const logger = new (Winston.Logger)({
        level: config.logLevel,
        transports: [
            new (Winston.transports.Console)({
                timestamp: true,
                colorize: true,
                prettyPrint: true,
                json: false
            }),
            new (Winston.transports.File)({
                timestamp: true,
                prettyPrint: true,
                json: false,
                filename: "logs/neo2cosmos.log"
            })
        ]
    });

    logger.info(config);
    return logger;
}