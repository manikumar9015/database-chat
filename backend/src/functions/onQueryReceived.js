
// --- Import 'app' and 'output' from the SDK ---
const { app, output } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');

// --- Define our two separate outputs ---
const queueOutput = output.storageQueue({
    queueName: 'queryjobs',
    connection: 'AzureWebJobsStorage',
});

const httpOutput = output.http({
    status: 202 // Status 202 means "Accepted"
});

// --- Register the function with both outputs ---
app.http('onQueryReceived', {
    methods: ['POST'],
    authLevel: 'anonymous',
    // The main 'return' goes to the queue.
    return: queueOutput,
    // The HTTP response is a secondary, "extra" output.
    extraOutputs: [httpOutput],
    
    handler: async (request, context) => {
        const requestBody = await request.json();
        const userQuestion = requestBody.question;

        if (!userQuestion) {
            // If validation fails, we set a bad request response and don't return anything to the queue.
            context.extraOutputs.set(httpOutput, {
                status: 400,
                body: "Please pass a 'question' in the request body"
            });
            return;
        }

        const correlationId = uuidv4();
        context.log(`Received question: "${userQuestion}", ID: ${correlationId}`);

        const queueMessage = {
            correlationId: correlationId,
            userQuestion: userQuestion
        };

        // --- Set the HTTP response for the client ---
        // This response body will be sent back to the browser.
        context.extraOutputs.set(httpOutput, {
            jsonBody: {
                message: "Request accepted and is being processed.",
                correlationId: correlationId // The crucial "ticket number"
            }
        });

        // --- Return the message for the queue ---
        // This is the primary output that goes to the storage queue.
        return queueMessage;
    }
});