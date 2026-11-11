import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { SQLiteEngine } from '../src/lib/sqlite-engine';
import { DEMO_TEMPLATES_METADATA } from '../src/lib/demo-databases';
import { parseApiResponse } from '../src/lib/api';
import {
  validateSqlSemantics,
  synthesizeGroupedOrOverallSql,
  parseSqlStructure
} from '../src/lib/sql-semantics';

const BASE_URL = process.env.QUERYWISE_BASE_URL || 'http://127.0.0.1:3000';

async function callProcessAndExecute(params: {
  dbId: string;
  dbName: string;
  templateId?: string;
  schemaContext: string;
  query: string;
  conversationHistory?: { role: string; content: string; sql?: string; resultSummary?: string }[];
}) {
  const res = await fetch(`${BASE_URL}/api/chat/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: params.query,
      schemaContext: params.schemaContext,
      conversationHistory: params.conversationHistory || [],
      databaseId: params.dbId,
      databaseName: params.dbName,
      databaseType: 'demo'
    })
  });
  assert.equal(res.status, 200, `Expected 200 from /api/chat/process for "${params.query}"`);
  const data = await res.json();
  assert.ok(data.sql && data.sql.length > 0, `Expected non-empty SQL for "${params.query}", got: ${JSON.stringify(data)}`);

  const execResult = await SQLiteEngine.executeQuery(params.dbId, data.sql, params.templateId);
  assert.equal(execResult.error, undefined, `SQLite execution error for "${params.query}" (${data.sql}): ${execResult.error}`);

  const interpRes = await fetch(`${BASE_URL}/api/chat/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      databaseId: params.dbId,
      databaseName: params.dbName,
      query: params.query,
      sql: data.sql,
      columns: execResult.columns,
      rows: execResult.rows,
      rowCount: execResult.rowCount
    })
  });
  assert.equal(interpRes.status, 200, `Expected 200 from /api/chat/interpret for "${params.query}"`);
  const interpData = await interpRes.json();

  return { processData: data, execResult, interpData };
}

async function runTests() {
  console.log('=== QueryWise Grouped Aggregations & Demo Database Regression Suite ===\n');

  // Verify ONLY Retail & Sales Analytics is registered as a built-in demo database
  console.log('Test 0a: Verify ONLY Retail & Sales Analytics is registered in DEMO_TEMPLATES_METADATA...');
  assert.equal(DEMO_TEMPLATES_METADATA.length, 1, `Expected exactly 1 demo database template, got ${DEMO_TEMPLATES_METADATA.length}`);
  assert.equal(DEMO_TEMPLATES_METADATA[0].id, 'retail-sales', `Expected retail-sales template ID, got ${DEMO_TEMPLATES_METADATA[0].id}`);
  assert.equal(DEMO_TEMPLATES_METADATA[0].name, 'Retail & Sales Analytics', `Expected Retail & Sales Analytics, got ${DEMO_TEMPLATES_METADATA[0].name}`);
  assert.equal(SQLiteEngine.lookupTemplateId('db_hospital-mgmt_123'), null, 'Removed demo template hospital-mgmt should return null');
  assert.equal(SQLiteEngine.lookupTemplateId('db_retail-sales_123'), 'retail-sales', 'retail-sales template should resolve properly');
  console.log('  PASS -> Exactly 1 built-in demo database retained: Retail & Sales Analytics (retail-sales)\n');

  // Initialize Retail & Sales Database (retail-sales)
  const retailDbId = 'test-retail-db';
  const { instance: retailDb, db: rawRetailSqlite } = await SQLiteEngine.createDemoDatabase(retailDbId, 'Retail & Sales Analytics', 'retail-sales');
  assert.equal(retailDb.tables.length, 3, 'Expected 3 tables in Retail & Sales Analytics (customers, products, sales)');
  const retailSchema = SQLiteEngine.generateSchemaContext(retailDb.tables, {
    id: retailDbId,
    name: 'Retail & Sales Analytics',
    type: 'demo'
  });

  // 0. Pre-Execution Semantic Validator Rejection Unit Test
  console.log('Test 0: Pre-Execution Semantic Intent Validator rejects ungrouped SQL for grouped question...');
  const buggySql = 'SELECT ROUND(SUM("revenue"), 2) AS total_revenue FROM "sales";';
  const validation = validateSqlSemantics('Total revenue for each category', buggySql, retailSchema);
  assert.equal(validation.valid, false, 'Validator must reject ungrouped SUM(revenue) when user asks "Total revenue for each category"');
  assert.ok(validation.reason?.includes('GROUP BY'), `Expected rejection reason to mention GROUP BY, got: ${validation.reason}`);
  const repaired = synthesizeGroupedOrOverallSql(validation.intent);
  assert.ok(repaired && /\bGROUP\s+BY\s+"?category"?/i.test(repaired.sql), `Expected synthesized SQL to GROUP BY category, got: ${repaired?.sql}`);
  console.log(`  PASS -> Rejected buggy SQL (${validation.reason}) and synthesized: ${repaired?.sql}\n`);

  // 1. Overall SUM without GROUP BY
  console.log('Test 1: Overall SUM without GROUP BY ("What is the total revenue?")...');
  const t1 = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'What is the total revenue?'
  });
  const s1 = parseSqlStructure(t1.processData.sql);
  assert.equal(s1.hasGroupBy, false, `Expected NO GROUP BY for overall revenue, got: ${t1.processData.sql}`);
  assert.ok(s1.aggregateFunctions.includes('SUM'), `Expected SUM aggregate for overall revenue, got: ${t1.processData.sql}`);
  assert.equal(t1.execResult.rowCount, 1, `Expected 1 scalar row for overall revenue, got ${t1.execResult.rowCount}`);
  assert.equal(t1.execResult.columns.length, 1, `Expected 1 column for overall revenue, got ${t1.execResult.columns.length}`);
  console.log(`  PASS -> SQL: ${t1.processData.sql} | Result: ${JSON.stringify(t1.execResult.rows[0])}\n`);

  // 2. SUM with GROUP BY (including the exact reported bug: "Total revenue for each category")
  console.log('Test 2a: SUM with GROUP BY ("Total revenue for each category")...');
  const t2a = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Total revenue for each category'
  });
  const s2a = parseSqlStructure(t2a.processData.sql);
  assert.equal(s2a.hasGroupBy, true, `Expected GROUP BY for "Total revenue for each category", got: ${t2a.processData.sql}`);
  assert.ok(s2a.groupByColumns.includes('category'), `Expected GROUP BY category, got: ${s2a.groupByColumns}`);
  assert.ok(s2a.aggregateFunctions.includes('SUM'), `Expected SUM function, got: ${t2a.processData.sql}`);
  assert.ok(t2a.execResult.rowCount > 1, `Expected multiple category rows (>1), got: ${t2a.execResult.rowCount}`);
  assert.equal(t2a.execResult.columns.length >= 2, true, 'Expected at least 2 columns (category + total_revenue)');
  console.log(`  PASS -> SQL: ${t2a.processData.sql}`);
  console.log(`  Returned ${t2a.execResult.rowCount} categories: ${t2a.execResult.rows.map(r => `${r[0]}=${r[1]}`).join(', ')}`);
  console.log(`  KPIs: ${JSON.stringify(t2a.interpData.kpis)}\n`);

  console.log('Test 2b: SUM with GROUP BY ("Total quantity sold for each product")...');
  const t2b = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Total quantity sold for each product'
  });
  const s2b = parseSqlStructure(t2b.processData.sql);
  assert.equal(s2b.hasGroupBy, true, `Expected GROUP BY for product quantity, got: ${t2b.processData.sql}`);
  assert.ok(s2b.aggregateFunctions.includes('SUM'), `Expected SUM(quantity), got: ${t2b.processData.sql}`);
  assert.ok(t2b.execResult.rowCount > 1, `Expected multiple product rows, got: ${t2b.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t2b.processData.sql} (${t2b.execResult.rowCount} products)\n`);

  console.log('Test 2c: SUM with GROUP BY ("Total revenue for each customer")...');
  const t2c = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Total revenue for each customer'
  });
  const s2c = parseSqlStructure(t2c.processData.sql);
  assert.equal(s2c.hasGroupBy, true, `Expected GROUP BY for customer revenue, got: ${t2c.processData.sql}`);
  assert.ok(s2c.aggregateFunctions.includes('SUM'), `Expected SUM(revenue), got: ${t2c.processData.sql}`);
  assert.ok(t2c.execResult.rowCount > 1, `Expected multiple customer rows, got: ${t2c.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t2c.processData.sql} (${t2c.execResult.rowCount} customers)\n`);

  // 3. AVG with GROUP BY
  console.log('Test 3a: AVG with GROUP BY ("Average revenue per customer")...');
  const t3a = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Average revenue per customer'
  });
  const s3a = parseSqlStructure(t3a.processData.sql);
  assert.equal(s3a.hasGroupBy, true, `Expected GROUP BY for average revenue per customer, got: ${t3a.processData.sql}`);
  assert.ok(s3a.aggregateFunctions.includes('AVG'), `Expected AVG(revenue), got: ${t3a.processData.sql}`);
  assert.ok(t3a.execResult.rowCount > 1, `Expected multiple customer rows, got: ${t3a.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t3a.processData.sql} (${t3a.execResult.rowCount} customers)\n`);

  console.log('Test 3b: AVG with GROUP BY ("Average unit price for each category")...');
  const t3b = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Average unit price for each category'
  });
  const s3b = parseSqlStructure(t3b.processData.sql);
  assert.equal(s3b.hasGroupBy, true, `Expected GROUP BY category, got: ${t3b.processData.sql}`);
  assert.ok(s3b.groupByColumns.includes('category'), `Expected category in GROUP BY, got: ${s3b.groupByColumns}`);
  assert.ok(s3b.aggregateFunctions.includes('AVG'), `Expected AVG(unit_price), got: ${t3b.processData.sql}`);
  assert.equal(t3b.execResult.rowCount, 5, `Expected 5 categories, got: ${t3b.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t3b.processData.sql} (${t3b.execResult.rowCount} categories)\n`);

  // 4. COUNT with GROUP BY
  console.log('Test 4a: COUNT with GROUP BY ("Number of sales per category")...');
  const t4a = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Number of sales per category'
  });
  const s4a = parseSqlStructure(t4a.processData.sql);
  assert.equal(s4a.hasGroupBy, true, `Expected GROUP BY category, got: ${t4a.processData.sql}`);
  assert.ok(s4a.aggregateFunctions.includes('COUNT'), `Expected COUNT, got: ${t4a.processData.sql}`);
  assert.equal(t4a.execResult.rowCount, 5, `Expected 5 categories, got: ${t4a.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t4a.processData.sql} (${t4a.execResult.rowCount} categories)\n`);

  console.log('Test 4b: COUNT with GROUP BY ("Count of customers in each category")...');
  const t4b = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Count of customers in each category'
  });
  const s4b = parseSqlStructure(t4b.processData.sql);
  assert.equal(s4b.hasGroupBy, true, `Expected GROUP BY category, got: ${t4b.processData.sql}`);
  assert.ok(s4b.aggregateFunctions.includes('COUNT'), `Expected COUNT, got: ${t4b.processData.sql}`);
  assert.equal(t4b.execResult.rowCount, 5, `Expected 5 categories, got: ${t4b.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t4b.processData.sql} (${t4b.execResult.rowCount} categories)\n`);

  // 5. MIN and MAX with GROUP BY
  console.log('Test 5a: MAX with GROUP BY ("Highest revenue in each category")...');
  const t5a = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Highest revenue in each category'
  });
  const s5a = parseSqlStructure(t5a.processData.sql);
  assert.equal(s5a.hasGroupBy, true, `Expected GROUP BY category, got: ${t5a.processData.sql}`);
  assert.ok(s5a.aggregateFunctions.includes('MAX'), `Expected MAX(revenue), got: ${t5a.processData.sql}`);
  assert.equal(t5a.execResult.rowCount, 5, `Expected all 5 categories (not LIMIT 1), got: ${t5a.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t5a.processData.sql} (${t5a.execResult.rowCount} categories)\n`);

  console.log('Test 5b: MIN with GROUP BY ("Lowest unit price in each category")...');
  const t5b = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Lowest unit price in each category'
  });
  const s5b = parseSqlStructure(t5b.processData.sql);
  assert.equal(s5b.hasGroupBy, true, `Expected GROUP BY category, got: ${t5b.processData.sql}`);
  assert.ok(s5b.aggregateFunctions.includes('MIN'), `Expected MIN(unit_price), got: ${t5b.processData.sql}`);
  assert.equal(t5b.execResult.rowCount, 5, `Expected all 5 categories, got: ${t5b.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t5b.processData.sql} (${t5b.execResult.rowCount} categories)\n`);

  // 6. GROUP BY combined with HAVING
  console.log('Test 6: GROUP BY combined with HAVING ("Show categories where total revenue exceeds 6000")...');
  const t6 = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Show categories where total revenue exceeds 6000'
  });
  const s6 = parseSqlStructure(t6.processData.sql);
  assert.equal(s6.hasGroupBy, true, `Expected GROUP BY category, got: ${t6.processData.sql}`);
  assert.equal(s6.hasHaving, true, `Expected HAVING clause, got: ${t6.processData.sql}`);
  assert.ok(t6.execResult.rowCount >= 1 && t6.execResult.rowCount < 5, `Expected filtered subset of categories (1..4), got: ${t6.execResult.rowCount}`);
  for (const r of t6.execResult.rows) {
    assert.ok(Number(r[1]) > 6000, `Expected every returned category to have total_revenue > 6000, got: ${r[0]}=${r[1]}`);
  }
  console.log(`  PASS -> SQL: ${t6.processData.sql} | Qualifying categories: ${t6.execResult.rows.map(r => `${r[0]} (${r[1]})`).join(', ')}\n`);

  // 7. GROUP BY combined with ORDER BY
  console.log('Test 7: GROUP BY combined with ORDER BY ("Rank categories by total revenue")...');
  const t7 = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Rank categories by total revenue'
  });
  const s7 = parseSqlStructure(t7.processData.sql);
  assert.equal(s7.hasGroupBy, true, `Expected GROUP BY category, got: ${t7.processData.sql}`);
  assert.equal(s7.hasOrderBy, true, `Expected ORDER BY clause, got: ${t7.processData.sql}`);
  assert.equal(t7.execResult.rowCount, 5, `Expected 5 ranked categories, got: ${t7.execResult.rowCount}`);
  for (let i = 1; i < t7.execResult.rows.length; i++) {
    const prev = Number(t7.execResult.rows[i - 1][1]);
    const curr = Number(t7.execResult.rows[i][1]);
    assert.ok(prev >= curr, `Expected descending order of total_revenue: ${prev} >= ${curr}`);
  }
  console.log(`  PASS -> SQL: ${t7.processData.sql} | Ranked: ${t7.execResult.rows.map(r => `${r[0]} (${r[1]})`).join(' > ')}\n`);

  // 8. Multiple grouping columns
  console.log('Test 8a: Multiple grouping columns on same table ("Number of customers for each city and loyalty tier")...');
  const t8a = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'retail-sales',
    schemaContext: retailSchema,
    query: 'Number of customers for each city and loyalty tier'
  });
  const s8a = parseSqlStructure(t8a.processData.sql);
  assert.equal(s8a.hasGroupBy, true, `Expected GROUP BY, got: ${t8a.processData.sql}`);
  assert.ok(s8a.groupByColumns.length >= 2, `Expected at least 2 GROUP BY columns, got: ${s8a.groupByColumns.join(', ')}`);
  assert.ok(t8a.execResult.columns.length >= 3, `Expected at least 3 columns (2 group cols + metric), got: ${t8a.execResult.columns.join(', ')}`);
  assert.ok(t8a.execResult.rowCount > 3, `Expected >3 composite group rows, got: ${t8a.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t8a.processData.sql} (${t8a.execResult.rowCount} composite groups)\n`);

  console.log('Test 8b: Multiple grouping columns across joined tables ("Total revenue for each category and loyalty tier")...');
  const t8b = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Total revenue for each category and loyalty tier'
  });
  const s8b = parseSqlStructure(t8b.processData.sql);
  assert.equal(s8b.hasGroupBy, true, `Expected GROUP BY, got: ${t8b.processData.sql}`);
  assert.ok(s8b.groupByColumns.length >= 2, `Expected at least 2 GROUP BY columns, got: ${s8b.groupByColumns.join(', ')}`);
  assert.ok(t8b.execResult.rowCount > 5, `Expected >5 composite group rows, got: ${t8b.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t8b.processData.sql} (${t8b.execResult.rowCount} composite groups)\n`);

  // 9. Follow-up questions involving previously selected grouping columns
  console.log('Test 9: Multi-turn follow-up on previously grouped results ("Now show the average unit price for each of them")...');
  const historyTurn1 = [
    {
      role: 'user',
      content: 'Show categories where total revenue exceeds 6000'
    },
    {
      role: 'assistant',
      content: t6.interpData.headline,
      sql: t6.processData.sql,
      resultSummary: JSON.stringify({
        columns: t6.execResult.columns,
        rowCount: t6.execResult.rowCount,
        rows: t6.execResult.rows
      })
    }
  ];
  const t9 = await callProcessAndExecute({
    dbId: retailDbId,
    dbName: 'Retail & Sales Analytics',
    templateId: 'sales-analytics',
    schemaContext: retailSchema,
    query: 'Now show the average unit price for each of them',
    conversationHistory: historyTurn1
  });
  const s9 = parseSqlStructure(t9.processData.sql);
  assert.equal(s9.hasGroupBy, true, `Expected follow-up to preserve GROUP BY category, got: ${t9.processData.sql}`);
  assert.ok(s9.groupByColumns.includes('category'), `Expected category in follow-up GROUP BY, got: ${s9.groupByColumns}`);
  assert.ok(s9.aggregateFunctions.includes('AVG'), `Expected AVG in follow-up SQL, got: ${t9.processData.sql}`);
  console.log(`  PASS -> SQL: ${t9.processData.sql} | Rows: ${t9.execResult.rowCount}\n`);

  // 10. Dynamic Schema Generalization Test on a Custom CSV Database (No Hardcoded Column Names)
  console.log('Test 10: Dynamic Schema Generalization on Custom CSV Database (HR Workforce)...');
  const csvDbId = 'test-custom-hr-csv';
  const csvContent = [
    'emp_id,division,office_city,annual_compensation,years_experience',
    '1,Cloud Infrastructure,Bengaluru,145000,6',
    '2,Cloud Infrastructure,Hyderabad,132000,5',
    '3,AI Research,Bengaluru,185000,8',
    '4,AI Research,Pune,172000,7',
    '5,Cybersecurity,Hyderabad,128000,4',
    '6,Cybersecurity,Pune,138000,5'
  ].join('\n');
  const { instance: csvDb } = await SQLiteEngine.createFromCsv(csvDbId, 'Custom Workforce CSV', 'workforce_metrics', csvContent);
  const csvSchema = SQLiteEngine.generateSchemaContext(csvDb.tables, {
    id: csvDbId,
    name: 'Custom Workforce CSV',
    type: 'csv'
  });

  const t10 = await callProcessAndExecute({
    dbId: csvDbId,
    dbName: 'Custom Workforce CSV',
    schemaContext: csvSchema,
    query: 'Total annual compensation for each division'
  });
  const s10 = parseSqlStructure(t10.processData.sql);
  assert.equal(s10.hasGroupBy, true, `Expected GROUP BY division on custom CSV schema, got: ${t10.processData.sql}`);
  assert.ok(s10.groupByColumns.includes('division'), `Expected division in GROUP BY, got: ${s10.groupByColumns}`);
  assert.ok(s10.aggregateFunctions.includes('SUM'), `Expected SUM(annual_compensation), got: ${t10.processData.sql}`);
  assert.equal(t10.execResult.rowCount, 3, `Expected 3 divisions, got: ${t10.execResult.rowCount}`);
  console.log(`  PASS -> SQL: ${t10.processData.sql} | Divisions: ${t10.execResult.rows.map(r => `${r[0]}=${r[1]}`).join(', ')}\n`);

  // 11. Verify SQLite file upload & Excel file import remain intact
  console.log('Test 11: Verify User-Uploaded SQLite (.db) and Excel (.xlsx) database creation & querying...');
  const exportedBytes = rawRetailSqlite.export();
  const sqliteArrayBuffer = new Uint8Array(exportedBytes).buffer;
  const { instance: uploadedSqliteDb } = await SQLiteEngine.createFromSqliteFile('test-uploaded-sqlite', 'Uploaded SQLite DB', sqliteArrayBuffer);
  assert.equal(uploadedSqliteDb.type, 'sqlite', 'Expected type sqlite');
  assert.equal(uploadedSqliteDb.tables.length, 3, 'Expected 3 tables in uploaded SQLite DB');
  const sqliteQueryRes = await SQLiteEngine.executeQuery('test-uploaded-sqlite', 'SELECT COUNT(*) FROM "sales";');
  assert.equal(sqliteQueryRes.rows[0][0], 120, 'Expected 120 sales rows in uploaded SQLite DB');

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { region: 'North', quarter_sales: 12500 },
    { region: 'South', quarter_sales: 18400 }
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'regional_summary');
  const excelOut = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const { instance: uploadedExcelDb } = await SQLiteEngine.createFromExcel('test-uploaded-excel', 'Uploaded Excel DB', excelOut);
  assert.equal(uploadedExcelDb.type, 'excel', 'Expected type excel');
  assert.equal(uploadedExcelDb.tables.length, 1, 'Expected 1 table in uploaded Excel DB');
  const excelQueryRes = await SQLiteEngine.executeQuery('test-uploaded-excel', 'SELECT SUM("quarter_sales") FROM "regional_summary";');
  assert.equal(excelQueryRes.rows[0][0], 30900, 'Expected sum 30900 from uploaded Excel DB');
  console.log('  PASS -> Native SQLite (.db/.sqlite), CSV, and Excel (.xlsx) user database imports verified!\n');

  // 12. Verify Complete Production Authentication Suite (All 9 Scenarios + Non-JSON Error Handling + Vercel Rewrite Path)
  console.log('Test 12: Verify Complete Production Auth Suite (Register, Duplicate, Validation, Login, Invalid Pass, Session, Logout, Re-login, Non-JSON Error)...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.equal(healthRes.ok, true, 'Expected /api/health to return 200 OK');
  const healthData = await parseApiResponse(healthRes);
  assert.equal(healthData.status, 'ok', 'Expected health status ok');

  // 12.1 Missing / Invalid Field Validation
  const invalidEmailRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Test', email: 'not-an-email', password: 'Password123' })
  });
  assert.equal(invalidEmailRes.status, 400, 'Expected 400 for invalid email');

  const shortPassRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Test', email: 'short@querywise.test', password: '123' })
  });
  assert.equal(shortPassRes.status, 400, 'Expected 400 for short password');

  // 12.2 New User Registration
  const testEmail = `vercel-prod-${Date.now()}@querywise.test`;
  const testPass = 'ProdPass#2026';
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Vercel Tester', email: testEmail, password: testPass })
  });
  assert.equal(regRes.status, 201, `Expected 201 on register, got ${regRes.status}`);
  const regData = await parseApiResponse(regRes);
  assert.ok(regData.accountProof && regData.accountProof.startsWith('qwa1.'), 'Expected signed accountProof starting with qwa1.');

  // 12.3 Duplicate Email Registration (409 Conflict)
  const dupRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Vercel Tester', email: testEmail, password: testPass, accountProof: regData.accountProof })
  });
  assert.equal(dupRegRes.status, 409, `Expected 409 on duplicate email registration, got ${dupRegRes.status}`);

  // 12.4 Invalid Password Handling (401 Unauthorized)
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'WrongPassword999', accountProof: regData.accountProof })
  });
  assert.equal(badLoginRes.status, 401, `Expected 401 on wrong password, got ${badLoginRes.status}`);

  // 12.5 Existing User Login & Session Creation
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPass, accountProof: regData.accountProof })
  });
  assert.equal(loginRes.ok, true, 'Expected /api/auth/login to succeed');
  const loginData = await parseApiResponse(loginRes);
  assert.equal(loginData.user.email, testEmail);
  assert.equal(loginData.isFirstLogin, true, 'Expected isFirstLogin=true on first login');
  assert.ok(loginData.token && loginData.token.startsWith('qws1.'), 'Expected stateless HMAC session token starting with qws1.');

  // 12.6 Session Persistence After Refreshing Page (including Vercel rewrite path format)
  const sessRes = await fetch(`${BASE_URL}/api/index?__pathname=/auth/session`, {
    headers: { Authorization: `Bearer ${loginData.token}` }
  });
  assert.equal(sessRes.ok, true, 'Expected /api/auth/session via Vercel rewrite path to validate stateless token');
  const sessData = await parseApiResponse(sessRes);
  assert.equal(sessData.user.email, testEmail, 'Expected matching user email from stateless session');

  // Complete first login so subsequent login goes directly to Dashboard
  await fetch(`${BASE_URL}/api/auth/complete-first-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: loginData.user.id })
  });

  // 12.7 Logout & Session Revocation
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginData.token}` }
  });
  assert.equal(logoutRes.ok, true, 'Expected /api/auth/logout to return 200');

  const revokedSessRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Authorization: `Bearer ${loginData.token}` }
  });
  assert.equal(revokedSessRes.status, 401, 'Expected 401 for logged-out token');

  // 12.8 Authentication After Reopening Application
  const reloginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPass, accountProof: loginData.accountProof })
  });
  assert.equal(reloginRes.ok, true, 'Expected re-login after reopening app to succeed');
  const reloginData = await parseApiResponse(reloginRes);
  assert.equal(reloginData.user.email, testEmail);
  assert.ok(reloginData.token && reloginData.token.startsWith('qws1.'));

  // 12.9 Non-JSON Error Response Handling (Verify no "Unexpected token 'A'" SyntaxError)
  const simulatedVercel500 = new Response(
    'A server error has occurred\n\nFUNCTION_INVOCATION_FAILED\n',
    { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
  await assert.rejects(
    () => parseApiResponse(simulatedVercel500, 'Failed to create account.'),
    (err: Error) => {
      assert.ok(!err.message.includes('Unexpected token'), `Must not throw raw JSON SyntaxError: ${err.message}`);
      assert.ok(err.message.includes('HTTP 500'), `Expected clean HTTP 500 message, got: ${err.message}`);
      return true;
    }
  );
  console.log('  PASS -> All 9 Auth Scenarios + Vercel Rewrite Routing + Non-JSON Error Handling verified!\n');

  console.log('==============================================================');
  console.log('ALL 17 PRODUCTION, DEMO DATABASE, UPLOAD & AGGREGATION TESTS PASSED!');
  console.log('==============================================================');
}

runTests().catch(err => {
  console.error('REGRESSION TEST FAILED:', err);
  process.exit(1);
});

