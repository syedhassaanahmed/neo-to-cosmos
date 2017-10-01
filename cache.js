import config from './config.json'
import redis from 'redis'
import bluebird from 'bluebird'
bluebird.promisifyAll(redis.RedisClient.prototype)

const redisClient = redis.createClient({ url: config.redisUrl })
process.on('exit', () => redisClient.quit())

exports.exists = async key => {
    return config.redisUrl ? await redisClient.existsAsync(key) : false
}

exports.get = async key => {
    return config.redisUrl ? await redisClient.getAsync(key) : undefined
}

exports.set = (key, value) => {
    if (config.redisUrl)
        redisClient.set(key, value)
}

exports.flush = async () => {
    if (config.redisUrl)
        await redisClient.flushdbAsync()
}