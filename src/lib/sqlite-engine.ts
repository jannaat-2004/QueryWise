// @ts-expect-error sql.js provides untyped inline wasm bundle
import initSqlJsInline from 'sql.js/dist/sql-wasm-inline.js';
import initSqlJsStandard, { Database, SqlJsStatic } from 'sql.js';
import { DatabaseInstance, QueryResult, TableDefinition, ColumnDefinition } from '../types';
import { getDemoDatabaseDefinition } from './demo-databases';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

let sqlPromise: Promise<SqlJsStatic> | null = null;

export async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      try {
        // 1. First preference: Self-contained inline WebAssembly (zero network/CDN fetch)
        return await initSqlJsInline();
      } catch (err) {
        console.warn('Inline sql.js failed, attempting local /sql-wasm.wasm:', err);
        try {
          // 2. Second preference: Local public /sql-wasm.wasm
          return await initSqlJsStandard({
            locateFile: () => '/sql-wasm.wasm'
          });
        } catch (err2) {
          console.warn('Local wasm failed, falling back to CDN:', err2);
          // 3. Fallback to CDN
          return await initSqlJsStandard({
            locateFile: file => `https://sql.js.org/dist/${file}`
          });
        }
      }
    })();
  }
  return sqlPromise;
}

// In-memory registry of active SQLite Database instances keyed by databaseId
const dbRegistry = new Map<string, Database>();

const IDB_NAME = 'querywise_idb_storage';
const IDB_STORE = 'databases';

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveBlobToIndexedDb(dbId: string, data: Uint8Array): Promise<void> {
  const idb = await openIndexedDb();
  if (!idb) return;
  await new Promise<void>(resolve => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, dbId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadBlobFromIndexedDb(dbId: string): Promise<Uint8Array | null> {
  const idb = await openIndexedDb();
  if (!idb) return null;
  return new Promise(resolve => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(dbId);
      req.onsuccess = () => {
        if (req.result instanceof Uint8Array) {
          resolve(req.result);
        } else if (req.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(req.result));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function deleteBlobFromIndexedDb(dbId: string): Promise<void> {
  const idb = await openIndexedDb();
  if (!idb) return;
  await new Promise<void>(resolve => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(dbId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export class SQLiteEngine {
  static lookupTemplateId(dbId: string): string | null {
    if (dbId.includes('retail-sales') || dbId.includes('sales-analytics')) {
      return 'retail-sales';
    }
    return null;
  }

  static async getDatabase(dbId: string, templateId?: string): Promise<Database | null> {
    if (dbRegistry.has(dbId)) {
      return dbRegistry.get(dbId)!;
    }

    // 1a. Check IndexedDB binary store (supports large SQLite / CSV / Excel databases)
    const idbBytes = await loadBlobFromIndexedDb(dbId);
    if (idbBytes) {
      try {
        const SQL = await getSqlJs();
        const db = new SQL.Database(idbBytes);
        dbRegistry.set(dbId, db);
        return db;
      } catch (err) {
        console.warn('Failed restoring db from IndexedDB:', err);
      }
    }

    // 1b. Check localStorage cache
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(`querywise_db_blob_${dbId}`);
      if (stored) {
        try {
          const SQL = await getSqlJs();
          const binary = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
          const db = new SQL.Database(binary);
          dbRegistry.set(dbId, db);
          return db;
        } catch (err) {
          console.warn('Failed restoring db from storage:', err);
        }
      }
    }

    // 2. If it is the Retail & Sales Analytics demo database, re-seed in memory immediately
    const tId = templateId || this.lookupTemplateId(dbId);
    if (tId === 'retail-sales' || tId === 'sales-analytics') {
      try {
        const template = getDemoDatabaseDefinition(tId);
        const SQL = await getSqlJs();
        const db = new SQL.Database();
        db.run(template.schemaSql);
        db.run(template.seedSql);
        dbRegistry.set(dbId, db);
        return db;
      } catch (err) {
        console.error('Failed re-hydrating demo database:', err);
      }
    }

    return null;
  }

  static async persistDatabase(dbId: string, db: Database) {
    dbRegistry.set(dbId, db);
    try {
      const data = db.export();
      await saveBlobToIndexedDb(dbId, data);

      if (typeof localStorage !== 'undefined') {
        const len = data.byteLength;
        // Also persist in localStorage when under 2.5MB for instant synchronous fallback
        if (len < 2.5 * 1024 * 1024) {
          let binary = '';
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(data[i]);
          }
          localStorage.setItem(`querywise_db_blob_${dbId}`, btoa(binary));
        }
      }
    } catch (e) {
      console.warn('Could not persist database to client storage', e);
    }
  }

  static async removeDatabase(dbId: string) {
    if (dbRegistry.has(dbId)) {
      const db = dbRegistry.get(dbId);
      db?.close();
      dbRegistry.delete(dbId);
    }
    await deleteBlobFromIndexedDb(dbId);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`querywise_db_blob_${dbId}`);
    }
  }

  /**
   * Initialize the built-in Retail & Sales Analytics Demo Database
   */
  static async createDemoDatabase(
    id: string,
    name: string,
    templateId = 'retail-sales'
  ): Promise<{ instance: DatabaseInstance; db: Database }> {
    const SQL = await getSqlJs();
    const db = new SQL.Database();
    const template = getDemoDatabaseDefinition(templateId);

    // Run schema
    db.run(template.schemaSql);
    // Run seed data
    db.run(template.seedSql);

    const tables = this.extractTables(db);
    const instance: DatabaseInstance = {
      id,
      name,
      type: 'demo',
      templateId: 'retail-sales',
      templateName: template.name,
      tables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileSize: `${Math.round(db.export().byteLength / 1024)} KB`
    };

    await this.persistDatabase(id, db);
    return { instance, db };
  }

  /**
   * Create database from uploaded SQLite file binary
   */
  static async createFromSqliteFile(
    id: string,
    name: string,
    fileBuffer: ArrayBuffer
  ): Promise<{ instance: DatabaseInstance; db: Database }> {
    const SQL = await getSqlJs();
    const u8 = new Uint8Array(fileBuffer);
    const db = new SQL.Database(u8);

    const tables = this.extractTables(db);
    const instance: DatabaseInstance = {
      id,
      name,
      type: 'sqlite',
      tables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileSize: `${Math.round(u8.byteLength / 1024)} KB`
    };

    await this.persistDatabase(id, db);
    return { instance, db };
  }

  /**
   * Create database from CSV file content
   */
  static async createFromCsv(
    id: string,
    dbName: string,
    tableName: string,
    csvContent: string
  ): Promise<{ instance: DatabaseInstance; db: Database }> {
    const SQL = await getSqlJs();
    const db = new SQL.Database();

    const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    });

    if (!parsed.data || parsed.data.length === 0) {
      throw new Error('CSV file contains no valid data rows');
    }

    const cleanTableName = sanitizeIdentifier(tableName || 'imported_data');
    const fields = parsed.meta.fields || Object.keys(parsed.data[0]);

    // Infer column types
    const columns: ColumnDefinition[] = fields.map(field => {
      const sampleVal = parsed.data.find(row => row[field] !== null && row[field] !== undefined)?.[field];
      let colType = 'TEXT';
      if (typeof sampleVal === 'number') {
        colType = Number.isInteger(sampleVal) ? 'INTEGER' : 'REAL';
      } else if (typeof sampleVal === 'boolean') {
        colType = 'INTEGER';
      }
      return {
        name: sanitizeIdentifier(field),
        type: colType
      };
    });

    // Create table SQL
    const colDefs = columns.map(c => `"${c.name}" ${c.type}`).join(', ');
    db.run(`CREATE TABLE "${cleanTableName}" (${colDefs});`);

    // Insert rows
    const placeholders = columns.map(() => '?').join(', ');
    const insertStmt = db.prepare(`INSERT INTO "${cleanTableName}" VALUES (${placeholders});`);

    for (const row of parsed.data) {
      const values: (string | number | null)[] = fields.map(f => {
        const val = row[f];
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return val;
        if (typeof val === 'boolean') return val ? 1 : 0;
        return String(val);
      });
      insertStmt.run(values);
    }
    insertStmt.free();

    const tables = this.extractTables(db);
    const instance: DatabaseInstance = {
      id,
      name: dbName,
      type: 'csv',
      tables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileSize: `${Math.round(csvContent.length / 1024)} KB`
    };

    await this.persistDatabase(id, db);
    return { instance, db };
  }

  /**
   * Create database from Excel spreadsheet (.xlsx / .xls)
   */
  static async createFromExcel(
    id: string,
    dbName: string,
    fileBuffer: ArrayBuffer
  ): Promise<{ instance: DatabaseInstance; db: Database }> {
    const SQL = await getSqlJs();
    const db = new SQL.Database();

    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel workbook contains no sheets');
    }

    // Process all sheets as separate tables
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
      if (!jsonData || jsonData.length === 0) continue;

      const cleanTableName = sanitizeIdentifier(sheetName);
      const fields = Object.keys(jsonData[0]);

      const columns: ColumnDefinition[] = fields.map(field => {
        const sampleVal = jsonData.find(row => row[field] !== null && row[field] !== undefined)?.[field];
        let colType = 'TEXT';
        if (typeof sampleVal === 'number') {
          colType = Number.isInteger(sampleVal) ? 'INTEGER' : 'REAL';
        }
        return {
          name: sanitizeIdentifier(field),
          type: colType
        };
      });

      const colDefs = columns.map(c => `"${c.name}" ${c.type}`).join(', ');
      db.run(`CREATE TABLE "${cleanTableName}" (${colDefs});`);

      const placeholders = columns.map(() => '?').join(', ');
      const insertStmt = db.prepare(`INSERT INTO "${cleanTableName}" VALUES (${placeholders});`);

      for (const row of jsonData) {
        const values: (string | number | null)[] = fields.map(f => {
          const val = row[f];
          if (val === undefined || val === null) return null;
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 1 : 0;
          return String(val);
        });
        insertStmt.run(values);
      }
      insertStmt.free();
    }

    const tables = this.extractTables(db);
    const instance: DatabaseInstance = {
      id,
      name: dbName,
      type: 'excel',
      tables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileSize: `${Math.round(fileBuffer.byteLength / 1024)} KB`
    };

    await this.persistDatabase(id, db);
    return { instance, db };
  }

  /**
   * Introspect tables, columns, and foreign key relationships from active SQLite database
   */
  static extractTables(db: Database): TableDefinition[] {
    const tables: TableDefinition[] = [];
    const tableRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    if (tableRes.length === 0 || !tableRes[0].values) return tables;

    for (const row of tableRes[0].values) {
      const tableName = String(row[0]);

      // Extract explicit foreign keys via PRAGMA foreign_key_list
      const fkMap = new Map<string, { table: string; column: string }>();
      try {
        const fkRes = db.exec(`PRAGMA foreign_key_list("${tableName}");`);
        if (fkRes.length > 0 && fkRes[0].values) {
          for (const fk of fkRes[0].values) {
            const targetTable = String(fk[2] || '');
            const fromCol = String(fk[3] || '');
            const toCol = String(fk[4] || '');
            if (fromCol && targetTable) {
              fkMap.set(fromCol.toLowerCase(), {
                table: targetTable,
                column: toCol || fromCol
              });
            }
          }
        }
      } catch {
        // Ignore if PRAGMA foreign_key_list is unsupported
      }

      // Extract columns
      const colRes = db.exec(`PRAGMA table_info("${tableName}");`);
      const columns: ColumnDefinition[] = [];
      if (colRes.length > 0 && colRes[0].values) {
        for (const c of colRes[0].values) {
          const colName = String(c[1]);
          const fk = fkMap.get(colName.toLowerCase());
          columns.push({
            name: colName,
            type: String(c[2] || 'TEXT'),
            notNull: c[3] === 1,
            primaryKey: c[5] === 1,
            ...(fk ? { foreignKey: fk } : {})
          });
        }
      }

      // Extract row count
      let rowCount = 0;
      try {
        const cntRes = db.exec(`SELECT COUNT(*) FROM "${tableName}";`);
        if (cntRes.length > 0 && cntRes[0].values && cntRes[0].values[0]) {
          rowCount = Number(cntRes[0].values[0][0]) || 0;
        }
      } catch (err) {
        console.warn(`Could not count rows for table ${tableName}`, err);
      }

      tables.push({
        name: tableName,
        columns,
        rowCount
      });
    }

    // Infer implicit foreign key relationships (e.g. customer_id -> customers.customer_id) when not explicitly declared
    for (const tbl of tables) {
      for (const col of tbl.columns) {
        if (col.primaryKey || col.foreignKey) continue;
        if (col.name.toLowerCase().endsWith('_id')) {
          const targetTbl = tables.find(
            other =>
              other.name.toLowerCase() !== tbl.name.toLowerCase() &&
              other.columns.some(
                oc => oc.name.toLowerCase() === col.name.toLowerCase() && oc.primaryKey
              )
          );
          if (targetTbl) {
            col.foreignKey = {
              table: targetTbl.name,
              column: col.name
            };
          }
        }
      }
    }

    return tables;
  }

  /**
   * Preview rows for a specific table
   */
  static async previewTable(
    dbId: string,
    tableName: string,
    limit = 20,
    templateId?: string
  ): Promise<QueryResult> {
    const query = `SELECT * FROM "${sanitizeIdentifier(tableName)}" LIMIT ${limit};`;
    return this.executeQuery(dbId, query, templateId);
  }

  /**
   * Validate SQL query safety: reject destructive SQL and unauthorized table access
   */
  static validateSqlSafety(sql: string, allowedTables?: string[]): { isSafe: boolean; reason?: string } {
    // Strip SQL comments before validation
    const stripped = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    if (!stripped) {
      return { isSafe: false, reason: 'Query cannot be empty.' };
    }

    // Prohibit multiple statements (semicolon separating non-whitespace)
    const statements = stripped.split(';').map(s => s.trim()).filter(Boolean);
    if (statements.length > 1) {
      return { isSafe: false, reason: 'Multiple SQL statements are not permitted for security.' };
    }

    const upper = stripped.toUpperCase();
    const destructiveWords = [
      'DROP ', 'DELETE ', 'UPDATE ', 'INSERT ', 'ALTER ', 'TRUNCATE ',
      'CREATE ', 'GRANT ', 'REVOKE ', 'ATTACH ', 'DETACH ', 'REPLACE ',
      'VACUUM ', 'REINDEX ', 'BEGIN ', 'COMMIT ', 'ROLLBACK ', 'SAVEPOINT '
    ];

    for (const word of destructiveWords) {
      const kw = word.trim();
      if (new RegExp(`(^|\\s|\\()${kw}\\b`, 'i').test(upper)) {
        return {
          isSafe: false,
          reason: `Destructive or state-modifying operation '${kw}' is prohibited. QueryWise operates in safe read-only mode.`
        };
      }
    }

    // Block write PRAGMA statements (e.g. PRAGMA writable_schema = 1)
    if (upper.startsWith('PRAGMA') && upper.includes('=')) {
      return {
        isSafe: false,
        reason: 'Write PRAGMA operations are prohibited in read-only mode.'
      };
    }

    // Allowed start keywords: SELECT, WITH, PRAGMA, EXPLAIN
    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && !upper.startsWith('EXPLAIN') && !upper.startsWith('PRAGMA')) {
      return {
        isSafe: false,
        reason: 'Only read-only SELECT or analysis queries are permitted.'
      };
    }

    // Validate referenced tables against active database schema when provided
    if (allowedTables && allowedTables.length > 0 && (upper.startsWith('SELECT') || upper.startsWith('WITH'))) {
      const allowedSet = new Set(allowedTables.map(t => t.toLowerCase()));
      allowedSet.add('sqlite_master');
      allowedSet.add('sqlite_schema');

      // Collect CTE names defined in WITH clauses
      const cteRegex = /\b(?:WITH|,)\s+(?:RECURSIVE\s+)?["`[]?([a-zA-Z0-9_]+)["`\]]?\s+AS\s*\(/gi;
      let cteMatch: RegExpExecArray | null;
      while ((cteMatch = cteRegex.exec(stripped)) !== null) {
        if (cteMatch[1]) allowedSet.add(cteMatch[1].toLowerCase());
      }

      // Check tables referenced in FROM / JOIN clauses (ignoring subqueries starting with '(')
      const tableRefRegex = /\b(?:FROM|JOIN)\s+(?!\()(["`[]?[a-zA-Z0-9_]+["`\]]?)/gi;
      let refMatch: RegExpExecArray | null;
      while ((refMatch = tableRefRegex.exec(stripped)) !== null) {
        const rawTbl = refMatch[1].replace(/["`[\]]/g, '').trim();
        if (rawTbl && !allowedSet.has(rawTbl.toLowerCase())) {
          return {
            isSafe: false,
            reason: `Table "${rawTbl}" does not exist in the selected database. Available tables: ${allowedTables.join(', ')}.`
          };
        }
      }
    }

    return { isSafe: true };
  }

  /**
   * Execute validated SQL query on the given database
   */
  static async executeQuery(dbId: string, sql: string, templateId?: string): Promise<QueryResult> {
    const basicSafety = this.validateSqlSafety(sql);
    if (!basicSafety.isSafe) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: basicSafety.reason
      };
    }

    let db = await this.getDatabase(dbId, templateId);
    if (!db) {
      // Only re-hydrate from the Retail & Sales Analytics demo template if applicable
      const resolvedTemplate = templateId || this.lookupTemplateId(dbId);
      if (resolvedTemplate === 'retail-sales' || resolvedTemplate === 'sales-analytics') {
        try {
          const created = await this.createDemoDatabase(dbId, 'Retail & Sales Analytics', 'retail-sales');
          db = created.db;
        } catch (e) {
          console.error('Failed auto-creating demo db:', e);
        }
      }
    }

    if (!db) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: `Database instance '${dbId}' not found or active. Please re-select or re-upload the database.`
      };
    }

    // Validate table access against the actual tables in this specific SQLite database
    const activeTables = this.extractTables(db).map(t => t.name);
    const schemaSafety = this.validateSqlSafety(sql, activeTables);
    if (!schemaSafety.isSafe) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: schemaSafety.reason
      };
    }

    const start = performance.now();
    try {
      const results = db.exec(sql);
      const executionTimeMs = Number((performance.now() - start).toFixed(2));

      if (results.length === 0) {
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs
        };
      }

      const res = results[0];
      const safeRows: (string | number | boolean | null)[][] = res.values.map(r =>
        r.map(v => (v instanceof Uint8Array ? '[BLOB]' : (v as string | number | boolean | null)))
      );
      return {
        columns: res.columns,
        rows: safeRows,
        rowCount: safeRows.length,
        executionTimeMs
      };
    } catch (err: unknown) {
      const executionTimeMs = Number((performance.now() - start).toFixed(2));
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`SQL Execution failed, running self-healing engine: "${sql}" - Reason: ${errMsg}`);

      const healed = this.attemptSelfHealingQuery(db, sql, errMsg);
      if (healed) {
        return healed;
      }

      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs,
        error: `SQL Error: ${errMsg}`
      };
    }
  }

  /**
   * Self-healing SQL query engine for gentle syntactic corrections
   * Never substitutes the user's requested operation with an arbitrary or default query
   */
  private static attemptSelfHealingQuery(
    db: Database,
    failedSql: string,
    errMsg: string
  ): QueryResult | null {
    try {
      // Attempt gentle syntactic repairs on the original SQL query
      const candidates: string[] = [];

      // 1. Missing trailing semicolon
      const trimmed = failedSql.trim();
      if (!trimmed.endsWith(';')) {
        candidates.push(`${trimmed};`);
      }

      // 2. Extra trailing semicolons or whitespace
      if (trimmed.endsWith(';;')) {
        candidates.push(`${trimmed.replace(/;+$/, '')};`);
      }

      for (const candidate of candidates) {
        if (candidate === failedSql) continue;
        try {
          const results = db.exec(candidate);
          if (results.length > 0 && results[0].values) {
            const res = results[0];
            const safeRows = res.values.map(r =>
              r.map(v => (v instanceof Uint8Array ? '[BLOB]' : (v as string | number | boolean | null)))
            );
            return {
              columns: res.columns,
              rows: safeRows,
              rowCount: safeRows.length,
              executionTimeMs: 1.0,
              healedSql: candidate
            };
          }
        } catch {
          // ignore
        }
      }
    } catch (healErr) {
      console.warn('Self-healing check failed:', healErr);
    }
    return null;
  }

  /**
   * Format full schema definition (including primary keys and foreign key relationships)
   * as readable prompt context for Gemini
   */
  static generateSchemaContext(
    tables: TableDefinition[],
    dbMeta?: { id?: string; name?: string; type?: string }
  ): string {
    const header = dbMeta?.id || dbMeta?.name
      ? `Database ID: "${dbMeta.id || 'active'}" | Name: "${dbMeta.name || 'Connected DB'}" | Type: ${dbMeta.type || 'sqlite'}\n\n`
      : '';

    const relationships: string[] = [];
    const tableBlocks = tables
      .map(table => {
        const colList = table.columns
          .map(c => {
            const flags: string[] = [c.type];
            if (c.primaryKey) flags.push('PRIMARY KEY');
            if (c.notNull && !c.primaryKey) flags.push('NOT NULL');
            if (c.foreignKey) {
              flags.push(`FOREIGN KEY -> "${c.foreignKey.table}"."${c.foreignKey.column}"`);
              relationships.push(`"${table.name}"."${c.name}" = "${c.foreignKey.table}"."${c.foreignKey.column}"`);
            }
            return `  - ${c.name} (${flags.join(', ')})`;
          })
          .join('\n');
        return `Table: "${table.name}" (${table.rowCount} records)\nColumns:\n${colList}`;
      })
      .join('\n\n');

    const relSection = relationships.length > 0
      ? `\n\nTable Relationships (Join Paths):\n${relationships.map(r => `  - ${r}`).join('\n')}`
      : '';

    return `${header}${tableBlocks}${relSection}`;
  }
}

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}
