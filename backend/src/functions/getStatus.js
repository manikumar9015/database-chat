// src/functions/getStatus.js
const { app, input } = require('@azure/functions');

// Define the Cosmos DB input binding. It will use a placeholder
// from the request's query string to find a specific document.
const sessionInput = input.cosmosDB({
    databaseName: 'DataLabDB',
    containerName: 'Sessions',
    connection: 'COSMOS_CONNECTION_STRING',
    // The 'id' comes from the URL query: ?id=...
    id: '{Query.id}', 
    // The partition key is also the id
    partitionKey: '{Query.id}',
});

app.http('getStatus', {
    methods: ['GET'],
    authLevel: 'anonymous',
    extraInputs: [sessionInput],
    handler: (request, context) => {
        context.log(`getStatus function processed a request for ID: ${request.query.get('id')}`);

        // Get the document that the binding found for us.
        const session = context.extraInputs.get(sessionInput);

        if (session) {
            // If the document was found, return it with a 200 OK status.
            return {
                status: 200,
                jsonBody: session
            };
        } else {
            // If the document was not found yet, it means it's still processing.
            // We return a 202 Accepted status to tell the frontend to keep polling.
            return {
                status: 202,
                jsonBody: { status: 'Processing' }
            };
        }
    }
});