import neo4j from 'neo4j-driver'

export default function (config) {
    let module = {}
    let driver, session

    module.initialize = async() => {
        driver = await neo4j.driver(config.neo4j.bolt,
            neo4j.auth.basic(config.neo4j.user, config.neo4j.pass))

        session = driver.session()
    }

    module.getTotalNodes = async() => {
        const result = await session.run('MATCH (n) RETURN COUNT(n)')
        return result.records[0].get(0)
    }

    module.getTotalRelationships = async() => {
        const result = await session.run('MATCH (a)-[r]->(b) RETURN COUNT(r)')
        return result.records[0].get(0)
    }

    module.getNodes = async index => {
        const nodeQuery = `MATCH (n) RETURN n ORDER BY ID(n) SKIP ${index} LIMIT ${config.pageSize}`
        const nodes = await session.run(nodeQuery)
        return nodes.records.map(record => record.get('n'))
    }

    module.getRelationships = async index => {
        const relationshipQuery = `MATCH (a)-[r]->(b) RETURN r ORDER BY ID(r) SKIP ${index} LIMIT ${config.pageSize}`
        const relationships = await session.run(relationshipQuery)
        return relationships.records.map(record => record.get('r'))
    }

    module.close = () => {
        session.close()
        driver.close()
    }

    return module
}