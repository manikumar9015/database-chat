// src/functions/sqlValidationAndExecution.js (Cleaned Up Version)

const { app } = require('@azure/functions');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { executeQuery } = require('../utils/sqlHelper');

const DENYLIST = ["DROP", "DELETE", "INSERT", "UPDATE", "CREATE", "ALTER", "TRUNCATE"];
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
        const { correlationId, userQuestion, generatedSql, sqlExplanation } = queueItem;

        try {
            if (!DENYLIST.every(keyword => !generatedSql.toUpperCase().includes(keyword)) || generatedSql === "ERROR") {
                throw new Error("Validation Failed: Generated SQL is invalid or contains unsafe keywords.");
            }

            const config = { server: process.env.SQL_SERVER_NAME, authentication: { type: 'default', options: { userName: 'sqladmin', password: process.env.SQL_PASSWORD } }, options: { encrypt: true, database: 'SampleDB' } };
            const results = await executeQuery(config, generatedSql, context);
            context.log("Successfully executed query.");

            let resultSummary = "The query ran successfully but returned no results.";
            if (results && results.length > 0) {
                const summaryPrompt = `Based on the user's question and the following JSON data, write a one-sentence summary of the answer.\n\nOriginal Question: "${userQuestion}"\nJSON Result: ${JSON.stringify(results)}\n\nSummary:`;
                const summaryResult = await model.generateContent(summaryPrompt);
                resultSummary = (await summaryResult.response).text().trim();
            }
            
            // The return value now only goes to Cosmos DB.
            return { id: correlationId, userQuestion, generatedSql, sqlExplanation, status: "Succeeded", error: null, results: results, resultSummary, timestamp: new Date().toISOString() };

        } catch (error) {
            context.error("An error occurred during the final step:", error);
            return { id: correlationId, userQuestion, generatedSql, sqlExplanation, status: "Failed", error: error.message, results: [], resultSummary: "", timestamp: new Date().toISOString() };
        }
    }
});