// src/functions/sqlGeneration.js (FINAL CORRECTED VERSION)

const { app } = require('@azure/functions');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { executeQuery } = require('../utils/sqlHelper');

const instructions = `
Your task is to be an expert T-SQL generator.
Given the database schema and a user question, generate a single, valid T-SQL query.
- You MUST NOT use 'SELECT *'. Instead, you must explicitly select only the columns that are most relevant to the user's question.
- Ensure you use T-SQL syntax, for example, use 'SELECT TOP(N)' instead of 'LIMIT'.
- Only output the raw SQL query, with no other text or markdown formatting.
`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });  

app.storageQueue('sqlGeneration', {
    queueName: 'queryjobs',
    connection: 'AzureWebJobsStorage',
    return: {
        type: 'queue',
        queueName: 'validationjobs',
        connection: 'AzureWebJobsStorage'
    },
    handler: async (queueItem, context) => {
        // --- THE FIX IS HERE ---
        // The queue message is now a flat object, not nested.
        const { correlationId, userQuestion } = queueItem;
        context.log(`SQL Generation triggered for question: "${userQuestion}"`);

        try {
            const config = {
                server: process.env.SQL_SERVER_NAME,
                authentication: { type: 'default', options: { userName: 'sqladmin', password: process.env.SQL_PASSWORD } },
                options: { encrypt: true, database: 'SampleDB' }
            };

            const schemaQuery = `
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = 'dbo'
                ORDER BY TABLE_NAME, ORDINAL_POSITION;
            `;

            context.log("Fetching database schema...");
            const schemaRows = await executeQuery(config, schemaQuery, context);
            context.log("Schema fetched successfully.");

            let schemaForPrompt = '/* The schema of a Microsoft SQL Server database is provided below. */\n/* Example rows: Products(ProductID: 1, ProductName: \'Laptop\', Category: \'Electronics\'), Sales(SaleID: 1, ProductID: 1, Quantity: 5) */\n\n';
            const formattedSchema = schemaRows.reduce((acc, { TABLE_NAME, COLUMN_NAME, DATA_TYPE }) => {
                if (!acc[TABLE_NAME]) { acc[TABLE_NAME] = []; }
                acc[TABLE_NAME].push(`- ${COLUMN_NAME} (${DATA_TYPE})`);
                return acc;
            }, {});
            for (const tableName in formattedSchema) {
                schemaForPrompt += `Table: ${tableName}\nColumns:\n${formattedSchema[tableName].join('\n')}\n\n`;
            }
            
            const fullPrompt = `${schemaForPrompt}\n${instructions}\nQuestion: "${userQuestion}"\nSQL Query:`;
            
            context.log("--- Sending Enriched Prompt to Gemini ---");
            const sqlResult = await model.generateContent(fullPrompt);
            const sqlResponse = await sqlResult.response;
            let generatedSql = sqlResponse.text().replace(/```sql/g, '').replace(/```/g, '').trim();
            context.log(`--- Received SQL from Gemini: ---\n${generatedSql}`);

            const explanationPrompt = `Explain the following SQL query in one simple, human-readable sentence: ${generatedSql}`;
            const explanationResult = await model.generateContent(explanationPrompt);
            const explanationResponse = await explanationResult.response;
            const sqlExplanation = explanationResponse.text().trim();
            context.log(`--- Received Explanation: --- \n${sqlExplanation}`);
            
            return { correlationId, userQuestion, generatedSql, sqlExplanation };

        } catch (error) {
            context.error("An error occurred during SQL generation:", error);
            return { correlationId, userQuestion, generatedSql: "ERROR", sqlExplanation: "", error: "Failed to generate SQL due to an internal error." };
        }
    }
});