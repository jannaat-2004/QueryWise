import React, { useState } from 'react';
import { ChartConfig, QueryResult } from '../types';
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  Table,
  Download,
  Sparkles,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react';

interface ChartRendererProps {
  queryResult: QueryResult;
  config?: ChartConfig;
  defaultChartType?: 'bar' | 'line' | 'pie' | 'area';
  displayMode?: 'direct_answer' | 'kpi_metric' | 'table' | 'chart_and_table';
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  queryResult,
  config,
  defaultChartType,
  displayMode
}) => {
  const { columns, rows } = queryResult;
  // If displayMode is table or chart type is none, default directly to table view
  const isTablePreferred = displayMode === 'table' || (config && (config.type as string) === 'none');
  const initialType = isTablePreferred ? 'table' : (defaultChartType || config?.type || 'bar');
  const [activeType, setActiveType] = useState<'bar' | 'line' | 'pie' | 'area' | 'table'>(initialType);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Structured Table state: search, sort, pagination
  const [tableSearch, setTableSearch] = useState('');
  const [sortColIdx, setSortColIdx] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm bg-slate-900/40 rounded-xl border border-slate-800/60">
        No data available for visualization.
      </div>
    );
  }

  const isIdCol = (name: string) => /^(id|.*_id)$/i.test(name.trim());

  // Identify category (x-axis) and numeric (y-axis) columns
  const configuredXIdx = config?.xKey
    ? columns.findIndex(c => c.toLowerCase() === config.xKey.toLowerCase())
    : -1;
  const firstTextIdx = columns.findIndex((_, idx) => rows.some(r => typeof r[idx] === 'string'));
  const xIndex = configuredXIdx !== -1
    ? configuredXIdx
    : (isIdCol(columns[0]) && firstTextIdx !== -1 ? firstTextIdx : 0);

  // Find numeric column indices
  let yIndices: number[] = [];
  if (config?.yKeys && config.yKeys.length > 0) {
    yIndices = config.yKeys
      .map(k => columns.findIndex(c => c.toLowerCase() === k.toLowerCase()))
      .filter(idx => idx !== -1 && idx !== xIndex);
  }
  if (yIndices.length === 0) {
    // Auto-detect numeric columns (excluding ID columns)
    columns.forEach((col, idx) => {
      if (idx !== xIndex && !isIdCol(col) && rows.some(r => typeof r[idx] === 'number')) {
        yIndices.push(idx);
      }
    });
  }
  if (yIndices.length === 0) {
    columns.forEach((_, idx) => {
      if (idx !== xIndex && rows.some(r => typeof r[idx] === 'number')) {
        yIndices.push(idx);
      }
    });
  }
  if (yIndices.length === 0 && columns.length > 1) {
    yIndices = [1];
  }

  const primaryYIndex = yIndices[0] ?? (columns.length > 1 ? 1 : 0);
  const primaryYName = columns[primaryYIndex] || 'Value';

  // Support single or multiple grouping columns for chart labels (e.g. "Electronics • Credit Card")
  const groupColIndices =
    primaryYIndex > 1
      ? Array.from({ length: primaryYIndex }, (_, idx) => idx)
      : [xIndex];

  // Extract clean chart items (cap at 20 items for readability)
  const chartData = rows.slice(0, 20).map((r, i) => {
    const compositeLabel = groupColIndices
      .map(idx => r[idx])
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      .map(v => String(v))
      .join(' • ');
    const rawY = Number(r[primaryYIndex]) || 0;
    return {
      id: i,
      label: compositeLabel || `Item ${i + 1}`,
      value: rawY
    };
  });

  const maxValue = Math.max(...chartData.map(d => d.value), 1);
  const totalValue = chartData.reduce((acc, d) => acc + d.value, 0) || 1;

  // Filter and sort for the Data Table
  const filteredRows = rows.filter(r => {
    if (!tableSearch.trim()) return true;
    const term = tableSearch.toLowerCase();
    return r.some(cell => (cell !== null && cell !== undefined ? String(cell).toLowerCase().includes(term) : false));
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortColIdx === null) return 0;
    const valA = a[sortColIdx];
    const valB = b[sortColIdx];
    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (colIdx: number) => {
    if (sortColIdx === colIdx) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColIdx(colIdx);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Export CSV
  const handleExportCsv = () => {
    const header = columns.map(c => `"${c}"`).join(',');
    const body = rows.map(r => r.map(v => (v === null ? '' : `"${String(v).replace(/"/g, '""')}"`)).join(',')).join('\n');
    const csvBlob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `querywise_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const colors = [
    '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#34d399',
    '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#4ade80'
  ];

  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xl mt-2 transition-all ${
      isExpanded
        ? 'fixed inset-3 sm:inset-6 z-50 bg-white/95 dark:bg-slate-950/95 border-cyan-500/40 shadow-2xl flex flex-col overflow-y-auto'
        : 'w-full'
    }`}>
      {/* Chart & Table Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-950/40 gap-2 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
            {activeType === 'table'
              ? (config?.title || (isTablePreferred ? 'Structured Data Table' : 'Tabular Results'))
              : (config?.title || `${primaryYName} by ${columns[xIndex] || 'Category'}`)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            ({rows.length} {rows.length === 1 ? 'record' : 'records'})
          </span>

          {activeType === 'table' && (
            <div className="relative ml-2">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter rows..."
                value={tableSearch}
                onChange={e => {
                  setTableSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 pr-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-32 sm:w-44 font-sans shadow-xs"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* View Mode Switchers */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
            {!isTablePreferred && (
              <>
                <button
                  onClick={() => setActiveType('bar')}
                  className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                    activeType === 'bar'
                      ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 shadow-xs border border-cyan-500/40'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Bar Chart"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setActiveType('line')}
                  className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                    activeType === 'line'
                      ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Line Chart"
                >
                  <LineChart className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setActiveType('area')}
                  className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                    activeType === 'area'
                      ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Area Chart"
                >
                  <AreaChart className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setActiveType('pie')}
                  className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                    activeType === 'pie'
                      ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Donut / Pie Chart"
                >
                  <PieChart className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => setActiveType('table')}
              className={`p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                activeType === 'table'
                  ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Data Table View"
            >
              <Table className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold pr-0.5">Table</span>
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-lg transition-colors"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 p-1 sm:px-2 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-lg transition-colors"
            title={isExpanded ? 'Minimize view' : 'Maximize visualization to full-screen'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5 text-cyan-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Chart Body */}
      <div className="p-4">
        {/* 1. Bar Chart */}
        {activeType === 'bar' && (
          <div className="space-y-2.5 pt-2">
            {chartData.map((d, idx) => {
              const pct = Math.max(4, Math.round((d.value / maxValue) * 100));
              const isHovered = hoveredIndex === idx;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`group relative flex items-center gap-3 p-1 rounded-lg transition-all ${
                    isHovered ? 'bg-cyan-500/10' : ''
                  }`}
                >
                  <div className="w-32 text-xs font-medium text-slate-300 truncate text-right">
                    {d.label}
                  </div>
                  <div className="flex-1 h-6 bg-slate-950/60 rounded-md overflow-hidden relative border border-slate-800/80 flex items-center">
                    <div
                      className="h-full rounded-sm transition-all duration-500 relative"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, #0ea5e9 0%, #8b5cf6 100%)`
                      }}
                    >
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="absolute right-2 text-[11px] font-mono font-medium text-slate-200 drop-shadow">
                      {d.value.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. Line / Area Chart */}
        {(activeType === 'line' || activeType === 'area') && (
          <div className="w-full h-64 pt-2">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 200">
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((step, i) => (
                <line
                  key={i}
                  x1="40"
                  y1={20 + step * 140}
                  x2="480"
                  y2={20 + step * 140}
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Build line coordinates */}
              {(() => {
                const count = chartData.length;
                const width = 440;
                const stepX = count > 1 ? width / (count - 1) : width;
                const points = chartData.map((d, i) => {
                  const x = 40 + i * stepX;
                  const y = 160 - (d.value / maxValue) * 140;
                  return { x, y, ...d };
                });

                const pathD = points.reduce(
                  (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`,
                  ''
                );

                const areaD = `${pathD} L ${points[points.length - 1].x} 160 L ${points[0].x} 160 Z`;

                return (
                  <>
                    {activeType === 'area' && <path d={areaD} fill="url(#areaGradient)" />}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="url(#lineStroke)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Interactive points */}
                    {points.map((pt, i) => (
                      <g
                        key={i}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredIndex === i ? 6 : 4}
                          fill={hoveredIndex === i ? '#38bdf8' : '#8b5cf6'}
                          stroke="#060814"
                          strokeWidth="2"
                        />
                        {hoveredIndex === i && (
                          <g>
                            <rect
                              x={Math.min(400, Math.max(10, pt.x - 45))}
                              y={Math.max(0, pt.y - 30)}
                              width="90"
                              height="22"
                              rx="4"
                              fill="#0f172a"
                              stroke="#38bdf8"
                              strokeWidth="1"
                            />
                            <text
                              x={Math.min(445, Math.max(55, pt.x))}
                              y={Math.max(15, pt.y - 15)}
                              textAnchor="middle"
                              fill="#f1f5f9"
                              fontSize="10"
                              fontFamily="monospace"
                            >
                              {pt.value.toLocaleString()}
                            </text>
                          </g>
                        )}
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        )}

        {/* 3. Donut / Pie Chart */}
        {activeType === 'pie' && (
          <div className="flex flex-col md:flex-row items-center justify-around gap-6 py-4">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {(() => {
                  let accumulatedPercent = 0;
                  return chartData.slice(0, 8).map((d, i) => {
                    const percent = (d.value / totalValue) * 100;
                    const strokeDasharray = `${percent} ${100 - percent}`;
                    const strokeDashoffset = -accumulatedPercent;
                    accumulatedPercent += percent;
                    const color = colors[i % colors.length];

                    return (
                      <circle
                        key={i}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke={color}
                        strokeWidth="18"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase font-semibold text-slate-400">Total</span>
                <span className="text-sm font-mono font-bold text-white">
                  {totalValue > 1000 ? Math.round(totalValue).toLocaleString() : totalValue.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 max-w-xs text-xs">
              {chartData.slice(0, 8).map((d, i) => {
                const pct = Math.round((d.value / totalValue) * 100);
                const color = colors[i % colors.length];
                const isHovered = hoveredIndex === i;
                return (
                  <div
                    key={i}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className={`flex items-center gap-2 p-1.5 rounded-lg border transition-all ${
                      isHovered
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/40 text-slate-300'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="truncate flex-1 font-medium">{d.label}</span>
                    <span className="font-mono text-slate-400 text-[10px]">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Structured Data Table with Search, Sorting, and Pagination */}
        {(activeType === 'table' || displayMode === 'chart_and_table') && (
          <div className={`space-y-3 ${activeType !== 'table' ? 'mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/70' : ''}`}>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/60 shadow-inner">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-950/90 text-slate-700 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-slate-400 dark:text-slate-500 font-mono text-center">#</th>
                    {columns.map((col, colIdx) => {
                      const isSorted = sortColIdx === colIdx;
                      return (
                        <th
                          key={colIdx}
                          onClick={() => handleSort(colIdx)}
                          className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors select-none group"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                              {col}
                            </span>
                            {isSorted ? (
                              sortOrder === 'asc' ? (
                                <ChevronUp className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 font-mono text-slate-800 dark:text-slate-200 text-xs">
                  {pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="py-8 text-center text-slate-400 dark:text-slate-500 italic font-sans">
                        {tableSearch ? `No records matching "${tableSearch}".` : 'No records found.'}
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((row, rowIdx) => {
                      const absoluteIndex = (safePage - 1) * pageSize + rowIdx + 1;
                      return (
                        <tr
                          key={rowIdx}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-center text-slate-400 dark:text-slate-500 text-[11px] font-mono select-none">
                            {absoluteIndex}
                          </td>
                          {row.map((cell, colIdx) => {
                            const colName = columns[colIdx]?.toLowerCase() || '';
                            const isStatus = /status|tier|grade/i.test(colName);
                            const isNumber = typeof cell === 'number';

                            return (
                              <td key={colIdx} className="py-2.5 px-3 whitespace-nowrap">
                                {cell === null || cell === undefined ? (
                                  <span className="text-slate-400 dark:text-slate-600 italic">null</span>
                                ) : isStatus ? (
                                  <span
                                    className={`inline-flex items-center gap-1.5 font-medium text-xs ${
                                      /completed|paid|active|a\b|high/i.test(String(cell))
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : /pending|scheduled|b\b|medium/i.test(String(cell))
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : /cancelled|overdue|f\b|low/i.test(String(cell))
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-cyan-600 dark:text-cyan-400'
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        /completed|paid|active|a\b|high/i.test(String(cell))
                                          ? 'bg-emerald-500'
                                          : /pending|scheduled|b\b|medium/i.test(String(cell))
                                          ? 'bg-amber-500'
                                          : /cancelled|overdue|f\b|low/i.test(String(cell))
                                          ? 'bg-rose-500'
                                          : 'bg-cyan-500'
                                      }`}
                                    />
                                    {String(cell)}
                                  </span>
                                ) : isNumber ? (
                                  <span className="text-cyan-700 dark:text-cyan-300 font-semibold font-mono">
                                    {/revenue|amount|salary|balance|spent|price|bill/i.test(colName)
                                      ? `$${cell.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                                      : cell.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-slate-800 dark:text-slate-200">{String(cell)}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {sortedRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between px-2 text-xs text-slate-500 dark:text-slate-400 gap-2">
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-500">
                  Showing {(safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, sortedRows.length)} of {sortedRows.length} records
                </span>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="p-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      Page <strong className="text-slate-900 dark:text-white font-semibold">{safePage}</strong> of {totalPages}
                    </span>

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="p-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Next Page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
