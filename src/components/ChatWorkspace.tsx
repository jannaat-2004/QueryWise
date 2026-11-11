/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Message,
  Conversation,
  DatabaseInstance
} from '../types';
import { SQLiteEngine } from '../lib/sqlite-engine';
import { ChartRenderer } from './ChartRenderer';
import { SqlModal } from './SqlModal';
import {
  Send,
  Sparkles,
  Bot,
  Database,
  Code2,
  Zap,
  BookOpen,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

interface ChatWorkspaceProps {
  activeDatabase: DatabaseInstance | null;
  activeConversation: Conversation | null;
  messages: Message[];
  databases?: DatabaseInstance[];
  onSelectDatabase?: (db: DatabaseInstance) => void;
  onSendMessage: (query: string) => Promise<void>;
  onClearConversation: () => void;
  onOpenDatabaseManager: () => void;
  isLoading: boolean;
  loadingStep?: string;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  activeDatabase,
  activeConversation,
  messages,
  databases = [],
  onSelectDatabase,
  onSendMessage,
  onClearConversation,
  onOpenDatabaseManager,
  isLoading,
  loadingStep
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);
  const [collapsedSql, setCollapsedSql] = useState<Record<string, boolean>>({});

  // SQL Modal state (for Optimize and Explain buttons)
  const [sqlModalConfig, setSqlModalConfig] = useState<{
    isOpen: boolean;
    mode: 'optimize' | 'explain';
    sql: string;
  }>({
    isOpen: false,
    mode: 'explain',
    sql: ''
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle textarea resize
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim() || isLoading) return;
    const query = inputText.trim();
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onSendMessage(query);
  };

  const handleCopySql = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 2000);
  };

  const toggleSqlCollapse = (id: string) => {
    setCollapsedSql(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Find latest SQL in conversation for quick action buttons
  const latestMessageWithSql = [...messages].reverse().find(m => m.sql);
  const activeSql = latestMessageWithSql?.sql || '';

  const schemaContext = activeDatabase
    ? SQLiteEngine.generateSchemaContext(activeDatabase.tables, {
        id: activeDatabase.id,
        name: activeDatabase.name,
        type: activeDatabase.type
      })
    : '';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative bg-transparent">
      {/* 1. Minimal Top Header */}
      <div className="flex-shrink-0 h-11 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-slate-950/40 backdrop-blur-md flex items-center justify-between gap-4 z-10 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px] sm:max-w-xs">
            {activeConversation?.title || 'Interactive Analytics'}
          </span>
          <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">•</span>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>DB:</span>
            {databases.length > 0 && onSelectDatabase ? (
              <select
                value={activeDatabase?.id || ''}
                onChange={e => {
                  const found = databases.find(d => d.id === e.target.value);
                  if (found) onSelectDatabase(found);
                }}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-cyan-700 dark:text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                {databases.map(d => (
                  <option key={d.id} value={d.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-cyan-700 dark:text-cyan-300 font-mono font-medium">{activeDatabase?.name || 'None'}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={onClearConversation}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-[11px] font-medium transition-colors"
              title="Clear current conversation messages"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          <button
            onClick={onOpenDatabaseManager}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/40 text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-300 text-[11px] font-semibold transition-all shadow-xs"
          >
            <Database className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span className="hidden sm:inline">Databases</span>
          </button>
        </div>
      </div>

      {/* 2. Independent Scrollable Message History Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 custom-scrollbar">
        {messages.length === 0 ? (
          /* Empty Chat Welcome State (Minimal, ChatGPT-inspired) */
          <div className="max-w-2xl mx-auto pt-16 pb-8 text-center space-y-5 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20 text-white">
              <Sparkles className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                What would you like to explore today?
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                Connected to <span className="text-cyan-600 dark:text-cyan-300 font-medium">{activeDatabase?.name || 'your dataset'}</span>. Ask in plain English to generate queries, inspect records, or synthesize charts.
              </p>
            </div>
          </div>
        ) : (
          /* Render Messages in a Clean, Centered ChatGPT-style Column */
          <div className="max-w-4xl mx-auto w-full space-y-6 pb-36">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`w-full ${
                  msg.role === 'user' ? 'flex justify-end' : 'flex gap-3 items-start'
                }`}
              >
                {/* Assistant Avatar */}
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                {/* User Message Bubble */}
                {msg.role === 'user' && (
                  <div className="max-w-[78%] rounded-2xl px-4 py-2 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 text-slate-900 dark:text-slate-100 text-sm leading-relaxed shadow-xs">
                    {msg.content}
                  </div>
                )}

                {/* Assistant Response Body: Natural flow, no bulky card enclosing everything */}
                {msg.role === 'assistant' && (
                  <div className="flex-1 min-w-0 space-y-3 text-sm text-slate-200 leading-relaxed">
                    
                    {/* Direct Answer Headline Banner */}
                    {msg.structuredAnswer ? (
                      <div className="space-y-2">
                        {/* Detected Intent Metadata */}
                        {msg.detectedIntent && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            <span className="uppercase text-cyan-600 dark:text-cyan-400 font-medium">
                              {msg.detectedIntent.operation.replace(/_/g, ' ')}
                            </span>
                            {msg.detectedIntent.requestedRowCount ? (
                              <>
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                                <span>{msg.detectedIntent.requestedRowCount} records</span>
                              </>
                            ) : null}
                          </div>
                        )}

                        {/* Direct Headline Callout */}
                        <div className="p-3 sm:p-3.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/70 border-l-4 border-cyan-500 border-y border-r border-slate-200 dark:border-slate-800/80 transition-colors">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight leading-snug">
                            {msg.structuredAnswer.headline}
                          </h3>
                          {msg.structuredAnswer.detailedInsight && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1 whitespace-pre-line">
                              {msg.structuredAnswer.detailedInsight}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed text-sm text-slate-800 dark:text-slate-200">
                        {msg.content}
                      </div>
                    )}

                    {/* Clarification Disambiguation Options */}
                    {msg.clarificationOptions && msg.clarificationOptions.length > 0 && (
                      <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-500/20 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                          <HelpCircle className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>Select a clarification to proceed:</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {msg.clarificationOptions.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => onSendMessage(opt)}
                              className="p-2 rounded-lg bg-white dark:bg-slate-900/90 hover:bg-cyan-50 dark:hover:bg-cyan-500/15 border border-slate-200 dark:border-slate-700/70 hover:border-cyan-500 text-xs text-left text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white transition-all flex items-center justify-between group shadow-xs"
                            >
                              <span className="font-medium truncate pr-1">{opt}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SQL Query Section (Compact syntax block with fast actions) */}
                    {msg.sql && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-950/70 overflow-hidden shadow-xs">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-100/90 dark:bg-slate-950/90">
                          <button
                            onClick={() => toggleSqlCollapse(msg.id)}
                            className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
                          >
                            <Code2 className="w-3 h-3 text-cyan-400" />
                            <span>SQLite Query</span>
                            {collapsedSql[msg.id] ? (
                              <ChevronDown className="w-3 h-3 text-slate-500" />
                            ) : (
                              <ChevronUp className="w-3 h-3 text-slate-500" />
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            {msg.queryResult && !msg.queryResult.error && (
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                {msg.queryResult.rowCount} rows <span className="text-slate-300 dark:text-slate-700">·</span> {msg.queryResult.executionTimeMs} ms
                              </span>
                            )}
                            <button
                              onClick={() => setSqlModalConfig({ isOpen: true, mode: 'explain', sql: msg.sql! })}
                              className="flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors px-2 py-0.5 rounded hover:bg-violet-500/10"
                              title="Inspect clause-by-clause breakdown"
                            >
                              <BookOpen className="w-3 h-3 text-violet-400" />
                              <span className="hidden sm:inline">Explain Clauses</span>
                            </button>
                            <button
                              onClick={() => handleCopySql(msg.id, msg.sql!)}
                              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors px-1.5 py-0.5"
                              title="Copy SQL"
                            >
                              {copiedSqlId === msg.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedSqlId === msg.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>

                        {!collapsedSql[msg.id] && (
                          <pre className="p-3 text-xs font-mono text-cyan-300/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                            {msg.sql}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Query Execution Error (if any) */}
                    {msg.queryResult?.error && (
                      <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span>{msg.queryResult.error}</span>
                      </div>
                    )}

                    {/* KPI Metric Cards */}
                    {msg.kpis && msg.kpis.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {msg.kpis.map((kpi, kIdx) => (
                          <div
                            key={kIdx}
                            className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center"
                          >
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block truncate">
                              {kpi.label}
                            </span>
                            <span className="text-sm font-bold text-white font-mono block mt-0.5">
                              {kpi.value}
                            </span>
                            {kpi.change && (
                              <span
                                className={`text-[10px] font-mono mt-0.5 inline-block ${
                                  kpi.trend === 'up'
                                    ? 'text-emerald-400'
                                    : kpi.trend === 'down'
                                    ? 'text-red-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {kpi.change}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Full-Width Interactive Charts & Data Tables */}
                    {msg.queryResult && !msg.queryResult.error && msg.queryResult.rowCount > 0 && (
                      <div className="w-full pt-1">
                        <ChartRenderer
                          queryResult={msg.queryResult}
                          config={msg.chartConfig}
                          displayMode={msg.structuredAnswer?.displayMode}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator with Animated Stage */}
            {isLoading && (
              <div className="flex gap-3 items-start animate-in fade-in">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs text-cyan-300 font-mono">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin flex-shrink-0" />
                  <span>{loadingStep || 'QueryWise is reasoning over your database schema...'}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 3. Compact ChatGPT-inspired Input Composer Fixed at the Bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-slate-50 via-slate-50/95 dark:from-[#060814] dark:via-[#060814]/95 to-transparent pointer-events-none z-20 transition-colors">
        <div className="max-w-3xl mx-auto w-full pointer-events-auto space-y-2">
          
          {/* Rounded Input Pill */}
          <div className="relative flex items-center rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700/70 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 shadow-2xl backdrop-blur-xl px-3.5 py-1.5 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Ask a question about ${activeDatabase?.name || 'your data'}, request SQL, or visualize metrics...`}
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none max-h-32 py-1 leading-relaxed pl-1 pr-2"
            />

            <button
              onClick={handleSubmit}
              disabled={!inputText.trim() || isLoading}
              className="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center transition-all disabled:opacity-20 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 flex-shrink-0 shadow-sm"
              title="Send query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Auxiliary Micro-Actions & Context DB Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-slate-500">Context:</span>
              <span className="text-cyan-300 font-medium truncate max-w-[150px] sm:max-w-xs">
                {activeDatabase ? activeDatabase.name : 'No DB'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (inputText.trim()) {
                    handleSubmit();
                  }
                }}
                disabled={!inputText.trim()}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
                title="Generate SQL"
              >
                <Code2 className="w-3 h-3 text-cyan-400" />
                <span>SQL</span>
              </button>

              <button
                onClick={() => {
                  if (activeSql) {
                    setSqlModalConfig({ isOpen: true, mode: 'optimize', sql: activeSql });
                  } else {
                    onSendMessage('Can you optimize the most recent query and suggest helpful indexes?');
                  }
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 transition-colors"
                title="Optimize query"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Optimize</span>
              </button>

              <button
                onClick={() => {
                  if (activeSql) {
                    setSqlModalConfig({ isOpen: true, mode: 'explain', sql: activeSql });
                  } else {
                    onSendMessage('Explain how the current query works clause by clause.');
                  }
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 transition-colors"
                title="Clause-by-clause breakdown"
              >
                <BookOpen className="w-3 h-3 text-violet-400" />
                <span>Explain</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SQL Optimize / Explain Modal */}
      <SqlModal
        isOpen={sqlModalConfig.isOpen}
        onClose={() => setSqlModalConfig(prev => ({ ...prev, isOpen: false }))}
        mode={sqlModalConfig.mode}
        sql={sqlModalConfig.sql}
        schemaContext={schemaContext}
      />
    </div>
  );
};
