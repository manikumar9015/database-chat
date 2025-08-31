const { app } = require('@azure/functions');
const { Connection, Request } = require('tedious');

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

// --- Corrected Helper Function ---
function executeQuery(config, query, context) {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) {
                context.error('Connection failed:', err);
                return reject(err);
            }
            context.log('Successfully connected to Azure SQL.');
            const request = new Request(query, (err, rowCount) => {
                if (err) {
                    context.error('Request failed:', err);
                    reject(err);
                }
                connection.close();
            });
            const results = [];
            request.on('row', (columns) => {
                const row = {};
                columns.forEach((column) => {
                    row[column.metadata.colName] = column.value;
                });
                results.push(row);
            });
            request.on('requestCompleted', () => {
                context.log("Request completed. Rows found:", results.length);
                resolve(results);
            });
            request.on('error', (err) => {
                context.error('Request error event:', err);
                reject(err);
            });

            // This line was inside the 'connect' event handler, it needs to be here.
            connection.execSql(request);
        });

        connection.on('error', (err) => {
            context.error('Connection-level error:', err);
            reject(err);
        });
        
        // *** THE MISSING PIECE OF THE PUZZLE WAS THIS LINE ***
        connection.connect();
    });
}