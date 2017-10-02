import redis from 'redis'
import bluebird from 'bluebird'
bluebird.promisifyAll(redis.RedisClient.prototype)

export default function (config) {
    let module = {}

    const redisClient = redis.createClient({ url: config.redisUrl })
    process.on('exit', () => redisClient.quit())

    module.exists = async key => {
        return config.redisUrl ? await redisClient.existsAsync(key) : false
    }

    module.get = async key => {
        return config.redisUrl ? await redisClient.getAsync(key) : undefined
    }

    module.set = (key, value) => {
        if (config.redisUrl)
            redisClient.set(key, value)
    }

    module.flush = async () => {
        if (config.redisUrl)
            await redisClient.flushdbAsync()
    }

    return module
}