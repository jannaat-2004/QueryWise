import React, { useState, useEffect } from 'react';
import { DatabaseInstance, QueryResult } from '../types';
import { SQLiteEngine } from '../lib/sqlite-engine';
import { ChartRenderer } from './ChartRenderer';
import {
  BarChart2,
  Database,
  Sparkles,
  TrendingUp,
  Table,
  Layers,
  ArrowRight,
  RefreshCw,
  PieChart,
  LineChart
} from 'lucide-react';

interface DataInsightsViewProps {
  activeDatabase: DatabaseInstance | null;
  onOpenChatWithQuery: (query: string) => void;
  onOpenDatabaseManager: () => void;
}

export const DataInsightsView: React.FC<DataInsightsViewProps> = ({
  activeDatabase,
  onOpenChatWithQuery,
  onOpenDatabaseManager
}) => {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Generate automated quick insight queries based on active database schema
  const tables = activeDatabase?.tables || [];

  const presetQueries = React.useMemo((): {
    title: string;
    sql: string;
    chartType: 'bar' | 'line' | 'pie';
    xKey: string;
    yKeys: string[];
  }[] => {
    if (!activeDatabase || tables.length === 0) return [];

    if (activeDatabase.templateId === 'retail-sales' || activeDatabase.templateId === 'sales-analytics') {
      return [
        {
          title: 'Total Revenue by Category',
          sql: 'SELECT category, ROUND(SUM(revenue), 2) AS total_revenue, SUM(quantity) AS total_units FROM sales GROUP BY category ORDER BY total_revenue DESC;',
          chartType: 'bar' as const,
          xKey: 'category',
          yKeys: ['total_revenue']
        },
        {
          title: 'Monthly Sales Revenue Trend',
          sql: "SELECT strftime('%Y-%m', sale_date) AS month, ROUND(SUM(revenue), 2) AS monthly_revenue FROM sales GROUP BY month ORDER BY month ASC;",
          chartType: 'line' as const,
          xKey: 'month',
          yKeys: ['monthly_revenue']
        },
        {
          title: 'Top 5 Selling Products by Volume',
          sql: 'SELECT p.product_name, SUM(s.quantity) AS units_sold, ROUND(SUM(s.revenue), 2) AS revenue FROM sales s JOIN products p ON s.product_id = p.product_id GROUP BY p.product_name ORDER BY units_sold DESC LIMIT 5;',
          chartType: 'bar' as const,
          xKey: 'product_name',
          yKeys: ['units_sold']
        }
      ];
    }

    // Generic fallback for any user-uploaded database (SQLite, CSV, Excel)
    const firstTable = tables[0];
    return [
      {
        title: `Row Count & Preview for ${firstTable.name}`,
        sql: `SELECT * FROM "${firstTable.name}" LIMIT 15;`,
        chartType: 'bar' as const,
        xKey: firstTable.columns[0]?.name || 'id',
        yKeys: firstTable.columns.slice(1, 2).map(c => c.name)
      }
    ];
  }, [activeDatabase, tables]);

  // Execute selected preset query against SQLite
  useEffect(() => {
    if (!activeDatabase || presetQueries.length === 0) return;
    const activePreset = presetQueries[selectedPresetIndex] || presetQueries[0];
    if (!activePreset) return;

    setLoading(true);
    SQLiteEngine.executeQuery(activeDatabase.id, activePreset.sql)
      .then(res => {
        setQueryResult(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to run insight query:', err);
        setLoading(false);
      });
  }, [activeDatabase, presetQueries, selectedPresetIndex]);

  if (!activeDatabase) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
          <BarChart2 className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">No Database Connected</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Select an active database to generate automated visual metrics and charts.
        </p>
        <button
          onClick={onOpenDatabaseManager}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all"
        >
          Select Database
        </button>
      </div>
    );
  }

  const activePreset = presetQueries[selectedPresetIndex];

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Data Insights & Analytics</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Automated KPI discovery, dimensional rollups, and interactive chart visualizations for <span className="font-medium text-slate-700 dark:text-slate-300">{activeDatabase.name}</span>.
          </p>
        </div>

        <button
          onClick={() => {
            if (activePreset) {
              onOpenChatWithQuery(activePreset.title);
            }
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-500/25 transition-all self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          <span>Ask Custom Question in Chat</span>
        </button>
      </div>

      {/* Preset Insight Tabs */}
      <div className="flex flex-wrap gap-2">
        {presetQueries.map((pq, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedPresetIndex(idx)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              selectedPresetIndex === idx
                ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shadow-xs'
                : 'bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {pq.chartType === 'line' ? (
              <LineChart className="w-3.5 h-3.5" />
            ) : pq.chartType === 'pie' ? (
              <PieChart className="w-3.5 h-3.5" />
            ) : (
              <BarChart2 className="w-3.5 h-3.5" />
            )}
            <span>{pq.title}</span>
          </button>
        ))}
      </div>

      {/* Visual Analytics Canvas */}
      {loading ? (
        <div className="py-24 rounded-3xl bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Running SQL aggregation in SQLite...</p>
        </div>
      ) : queryResult && !queryResult.error ? (
        <div className="space-y-4">
          {/* Active Preset Query Box */}
          <div className="p-4 rounded-2xl bg-white/90 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs transition-colors">
            <div className="flex items-center gap-2 font-mono text-cyan-700 dark:text-cyan-300 truncate">
              <span className="text-slate-400 dark:text-slate-500">SQL:</span>
              <span className="truncate">{activePreset.sql}</span>
            </div>
            <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] flex-shrink-0 ml-3">
              {queryResult.rowCount} rows • {queryResult.executionTimeMs} ms
            </span>
          </div>

          {/* Render Interactive Chart */}
          <ChartRenderer
            queryResult={queryResult}
            config={{
              type: activePreset.chartType,
              title: activePreset.title,
              xKey: activePreset.xKey,
              yKeys: activePreset.yKeys
            }}
          />
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 text-xs rounded-2xl bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
          No insight data available for this query.
        </div>
      )}
    </div>
  );
};
