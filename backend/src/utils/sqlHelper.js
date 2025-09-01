// src/utils/sqlHelper.js

const { Connection, Request } = require('tedious');

// --- NEW: Retry Logic ---
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function executeQuery(config, query, context) {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            // Attempt to execute the query
            return await tryExecuteQuery(config, query, context);
        } catch (error) {
            // If the error is a network error (ESOCKET), we retry
            if (error.code === 'ESOCKET' && i < MAX_RETRIES - 1) {
                context.warn(`Network error detected (ECONNRESET). Retrying in ${RETRY_DELAY_MS}ms... (Attempt ${i + 1}/${MAX_RETRIES})`);
                await new Promise(res => setTimeout(res, RETRY_DELAY_MS)); // Wait before retrying
            } else {
                // If it's not a network error or we've run out of retries, throw the error
                throw error;
            }
        }
    }
}

function tryExecuteQuery(config, query, context) {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);
        connection.on('connect', (err) => {
            if (err) { return reject(err); }
            const request = new Request(query, (err, rowCount) => {
                if (err) { reject(err); }
                connection.close();
            });
            const results = [];
            request.on('row', (columns) => {
                const row = {};
                columns.forEach((column) => { row[column.metadata.colName] = column.value; });
                results.push(row);
            });
            request.on('requestCompleted', () => {
                resolve(results);
            });
            request.on('error', (err) => { reject(err); });
            connection.execSql(request);
        });
        connection.on('error', (err) => { reject(err); });
        connection.connect();
    });
}

module.exports = { executeQuery };