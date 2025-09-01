const { app } = require('@azure/functions');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // <-- NEW: Import Gemini
const { executeQuery } = require('../utils/sqlHelper');

const DENYLIST = ["DROP", "DELETE", "INSERT", "UPDATE", "CREATE", "ALTER", "TRUNCATE"];

// --- NEW: Initialize Gemini for this function ---
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
        // We now receive sqlExplanation from the previous function
        const { correlationId, userQuestion, generatedSql, sqlExplanation } = queueItem;

        if (!DENYLIST.every(keyword => !generatedSql.toUpperCase().includes(keyword)) || generatedSql === "ERROR") {
            context.warn(`Validation failed for query: ${generatedSql}`);
            return { id: correlationId, userQuestion, generatedSql, sqlExplanation, status: "Failed", error: "Validation Failed", results: [], resultSummary: "", timestamp: new Date().toISOString() };
        }

        const config = { server: process.env.SQL_SERVER_NAME, authentication: { type: 'default', options: { userName: 'sqladmin', password: process.env.SQL_PASSWORD } }, options: { encrypt: true, database: 'SampleDB' } };

        try {
            const results = await executeQuery(config, generatedSql, context);
            context.log("Successfully executed query.");

            // --- NEW FEATURE: Generate Result Summary ---
            let resultSummary = "Could not generate a summary.";
            if (results && results.length > 0) {
                context.log("--- Sending Prompt to Gemini for Result Summary ---");
                const summaryPrompt = `Based on the user's question and the following JSON data from the database, write a one-sentence, human-readable summary of the answer.\n\nOriginal Question: "${userQuestion}"\nJSON Result: ${JSON.stringify(results)}\n\nSummary:`;
                const summaryResult = await model.generateContent(summaryPrompt);
                const summaryResponse = await summaryResult.response;
                resultSummary = summaryResponse.text().trim();
                context.log(`--- Received Summary: --- \n${resultSummary}`);
            } else {
                resultSummary = "The query ran successfully but returned no results.";
            }
            // --- END NEW FEATURE ---
            
            // Add the new summary to the final document
            return { id: correlationId, userQuestion, generatedSql, sqlExplanation, status: "Succeeded", error: null, results: results, resultSummary, timestamp: new Date().toISOString() };
        } catch (error) {
            context.error("Error executing SQL query:", error);
            return { id: correlationId, userQuestion, generatedSql, sqlExplanation, status: "Failed", error: error.message, results: [], resultSummary: "", timestamp: new Date().toISOString() };
        }
    }
});