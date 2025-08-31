// src/ResultsTable.jsx

import React from 'react';

function ResultsTable({ results }) {
  // --- Edge Case Handling ---
  // If there are no results or the results aren't an array,
  // display a user-friendly message instead of crashing.
  if (!Array.isArray(results) || results.length === 0) {
    return <p className="text-sm text-slate-500 mt-2">No results were returned for this query.</p>;
  }

  // --- Dynamic Header Generation ---
  // Get the column headers by taking the keys from the first object in the results array.
  const headers = Object.keys(results[0]);

  return (
    <div className="overflow-x-auto mt-2 rounded-lg border border-slate-200">
      <table className="min-w-full bg-white">
        <thead className="bg-slate-50">
          <tr>
            {/* Map over the headers to create the table header cells */}
            {headers.map(header => (
              <th key={header} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {/* Map over each row in the results array */}
          {results.map((row, index) => (
            <tr key={index} className="hover:bg-slate-50">
              {/* For each row, map over the headers to ensure the cells are in the correct order */}
              {headers.map(header => (
                <td key={header} className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                  {/* Convert any non-string values (like numbers) to strings for display */}
                  {String(row[header])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ResultsTable;