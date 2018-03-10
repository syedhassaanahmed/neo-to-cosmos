import { ClientOpts, createClient } from "redis";
import { promisifyAll } from "bluebird";

export default class Cache {
    private readonly redisClient: any;

    constructor() {
        const redisHost = process.env.REDIS_HOST;

        if (redisHost) {
            const redisOptions: ClientOpts = {
                auth_pass: process.env.REDIS_KEY
            };
            if (process.env.REDIS_SSL) {
                redisOptions.tls = {
                    servername: redisHost
                };
            }

            this.redisClient = promisifyAll(createClient(
                Number.parseInt(process.env.REDIS_PORT), redisHost, redisOptions));
        }
    }

    exists = async (key: string) => {
        return this.redisClient ? await this.redisClient.existsAsync(key) : false;
    }

    get = async (key: string) => {
        return this.redisClient ? await this.redisClient.getAsync(key) : undefined;
    }

    set = (key: string, value: string) => {
        if (this.redisClient)
            this.redisClient.set(key, value);
    }

    flush = async () => {
        if (this.redisClient)
            await this.redisClient.flushdbAsync();
    }
}