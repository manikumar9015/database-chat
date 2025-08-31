// Import the app object from the Azure Functions SDK
const { app } = require('@azure/functions');
// Import a library to generate unique IDs
const { v4: uuidv4 } = require('uuid');

// Define the HTTP endpoint
app.http('onQueryReceived', {
    methods: ['POST'], // This function only accepts POST requests
    authLevel: 'anonymous', // Anyone can call this function (for now)
    
    // Define an output binding to send data to our queue
    // This is a powerful feature of Azure Functions.
    // We just have to return a value, and the runtime automatically sends it to the 'queryjobs' queue.
    return: {
        type: 'queue',
        queueName: 'queryjobs',
        connection: 'AzureWebJobsStorage' // Uses the connection string we stored in local.settings.json
    },
    
    // The main handler for the function
    handler: async (request, context) => {
        // Log that the function was triggered
        context.log(`HTTP trigger function processed a request.`);

        // Get the body of the incoming request (where the user's question will be)
        const requestBody = await request.json();
        const userQuestion = requestBody.question;

        // --- Basic Validation ---
        // If there's no question in the request body, return an error.
        if (!userQuestion) {
            return {
                status: 400, // Bad Request
                body: "Please pass a 'question' in the request body"
            };
        }

        // Generate a unique ID for this entire transaction.
        // This allows us to track the user's request as it flows through all our functions.
        const correlationId = uuidv4();

        context.log(`Received question: "${userQuestion}"`);
        context.log(`Generated correlation ID: ${correlationId}`);

        // Prepare the message that will be placed on the queue
        const queueMessage = {
            correlationId: correlationId,
            userQuestion: userQuestion
        };

        // --- Return the message ---
        // Because we defined a return output binding above, whatever we return here
        // will be automatically sent as a message to the 'queryjobs' queue.
        // We also send a simple success message back to the user's browser.
        return {
            // This is the object that goes to the queue
            returnValue: queueMessage,
            
            // This is the HTTP response sent back to the client
            httpResponse: {
                status: 202, // Accepted
                jsonBody: {
                    message: "Request accepted and is being processed.",
                    correlationId: correlationId
                }
            }
        };
    }
});