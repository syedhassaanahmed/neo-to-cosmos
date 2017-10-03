import redis from 'redis'
import bluebird from 'bluebird'
bluebird.promisifyAll(redis.RedisClient.prototype)

export default function (config) {
    let module = {}

    let redisClient

    if (config.redis) {
        let redisOptions = { auth_pass: config.redis.pass }
        if (config.redis.ssl) {
            redisOptions.tls = { servername: config.redis.host }
        }
    
        redisClient = redis.createClient(config.redis.port, config.redis.host, redisOptions)
        process.on('exit', () => redisClient.quit())
    }

    module.exists = async key => {
        return redisClient ? await redisClient.existsAsync(key) : false
    }

    module.get = async key => {
        return redisClient ? await redisClient.getAsync(key) : undefined
    }

    module.set = (key, value) => {
        if (redisClient)
            redisClient.set(key, value)
    }

    module.flush = async () => {
        if (redisClient)
            await redisClient.flushdbAsync()
    }

    return module
}