import React, { useState, useRef } from 'react';
import { DatabaseInstance } from '../types';
import { DEMO_TEMPLATES_METADATA } from '../lib/demo-databases';
import { SQLiteEngine } from '../lib/sqlite-engine';
import {
  Database,
  Plus,
  Upload,
  FileSpreadsheet,
  Check,
  Trash2,
  Layers,
  ArrowRight,
  X,
  FileUp,
  AlertCircle,
  Eye,
  Calendar,
  Sparkles
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface DatabaseManagerViewProps {
  databases: DatabaseInstance[];
  activeDatabase: DatabaseInstance | null;
  onSelectDatabase: (db: DatabaseInstance) => void;
  onAddDatabase: (db: DatabaseInstance) => void;
  onDeleteDatabase: (id: string) => void;
}

export const DatabaseManagerView: React.FC<DatabaseManagerViewProps> = ({
  databases,
  activeDatabase,
  onSelectDatabase,
  onAddDatabase,
  onDeleteDatabase
}) => {
  // Modal states
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('retail-sales');
  const [demoDbName, setDemoDbName] = useState('Retail & Sales Analytics');
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);

  // Upload SQLite states
  const sqliteFileRef = useRef<HTMLInputElement>(null);
  const [sqliteUploadStatus, setSqliteUploadStatus] = useState<string | null>(null);
  const [sqliteDetectedTables, setSqliteDetectedTables] = useState<string[]>([]);
  const [isUploadingSqlite, setIsUploadingSqlite] = useState(false);

  // Import CSV / Excel states
  const spreadsheetFileRef = useRef<HTMLInputElement>(null);
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<{
    fileName: string;
    tableName: string;
    headers: string[];
    sampleRows: (string | number | boolean | null)[][];
    totalRows: number;
    rawBuffer?: ArrayBuffer;
    rawCsvText?: string;
    isExcel: boolean;
  } | null>(null);
  const [isImportingSpreadsheet, setIsImportingSpreadsheet] = useState(false);

  // Delete modal state
  const [deleteConfirmDb, setDeleteConfirmDb] = useState<DatabaseInstance | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle Create Demo Database
  const handleCreateDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingDemo(true);
    setErrorMessage(null);
    try {
      const template = DEMO_TEMPLATES_METADATA.find(t => t.id === selectedTemplateId)!;
      const id = `db_${selectedTemplateId}_${Date.now()}`;
      const name = demoDbName.trim() || template.name;
      const { instance } = await SQLiteEngine.createDemoDatabase(id, name, selectedTemplateId);
      onAddDatabase(instance);
      setIsDemoModalOpen(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreatingDemo(false);
    }
  };

  // Handle SQLite File Upload
  const handleSqliteFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSqlite(true);
    setSqliteUploadStatus('Reading SQLite binary buffer...');
    setErrorMessage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const id = `db_sqlite_${Date.now()}`;
      const name = file.name.replace(/\.[^/.]+$/, '');

      setSqliteUploadStatus('Validating SQLite master tables...');
      const { instance } = await SQLiteEngine.createFromSqliteFile(id, name, arrayBuffer);

      setSqliteDetectedTables(instance.tables.map(t => t.name));
      setSqliteUploadStatus(`Successfully parsed ${instance.tables.length} table(s). Ready!`);
      onAddDatabase(instance);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid SQLite database file.');
      setSqliteUploadStatus(null);
    } finally {
      setIsUploadingSqlite(false);
      if (sqliteFileRef.current) sqliteFileRef.current.value = '';
    }
  };

  // Handle CSV / Excel File Selected for Preview
  const handleSpreadsheetFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    const fileName = file.name;
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const defaultTableName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

    try {
      if (isExcel) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });

        if (!data || data.length === 0) {
          throw new Error('Excel sheet contains no data.');
        }

        const headers = Object.keys(data[0]);
        const sampleRows = data.slice(0, 5).map(row => headers.map(h => (row[h] as string | number | boolean | null)));

        setSpreadsheetPreview({
          fileName,
          tableName: defaultTableName,
          headers,
          sampleRows,
          totalRows: data.length,
          rawBuffer: buffer,
          isExcel: true
        });
      } else {
        // CSV
        const text = await file.text();
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
          preview: 6
        });

        if (!parsed.data || parsed.data.length === 0) {
          throw new Error('CSV file contains no valid data.');
        }

        const headers = parsed.meta.fields || Object.keys(parsed.data[0]);
        const sampleRows = parsed.data.slice(0, 5).map(row => headers.map(h => (row[h] as string | number | boolean | null)));

        setSpreadsheetPreview({
          fileName,
          tableName: defaultTableName,
          headers,
          sampleRows,
          totalRows: parsed.data.length,
          rawCsvText: text,
          isExcel: false
        });
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      if (spreadsheetFileRef.current) spreadsheetFileRef.current.value = '';
    }
  };

  // Confirm Import Spreadsheet into SQLite
  const handleConfirmSpreadsheetImport = async () => {
    if (!spreadsheetPreview) return;
    setIsImportingSpreadsheet(true);
    setErrorMessage(null);

    try {
      const id = `db_imported_${Date.now()}`;
      const dbName = spreadsheetPreview.tableName;

      let instance: DatabaseInstance;

      if (spreadsheetPreview.isExcel && spreadsheetPreview.rawBuffer) {
        const res = await SQLiteEngine.createFromExcel(id, dbName, spreadsheetPreview.rawBuffer);
        instance = res.instance;
      } else if (spreadsheetPreview.rawCsvText) {
        const res = await SQLiteEngine.createFromCsv(
          id,
          dbName,
          spreadsheetPreview.tableName,
          spreadsheetPreview.rawCsvText
        );
        instance = res.instance;
      } else {
        throw new Error('Missing file data');
      }

      onAddDatabase(instance);
      setSpreadsheetPreview(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setIsImportingSpreadsheet(false);
    }
  };

  // Handle Database Deletion
  const handleExecuteDelete = async () => {
    if (!deleteConfirmDb) return;
    try {
      await SQLiteEngine.removeDatabase(deleteConfirmDb.id);
      onDeleteDatabase(deleteConfirmDb.id);
      setDeleteConfirmDb(null);
    } catch (err) {
      console.error('Failed to delete database:', err);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-2">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Database Manager
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
          Connect, upload, and orchestrate independent SQLite databases for AI-powered queries.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3 Connection Option Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* OPTION A: DEMO DATABASE */}
        <div className="p-6 rounded-3xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xl flex flex-col justify-between group hover:border-cyan-500/40 transition-all">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-4 border border-cyan-500/20">
              <Database className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Option A
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">Retail & Sales Analytics Demo</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Launch the built-in Retail & Sales Analytics demo dataset featuring customers, products, and sales transactions.
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedTemplateId('retail-sales');
              setDemoDbName('Retail & Sales Analytics');
              setIsDemoModalOpen(true);
            }}
            className="mt-6 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Demo Database</span>
          </button>
        </div>

        {/* OPTION B: UPLOAD SQLITE */}
        <div className="p-6 rounded-3xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xl flex flex-col justify-between group hover:border-violet-500/40 transition-all">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-4 border border-violet-500/20">
              <Upload className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Option B
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">Upload SQLite File</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Accepts native <code className="text-violet-600 dark:text-violet-300 font-semibold">.db</code>, <code className="text-violet-600 dark:text-violet-300 font-semibold">.sqlite</code>, and <code className="text-violet-600 dark:text-violet-300 font-semibold">.sqlite3</code> files. Queries execute directly in WebAssembly SQLite.
            </p>

            {sqliteUploadStatus && (
              <div className="mt-3 p-2 rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-200 text-[11px] font-mono">
                {sqliteUploadStatus}
              </div>
            )}
          </div>

          <div>
            <input
              type="file"
              ref={sqliteFileRef}
              onChange={handleSqliteFileChange}
              accept=".db,.sqlite,.sqlite3"
              className="hidden"
            />
            <button
              onClick={() => sqliteFileRef.current?.click()}
              disabled={isUploadingSqlite}
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-lg shadow-violet-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isUploadingSqlite ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <FileUp className="w-4 h-4" />
                  <span>Choose SQLite (.db / .sqlite)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* OPTION C: IMPORT CSV / EXCEL */}
        <div className="p-6 rounded-3xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xl flex flex-col justify-between group hover:border-emerald-500/40 transition-all">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Option C
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">Import CSV or Excel</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Accepts <code className="text-emerald-600 dark:text-emerald-300 font-semibold">.csv</code>, <code className="text-emerald-600 dark:text-emerald-300 font-semibold">.xlsx</code>, and <code className="text-emerald-600 dark:text-emerald-300 font-semibold">.xls</code>. Automatically detects types and creates queryable SQLite tables.
            </p>
          </div>

          <div>
            <input
              type="file"
              ref={spreadsheetFileRef}
              onChange={handleSpreadsheetFileChange}
              accept=".csv,.xlsx,.xls"
              className="hidden"
            />
            <button
              onClick={() => spreadsheetFileRef.current?.click()}
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import Spreadsheet</span>
            </button>
          </div>
        </div>
      </div>

      {/* SPREADSHEET PREVIEW & TABLE NAMING MODAL */}
      {spreadsheetPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Import Spreadsheet Data</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  File: <span className="font-mono text-cyan-600 dark:text-cyan-300">{spreadsheetPreview.fileName}</span> ({spreadsheetPreview.totalRows} rows)
                </p>
              </div>
              <button
                onClick={() => setSpreadsheetPreview(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Target SQLite Table Name
              </label>
              <input
                type="text"
                value={spreadsheetPreview.tableName}
                onChange={e => setSpreadsheetPreview({ ...spreadsheetPreview, tableName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-cyan-700 dark:text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                First 5 Rows Preview
              </span>
              <div className="overflow-x-auto max-h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      {spreadsheetPreview.headers.map((h, i) => (
                        <th key={i} className="py-2 px-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {spreadsheetPreview.sampleRows.map((r, rowIdx) => (
                      <tr key={rowIdx}>
                        {r.map((c, colIdx) => (
                          <td key={colIdx} className="py-1.5 px-3 whitespace-nowrap">
                            {c === null ? 'null' : String(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setSpreadsheetPreview(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSpreadsheetImport}
                disabled={isImportingSpreadsheet}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-2"
              >
                {isImportingSpreadsheet ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Import into SQLite</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE DEMO DATABASE MODAL */}
      {isDemoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Create Demo Database Instance</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Generates a fresh, independent SQLite instance</p>
                </div>
              </div>
              <button
                onClick={() => setIsDemoModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDemo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Database Instance Name
                </label>
                <input
                  type="text"
                  value={demoDbName}
                  onChange={e => setDemoDbName(e.target.value)}
                  placeholder="e.g. Q4 Retail Analytics"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Demo Dataset Template
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {DEMO_TEMPLATES_METADATA.map(t => {
                    const isSelected = selectedTemplateId === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTemplateId(t.id);
                          setDemoDbName(t.name);
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer text-xs transition-all ${
                          isSelected
                            ? 'bg-cyan-500/15 border-cyan-500 text-cyan-800 dark:text-white font-semibold'
                            : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{t.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t.category} • Tables: {t.tables.join(', ')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Template Description */}
              {(() => {
                const tmpl = DEMO_TEMPLATES_METADATA.find(t => t.id === selectedTemplateId);
                return tmpl ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                    <span className="text-cyan-700 dark:text-cyan-300 font-semibold block mb-0.5">Template Overview:</span>
                    {tmpl.description}
                  </div>
                ) : null;
              })()}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDemoModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingDemo}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2"
                >
                  {isCreatingDemo ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Create Database</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGED DATABASES LIST */}
      <div className="p-6 rounded-3xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Managed Databases</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Active SQLite databases belonging to your session ({databases.length} total)
            </p>
          </div>
        </div>

        {databases.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
            No databases connected yet. Use the options above to connect your first dataset.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Database Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Tables</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-700 dark:text-slate-200">
                {databases.map(db => {
                  const isActive = activeDatabase?.id === db.id;
                  return (
                    <tr key={db.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>{db.name}</span>
                        </div>
                        {db.templateName && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">Template: {db.templateName}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">
                          {db.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-cyan-700 dark:text-cyan-300 text-xs">
                        {db.tables ? db.tables.length : 0} table(s)
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {new Date(db.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-xs">Inactive</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isActive && (
                            <button
                              onClick={() => onSelectDatabase(db)}
                              className="px-3 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors"
                            >
                              Select
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteConfirmDb(db)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Delete database"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmDb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-red-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-500 dark:text-red-400">
              <div className="p-2 rounded-xl bg-red-500/10">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Database?</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-slate-900 dark:text-white">"{deleteConfirmDb.name}"</span>?
              This will permanently drop the associated SQLite instance and stored schema.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDeleteConfirmDb(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
