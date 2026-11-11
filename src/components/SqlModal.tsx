/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Copy, Zap, BookOpen, Layers, Sparkles } from 'lucide-react';
import { deconstructSqlClauses, ClauseExplanation } from '../lib/sql-explainer';
import { apiUrl } from '../lib/api';

interface SqlModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'optimize' | 'explain';
  sql: string;
  schemaContext: string;
}

export const SqlModal: React.FC<SqlModalProps> = ({
  isOpen,
  onClose,
  mode: initialMode,
  sql,
  schemaContext
}) => {
  const [activeTab, setActiveTab] = useState<'explain' | 'optimize'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    optimizedSql?: string;
    explanation?: string;
    suggestedIndexes?: string[];
    breakdown?: ClauseExplanation[];
    businessContext?: string;
    complexity?: 'Simple' | 'Intermediate' | 'Advanced';
  } | null>(null);

  // Sync active tab when modal is opened or mode prop changes
  useEffect(() => {
    setActiveTab(initialMode);
  }, [initialMode, isOpen]);

  // Zero-latency instant breakdown + background enrichment
  useEffect(() => {
    if (!isOpen || !sql) return;

    // 1. Instant local deconstruction (0ms latency, guaranteed accurate)
    const local = deconstructSqlClauses(sql);

    // Initial state rendered immediately without spinning wheel
    setResult({
      explanation: local.overview,
      breakdown: local.breakdown,
      businessContext: local.businessContext,
      complexity: local.complexity,
      optimizedSql: sql,
      suggestedIndexes: generateLocalIndexHints(sql)
    });

    // 2. Fetch server enrichment in background if needed
    const endpoint = apiUrl(activeTab === 'optimize' ? '/api/sql/optimize' : '/api/sql/explain');
    
    // For optimize mode, show subtle loading if we need deep index analysis
    if (activeTab === 'optimize') {
      setLoading(true);
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, schemaContext })
    })
      .then(res => res.json())
      .then(data => {
        setResult(prev => ({
          ...prev,
          explanation: data.explanation || prev?.explanation || local.overview,
          breakdown: (data.breakdown && data.breakdown.length > 0) ? data.breakdown : (prev?.breakdown || local.breakdown),
          businessContext: data.businessContext || prev?.businessContext || local.businessContext,
          complexity: data.complexity || prev?.complexity || local.complexity,
          optimizedSql: data.optimizedSql || prev?.optimizedSql || sql,
          suggestedIndexes: (data.suggestedIndexes && data.suggestedIndexes.length > 0)
            ? data.suggestedIndexes
            : (prev?.suggestedIndexes || generateLocalIndexHints(sql))
        }));
        setLoading(false);
      })
      .catch(err => {
        console.warn(`Background ${activeTab} enrichment skipped:`, err);
        setLoading(false);
      });
  }, [isOpen, activeTab, sql, schemaContext]);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getKeywordTextColor = (kw: string) => {
    if (kw === 'SELECT') return 'text-cyan-400';
    if (kw === 'FROM') return 'text-blue-400';
    if (kw.includes('JOIN')) return 'text-indigo-400';
    if (kw === 'WHERE') return 'text-amber-400';
    if (kw === 'GROUP BY' || kw === 'HAVING') return 'text-purple-400';
    if (kw === 'ORDER BY') return 'text-emerald-400';
    if (kw === 'LIMIT') return 'text-rose-400';
    return 'text-slate-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-slate-100 transition-colors">
        
        {/* Header with Mode Tabs */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/70">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('explain')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'explain'
                  ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>SQL Clause-by-Clause</span>
            </button>

            <button
              onClick={() => setActiveTab('optimize')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'optimize'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Optimization Advisor</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm custom-scrollbar">
          
          {/* Target Query Display */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                SQL Query Analyzed
              </span>
              <button
                onClick={() => handleCopy(sql)}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-mono"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
              {sql}
            </pre>
          </div>

          {/* Explain Mode: Immediate Clause-by-Clause Breakdown */}
          {activeTab === 'explain' && result && (
            <div className="space-y-4">
              
              {/* Executive Overview Card */}
              {result.explanation && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-cyan-500/20 shadow-sm flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 mt-0.5 flex-shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide uppercase mb-1">
                      Query Execution Overview
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {result.explanation}
                    </p>
                  </div>
                </div>
              )}

              {/* Clause-by-Clause Breakdown Cards */}
              {result.breakdown && result.breakdown.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                      Clause-by-Clause Breakdown ({result.breakdown.length} Clauses)
                    </h4>
                  </div>

                  <div className="space-y-2">
                    {result.breakdown.map((item, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-all space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className={`text-xs font-mono font-bold tracking-wide ${getKeywordTextColor(item.keyword)}`}>
                              {item.keyword}
                            </span>
                            <span className="font-mono text-xs text-slate-200 font-semibold truncate max-w-md">
                              {item.expression}
                            </span>
                          </div>
                          {item.purpose && (
                            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                              {item.purpose}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed pl-1 pt-0.5">
                          {item.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Business Context Card */}
              {result.businessContext && (
                <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400 leading-relaxed flex items-center gap-2">
                  <span className="font-bold text-slate-300 flex-shrink-0">Analytics Utility:</span>
                  <span>{result.businessContext}</span>
                </div>
              )}
            </div>
          )}

          {/* Optimize Mode */}
          {activeTab === 'optimize' && (
            <div className="space-y-4">
              {loading && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin flex-shrink-0" />
                  <span>Evaluating database query plan and index coverage...</span>
                </div>
              )}

              {result?.optimizedSql && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      Optimized SQL Query
                    </span>
                    <button
                      onClick={() => handleCopy(result.optimizedSql!)}
                      className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-mono"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Optimized</span>
                    </button>
                  </div>
                  <pre className="p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                    {result.optimizedSql}
                  </pre>
                </div>
              )}

              {result?.explanation && (
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Performance Notes
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {result.explanation}
                  </p>
                </div>
              )}

              {result?.suggestedIndexes && result.suggestedIndexes.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    Recommended SQLite Index Creations
                  </h4>
                  <div className="space-y-1.5">
                    {result.suggestedIndexes.map((idx, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-cyan-300 flex items-center justify-between group"
                      >
                        <span className="truncate pr-2">{idx}</span>
                        <button
                          onClick={() => handleCopy(idx)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity p-1"
                          title="Copy Index Statement"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-slate-800/80 bg-slate-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

function generateLocalIndexHints(sql: string): string[] {
  const hints: string[] = [];
  const fromMatch = sql.match(/\bFROM\s+["']?([a-zA-Z0-9_]+)["']?/i);
  const table = fromMatch ? fromMatch[1] : 'data_table';

  // Where columns
  const whereMatch = sql.match(/\bWHERE\s+([^;]+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
  if (whereMatch) {
    const colMatches = Array.from(whereMatch[1].matchAll(/["']?([a-zA-Z0-9_]+)["']?\s*(?:=|<|>|LIKE|IN)/gi));
    for (const cm of colMatches) {
      if (!/AND|OR|NOT|NULL/i.test(cm[1])) {
        hints.push(`CREATE INDEX IF NOT EXISTS idx_${table}_${cm[1]} ON "${table}"("${cm[1]}");`);
      }
    }
  }

  // Order by columns
  const orderMatch = sql.match(/\bORDER\s+BY\s+["']?([a-zA-Z0-9_]+)["']?/i);
  if (orderMatch && orderMatch[1]) {
    hints.push(`CREATE INDEX IF NOT EXISTS idx_${table}_order ON "${table}"("${orderMatch[1]}");`);
  }

  if (hints.length === 0) {
    hints.push(`CREATE INDEX IF NOT EXISTS idx_${table}_lookup ON "${table}"(id);`);
  }

  return Array.from(new Set(hints));
}
