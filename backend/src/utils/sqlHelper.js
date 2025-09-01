// src/utils/sqlHelper.js

const { Connection, Request } = require('tedious');

function executeQuery(config, query, context) {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) {
                context.error('Connection failed:', err);
                return reject(err);
            }
            context.log('Successfully connected to Azure SQL.');
            const request = new Request(query, (err, rowCount) => {
                if (err) {
                    context.error('Request failed:', err);
                    reject(err);
                }
                connection.close();
            });
            const results = [];
            request.on('row', (columns) => {
                const row = {};
                columns.forEach((column) => {
                    row[column.metadata.colName] = column.value;
                });
                results.push(row);
            });
            request.on('requestCompleted', () => {
                // *** THE FIX IS HERE ***
                // We use results.length instead of the out-of-scope rowCount variable.
                context.log(`Request completed. Rows found: ${results.length}`);
                resolve(results);
            });
            request.on('error', (err) => {
                context.error('Request error event:', err);
                reject(err);
            });
            connection.execSql(request);
        });

        connection.on('error', (err) => {
            context.error('Connection-level error:', err);
            reject(err);
        });

        connection.connect();
    });
}

module.exports = { executeQuery };