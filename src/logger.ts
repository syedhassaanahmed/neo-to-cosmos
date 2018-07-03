import { createLogger, format, transports } from "winston";

export default () => {
    const logger = createLogger({
        level: process.env.LOG_LEVEL || "info",
        format: format.combine(
            format.colorize(),
            format.prettyPrint(),
            format.timestamp(),
            format.simple()
        ),
        transports: [
            new transports.Console(),
            new transports.File({
                filename: "logs/neo2cosmos.log"
            })
        ]
    });

    return logger;
};