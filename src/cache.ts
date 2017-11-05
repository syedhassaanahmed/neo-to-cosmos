import { ClientOpts, createClient } from "redis";
import { promisifyAll } from "bluebird";

export default class Cache {
    private readonly config: any;
    private readonly redisClient: any;

    constructor(config: any) {
        this.config = config;

        if (config.redis) {
            const redisOptions: ClientOpts = {
                auth_pass: config.redis.pass
            };
            if (config.redis.ssl) {
                redisOptions.tls = {
                    servername: config.redis.host
                };
            }

            this.redisClient = promisifyAll(createClient(
                config.redis.port, config.redis.host, redisOptions));
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