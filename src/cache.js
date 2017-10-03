import redis from 'redis'
import bluebird from 'bluebird'
bluebird.promisifyAll(redis.RedisClient.prototype)

export default function (config) {
    let module = {}

    let redisOptions = { auth_pass: config.redis.pass }
    if (config.redis.ssl) {
        redisOptions.tls = { servername: config.redis.host }
    }

    const redisClient = redis.createClient(config.redis.port, config.redis.host, redisOptions)
    process.on('exit', () => redisClient.quit())

    module.exists = async key => {
        return config.redis ? await redisClient.existsAsync(key) : false
    }

    module.get = async key => {
        return config.redis ? await redisClient.getAsync(key) : undefined
    }

    module.set = (key, value) => {
        if (config.redis)
            redisClient.set(key, value)
    }

    module.flush = async () => {
        if (config.redis)
            await redisClient.flushdbAsync()
    }

    return module
}