import React, { useState } from 'react';
import { DatabaseInstance, Conversation, Message } from '../types';
import {
  Sparkles,
  ArrowRight,
  Database,
  Search,
  BarChart3,
  Code2,
  CheckCircle2,
  MessageSquare,
  Clock,
  Layers,
  TrendingUp,
  FileText,
  Trash2
} from 'lucide-react';

interface DashboardViewProps {
  activeDatabase: DatabaseInstance | null;
  databases: DatabaseInstance[];
  conversations: Conversation[];
  allMessages: Message[];
  onStartChatWithQuery: (query: string) => void;
  onOpenExplorer: () => void;
  onOpenInsights: () => void;
  onOpenDatabaseManager: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  activeDatabase,
  databases,
  conversations,
  allMessages,
  onStartChatWithQuery,
  onOpenExplorer,
  onOpenInsights,
  onOpenDatabaseManager,
  onSelectConversation,
  onDeleteConversation
}) => {
  const [nlQueryInput, setNlQueryInput] = useState('');

  // Real Computed Metrics
  const totalQueries = allMessages.filter(m => m.role === 'user').length;
  const successfulQueries = allMessages.filter(m => m.queryResult && !m.queryResult.error).length;
  const totalDatabases = databases.length;
  const totalTables = databases.reduce((acc, db) => acc + (db.tables ? db.tables.length : 0), 0);
  const successRate = totalQueries > 0 ? Math.round((successfulQueries / totalQueries) * 100) : 100;

  const handleQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQueryInput.trim()) return;
    onStartChatWithQuery(nlQueryInput.trim());
    setNlQueryInput('');
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-2">
      {/* Hero Welcome Banner */}
      <div className="relative rounded-3xl p-8 bg-gradient-to-br from-white/95 via-slate-50/90 to-white/95 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-slate-950/90 border border-slate-200 dark:border-slate-800/80 backdrop-blur-xl shadow-xl overflow-hidden transition-colors">
        {/* Glow gradients */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            Welcome back! Ready to explore your data?
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Ask questions, discover insights, and turn your data into decisions.
          </p>
        </div>

        {/* Natural Language Query Input */}
        <form onSubmit={handleQuerySubmit} className="relative z-10 mt-6 max-w-3xl">
          <div className="relative flex items-center">
            <div className="absolute left-4 text-cyan-600 dark:text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={nlQueryInput}
              onChange={e => setNlQueryInput(e.target.value)}
              placeholder="Ask anything about your database..."
              className="w-full pl-12 pr-32 py-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-lg transition-all"
            />
            <button
              type="submit"
              disabled={!nlQueryInput.trim()}
              className="absolute right-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-500/25 transition-all flex items-center gap-1.5 disabled:opacity-40"
            >
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Active Database Schema Status Bar */}
        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-semibold flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400">
            <Database className="w-3.5 h-3.5" />
            {activeDatabase ? `Active Database: ${activeDatabase.name}` : 'No Database Selected'}
          </span>
          {activeDatabase && activeDatabase.tables && activeDatabase.tables.length > 0 && (
            <span className="font-mono text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-300">
              Tables ({activeDatabase.tables.length}): {activeDatabase.tables.map(t => `${t.name} (${t.rowCount})`).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onStartChatWithQuery('')}
          className="p-6 rounded-2xl bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-cyan-500/50 hover:bg-white dark:hover:bg-slate-900/90 cursor-pointer transition-all group backdrop-blur-md shadow-sm"
        >
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform border border-cyan-500/20">
            <Code2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
            Generate SQL
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Translate complex business questions into validated SQLite queries in seconds with automatic intent classification.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-cyan-600 dark:text-cyan-400 group-hover:translate-x-1 transition-transform">
            <span>Launch Chat</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        <div
          onClick={onOpenExplorer}
          className="p-6 rounded-2xl bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-violet-500/50 hover:bg-white dark:hover:bg-slate-900/90 cursor-pointer transition-all group backdrop-blur-md shadow-sm"
        >
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform border border-violet-500/20">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors">
            Explore Database
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Inspect live schemas, column types, primary/foreign keys, and preview sample records directly from SQLite tables.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-violet-600 dark:text-violet-400 group-hover:translate-x-1 transition-transform">
            <span>Browse Schema</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        <div
          onClick={onOpenInsights}
          className="p-6 rounded-2xl bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-emerald-500/50 hover:bg-white dark:hover:bg-slate-900/90 cursor-pointer transition-all group backdrop-blur-md shadow-sm"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform border border-emerald-500/20">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
            View Data Insights
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Transform raw query results into dynamic bar charts, area charts, donut distributions, and export data to CSV.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
            <span>Open Visualizations</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>
      </div>

      {/* Analytics Cards (Real Application Data) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Queries</span>
            <MessageSquare className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">{totalQueries}</div>
          <p className="text-[11px] text-slate-500 mt-1">Processed by AI engine</p>
        </div>

        <div className="p-5 rounded-2xl bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Successful Queries</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">{successfulQueries}</div>
          <p className="text-[11px] text-emerald-600/90 dark:text-emerald-500/90 mt-1 font-mono">{successRate}% execution rate</p>
        </div>

        <div className="p-5 rounded-2xl bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Connected DBs</span>
            <Database className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">{totalDatabases}</div>
          <p className="text-[11px] text-slate-500 mt-1">Active SQLite instances</p>
        </div>

        <div className="p-5 rounded-2xl bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Available Tables</span>
            <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">{totalTables}</div>
          <p className="text-[11px] text-slate-500 mt-1">Across all databases</p>
        </div>
      </div>

      {/* Visual Charts: Activity & Usage Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Database Distribution */}
        <div className="p-6 rounded-2xl bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Database Distribution & Tables</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total tables mapped across configured datasets</p>
            </div>
            <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </div>

          {databases.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No databases connected yet.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {databases.map((db, idx) => {
                const count = db.tables ? db.tables.length : 0;
                const pct = totalTables > 0 ? Math.round((count / totalTables) * 100) : 0;
                const isActive = activeDatabase?.id === db.id;

                return (
                  <div key={db.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium truncate ${isActive ? 'text-cyan-300 font-bold' : 'text-slate-300'}`}>
                        {db.name} {isActive && '★'}
                      </span>
                      <span className="font-mono text-slate-400">{count} tables ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(8, pct)}%`,
                          background: idx % 2 === 0 ? '#38bdf8' : '#a855f7'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 2: Query Success Rate & Activity */}
        <div className="p-6 rounded-2xl bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Execution Reliability</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Safe execution rate vs execution failures</p>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="flex items-center justify-around py-4">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="12" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={`${successRate * 2.51} 251`}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{successRate}%</span>
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Success</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Valid Queries</div>
                  <div className="text-slate-500 dark:text-slate-400 font-mono">{successfulQueries} runs</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Clarifications / Greetings</div>
                  <div className="text-slate-500 dark:text-slate-400 font-mono">{Math.max(0, totalQueries - successfulQueries)} interactions</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="p-6 rounded-2xl bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Conversations</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Continue previous analytical sessions or review insights</p>
          </div>
          <button
            onClick={() => onStartChatWithQuery('')}
            className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 transition-colors"
          >
            + New Chat
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs">
            No saved conversations yet. Start by asking a question above!
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {conversations.slice(0, 5).map(conv => (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="py-3 px-2 flex items-center justify-between hover:bg-slate-800/40 rounded-xl cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-slate-800/70 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                      {conv.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">
                      Database: <span className="text-cyan-400">{conv.databaseName}</span> • {conv.messageCount} messages
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
