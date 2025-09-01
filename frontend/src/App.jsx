// src/App.jsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ResultsTable from './ResultsTable';

const API_BASE_URL = 'http://localhost:7071/api';

function App() {
  const [question, setQuestion] = useState('');
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/getSessionHistory`);
      setSessions(response.data);
    } catch (err) {
      setError('Could not fetch session history.');
      console.error(err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!question) return;
    setIsLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/onQueryReceived`, { question: question });
      // We increase the timeout slightly to allow for the extra AI calls
      setTimeout(() => {
        fetchHistory();
        setIsLoading(false);
        setQuestion('');
      }, 12000); // Increased timeout to 12 seconds
    } catch (err) {
      setError('An error occurred while submitting your question.');
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto p-4 pt-8">
        <h1 className="text-4xl font-bold text-center text-slate-800">Azure Data Lab 💬</h1>
        <p className="text-center text-slate-600 mt-2 mb-8">
          Ask a question about your data in plain English. (e.g., "show me the top 3 products")
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter your question here..."
            disabled={isLoading}
            className="flex-grow p-3 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-sm hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
          >
            {isLoading ? 'Thinking...' : 'Ask'}
          </button>
        </form>

        {error && <p className="text-red-500 text-center">{error}</p>}

        <div className="mt-12">
          <h2 className="text-2xl font-semibold text-slate-700 mb-4">History</h2>
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <p className="font-medium text-slate-800">
                  <strong>Question:</strong> {session.userQuestion}
                </p>
                <p className="mt-2">
                  <strong>Status:</strong>
                  <span className={`font-bold ml-2 ${session.status === 'Succeeded' ? 'text-green-600' : 'text-red-600'}`}>
                    {session.status}
                  </span>
                </p>

                {session.status === 'Succeeded' ? (
                  <div className="mt-4">
                    {/* --- NEW: Display the Summary --- */}
                    {session.resultSummary && (
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg mb-4">
                        <p><strong>Summary:</strong> {session.resultSummary}</p>
                      </div>
                    )}
                    
                    {/* --- NEW: Display the Explanation --- */}
                    <h3 className="font-semibold text-slate-600">Generated SQL Query:</h3>
                    {session.sqlExplanation && (
                      <p className="text-sm text-slate-500 italic mb-1">{session.sqlExplanation}</p>
                    )}
                    <pre className="bg-slate-100 p-3 mt-1 rounded-md overflow-x-auto">
                      <code>{session.generatedSql}</code>
                    </pre>

                    <h3 className="font-semibold text-slate-600 mt-4">Results:</h3>
                    <ResultsTable results={session.results} />
                  </div>
                ) : (
                  <p className="mt-2">
                    <strong>Error:</strong> {session.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;