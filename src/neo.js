import neo4j from 'neo4j-driver'

export default function (config) {
    let module = {}

    const executeCypher = async(query, getResult) => {
        const driver = await neo4j.driver(config.neo4j.bolt,
            neo4j.auth.basic(config.neo4j.user, config.neo4j.pass))

        const session = driver.session()
        const result = await session.run(query)

        session.close()
        driver.close()

        return getResult(result)
    }

    module.getTotalNodes = async() => {
        return await executeCypher('MATCH (n) RETURN COUNT(n)', 
            result => result.records[0].get(0))
    }

    module.getTotalRelationships = async() => {
        return await executeCypher('MATCH (a)-[r]->(b) RETURN COUNT(r)', 
            result => result.records[0].get(0))
    }

    module.getNodes = async index => {
        const nodeQuery = `MATCH (n) RETURN n ORDER BY ID(n) SKIP ${index} LIMIT ${config.pageSize}`
        return await executeCypher(nodeQuery, 
            result => result.records.map(record => record.get('n')))
    }

    module.getRelationships = async index => {
        const relationshipQuery = `MATCH (a)-[r]->(b) RETURN r ORDER BY ID(r) SKIP ${index} LIMIT ${config.pageSize}`
        return await executeCypher(relationshipQuery, 
            result => result.records.map(record => record.get('r')))
    }

    return module
}