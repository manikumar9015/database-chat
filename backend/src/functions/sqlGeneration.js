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
        const { correlationId, userQuestion } = queueItem.returnValue;
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

            // --- THE FIX IS HERE: We now add a few examples to the prompt ---
            let schemaForPrompt = '/* The schema of a Microsoft SQL Server database is provided below. */\n';
            schemaForPrompt += `
/* 
Here are some example rows from the tables to give you context about the data:
- Products table: (ProductID: 1, ProductName: 'Laptop', Category: 'Electronics'), (ProductID: 3, ProductName: 'Coffee Maker', Category: 'Home Goods')
- Sales table: (SaleID: 1, ProductID: 1, Quantity: 5), (SaleID: 2, ProductID: 2, Quantity: 10)
*/\n\n`;

            const formattedSchema = schemaRows.reduce((acc, { TABLE_NAME, COLUMN_NAME, DATA_TYPE }) => {
                if (!acc[TABLE_NAME]) {
                    acc[TABLE_NAME] = [];
                }
                acc[TABLE_NAME].push(`- ${COLUMN_NAME} (${DATA_TYPE})`);
                return acc;
            }, {});

            for (const tableName in formattedSchema) {
                schemaForPrompt += `Table: ${tableName}\nColumns:\n${formattedSchema[tableName].join('\n')}\n\n`;
            }
            
            const fullPrompt = `${schemaForPrompt}\n${instructions}\nQuestion: "${userQuestion}"\nSQL Query:`;
            
            context.log("--- Sending Enriched Prompt to Gemini ---");
            context.log(fullPrompt);

            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            let generatedSql = response.text().replace(/```sql/g, '').replace(/```/g, '').trim();

            context.log(`--- Received Response from Gemini: ---\n${generatedSql}`);
            
            return { correlationId, userQuestion, generatedSql };

        } catch (error) {
            context.error("An error occurred during SQL generation:", error);
            return { correlationId, userQuestion, generatedSql: "ERROR", error: "Failed to generate SQL due to an internal error." };
        }
    }
});