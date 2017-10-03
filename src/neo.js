import neo4j from 'neo4j-driver'

export default function (config) {
    let module = {}

    const createNeo4jDriver = async () => {
        return await neo4j.driver(config.neo4j.bolt,
            neo4j.auth.basic(config.neo4j.user, config.neo4j.pass))
    }

    module.getNodes = async index => {
        const driver = await createNeo4jDriver()
        const session = driver.session()

        const nodeQuery = `MATCH (n) RETURN n ORDER BY ID(n) SKIP ${index} LIMIT ${config.pageSize}`
        const nodes = await session.run(nodeQuery)

        session.close()
        driver.close()

        return nodes.records.map(record => record.get('n'))
    }

    module.getRelationships = async index => {
        const driver = await createNeo4jDriver()
        const session = driver.session()

        const relationshipQuery = `MATCH (a)-[r]->(b) RETURN r ORDER BY ID(r) SKIP ${index} LIMIT ${config.pageSize}`

        const relationships = await session.run(relationshipQuery)

        session.close()
        driver.close()

        return relationships.records.map(record => record.get('r'))
    }

    return module
}