import * as Winston from "winston";

export default () => {
    const logger = new (Winston.Logger)({
        level: process.env.LOG_LEVEL || "info",
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

    return logger;
};