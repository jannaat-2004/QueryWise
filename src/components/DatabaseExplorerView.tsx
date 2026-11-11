import React, { useState } from 'react';
import { DatabaseInstance, QueryResult } from '../types';
import { SQLiteEngine } from '../lib/sqlite-engine';
import {
  Search,
  Database,
  Table,
  Key,
  ChevronDown,
  ChevronRight,
  Eye,
  Layers,
  Sparkles,
  ArrowRight,
  AlertCircle
} from 'lucide-react';

interface DatabaseExplorerViewProps {
  activeDatabase: DatabaseInstance | null;
  onQueryTable: (tableName: string) => void;
  onOpenDatabaseManager: () => void;
}

export const DatabaseExplorerView: React.FC<DatabaseExplorerViewProps> = ({
  activeDatabase,
  onQueryTable,
  onOpenDatabaseManager
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [tablePreview, setTablePreview] = useState<{
    tableName: string;
    result: QueryResult;
    loading: boolean;
  } | null>(null);

  if (!activeDatabase) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
          <Database className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-white">No Active Database Selected</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Select or connect a database from the Database Manager to inspect its schema and preview table rows.
        </p>
        <button
          onClick={onOpenDatabaseManager}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all"
        >
          Choose a Database
        </button>
      </div>
    );
  }

  const tables = activeDatabase.tables || [];

  const filteredTables = tables.filter(t => {
    const matchesTable = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCol = t.columns.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTable || matchesCol;
  });

  const toggleTable = (name: string) => {
    setExpandedTables(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handlePreviewTable = async (tableName: string) => {
    setTablePreview({ tableName, result: { columns: [], rows: [], rowCount: 0, executionTimeMs: 0 }, loading: true });
    try {
      const res = await SQLiteEngine.previewTable(activeDatabase.id, tableName, 25, activeDatabase.templateId);
      setTablePreview({ tableName, result: res, loading: false });
    } catch (err) {
      console.error('Failed to preview table:', err);
      setTablePreview(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Database Explorer</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Browse tables, inspect column definitions, examine row distributions, and preview live data in <span className="font-medium text-slate-700 dark:text-slate-300">{activeDatabase.name}</span>.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tables or columns..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 shadow-xs"
          />
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTables.map(tbl => {
          const isExpanded = expandedTables[tbl.name] ?? true;
          return (
            <div
              key={tbl.name}
              className="rounded-2xl bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md overflow-hidden shadow-sm flex flex-col justify-between transition-colors"
            >
              {/* Table Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/40">
                <div className="flex items-center justify-between">
                  <div
                    onClick={() => toggleTable(tbl.name)}
                    className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-900 dark:text-white hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <Table className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="font-mono">{tbl.name}</span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {tbl.rowCount} rows
                  </span>
                </div>
              </div>

              {/* Columns List */}
              {isExpanded && (
                <div className="p-3 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/50 space-y-1">
                  {tbl.columns.map((c, idx) => (
                    <div
                      key={idx}
                      className="pt-1.5 pb-1 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 min-w-0">
                        {c.primaryKey && (
                          <span title="Primary Key">
                            <Key className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                          </span>
                        )}
                        <span className={c.primaryKey ? 'text-amber-600 dark:text-amber-300 font-semibold' : ''}>
                          {c.name}
                        </span>
                        {c.foreignKey && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/30 truncate" title={`Foreign Key -> ${c.foreignKey.table}.${c.foreignKey.column}`}>
                            → {c.foreignKey.table}.{c.foreignKey.column}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">{c.type}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Toolbar */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30 flex items-center justify-between gap-2">
                <button
                  onClick={() => handlePreviewTable(tbl.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white text-xs font-medium transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview Data</span>
                </button>

                <button
                  onClick={() => onQueryTable(tbl.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Query Table</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* TABLE DATA PREVIEW MODAL */}
      {tablePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Table className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-mono">
                    Table: {tablePreview.tableName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Live preview (first 25 rows executed in SQLite WebAssembly)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTablePreview(null)}
                className="text-slate-400 hover:text-white px-2 py-1 text-sm font-semibold rounded-lg hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {tablePreview.loading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <p className="text-xs text-slate-400 font-mono">Executing SELECT * LIMIT 25...</p>
              </div>
            ) : tablePreview.result.error ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {tablePreview.result.error}
              </div>
            ) : (
              <div className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-950/70">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 text-slate-600">#</th>
                      {tablePreview.result.columns.map((c, i) => (
                        <th key={i} className="py-2.5 px-3 whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {tablePreview.result.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-600">{rowIdx + 1}</td>
                        {row.map((cell, colIdx) => (
                          <td key={colIdx} className="py-2 px-3 whitespace-nowrap">
                            {cell === null ? (
                              <span className="text-slate-600 italic">null</span>
                            ) : typeof cell === 'number' ? (
                              <span className="text-cyan-300">{cell.toLocaleString()}</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-800 text-xs text-slate-400 font-mono">
              <span>{tablePreview.result.rowCount} rows returned in {tablePreview.result.executionTimeMs} ms</span>
              <button
                onClick={() => {
                  const tbl = tablePreview.tableName;
                  setTablePreview(null);
                  onQueryTable(tbl);
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 transition-colors"
              >
                <span>Ask AI About This Table</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
