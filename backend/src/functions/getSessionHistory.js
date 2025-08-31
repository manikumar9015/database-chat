const { app, input } = require('@azure/functions');

// This defines the Cosmos DB input binding correctly for the v4 model
const sessionsInput = input.cosmosDB({
    databaseName: 'DataLabDB',
    containerName: 'Sessions',
    connection: 'COSMOS_CONNECTION_STRING', // Correct connection string name
    sqlQuery: "SELECT * FROM c ORDER BY c.timestamp DESC"
});

app.http('getSessionHistory', {
    methods: ['GET'],
    authLevel: 'anonymous',
    // We reference the correctly defined input binding here
    extraInputs: [sessionsInput],
    handler: (request, context) => {
        context.log(`getSessionHistory function processed a request.`);

        // The data from the input binding is now available on context.extraInputs
        const sessions = context.extraInputs.get(sessionsInput);

        // If sessions is null (e.g., container is empty), return an empty array
        return {
            jsonBody: sessions || []
        };
    }
});