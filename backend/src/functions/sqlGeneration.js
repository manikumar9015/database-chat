const { app } = require('@azure/functions');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const dbSchema = `/* The schema of a Microsoft SQL Server database is provided below. */
1. Products table:
   - Columns: ProductID (int, primary key), ProductName (varchar), Category (varchar), Price (decimal).
2. Sales table:
   - Columns: SaleID (int, primary key), ProductID (int, foreign key), Quantity (int), SaleDate (datetime).
`;

// --- FINAL PROMPT --- Softer, clearer instructions.
const instructions = `
Your task is to be an expert T-SQL generator.
Given the database schema and a user question, generate a single, valid T-SQL query.
Ensure you use T-SQL syntax, for example, use 'SELECT TOP(N)' instead of 'LIMIT'.
Only output the raw SQL query, with no other text or markdown formatting.
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
        const fullPrompt = `${dbSchema}\n${instructions}\nQuestion: "${userQuestion}"\nSQL Query:`;
        
        context.log("--- Sending Final Prompt to Gemini ---");
        context.log(fullPrompt);
        
        try {
            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            let generatedSql = response.text().replace(/```sql/g, '').replace(/```/g, '').trim();

            context.log(`--- Received Final Response from Gemini: ---\n${generatedSql}`);
            
            const outputMessage = { correlationId, userQuestion, generatedSql };
            return outputMessage;
        } catch (error) {
            context.error("Error calling Gemini API:", error);
            return { correlationId, userQuestion, generatedSql: "ERROR", error: "Failed to call LLM API." };
        }
    }
});