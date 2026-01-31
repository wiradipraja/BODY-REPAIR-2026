import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Play, Download, Copy, Trash2, Save } from 'lucide-react';

interface QueryResult {
  columns: string[];
  rows: any[];
  error?: string;
  executionTime: number;
}

const SqlEditorView: React.FC = () => {
  const [query, setQuery] = useState('SELECT * FROM bengkel_service_jobs LIMIT 10;');
  const [results, setResults] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savedQueries, setSavedQueries] = useState<{ id: string; name: string; query: string }[]>([]);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Load saved queries from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sqlQueries');
    if (saved) {
      try {
        setSavedQueries(JSON.parse(saved));
      } catch {
        // Invalid JSON, skip
      }
    }
  }, []);

  // Save query to localStorage
  const saveQuery = () => {
    const name = prompt('Enter query name:');
    if (!name) return;

    const newQuery = {
      id: Date.now().toString(),
      name,
      query
    };

    const updated = [...savedQueries, newQuery];
    setSavedQueries(updated);
    localStorage.setItem('sqlQueries', JSON.stringify(updated));
    alert('Query saved successfully!');
  };

  // Delete saved query
  const deleteSavedQuery = (id: string) => {
    const updated = savedQueries.filter(q => q.id !== id);
    setSavedQueries(updated);
    localStorage.setItem('sqlQueries', JSON.stringify(updated));
  };

  // Load saved query
  const loadSavedQuery = (savedQuery: string) => {
    setQuery(savedQuery);
    setShowSavedQueries(false);
  };

  // Execute query
  const executeQuery = async () => {
    if (!query.trim()) {
      alert('Please enter a query');
      return;
    }

    setIsLoading(true);
    const startTime = performance.now();

    try {
      // Using raw SQL via Supabase
      const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: query
      });

      const endTime = performance.now();

      if (error) {
        setResults({
          columns: [],
          rows: [],
          error: error.message,
          executionTime: endTime - startTime
        });
      } else {
        const rows = Array.isArray(data) ? data : [];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        setResults({
          columns,
          rows,
          executionTime: endTime - startTime
        });
      }
    } catch (err: any) {
      setResults({
        columns: [],
        rows: [],
        error: err.message || 'Unknown error',
        executionTime: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Copy results to clipboard
  const copyToClipboard = () => {
    if (!results || results.rows.length === 0) return;
    
    const csv = [
      results.columns.join(','),
      ...results.rows.map(row => 
        results.columns.map(col => {
          const val = row[col];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        }).join(',')
      )
    ].join('\n');
    
    navigator.clipboard.writeText(csv);
    alert('Results copied to clipboard!');
  };

  // Export results to CSV
  const exportToCsv = () => {
    if (!results || results.rows.length === 0) return;

    const csv = [
      results.columns.join(','),
      ...results.rows.map(row => 
        results.columns.map(col => {
          const val = row[col];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Clear query
  const clearQuery = () => {
    if (window.confirm('Clear the query editor?')) {
      setQuery('');
      setResults(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white p-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">SQL Query Editor</h1>
        <p className="text-gray-600">Execute SQL queries directly on your Supabase database</p>
      </div>

      <div className="flex gap-4 mb-4">
        <button
          onClick={executeQuery}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          <Play size={18} />
          {isLoading ? 'Executing...' : 'Execute Query'}
        </button>

        <button
          onClick={saveQuery}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Save size={18} />
          Save Query
        </button>

        <button
          onClick={() => setShowSavedQueries(!showSavedQueries)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Saved Queries ({savedQueries.length})
        </button>

        <button
          onClick={clearQuery}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Trash2 size={18} />
          Clear
        </button>
      </div>

      {/* Saved Queries Panel */}
      {showSavedQueries && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-semibold mb-2 text-purple-900">Saved Queries</h3>
          {savedQueries.length === 0 ? (
            <p className="text-gray-600 text-sm">No saved queries yet</p>
          ) : (
            <div className="space-y-2">
              {savedQueries.map(sq => (
                <div key={sq.id} className="flex items-center justify-between bg-white p-2 rounded border border-purple-100">
                  <button
                    onClick={() => loadSavedQuery(sq.query)}
                    className="text-left flex-1 text-sm font-medium text-blue-600 hover:underline"
                  >
                    {sq.name}
                  </button>
                  <button
                    onClick={() => deleteSavedQuery(sq.id)}
                    className="ml-2 p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Query Editor */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-2">SQL Query</label>
        <textarea
          ref={editorRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-40 p-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter your SQL query here..."
        />
      </div>

      {/* Results Panel */}
      {results && (
        <div className="flex-1 overflow-auto bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              {results.error ? (
                <div className="text-red-600 font-semibold">Error</div>
              ) : (
                <div className="text-sm text-gray-600">
                  {results.rows.length} rows returned in {results.executionTime.toFixed(2)}ms
                </div>
              )}
            </div>
            {!results.error && results.rows.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
                >
                  <Copy size={16} />
                  Copy
                </button>
                <button
                  onClick={exportToCsv}
                  className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm"
                >
                  <Download size={16} />
                  CSV
                </button>
              </div>
            )}
          </div>

          {results.error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded font-mono text-sm">
              {results.error}
            </div>
          ) : results.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-200 border-b border-gray-300">
                    {results.columns.map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-semibold text-gray-800 border-r border-gray-300">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-200 hover:bg-gray-100">
                      {results.columns.map((col) => (
                        <td key={`${idx}-${col}`} className="px-3 py-2 border-r border-gray-300 text-gray-700 max-w-xs truncate">
                          {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-600 py-6">No results to display</div>
          )}
        </div>
      )}
    </div>
  );
};

export default SqlEditorView;
