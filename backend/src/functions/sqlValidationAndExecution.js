const { app } = require('@azure/functions');
const { Connection, Request } = require('tedious');
const { executeQuery } = require('../utils/sqlHelper');

const DENYLIST = ["DROP", "DELETE", "INSERT", "UPDATE", "CREATE", "ALTER", "TRUNCATE"];

app.storageQueue('sqlValidationAndExecution', {
    queueName: 'validationjobs',
    connection: 'AzureWebJobsStorage',
    return: {
        type: 'cosmosDB',
        databaseName: 'DataLabDB',
        containerName: 'Sessions',
        connection: 'COSMOS_CONNECTION_STRING',
        createIfNotExists: true,
        partitionKey: '/id'
    },
    handler: async (queueItem, context) => {
        context.log('SQL Validation and Execution function triggered.');
        const { correlationId, userQuestion, generatedSql } = queueItem;

        if (!DENYLIST.every(keyword => !generatedSql.toUpperCase().includes(keyword)) || generatedSql === "ERROR") {
            context.warn(`Validation failed for query: ${generatedSql}`);
            return { id: correlationId, userQuestion, generatedSql, status: "Failed", error: "Validation Failed", results: [], timestamp: new Date().toISOString() };
        }

        const config = { server: process.env.SQL_SERVER_NAME, authentication: { type: 'default', options: { userName: 'sqladmin', password: process.env.SQL_PASSWORD } }, options: { encrypt: true, database: 'SampleDB' } };

        try {
            const results = await executeQuery(config, generatedSql, context);
            context.log("Successfully executed query. Saving results to Cosmos DB.");
            return { id: correlationId, userQuestion, generatedSql, status: "Succeeded", error: null, results: results, timestamp: new Date().toISOString() };
        } catch (error) {
            context.error("Error executing SQL query:", error);
            return { id: correlationId, userQuestion, generatedSql, status: "Failed", error: error.message || "Query execution error.", results: [], timestamp: new
            Date().toISOString() };
        }
    }
});

