import React from 'react';
import {
  BookOpen,
  Database,
  Search,
  MessageSquare,
  HelpCircle,
  Zap,
  Code2,
  BarChart2,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface UserGuideViewProps {
  onStartChat: () => void;
  onOpenDatabaseManager: () => void;
}

export const UserGuideView: React.FC<UserGuideViewProps> = ({
  onStartChat,
  onOpenDatabaseManager
}) => {
  const sections = [
    {
      icon: Database,
      title: '1. Connecting & Managing Databases',
      description: 'QueryWise supports 3 flexible ways to connect data:',
      points: [
        'Built-in Demo Database: Preloaded Retail & Sales Analytics dataset featuring customers, products, and sales transactions.',
        'Upload Native SQLite: Drag-and-drop .db, .sqlite, or .sqlite3 files. They are parsed directly by the client-side WebAssembly SQLite engine.',
        'Import CSV & Excel: Upload .csv, .xlsx, or .xls spreadsheets. Column types are automatically inferred and transformed into native SQLite tables.'
      ]
    },
    {
      icon: MessageSquare,
      title: '2. Natural Language Queries',
      description: 'Interact with your data using ordinary everyday English without writing code:',
      points: [
        'Ask about metrics, categories, sums, averages, or rankings (e.g. "What is our highest revenue category?").',
        'Conversational memory: Ask follow-up questions naturally (e.g. "What about for last month?" or "Filter by top 3 only").',
        'Intent Classification: Greetings, general Q&A, and technical queries are classified appropriately so no unwanted SQL is run.'
      ]
    },
    {
      icon: HelpCircle,
      title: '3. Intelligent Clarification Engine',
      description: 'Never guess blindly when queries are ambiguous:',
      points: [
        'If you type a vague prompt like "Show sales" or "Who is the best employee?", QueryWise detects ambiguity.',
        'The assistant responds with clarifying questions and offers interactive choice buttons (e.g. total revenue vs monthly breakdown).',
        'Clicking an option seamlessly resumes the query pipeline with your refined intent.'
      ]
    },
    {
      icon: ShieldCheck,
      title: '4. SQL Safety & Validation Pipeline',
      description: 'Enterprise-grade safeguards protect your data:',
      points: [
        'Strict Read-Only Enforcement: Only SELECT (and WITH ... SELECT) operations are allowed.',
        'Destructive statements (DROP, DELETE, UPDATE, ALTER, TRUNCATE, INSERT) are intercepted and rejected prior to execution.',
        'Protection against multi-statement injection and unauthorized system PRAGMA operations.'
      ]
    },
    {
      icon: BarChart2,
      title: '5. Instant Charts & Data Insights',
      description: 'Visualizations generated from actual query results:',
      points: [
        'Automatic chart recommendation: Bar charts for categories, Line/Area charts for timelines, and Donut charts for proportions.',
        'Interactive Toolbar: Switch freely between Bar, Line, Area, Donut, and raw data table views.',
        'One-click CSV Export: Download query results directly to your local workstation.'
      ]
    },
    {
      icon: Zap,
      title: '6. SQL Optimize & SQL Explain',
      description: 'Deep dive into database query mechanics:',
      points: [
        'Optimize SQL: Analyzes queries to suggest helpful indexes, refactor redundant joins, and improve filter performance.',
        'Explain SQL: Deconstructs the SQL query clause by clause (SELECT, FROM, JOIN, WHERE, GROUP BY) in simple business language.'
      ]
    }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-2">
      {/* Header */}
      <div className="rounded-3xl p-8 bg-gradient-to-br from-white/90 via-slate-50/80 to-slate-100/90 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-slate-950/90 border border-slate-200 dark:border-slate-800/80 backdrop-blur-xl shadow-xl dark:shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            QueryWise User Guide & Workflow Manual
          </h1>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            Learn how QueryWise translates ordinary human questions into safe, verified SQL queries, powers clarification loops, and produces actionable analytics.
          </p>

          <div className="flex items-center gap-3 pt-3">
            <button
              onClick={onStartChat}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Open Chat Workspace</span>
            </button>

            <button
              onClick={onOpenDatabaseManager}
              className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              Choose a Database
            </button>
          </div>
        </div>
      </div>

      {/* Guide Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sections.map((sec, idx) => {
          const Icon = sec.icon;
          return (
            <div
              key={idx}
              className="p-6 rounded-3xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-lg space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{sec.title}</h3>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{sec.description}</p>

                <ul className="space-y-2 pt-1 text-xs text-slate-600 dark:text-slate-400">
                  {sec.points.map((pt, pIdx) => (
                    <li key={pIdx} className="flex items-start gap-2 leading-relaxed">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
