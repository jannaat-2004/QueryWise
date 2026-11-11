import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { deconstructSqlClauses } from './src/lib/sql-explainer';
import { ServerAuthDatabase } from './src/lib/server-db';
import {
  parseSchemaTables,
  parseSqlStructure,
  analyzeQueryGroupingIntent,
  validateSqlSemantics,
  synthesizeGroupedOrOverallSql
} from './src/lib/sql-semantics';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Production CORS middleware (supports same-origin Vercel deployment as well as split frontend/backend hosting)
app.use((req: Request, res: Response, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// Initialize Gemini Client safely
function getApiKey(): string {
  return (process.env.GEMINI_API_KEY || '').trim();
}

const apiKey = getApiKey();
const ai = new GoogleGenAI({
  apiKey: apiKey || 'placeholder-key',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

function callWithTimeout<T>(promise: Promise<T>, ms = 4500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI generation timed out after ${ms}ms`)), ms)
    )
  ]);
}

// Track per-model quota exhaustion so we don't repeatedly wait on a rate-limited model bucket
const modelCooldownUntil: Record<string, number> = {};

async function generateWithGeminiModels(
  params: {
    contents: string;
    config: Record<string, unknown>;
  },
  timeoutMs = 12000
) {
  const models = [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest'
  ];
  let lastError: unknown;

  for (const modelName of models) {
    if (modelCooldownUntil[modelName] && Date.now() < modelCooldownUntil[modelName]) {
      continue;
    }
    try {
      const activeConfig = { ...params.config };
      // ThinkingConfig is only supported on models that accept thinkingConfig without error; if a lite model rejects it, retry without it
      return await callWithTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: activeConfig
        }),
        timeoutMs
      );
    } catch (err: unknown) {
      lastError = err;
      const errStr = err instanceof Error ? err.message : String(err);
      if (
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED') ||
        errStr.includes('404') ||
        errStr.includes('NOT_FOUND')
      ) {
        modelCooldownUntil[modelName] = Date.now() + 60_000;
        continue;
      }
      if (errStr.includes('thinking') || errStr.includes('INVALID_ARGUMENT')) {
        try {
          const fallbackConfig = { ...params.config };
          delete fallbackConfig.thinkingConfig;
          return await callWithTimeout(
            ai.models.generateContent({
              model: modelName,
              contents: params.contents,
              config: fallbackConfig
            }),
            timeoutMs
          );
        } catch (retryErr: unknown) {
          lastError = retryErr;
          continue;
        }
      }
      continue;
    }
  }

  throw lastError || new Error('All Gemini models rate-limited');
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'QueryWise Backend',
    database: 'SQLite Server Database Active',
    hasApiKey: Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY'),
    timestamp: new Date().toISOString()
  });
});

/* =========================================================
 * AUTHENTICATION ENDPOINTS (Real Database Integration)
 * ========================================================= */

// Register new account
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }
    const { user, accountProof } = await ServerAuthDatabase.register(email, password, fullName || '');
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Please sign in with your credentials.',
      user,
      accountProof
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('already exists') ? 409 : 400;
    res.status(status).json({ error: msg });
  }
});

// Sign In
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password, accountProof } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const result = await ServerAuthDatabase.login(email, password, accountProof);
    res.json({
      success: true,
      token: result.token,
      user: result.user,
      isFirstLogin: result.isFirstLogin,
      accountProof: result.accountProof
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('No account found') ? 404 : 401;
    res.status(status).json({ error: msg });
  }
});

// Verify active session
app.get('/api/auth/session', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query.token as string);

    if (!token) {
      res.status(401).json({ error: 'No session token provided.' });
      return;
    }

    const user = ServerAuthDatabase.validateSession(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired session.' });
      return;
    }

    res.json({ success: true, user });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Session check failed.' });
  }
});

// Sign Out
app.post('/api/auth/logout', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.body.token;

    if (token) {
      ServerAuthDatabase.logout(token);
    }
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

// Request password reset
app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email, accountProof } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }
    const { code } = await ServerAuthDatabase.requestPasswordReset(email, accountProof);
    res.json({
      success: true,
      message: 'Password reset code generated and issued.',
      resetCode: code
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: msg });
  }
});

// Reset password
app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, password, code, accountProof } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and new password are required.' });
      return;
    }
    const result = await ServerAuthDatabase.resetPassword(email, password, code, accountProof);
    res.json({
      success: true,
      message: 'Password updated successfully! Please sign in with your new credentials.',
      accountProof: result.accountProof
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// Update user profile name
app.post('/api/auth/update-profile', (req: Request, res: Response) => {
  try {
    const { userId, fullName } = req.body;
    if (!userId || !fullName) {
      res.status(400).json({ error: 'User ID and full name are required.' });
      return;
    }
    const updated = ServerAuthDatabase.updateProfile(userId, fullName);
    res.json({ success: true, user: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// Complete onboarding
app.post('/api/auth/complete-onboarding', (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (userId) {
      ServerAuthDatabase.completeOnboarding(userId);
    }
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to record onboarding completion.' });
  }
});

// Complete welcome (first login completion)
app.post('/api/auth/complete-welcome', (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (userId) {
      ServerAuthDatabase.completeFirstLogin(userId);
    }
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to record welcome completion.' });
  }
});

/**
 * Validate generated SQL for read-only safety and authorized schema table access
 */
function validateGeneratedSql(sql: string, schemaContext?: string): { safe: boolean; reason?: string; sanitizedSql?: string } {
  const trimmed = (sql || '').trim();
  if (!trimmed) {
    return { safe: true, sanitizedSql: '' };
  }

  // Strip SQL comments for inspection
  const withoutComments = trimmed
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!withoutComments) {
    return { safe: false, reason: 'Empty SQL query.' };
  }

  const upper = withoutComments.toUpperCase();

  // Enforce read-only statements only
  if (
    !upper.startsWith('SELECT') &&
    !upper.startsWith('WITH') &&
    !upper.startsWith('PRAGMA') &&
    !upper.startsWith('EXPLAIN')
  ) {
    return {
      safe: false,
      reason: 'Security Policy Violation: Only read-only SELECT queries are permitted.'
    };
  }

  if (upper.startsWith('PRAGMA') && withoutComments.includes('=')) {
    return {
      safe: false,
      reason: 'Security Policy Violation: Write PRAGMA statements are forbidden.'
    };
  }

  // Block destructive keywords
  const forbiddenKeywords = [
    'DROP',
    'DELETE',
    'UPDATE',
    'INSERT',
    'ALTER',
    'TRUNCATE',
    'REPLACE',
    'CREATE',
    'GRANT',
    'REVOKE',
    'ATTACH',
    'DETACH',
    'VACUUM',
    'REINDEX',
    'BEGIN',
    'COMMIT',
    'ROLLBACK',
    'SAVEPOINT'
  ];

  const withoutStringLiterals = withoutComments.replace(/'[^']*'/g, "''");
  for (const kw of forbiddenKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(withoutStringLiterals)) {
      return {
        safe: false,
        reason: `Security Policy Violation: Destructive keyword "${kw}" is strictly forbidden.`
      };
    }
  }

  // Prevent multiple stacked SQL statements
  const statements = withoutStringLiterals
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  if (statements.length > 1) {
    return {
      safe: false,
      reason: 'Security Policy Violation: Multiple stacked SQL statements are not allowed.'
    };
  }

  // Validate referenced tables against schema if schemaContext is provided
  if (schemaContext) {
    const tables = parseSchemaStructure(schemaContext);
    if (tables.length > 0) {
      const allowedSet = new Set(tables.map(t => t.tableName.toLowerCase()));
      allowedSet.add('sqlite_master');
      allowedSet.add('sqlite_schema');

      // Extract CTE aliases
      const cteRegex = /\b(?:WITH(?:\s+RECURSIVE)?|,)\s+["`[]?([a-zA-Z_][a-zA-Z0-9_]*)["`\]]?\s+AS\s*\(/gi;
      let cteMatch: RegExpExecArray | null;
      while ((cteMatch = cteRegex.exec(withoutStringLiterals)) !== null) {
        allowedSet.add(cteMatch[1].toLowerCase());
      }

      const tableRefRegex = /\b(?:FROM|JOIN)\s+["`[]?([a-zA-Z_][a-zA-Z0-9_]*)["`\]]?(?!\s*\()/gi;
      let match: RegExpExecArray | null;
      while ((match = tableRefRegex.exec(withoutStringLiterals)) !== null) {
        const refTable = match[1].toLowerCase();
        if (!allowedSet.has(refTable)) {
          return {
            safe: false,
            reason: `Unauthorized or unknown table "${match[1]}". Available tables: ${tables.map(t => t.tableName).join(', ')}.`
          };
        }
      }
    }
  }

  return { safe: true, sanitizedSql: trimmed };
}

interface ConversationHistoryItem {
  role: string;
  content: string;
  sql?: string;
  resultSummary?: string;
}

/**
 * 1. Process Natural Language Query
 * Handles intent detection, ambiguity clarification, multi-turn context, and schema-aware SQL generation
 */
app.post('/api/chat/process', async (req: Request, res: Response) => {
  try {
    const {
      query,
      schemaContext,
      conversationHistory,
      databaseId,
      databaseName,
      databaseType,
      databaseCategory
    } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query is required.' });
      return;
    }

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      const fallbackResult = generateLocalFallback(query, schemaContext, databaseName, conversationHistory, databaseId);
      res.json(fallbackResult);
      return;
    }

    const formattedHistory = Array.isArray(conversationHistory) && conversationHistory.length > 0
      ? `\nPrior Conversation Context (Multi-Turn Memory - use this to resolve pronouns like "their", "those", "it", "only the one with...", or references to previous entities, tables, columns, and SQL queries):\n${conversationHistory.slice(-8).map((m: ConversationHistoryItem, idx: number) => {
          let entry = `[Turn ${idx + 1}] ${m.role.toUpperCase()}: ${m.content}`;
          if (m.sql) {
            entry += `\n  Executed SQL: ${m.sql}`;
          }
          if (m.resultSummary) {
            entry += `\n  Query Result Summary: ${m.resultSummary}`;
          }
          return entry;
        }).join('\n\n')}\n`
      : '';

    const systemInstruction = `You are QueryWise, an intelligent, conversational AI database analyst and SQL architect powered by Google Gemini.
You are communicating with a user about their currently connected SQLite database:
- Database ID: "${databaseId || 'active-db'}"
- Database Name: "${databaseName || 'Active Database'}"
- Database Type: "${databaseType || 'SQLite'}"
- Domain / Category: "${databaseCategory || 'Analytics'}"

Connected Database Schema (Tables, Columns, Data Types, Primary Keys, Foreign Key Relationships):
${schemaContext || 'No schema provided'}

Execute this structured reasoning workflow:

STAGE 1: INTENT & CONVERSATIONAL CONTEXT ANALYSIS
1. Determine the user's intent:
   - "GREETING": Simple greetings ("hello", "hi") with no database question.
   - "GENERAL_CONVERSATION": Questions about what information/tables the database contains (e.g. "What information does this database contain?", "Describe this database", "What tables are available?"). NOTE: Even for database overview questions, if there are tables in the schema, you SHOULD ALSO generate a useful summary SQL query (such as counting records across tables or previewing the primary table) OR set intent to "DATA_QUERY" / "GENERAL_CONVERSATION" with a clear, comprehensive explanation of all tables, their record counts, key columns, and relationships based on the exact schema above!
   - "DATA_QUERY": Any question asking for data, records, metrics, rankings, comparisons, filtering, or trends.
   - "FOLLOW_UP_QUERY": A question that builds upon or refines the previous turn in the conversation (e.g., "Now compare their average...", "Show only the one with the highest...", "Filter those by...", "What about for the top 3?").
   - "CLARIFICATION_NEEDED": When the user's request is genuinely ambiguous and cannot be answered accurately without guessing (e.g., asking for "the last 5 records" on a table with no ID, primary key, or date column; or a vague request like "show performance" when multiple unrelated metrics exist). Provide 2-4 specific, helpful "clarificationOptions".
   - "EXPLAIN_SQL": When the user asks to explain how a SQL query works.
   - "OPTIMIZE_SQL": When the user asks to optimize a SQL query.

2. Classify intentDetection:
   - operation:
     * "RECORD_RETRIEVAL" for displaying, listing, or sampling rows (e.g. "Show me the first 10 records", "Display the last 5 records", "Show records where value > 100").
     * "AGGREGATION" ONLY for single overall scalar summaries across the entire table (e.g. "What is the total revenue?") with NO GROUP BY.
     * "RANKING" for highest, lowest, top N, bottom N (e.g. "Which category has the highest value?", "Show the top 5 districts", "Rank categories by total revenue").
     * "COMPARISON" for ANY grouped aggregation that computes metrics per group, category, customer, product, or dimension (e.g. "Total revenue for each category", "Average revenue per customer", "Number of sales per category", "Show categories where total revenue exceeds 1000").
     * "FILTERING" for retrieving raw records matching specific WHERE criteria (e.g. "Show records where the value is greater than 100").
     * "SUMMARY" for dataset overview or time-series trend analysis (e.g. "What are the trends in this dataset?").
   - isGrouped:
     * TRUE whenever the user asks for calculations per group ("for each", "per", "by", "in each", "for every", "across", "rank <group> by", "show <group> where <agg> > X").
     * FALSE for single overall scalar aggregations ("What is the total revenue?") or raw ungrouped row retrieval.
   - groupByColumns:
     * Array of exact column names from the schema used in the GROUP BY clause (e.g. ["category"], ["customer_id"], ["category", "payment_method"]), or [] if not grouped.
   - requestedRowCount:
     * Parse both digits and number words ("two" -> 2, "five" -> 5, "ten" -> 10).
     * "first 10 records" -> 10; "last 5 records" -> 5; "Which X has the highest Y?" (single winner) -> 1; "Highest Y in each X" (one per group) -> 0; "show all" -> 0.
   - requiresVisualization:
     * FALSE for RECORD_RETRIEVAL, FILTERING of raw rows, or single-row AGGREGATION/RANKING.
     * TRUE for all grouped aggregations (COMPARISON / GROUP BY queries returning one row per group), multi-row RANKING, or time-series trends.
   - recommendedVisualization: "bar" (grouped aggregations, category comparisons/rankings), "line" or "area" (trends over time/dates), "pie" (share/distribution with <= 8 categories), or "none".
   - outputFormat: "table" (for record retrieval/filtering), "direct_answer" (for single highest/lowest ranking), "kpi_metric" (for single scalar overall aggregation), or "chart_and_table" (for all grouped aggregations, comparisons, and trends).

STAGE 2: MULTI-TURN CONVERSATIONAL RESOLUTION
- Carefully inspect the Prior Conversation Context!
- If the user says "their", "those", "them", "these", "each of them", "from that", or "only the [entity] with the highest/lowest [metric]":
  * Look at the previous turn's Executed SQL and Query Result Summary.
  * Extract the exact entities, IDs, categories, grouping columns, or WHERE/IN clauses from the previous turn's results or use a CTE/subquery wrapping the previous query!
  * Example:
    Turn 1 User: "Total revenue for each category." -> Grouped by "category".
    Turn 2 User: "Now show the average unit price for each of them." -> Keep \`GROUP BY "category"\` and compute \`ROUND(AVG("unit_price"), 2) AS avg_unit_price\`!
- Never ask the user to repeat information that is already present in the Prior Conversation Context.

STAGE 3: STRICT SQLITE SQL GENERATION & GROUPING RULES
- Generate valid, read-only SQLite SQL based ONLY on the exact table names and column names in the Connected Database Schema above.
- Never invent or hallucinate table names or column names (never use "sales.db" or tables not in the schema).
- Wrap table or column identifiers in double quotes.
- CRITICAL DISTINCTION BETWEEN OVERALL AND GROUPED AGGREGATIONS:
  1. **Overall Aggregation (NO GROUP BY)**:
     - When the user asks for an overall calculation across the entire dataset (e.g., "What is the total revenue?", "Total revenue"):
     - Return a single scalar value with NO GROUP BY:
       \`SELECT ROUND(SUM("revenue"), 2) AS total_revenue FROM "sales";\`
  2. **Grouped Aggregation (MUST USE GROUP BY)**:
     - When the user asks for calculations for individual groups using phrases like "for each <X>", "per <X>", "by <X>", "in each <X>", "for every <X>", "across <X>":
     - You MUST SELECT the grouping column(s), apply the aggregate function (\`SUM\`, \`AVG\`, \`COUNT\`, \`MIN\`, \`MAX\`), include \`GROUP BY "group_col"\`, and \`ORDER BY\` the aggregate metric DESC!
     - NEVER omit \`GROUP BY\` on a grouped request!
     - Examples of dynamic grouping:
       * "Total revenue for each category" -> \`SELECT "category", ROUND(SUM("revenue"), 2) AS total_revenue FROM "sales" GROUP BY "category" ORDER BY total_revenue DESC;\`
       * "Average revenue per customer" -> \`SELECT "customer_id", ROUND(AVG("revenue"), 2) AS avg_revenue FROM "sales" GROUP BY "customer_id" ORDER BY avg_revenue DESC;\`
       * "Total quantity sold for each product" -> \`SELECT "product_id", ROUND(SUM("quantity"), 2) AS total_quantity FROM "sales" GROUP BY "product_id" ORDER BY total_quantity DESC;\`
       * "Number of sales per category" -> \`SELECT "category", COUNT(*) AS sales_count FROM "sales" GROUP BY "category" ORDER BY sales_count DESC;\`
       * "Average unit price for each category" -> \`SELECT "category", ROUND(AVG("unit_price"), 2) AS avg_unit_price FROM "sales" GROUP BY "category" ORDER BY avg_unit_price DESC;\`
       * "Total revenue for each customer" -> \`SELECT "customer_id", ROUND(SUM("revenue"), 2) AS total_revenue FROM "sales" GROUP BY "customer_id" ORDER BY total_revenue DESC;\`
       * "Highest revenue in each category" -> \`SELECT "category", ROUND(MAX("revenue"), 2) AS max_revenue FROM "sales" GROUP BY "category" ORDER BY max_revenue DESC;\` (Do NOT use LIMIT 1 when the user asks for the highest/lowest value IN EACH group!)
       * "Count of customers in each category" -> \`SELECT "category", COUNT(DISTINCT "customer_id") AS customer_count FROM "sales" GROUP BY "category" ORDER BY customer_count DESC;\`
  3. **Filtered Grouped Aggregation (GROUP BY + HAVING)**:
     - When the user filters groups by an aggregate condition (e.g., "Show categories where total revenue exceeds 1000"):
     - You MUST use \`GROUP BY\` and \`HAVING\` (NOT \`WHERE\` on the aggregate):
       \`SELECT "category", ROUND(SUM("revenue"), 2) AS total_revenue FROM "sales" GROUP BY "category" HAVING SUM("revenue") > 1000 ORDER BY total_revenue DESC;\`
  4. **Ranked Grouped Aggregation (GROUP BY + ORDER BY)**:
     - When the user asks to rank groups by an aggregate (e.g., "Rank categories by total revenue"):
     - \`SELECT "category", ROUND(SUM("revenue"), 2) AS total_revenue FROM "sales" GROUP BY "category" ORDER BY total_revenue DESC;\`
  5. **Multiple Grouping Columns**:
     - When the user asks to group by two or more dimensions (e.g., "Total revenue for each category and payment method"):
     - Include all requested grouping columns in both \`SELECT\` and \`GROUP BY\`:
       \`SELECT "category", "payment_method", ROUND(SUM("revenue"), 2) AS total_revenue FROM "sales" GROUP BY "category", "payment_method" ORDER BY total_revenue DESC;\`
- Distinction between record positions and rankings:
  * "First N records" (e.g. "Show me the first 10 records"):
    \`SELECT * FROM "table" ORDER BY "primary_key_or_rowid" ASC LIMIT N;\` (or \`SELECT * FROM "table" LIMIT N;\`).
  * "Last N records" (e.g. "Display the last 5 records"):
    Use the table's primary key / ID column (or date column if no ID exists) in a subquery so the last N rows are returned in their natural ascending order:
    \`SELECT * FROM (SELECT * FROM "table" ORDER BY "id_col" DESC LIMIT N) ORDER BY "id_col" ASC;\`
    If the table has NO primary key, ID column, or date/timestamp column, set intent to "CLARIFICATION_NEEDED" and ask which column defines the record order.
  * "Most recent / Latest N records":
    \`SELECT * FROM "table" ORDER BY "date_or_id_col" DESC LIMIT N;\`
  * "Oldest / Earliest N records":
    \`SELECT * FROM "table" ORDER BY "date_or_id_col" ASC LIMIT N;\`
  * "Which <dimension> has the highest/lowest <metric>?" (Single-winner ranking):
    Use \`GROUP BY "dimension" ORDER BY metric DESC LIMIT 1\`.
  * "Filtering" (e.g. "Show records where the value is greater than 100"):
    Map "the value" or the named attribute to the most relevant numeric metric column in the schema and generate \`SELECT * FROM "table" WHERE "metric_col" > 100;\`.
  * "Trends in this dataset" (e.g. "What are the trends in this dataset?"):
    If a date/time column exists, group by time period (e.g. \`substr("date_col", 1, 7) AS period\` or \`"date_col"\`), aggregate key numeric metrics (\`COUNT(*)\`, \`ROUND(SUM(...), 2)\`, \`ROUND(AVG(...), 2)\`), and \`ORDER BY period ASC\`. Set \`recommendedVisualization: "line"\` and \`requiresVisualization: true\`. If no date column exists, aggregate key metrics across the primary categorical dimension and set \`recommendedVisualization: "bar"\`.
  * "What information does this database contain?":
    Explain all tables, their record counts, columns, and relationships clearly in \`content\`, and generate a helpful overview SQL query (for example, a UNION ALL query showing each table name and its exact row count: \`SELECT 'table1' AS table_name, COUNT(*) AS record_count FROM "table1" UNION ALL SELECT 'table2' AS table_name, COUNT(*) AS record_count FROM "table2";\`).

STAGE 4: CONVERSATIONAL RESPONSE
- In "content", provide a natural, intelligent, analyst-grade explanation of what you are querying or what the database contains.
- Always set "suggestedFollowUps" to an empty array \`[]\`. Never return hardcoded suggested questions.

CRITICAL SAFETY:
Only generate read-only SELECT (or WITH ... SELECT) statements. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, ATTACH, DETACH, or write PRAGMA statements.`;

    const response = await generateWithGeminiModels(
      {
        contents: `${formattedHistory}Current User Question (Database: "${databaseName || 'Active DB'}", ID: "${databaseId || 'active'}"): "${query}"`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: {
                type: Type.STRING,
                description: 'One of: GREETING, GENERAL_CONVERSATION, DATA_QUERY, FOLLOW_UP_QUERY, CLARIFICATION_NEEDED, EXPLAIN_SQL, OPTIMIZE_SQL'
              },
              intentDetection: {
                type: Type.OBJECT,
                properties: {
                  operation: { type: Type.STRING, description: 'RECORD_RETRIEVAL, AGGREGATION, COMPARISON, RANKING, FILTERING, SUMMARY, GENERAL' },
                  isGrouped: { type: Type.BOOLEAN, description: 'True if the query groups results by one or more columns using GROUP BY' },
                  groupByColumns: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Columns used in GROUP BY clause, if any'
                  },
                  requestedRowCount: { type: Type.INTEGER, description: 'Exact requested row limit or 0 if none' },
                  requiresVisualization: { type: Type.BOOLEAN },
                  recommendedVisualization: { type: Type.STRING, description: 'bar, line, pie, area, or none' },
                  outputFormat: { type: Type.STRING, description: 'direct_answer, kpi_metric, table, chart_and_table' }
                },
                required: ['operation', 'requiresVisualization', 'outputFormat']
              },
              content: {
                type: Type.STRING,
                description: 'Clear, direct, conversational response answering the user question'
              },
              sql: {
                type: Type.STRING,
                description: 'Valid read-only SQLite SELECT query strictly honoring requested limits, GROUP BY, and HAVING requirements'
              },
              chartRecommendation: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: 'bar, line, pie, area, or none' },
                  title: { type: Type.STRING, description: 'Descriptive chart title' },
                  xKey: { type: Type.STRING, description: 'Column name for x-axis / categories' },
                  yKeys: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Numeric metric column names for y-axis'
                  }
                }
              },
              clarificationOptions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              suggestedFollowUps: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ['intent', 'intentDetection', 'content', 'chartRecommendation']
          }
        }
      },
      15000
    );

    const parsed = JSON.parse(response.text || '{}');
    parsed.suggestedFollowUps = [];
    parsed.databaseId = databaseId;

    // Pre-Execution Semantic Intent Validation (verifying GROUP BY, HAVING, and aggregate structure)
    if (parsed.sql && parsed.sql.trim() && parsed.intent !== 'GREETING' && parsed.intent !== 'CLARIFICATION_NEEDED') {
      let semanticCheck = validateSqlSemantics(
        query,
        parsed.sql,
        schemaContext || '',
        conversationHistory || [],
        parsed.intentDetection
      );

      if (!semanticCheck.valid) {
        console.warn(`[Semantic SQL Validator] Rejected initial SQL for "${query}": ${semanticCheck.reason}`);
        let regeneratedSuccess = false;

        // Attempt LLM-driven regeneration with explicit rejection feedback
        try {
          const regenResponse = await generateWithGeminiModels(
            {
              contents: `Your previously generated SQL for the user question "${query}" was REJECTED by the pre-execution semantic validator.
Rejection Reason: ${semanticCheck.reason}

Previous (Rejected) SQL:
\`\`\`sql
${parsed.sql}
\`\`\`

Database Schema:
${schemaContext}

Regenerate the SQL query so it accurately satisfies the user's intent, including all required GROUP BY columns in both SELECT and GROUP BY, appropriate aggregate functions (SUM, AVG, COUNT, MIN, MAX), and HAVING clauses if filtering groups.`,
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    sql: { type: Type.STRING },
                    content: { type: Type.STRING }
                  },
                  required: ['sql', 'content']
                }
              }
            },
            8000
          );

          const regenParsed = JSON.parse(regenResponse.text || '{}');
          if (regenParsed.sql) {
            const recheck = validateSqlSemantics(
              query,
              regenParsed.sql,
              schemaContext || '',
              conversationHistory || [],
              parsed.intentDetection
            );
            const safetyRecheck = validateGeneratedSql(regenParsed.sql, schemaContext);
            if (recheck.valid && safetyRecheck.safe) {
              parsed.sql = regenParsed.sql;
              if (regenParsed.content) parsed.content = regenParsed.content;
              semanticCheck = recheck;
              regeneratedSuccess = true;
            }
          }
        } catch (regenErr) {
          console.warn('[Semantic SQL Validator] Gemini regeneration failed, synthesizing verified SQL:', regenErr);
        }

        // If LLM regeneration still failed validation, synthesize guaranteed schema-verified grouped/overall SQL
        if (!regeneratedSuccess) {
          const synthesized = synthesizeGroupedOrOverallSql(semanticCheck.intent);
          if (synthesized) {
            parsed.sql = synthesized.sql;
            parsed.content = synthesized.description;
            parsed.intentDetection = {
              operation: synthesized.operation,
              isGrouped: semanticCheck.intent.requiresGroupBy,
              groupByColumns: semanticCheck.intent.groupingDimensions.map(d => d.columnName),
              requestedRowCount: semanticCheck.intent.requestedLimit || 0,
              requiresVisualization: synthesized.requiresVisualization,
              recommendedVisualization: synthesized.recommendedVisualization,
              outputFormat: synthesized.outputFormat
            };
            parsed.chartRecommendation = {
              type: synthesized.recommendedVisualization,
              title: synthesized.chartTitle,
              xKey: synthesized.xKey,
              yKeys: synthesized.yKeys
            };
            semanticCheck = validateSqlSemantics(
              query,
              parsed.sql,
              schemaContext || '',
              conversationHistory || [],
              parsed.intentDetection
            );
          }
        }
      }

      // Ensure grouped aggregations always set chart_and_table and accurate chartRecommendation metadata
      if (semanticCheck.sqlStructure.hasGroupBy && semanticCheck.sqlStructure.limitValue !== 1) {
        const groupCols = semanticCheck.sqlStructure.groupByColumns;
        parsed.intentDetection = {
          ...(parsed.intentDetection || {}),
          operation: parsed.intentDetection?.operation === 'SUMMARY' ? 'SUMMARY' : 'COMPARISON',
          isGrouped: true,
          groupByColumns: groupCols,
          requiresVisualization: true,
          recommendedVisualization:
            parsed.intentDetection?.recommendedVisualization && parsed.intentDetection.recommendedVisualization !== 'none'
              ? parsed.intentDetection.recommendedVisualization
              : 'bar',
          outputFormat: 'chart_and_table'
        };
        if (!parsed.chartRecommendation || parsed.chartRecommendation.type === 'none' || !parsed.chartRecommendation.xKey) {
          parsed.chartRecommendation = {
            type: 'bar',
            title: parsed.chartRecommendation?.title || `Grouped Analysis by ${groupCols.join(' & ')}`,
            xKey: groupCols[0] || '',
            yKeys: parsed.chartRecommendation?.yKeys || []
          };
        }
      } else if (semanticCheck.intent.aggregationType === 'OVERALL' && !semanticCheck.sqlStructure.hasGroupBy) {
        parsed.intentDetection = {
          ...(parsed.intentDetection || {}),
          operation: 'AGGREGATION',
          isGrouped: false,
          groupByColumns: [],
          requiresVisualization: false,
          recommendedVisualization: 'none',
          outputFormat: 'kpi_metric'
        };
      }
    }

    // Validate generated SQL for safety and schema compliance before returning
    if (parsed.sql && parsed.sql.trim()) {
      const validation = validateGeneratedSql(parsed.sql, schemaContext);
      if (!validation.safe) {
        res.json({
          intent: 'DATA_QUERY',
          intentDetection: parsed.intentDetection || {
            operation: 'GENERAL',
            requestedRowCount: 0,
            requiresVisualization: false,
            recommendedVisualization: 'none',
            outputFormat: 'direct_answer'
          },
          content: `I cannot execute that operation. ${validation.reason}`,
          sql: '',
          error: validation.reason,
          suggestedFollowUps: [],
          databaseId
        });
        return;
      }
    }

    res.json(parsed);
  } catch (error: unknown) {
    console.warn('Gemini generateContent timed out or threw error, using schema-aware fallback:', error);
    const { query, schemaContext, databaseName, conversationHistory, databaseId } = req.body;
    const fallback = generateLocalFallback(query || '', schemaContext || '', databaseName || '', conversationHistory || [], databaseId);
    res.json(fallback);
  }
});

/**
 * 2. Interpret Actual SQL Execution Results
 * Grounds interpretation 100% in the actual returned records from the selected database
 */
app.post('/api/chat/interpret', async (req: Request, res: Response) => {
  try {
    const { databaseId, databaseName, query, sql, columns, rows, rowCount } = req.body;

    const safeColumns: string[] = Array.isArray(columns) ? columns : [];
    const safeRows: (string | number | boolean | null)[][] = Array.isArray(rows) ? rows : [];
    const actualCount = typeof rowCount === 'number' ? rowCount : safeRows.length;

    const localSummary = buildGroundedLocalInterpretation(query || '', sql || '', safeColumns, safeRows, actualCount, databaseName);

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.json({
        databaseId,
        headline: localSummary.headline,
        interpretation: localSummary.interpretation,
        observations: localSummary.observations,
        kpis: generateBasicKPIs(safeColumns, safeRows, sql),
        suggestedFollowUps: []
      });
      return;
    }

    const sampleRows = safeRows.slice(0, 25);
    const formattedRows = sampleRows.map(r => {
      const obj: Record<string, unknown> = {};
      safeColumns.forEach((col, i) => {
        obj[col] = r[i];
      });
      return obj;
    });

    const prompt = `You are QueryWise, an intelligent conversational database analyst.
The user asked a question against database "${databaseName || 'Connected Database'}" (ID: "${databaseId || 'active'}"):
User Question: "${query}"

Executed SQL Query:
\`\`\`sql
${sql}
\`\`\`

Actual Execution Result:
- Total Rows Returned: ${actualCount}
- Columns: ${JSON.stringify(safeColumns)}
- Returned Data Rows (up to 25 rows):
${JSON.stringify(formattedRows, null, 2)}

Instructions for Grounded Result Interpretation:
1. "headline": Write a direct, natural-language answer to the user's question in 1-2 sentences, citing exact names and numbers from the returned rows (e.g., if they asked for the last 5 records, state that these are the last 5 records and mention the ID/name range; if they asked which category has the highest value, name the exact top category and its value; if they asked to compare categories, state the highest and lowest categories and their exact averages).
2. "interpretation": Write a clear, conversational explanation of the findings (2-4 sentences) grounded strictly in the returned rows. Highlight key patterns, comparisons, ranges, or notable observations that directly answer the user's question.
3. "observations": Provide 2 to 4 concise bullet-point observations strictly derived from the returned records (never invent statistics or numbers not present in the result set).
4. "kpis": Provide 2 to 4 key metrics computed directly from the returned data.
5. CRITICAL: Never fabricate values, trends, or statistics that are not supported by the returned rows above. If 0 rows were returned, state clearly that no records matched the criteria.`;

    const response = await generateWithGeminiModels(
      {
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING, description: 'Direct 1-2 sentence answer grounded in exact returned values' },
              interpretation: { type: Type.STRING, description: 'Clear explanation and observations of the returned data' },
              observations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2-4 specific observations grounded in the query result'
              },
              kpis: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.STRING },
                    change: { type: Type.STRING },
                    trend: { type: Type.STRING, description: 'up, down, or neutral' }
                  },
                  required: ['label', 'value']
                }
              }
            },
            required: ['headline', 'interpretation']
          }
        }
      },
      12000
    );

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      databaseId,
      headline: parsed.headline || localSummary.headline,
      interpretation: parsed.interpretation || localSummary.interpretation,
      observations: Array.isArray(parsed.observations) ? parsed.observations : localSummary.observations,
      kpis: Array.isArray(parsed.kpis) && parsed.kpis.length > 0 ? parsed.kpis : generateBasicKPIs(safeColumns, safeRows, sql),
      suggestedFollowUps: []
    });
  } catch (error: unknown) {
    console.warn('Interpret fallback used:', error);
    const { databaseId, databaseName, query, sql, columns, rows, rowCount } = req.body;
    const safeColumns: string[] = Array.isArray(columns) ? columns : [];
    const safeRows: (string | number | boolean | null)[][] = Array.isArray(rows) ? rows : [];
    const actualCount = typeof rowCount === 'number' ? rowCount : safeRows.length;
    const localSummary = buildGroundedLocalInterpretation(query || '', sql || '', safeColumns, safeRows, actualCount, databaseName);
    res.json({
      databaseId,
      headline: localSummary.headline,
      interpretation: localSummary.interpretation,
      observations: localSummary.observations,
      kpis: generateBasicKPIs(safeColumns, safeRows, sql),
      suggestedFollowUps: []
    });
  }
});

/**
 * 2b. Self-Healing SQL Repair Endpoint
 * Repairs invalid SQL when SQLite execution reports a syntax or schema/column error
 */
app.post('/api/sql/repair', async (req: Request, res: Response) => {
  try {
    const { query, failedSql, sqlError, schemaContext, databaseId, databaseName, conversationHistory } = req.body;
    if (!failedSql || !sqlError) {
      res.status(400).json({ error: 'failedSql and sqlError are required.' });
      return;
    }

    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const response = await generateWithGeminiModels(
          {
            contents: `The following SQLite query failed against database "${databaseName || 'Active DB'}" (ID: "${databaseId || 'active'}"):
User Question: "${query}"
Failed SQL:
\`\`\`sql
${failedSql}
\`\`\`
SQLite / Validation Error: "${sqlError}"

Actual Database Schema:
${schemaContext}

Fix the SQL query so it executes cleanly in SQLite using ONLY the exact table and column names in the schema above, preserving any required GROUP BY, HAVING, or aggregate logic. Return a read-only SELECT query.`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  repairedSql: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ['repairedSql', 'explanation']
              }
            }
          },
          10000
        );

        const parsed = JSON.parse(response.text || '{}');
        if (parsed.repairedSql) {
          const check = validateGeneratedSql(parsed.repairedSql, schemaContext);
          const semCheck = validateSqlSemantics(query || '', parsed.repairedSql, schemaContext || '', conversationHistory || []);
          if (check.safe && semCheck.valid) {
            res.json({
              repairedSql: parsed.repairedSql,
              explanation: parsed.explanation
            });
            return;
          }
        }
      } catch (e) {
        console.warn('Gemini SQL repair failed, falling back to local schema repair:', e);
      }
    }

    // Local fallback repair using schema heuristics
    const fallback = generateLocalFallback(query || '', schemaContext || '', databaseName || '', conversationHistory || [], databaseId);
    res.json({
      repairedSql: fallback.sql || '',
      explanation: fallback.content || 'Adjusted SQL query to match available schema columns.'
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * 3. Optimize SQL Query
 */
app.post('/api/sql/optimize', async (req: Request, res: Response) => {
  try {
    const { sql, schemaContext } = req.body;
    if (!sql) {
      res.status(400).json({ error: 'SQL query required.' });
      return;
    }

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.json({
        optimizedSql: sql,
        explanation: 'Local optimization: Ensure proper indexes exist on JOIN foreign keys and WHERE filtering columns.'
      });
      return;
    }

    const response = await generateWithGeminiModels(
      {
        contents: `Schema:\n${schemaContext || 'Standard SQLite'}\n\nOriginal SQL:\n${sql}\n\nOptimize this query for SQLite. Suggest index creations if helpful, improve joins or subqueries, and explain improvements accurately.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              optimizedSql: { type: Type.STRING },
              explanation: { type: Type.STRING },
              suggestedIndexes: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ['optimizedSql', 'explanation']
          }
        }
      },
      10000
    );

    res.json(JSON.parse(response.text || '{}'));
  } catch (err: unknown) {
    console.warn('Optimize fallback:', err);
    const { sql } = req.body;
    res.json({
      optimizedSql: sql,
      explanation: 'Query structure is already standard. Recommend ensuring indexes exist on foreign key columns and WHERE clause filters to optimize scan performance.',
      suggestedIndexes: ['CREATE INDEX IF NOT EXISTS idx_perf ON sales(sale_date);']
    });
  }
});

/**
 * 4. Explain SQL Query
 * Deconstructs query into clause-by-clause breakdown instantly (< 1ms)
 * with AI contextual enrichment.
 */
app.post('/api/sql/explain', async (req: Request, res: Response) => {
  try {
    const { sql, schemaContext } = req.body;
    if (!sql) {
      res.status(400).json({ error: 'SQL query required.' });
      return;
    }

    // Always compute the accurate, zero-latency local clause breakdown first (< 1ms)
    const localAnalysis = deconstructSqlClauses(sql);

    // If Gemini is not configured, return accurate local breakdown immediately
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.json({
        explanation: localAnalysis.overview,
        breakdown: localAnalysis.breakdown,
        businessContext: localAnalysis.businessContext,
        complexity: localAnalysis.complexity
      });
      return;
    }

    // Attempt AI enrichment with 10000ms timeout
    try {
      const response = await generateWithGeminiModels(
        {
          contents: `Explain this SQL query step-by-step for a business analyst and developer:\n${sql}\n\nSchema:\n${schemaContext || ''}`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                explanation: { type: Type.STRING, description: 'High level summary of what the query produces' },
                breakdown: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      clause: { type: Type.STRING },
                      description: { type: Type.STRING }
                    },
                    required: ['clause', 'description']
                  }
                },
                businessContext: { type: Type.STRING }
              },
              required: ['explanation', 'breakdown']
            }
          }
        },
        10000
      );

      const parsed = JSON.parse(response.text || '{}');
      if (parsed && Array.isArray(parsed.breakdown) && parsed.breakdown.length > 0) {
        res.json({
          explanation: parsed.explanation || localAnalysis.overview,
          breakdown: parsed.breakdown,
          businessContext: parsed.businessContext || localAnalysis.businessContext,
          complexity: localAnalysis.complexity
        });
        return;
      }
    } catch {
      // AI timeout or rate limit; smoothly fall through to accurate local analysis
    }

    res.json({
      explanation: localAnalysis.overview,
      breakdown: localAnalysis.breakdown,
      businessContext: localAnalysis.businessContext,
      complexity: localAnalysis.complexity
    });
  } catch (err: unknown) {
    console.warn('Explain endpoint error, returning instant local breakdown:', err);
    const { sql } = req.body;
    const fallback = deconstructSqlClauses(sql || 'SELECT * FROM data;');
    res.json({
      explanation: fallback.overview,
      breakdown: fallback.breakdown,
      businessContext: fallback.businessContext,
      complexity: fallback.complexity
    });
  }
});

interface ParsedColumn {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isDate: boolean;
  isNumeric: boolean;
  isText: boolean;
}

interface ParsedTable {
  tableName: string;
  rowCount: number;
  columns: ParsedColumn[];
  primaryKeyCol?: string;
  dateCol?: string;
  numericCols: string[];
  textCols: string[];
}

function parseWordNumber(text: string): number | null {
  const map: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    twentyfive: 25,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
    hundred: 100
  };
  const clean = text.toLowerCase().trim();
  if (map[clean] !== undefined) return map[clean];
  const num = parseInt(clean, 10);
  return isNaN(num) ? null : num;
}

function parseSchemaStructure(schemaText: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const blocks = (schemaText || '').split(/Table:\s*"?/i).slice(1);

  for (const block of blocks) {
    const nameMatch = block.match(/^([a-zA-Z0-9_]+)["\s(:]/);
    if (!nameMatch) continue;
    const tableName = nameMatch[1];

    let rowCount = 0;
    const countMatch = block.match(/\((\d+)\s+records?\)/i);
    if (countMatch) {
      rowCount = parseInt(countMatch[1], 10);
    }

    const columns: ParsedColumn[] = [];
    const lines = block.split('\n');
    for (const line of lines) {
      const colMatch = line.match(/^\s*-\s*([a-zA-Z0-9_]+)\s*\(([^)]+)\)/);
      if (colMatch) {
        const colName = colMatch[1];
        const colMeta = colMatch[2];
        const colType = colMeta.split(',')[0].trim().toUpperCase();
        const isPk =
          /primary\s*key/i.test(colMeta) ||
          colName.toLowerCase() === 'id' ||
          colName.toLowerCase() === `${tableName.toLowerCase()}_id` ||
          colName.toLowerCase() === `${tableName.toLowerCase().replace(/s$/, '')}_id`;
        const isFk =
          /foreign\s*key/i.test(colMeta) ||
          (!isPk && /_id$/i.test(colName));
        const isDate =
          /date|time|timestamp/i.test(colType) ||
          /created_at|updated_at|timestamp|sale_date|order_date|join_date|appointment_date|date|transaction_date|admit_date/i.test(colName);
        const isNumeric =
          !isPk &&
          !isFk &&
          (/int|real|float|double|decimal|numeric/i.test(colType) ||
            /revenue|amount|salary|balance|spent|price|marks|attendance|units|score|age|rate|cost|fee|quantity|level|rating|pct|percent|ph|nitrogen|phosphorus|potassium|value/i.test(colName));
        const isText = !isDate && !isNumeric && !isPk && !isFk;

        columns.push({
          name: colName,
          type: colType,
          isPrimaryKey: isPk,
          isDate,
          isNumeric,
          isText
        });
      }
    }

    const primaryKeyCol = columns.find(c => c.isPrimaryKey)?.name;
    const dateCol = columns.find(c => c.isDate)?.name;
    const numericCols = columns.filter(c => c.isNumeric).map(c => c.name);
    const textCols = columns.filter(c => c.isText).map(c => c.name);

    tables.push({
      tableName,
      rowCount,
      columns,
      primaryKeyCol,
      dateCol,
      numericCols,
      textCols
    });
  }

  return tables;
}

// Intelligent schema-aware SQL generator when Gemini is offline or rate-limited
function generateLocalFallback(
  query: string,
  schema: string,
  dbName: string,
  conversationHistory: ConversationHistoryItem[] = [],
  databaseId?: string
) {
  const q = query.toLowerCase().trim();
  const tables = parseSchemaStructure(schema);

  // 0. Block destructive requests immediately
  if (/^\s*(drop|delete|update|insert|alter|truncate|create|replace)\b/i.test(q)) {
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'GENERAL',
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'direct_answer'
      },
      content: 'Security Policy Violation: Destructive or write operations (DROP, DELETE, UPDATE, INSERT, ALTER) are strictly forbidden. QueryWise operates in read-only mode.',
      sql: '',
      error: 'Security Policy Violation: Only read-only SELECT queries are permitted.',
      suggestedFollowUps: []
    };
  }

  // 1. Detect target table
  let activeTable: ParsedTable | undefined;

  // Exact table name match in query
  for (const t of tables) {
    const tName = t.tableName.toLowerCase();
    const tSingular = tName.replace(/s$/, '');
    if (new RegExp(`\\b${tName}\\b|\\b${tSingular}\\b`, 'i').test(q)) {
      activeTable = t;
      break;
    }
  }

  // Score tables by number of matching column names in the query
  if (!activeTable && tables.length > 0) {
    const queryTokens = q.split(/[\s,?.!;'"]+/).filter(tok => tok.length > 2);
    let bestScore = 0;
    for (const t of tables) {
      let score = 0;
      for (const c of t.columns) {
        const cLow = c.name.toLowerCase();
        if (q.includes(cLow.replace(/_/g, ' ')) || queryTokens.some(tok => tok === cLow || (tok.length > 3 && cLow.includes(tok)))) {
          score += c.isNumeric ? 2 : 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        activeTable = t;
      }
    }
  }

  // Check recent conversation history for target table & SQL
  let lastAssistantSql = '';
  let lastResultSummary = '';
  if (Array.isArray(conversationHistory)) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const item = conversationHistory[i];
      if (!lastAssistantSql && item.sql) {
        lastAssistantSql = item.sql;
      }
      if (!lastResultSummary && item.resultSummary) {
        lastResultSummary = item.resultSummary;
      }
      if (!activeTable) {
        const prev = `${item.content || ''} ${item.sql || ''}`.toLowerCase();
        for (const t of tables) {
          if (prev.includes(t.tableName.toLowerCase())) {
            activeTable = t;
            break;
          }
        }
      }
    }
  }

  // Default to primary fact table (table with the most numeric/date columns and highest rowCount)
  if (!activeTable && tables.length > 0) {
    activeTable = [...tables].sort((a, b) => {
      const aScore = (a.numericCols.length > 0 ? 1000 : 0) + (a.dateCol ? 500 : 0) + a.rowCount;
      const bScore = (b.numericCols.length > 0 ? 1000 : 0) + (b.dateCol ? 500 : 0) + b.rowCount;
      return bScore - aScore;
    })[0];
  }

  const targetTable = activeTable?.tableName || 'records';
  const primaryKeyCol = activeTable?.primaryKeyCol;
  const dateCol = activeTable?.dateCol;
  const preferredMetricNames = ['revenue', 'amount', 'salary', 'balance', 'price', 'soil_score', 'nitrogen', 'marks', 'score', 'cost', 'unit_price', 'quantity'];
  const preferredCol = preferredMetricNames
    .map(p => activeTable?.numericCols.find(c => c.toLowerCase() === p))
    .find((c): c is string => Boolean(c));
  const numericCol =
    activeTable?.numericCols.find(c => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, ' '))) ||
    preferredCol ||
    activeTable?.numericCols[0] ||
    'amount';
  const textCol =
    activeTable?.textCols.find(c => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, ' '))) ||
    activeTable?.textCols[0] ||
    'name';

  // 2. Greeting Check
  if (
    q === 'hi' ||
    q === 'hello' ||
    q === 'hey' ||
    q.startsWith('hi ') ||
    q.startsWith('hello ') ||
    q === 'who are you'
  ) {
    return {
      databaseId,
      intent: 'GREETING',
      intentDetection: {
        operation: 'GENERAL',
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'direct_answer'
      },
      content: `Hello! I'm QueryWise, your conversational database analyst. I'm connected to "${dbName || 'your database'}" (${tables.length} table${tables.length === 1 ? '' : 's'}: ${tables.map(t => t.tableName).join(', ')}). Ask me anything about your data!`,
      sql: '',
      suggestedFollowUps: []
    };
  }

  // 2b. Database Overview / Schema Questions ("What information does this database contain?")
  if (
    q.includes('what information') ||
    q.includes('what data') ||
    q.includes('what tables') ||
    q.includes('describe this database') ||
    q.includes('about this database') ||
    q.includes('database contain') ||
    q.includes('schema of') ||
    q.includes('overview of this database')
  ) {
    const tableDescriptions = tables.map(t => {
      const colNames = t.columns.map(c => `${c.name} (${c.type})`).join(', ');
      return `- **${t.tableName}** (${t.rowCount} records): ${colNames}`;
    }).join('\n');

    const unionSql = tables.length > 0
      ? `${tables.map(t => `SELECT '${t.tableName}' AS table_name, COUNT(*) AS record_count FROM "${t.tableName}"`).join(' UNION ALL ')};`
      : '';

    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'SUMMARY',
        requestedRowCount: tables.length,
        requiresVisualization: tables.length > 1,
        recommendedVisualization: tables.length > 1 ? 'bar' : 'none',
        outputFormat: 'table'
      },
      content: `The connected database **"${dbName || 'Active Database'}"** contains **${tables.length} table${tables.length === 1 ? '' : 's'}**:\n\n${tableDescriptions}`,
      sql: unionSql,
      chartRecommendation: {
        type: tables.length > 1 ? 'bar' : 'none',
        title: `Record Counts Across Tables in ${dbName || 'Database'}`,
        xKey: 'table_name',
        yKeys: ['record_count']
      },
      suggestedFollowUps: []
    };
  }

  // 3. SQL Explanation / Breakdown
  if (
    q.includes('clause') ||
    q.includes('explain') ||
    q.includes('how does this work') ||
    q.includes('how does this query work') ||
    q.includes('how does this sql work') ||
    q.includes('break down') ||
    q.includes('deconstruct')
  ) {
    let targetSql = lastAssistantSql;
    if (!targetSql && Array.isArray(conversationHistory)) {
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const item = conversationHistory[i];
        if (item.content && /SELECT\b/i.test(item.content)) {
          const match = item.content.match(/SELECT[\s\S]+?;/i) || item.content.match(/SELECT[\s\S]+/i);
          if (match) {
            targetSql = match[0].trim();
            break;
          }
        }
      }
    }
    if (!targetSql) {
      const directMatch = query.match(/SELECT[\s\S]+/i);
      targetSql = directMatch ? directMatch[0].trim() : `SELECT * FROM "${targetTable}" LIMIT 10;`;
    }

    const analysis = deconstructSqlClauses(targetSql);
    const breakdownFormatted = analysis.breakdown
      .map(b => `* **\`${b.keyword}\`** (\`${b.expression}\`):\n  ${b.description}`)
      .join('\n\n');

    return {
      databaseId,
      intent: 'EXPLAIN_SQL',
      intentDetection: {
        operation: 'SUMMARY',
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'direct_answer'
      },
      content: `### SQL Clause-by-Clause Explanation\n\n**Query Analyzed**:\n\`\`\`sql\n${targetSql}\n\`\`\`\n\n**Overview**: ${analysis.overview} (${analysis.complexity} Complexity)\n\n**Clause Breakdown**:\n\n${breakdownFormatted}\n\n**Business Context**:\n${analysis.businessContext}`,
      sql: targetSql,
      chartRecommendation: {
        type: 'none',
        title: 'SQL Clause Breakdown',
        xKey: '',
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }

  // 3b. Multi-Turn Follow-up Resolution ("their", "those", "only the ... with highest/lowest")
  const isFollowUpRef = /\b(their|those|them|these|each of them|for each of those|from those|among those|only the)\b/i.test(q);
  const explicitNumericMatch = activeTable?.numericCols.find(
    c => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, ' '))
  );
  if (isFollowUpRef && lastResultSummary) {
    try {
      const parsedPrev = JSON.parse(lastResultSummary);
      const prevRows: unknown[][] = Array.isArray(parsedPrev.rows) ? parsedPrev.rows : [];
      const prevCols: string[] = Array.isArray(parsedPrev.columns) ? parsedPrev.columns : [];
      if (prevRows.length > 0 && prevCols.length > 0) {
        let entityColIndex = prevCols.findIndex(c =>
          activeTable?.columns.some(ac => ac.name.toLowerCase() === c.toLowerCase() && (ac.isText || ac.isPrimaryKey))
        );
        if (entityColIndex === -1) entityColIndex = 0;
        const matchedSchemaCol =
          activeTable?.columns.find(ac => ac.name.toLowerCase() === prevCols[entityColIndex]?.toLowerCase())?.name ||
          textCol;

        const entityValues = Array.from(
          new Set(
            prevRows
              .map(r => r[entityColIndex])
              .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
              .map(v => typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
          )
        );

        if (entityValues.length > 0) {
          const inClause = `"${matchedSchemaCol}" IN (${entityValues.join(', ')})`;

          if (
            q.includes('only the') ||
            ((q.includes('highest') || q.includes('lowest')) && !/\b(for each|in each|per|each of)\b/i.test(q))
          ) {
            const isLowest = q.includes('lowest') || q.includes('minimum') || q.includes('least');
            const dir = isLowest ? 'ASC' : 'DESC';
            const sql = `SELECT "${matchedSchemaCol}", ROUND(AVG("${numericCol}"), 2) AS avg_${numericCol} FROM "${targetTable}" WHERE ${inClause} GROUP BY "${matchedSchemaCol}" ORDER BY avg_${numericCol} ${dir} LIMIT 1;`;
            return {
              databaseId,
              intent: 'FOLLOW_UP_QUERY',
              intentDetection: {
                operation: 'RANKING',
                isGrouped: true,
                groupByColumns: [matchedSchemaCol],
                requestedRowCount: 1,
                requiresVisualization: false,
                recommendedVisualization: 'none',
                outputFormat: 'direct_answer'
              },
              content: `Refining the previous selection to find the ${matchedSchemaCol.replace(/_/g, ' ')} with the ${isLowest ? 'lowest' : 'highest'} ${numericCol.replace(/_/g, ' ')}.`,
              sql,
              chartRecommendation: {
                type: 'none',
                title: `${isLowest ? 'Lowest' : 'Highest'} ${numericCol.replace(/_/g, ' ')}`,
                xKey: matchedSchemaCol,
                yKeys: [`avg_${numericCol}`]
              },
              suggestedFollowUps: []
            };
          }

          // When the user asks generally for "their average <domain> levels/values" without naming a single column
          if (!explicitNumericMatch) {
            const metricsToAvg = (activeTable?.numericCols || [numericCol]).slice(0, 3);
            const selectMetrics = metricsToAvg.map(m => `ROUND(AVG("${m}"), 2) AS avg_${m}`).join(', ');
            const yKeys = metricsToAvg.map(m => `avg_${m}`);
            const sql = `SELECT "${matchedSchemaCol}", ${selectMetrics} FROM "${targetTable}" WHERE ${inClause} GROUP BY "${matchedSchemaCol}" ORDER BY ${yKeys[0]} DESC;`;
            return {
              databaseId,
              intent: 'FOLLOW_UP_QUERY',
              intentDetection: {
                operation: 'COMPARISON',
                isGrouped: true,
                groupByColumns: [matchedSchemaCol],
                requestedRowCount: entityValues.length,
                requiresVisualization: true,
                recommendedVisualization: 'bar',
                outputFormat: 'chart_and_table'
              },
              content: `Comparing average ${metricsToAvg.map(m => m.replace(/_/g, ' ')).join(', ')} across the ${entityValues.length} previously selected ${matchedSchemaCol.replace(/_/g, ' ')}s.`,
              sql,
              chartRecommendation: {
                type: 'bar',
                title: `Comparison Across Selected ${matchedSchemaCol.replace(/_/g, ' ')}s`,
                xKey: matchedSchemaCol,
                yKeys
              },
              suggestedFollowUps: []
            };
          }
        }
      }
    } catch {
      // Fall through to standard semantic analysis
    }
  }

  // 3c. Dynamic Schema-Aware Semantic Grouping & Aggregation Analysis
  // Distinguishes Overall Aggregation, Grouped Aggregation (GROUP BY), Filtered Grouped Aggregation (GROUP BY + HAVING),
  // Ranked Grouped Aggregation (GROUP BY + ORDER BY), and Multi-Column GROUP BY before raw row filters.
  const isPositionalRecordRequest =
    /\b(first|last|latest|newest|most recent|oldest|earliest)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty)\s*(records|rows|items|entries)?\b/i.test(q) ||
    /\b(all records|all rows|show all|display all|every record|every row)\b/i.test(q);

  if (!isPositionalRecordRequest && !q.includes('trend') && !q.includes('over time') && !q.includes('time series')) {
    const schemaTables = parseSchemaTables(schema);
    const semanticIntent = analyzeQueryGroupingIntent(query, schemaTables, conversationHistory);
    if (semanticIntent.requiresGroupBy) {
      const synthesized = synthesizeGroupedOrOverallSql(semanticIntent);
      if (synthesized) {
        return {
          databaseId,
          intent: isFollowUpRef ? 'FOLLOW_UP_QUERY' : 'DATA_QUERY',
          intentDetection: {
            operation: synthesized.operation,
            isGrouped: true,
            groupByColumns: semanticIntent.groupingDimensions.map(d => d.columnName),
            requestedRowCount: semanticIntent.requestedLimit || 0,
            requiresVisualization: synthesized.requiresVisualization,
            recommendedVisualization: synthesized.recommendedVisualization,
            outputFormat: synthesized.outputFormat
          },
          content: synthesized.description,
          sql: synthesized.sql,
          chartRecommendation: {
            type: synthesized.recommendedVisualization,
            title: synthesized.chartTitle,
            xKey: synthesized.xKey,
            yKeys: synthesized.yKeys
          },
          suggestedFollowUps: []
        };
      }
    }
  }

  // 4. Parse Count and Direction
  const numWordPattern =
    '\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twentyfive|thirty|forty|fifty|hundred';

  let extractedCount: number | null = null;
  const countRegexes = [
    new RegExp(`(?:last|latest|recent|newest|bottom|end)\\s+(${numWordPattern})\\s*(?:records|rows|items|entries|results)?`, 'i'),
    new RegExp(`(${numWordPattern})\\s+(?:last|recent|latest|newest)\\s*(?:records|rows|items|entries|results)?`, 'i'),
    new RegExp(`(?:first|top|earliest|oldest|initial|start)\\s+(${numWordPattern})\\s*(?:records|rows|items|entries|results)?`, 'i'),
    new RegExp(`(?:display|show|fetch|get|select|list|limit)\\s+(${numWordPattern})\\s*(?:records|rows|items|entries|results)?`, 'i'),
    new RegExp(`(${numWordPattern})\\s+(?:records|rows|items|entries|results)`, 'i')
  ];

  for (const rg of countRegexes) {
    const m = q.match(rg);
    if (m && m[1]) {
      extractedCount = parseWordNumber(m[1]);
      if (extractedCount !== null) break;
    }
  }

  const isLast = /\blast\b|\bbottom\b|\bend\b|\btail\b/i.test(q);
  const isLatest = /\blatest\b|\bnewest\b|\bmost recent\b|\brecent\b/i.test(q);
  const isOldest = /\boldest\b|\bearliest\b|\bfirst created\b/i.test(q);
  const isFirst = /\bfirst\b|\binitial\b|\bbeginning\b|\bstart\b/i.test(q);
  const isAll = /\ball records\b|\ball rows\b|\bshow all\b|\bdisplay all\b|\bevery record\b|\bevery row\b|\ball customers\b|\ball products\b|\ball sales\b|\ball patients\b|\ball orders\b|\beverything\b/i.test(q);

  // 4b. FILTERING QUERIES (e.g. "Show records where the value is greater than 100")
  const filterMatch =
    q.match(/(?:greater than|more than|above|over|exceeds|>)\s*(-?\d+(?:\.\d+)?)/i) ||
    q.match(/(?:less than|below|under|<)\s*(-?\d+(?:\.\d+)?)/i) ||
    q.match(/(?:equal to|equals|=)\s*(-?\d+(?:\.\d+)?)/i);
  if (filterMatch && (q.includes('where') || q.includes('greater than') || q.includes('less than') || q.includes('above') || q.includes('below') || q.includes('over') || q.includes('under') || q.includes('>') || q.includes('<'))) {
    const threshold = Number(filterMatch[1]);
    const isLess = /less than|below|under|</i.test(filterMatch[0]);
    const isEqual = /equal to|equals|=/i.test(filterMatch[0]) && !isLess && !/greater|more|above|over|>/i.test(filterMatch[0]);
    const op = isEqual ? '=' : isLess ? '<' : '>';
    const limitClause = extractedCount ? ` LIMIT ${extractedCount}` : '';
    const sql = `SELECT * FROM "${targetTable}" WHERE "${numericCol}" ${op} ${threshold} ORDER BY "${numericCol}" DESC${limitClause};`;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'FILTERING',
        requestedRowCount: extractedCount || 0,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'table'
      },
      content: `Filtering records from "${targetTable}" where "${numericCol}" is ${op} ${threshold}.`,
      sql,
      chartRecommendation: {
        type: 'none',
        title: `Records in ${targetTable} where ${numericCol} ${op} ${threshold}`,
        xKey: primaryKeyCol || textCol,
        yKeys: [numericCol]
      },
      suggestedFollowUps: []
    };
  }

  // 4c. TRENDS IN DATASET (e.g. "What are the trends in this dataset?")
  if (q.includes('trend') || q.includes('over time') || q.includes('time series') || q.includes('monthly') || q.includes('progression')) {
    if (dateCol) {
      const sql = `SELECT substr("${dateCol}", 1, 7) AS period, COUNT(*) AS record_count, ROUND(SUM("${numericCol}"), 2) AS total_${numericCol}, ROUND(AVG("${numericCol}"), 2) AS avg_${numericCol} FROM "${targetTable}" GROUP BY period ORDER BY period ASC;`;
      return {
        databaseId,
        intent: 'DATA_QUERY',
        intentDetection: {
          operation: 'SUMMARY',
          requestedRowCount: 0,
          requiresVisualization: true,
          recommendedVisualization: 'line',
          outputFormat: 'chart_and_table'
        },
        content: `Analyzing time-series trends in "${targetTable}" grouped by period (${dateCol}) for ${numericCol.replace(/_/g, ' ')}.`,
        sql,
        chartRecommendation: {
          type: 'line',
          title: `Trend of ${numericCol.replace(/_/g, ' ')} Over Time`,
          xKey: 'period',
          yKeys: [`total_${numericCol}`, `avg_${numericCol}`]
        },
        suggestedFollowUps: []
      };
    } else {
      const sql = `SELECT "${textCol}", COUNT(*) AS record_count, ROUND(AVG("${numericCol}"), 2) AS avg_${numericCol}, ROUND(SUM("${numericCol}"), 2) AS total_${numericCol} FROM "${targetTable}" GROUP BY "${textCol}" ORDER BY avg_${numericCol} DESC;`;
      return {
        databaseId,
        intent: 'DATA_QUERY',
        intentDetection: {
          operation: 'SUMMARY',
          requestedRowCount: 0,
          requiresVisualization: true,
          recommendedVisualization: 'bar',
          outputFormat: 'chart_and_table'
        },
        content: `Analyzing key patterns and distributions across ${textCol.replace(/_/g, ' ')} in "${targetTable}".`,
        sql,
        chartRecommendation: {
          type: 'bar',
          title: `Trend & Distribution of ${numericCol.replace(/_/g, ' ')} by ${textCol.replace(/_/g, ' ')}`,
          xKey: textCol,
          yKeys: [`avg_${numericCol}`]
        },
        suggestedFollowUps: []
      };
    }
  }

  // 5. Total Row Count Aggregation
  if (
    (q.includes('total') && (q.includes('record') || q.includes('row') || q.includes('count') || q.includes('number of'))) ||
    q === 'how many records' ||
    q === 'how many rows' ||
    q.includes('count all') ||
    q === 'total records'
  ) {
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'AGGREGATION',
        requestedRowCount: 1,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'kpi_metric'
      },
      content: `Calculated the total number of records in table "${targetTable}".`,
      sql: `SELECT COUNT(*) AS total_records FROM "${targetTable}";`,
      chartRecommendation: {
        type: 'none',
        title: `Total Records in ${targetTable}`,
        xKey: '',
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }

  // 6. LAST N RECORDS (Exact Handling as Required)
  if (isLast) {
    const count = extractedCount || 5;
    const orderCol = primaryKeyCol || dateCol;

    if (!orderCol) {
      return {
        databaseId,
        intent: 'CLARIFICATION_NEEDED',
        intentDetection: {
          operation: 'RECORD_RETRIEVAL',
          requestedRowCount: count,
          requiresVisualization: false,
          recommendedVisualization: 'none',
          outputFormat: 'direct_answer'
        },
        content: `Table "${targetTable}" does not have an explicit primary key, ID, or timestamp column to determine the last records. Which column should be used for ordering?`,
        clarificationOptions: (activeTable?.columns || []).slice(0, 3).map(c => `Order by ${c.name} descending`),
        sql: '',
        suggestedFollowUps: []
      };
    }

    const sql = `SELECT * FROM (SELECT * FROM "${targetTable}" ORDER BY "${orderCol}" DESC LIMIT ${count}) ORDER BY "${orderCol}" ASC;`;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'RECORD_RETRIEVAL',
        requestedRowCount: count,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'table'
      },
      content: `Displaying the last ${count} records from "${targetTable}" ordered by "${orderCol}".`,
      sql,
      chartRecommendation: {
        type: 'none',
        title: `Last ${count} Records from ${targetTable}`,
        xKey: orderCol,
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }

  // 7. LATEST N RECORDS
  if (isLatest) {
    const count = extractedCount || 5;
    const orderCol = dateCol || primaryKeyCol;
    if (orderCol) {
      const sql = `SELECT * FROM "${targetTable}" ORDER BY "${orderCol}" DESC LIMIT ${count};`;
      return {
        databaseId,
        intent: 'DATA_QUERY',
        intentDetection: {
          operation: 'RECORD_RETRIEVAL',
          requestedRowCount: count,
          requiresVisualization: false,
          recommendedVisualization: 'none',
          outputFormat: 'table'
        },
        content: `Displaying the latest ${count} records from "${targetTable}" based on "${orderCol}".`,
        sql,
        chartRecommendation: {
          type: 'none',
          title: `Latest ${count} Records from ${targetTable}`,
          xKey: orderCol,
          yKeys: []
        },
        suggestedFollowUps: []
      };
    }
  }

  // 8. OLDEST N RECORDS
  if (isOldest) {
    const count = extractedCount || 3;
    const orderCol = dateCol || primaryKeyCol;
    if (orderCol) {
      const sql = `SELECT * FROM "${targetTable}" ORDER BY "${orderCol}" ASC LIMIT ${count};`;
      return {
        databaseId,
        intent: 'DATA_QUERY',
        intentDetection: {
          operation: 'RECORD_RETRIEVAL',
          requestedRowCount: count,
          requiresVisualization: false,
          recommendedVisualization: 'none',
          outputFormat: 'table'
        },
        content: `Displaying the ${count} oldest records from "${targetTable}" based on "${orderCol}".`,
        sql,
        chartRecommendation: {
          type: 'none',
          title: `Oldest ${count} Records from ${targetTable}`,
          xKey: orderCol,
          yKeys: []
        },
        suggestedFollowUps: []
      };
    }
  }

  // 9. SHOW ALL RECORDS (Unbounded)
  if (isAll) {
    const sql = `SELECT * FROM "${targetTable}";`;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'RECORD_RETRIEVAL',
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'table'
      },
      content: `Displaying all records from "${targetTable}".`,
      sql,
      chartRecommendation: {
        type: 'none',
        title: `All Records from ${targetTable}`,
        xKey: primaryKeyCol || 'id',
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }

  // 10. COMPARISON ACROSS GROUPS (Check before ranking so "Compare the average values across categories" hits COMPARISON)
  if (
    q.includes('compare') ||
    q.includes('across') ||
    q.includes('breakdown') ||
    q.includes('distribution') ||
    q.includes('by category') ||
    q.includes('by department') ||
    q.includes('by region') ||
    q.includes('by district')
  ) {
    const dim = textCol;
    const metric = numericCol;
    const useAvg = q.includes('average') || q.includes('avg') || q.includes('mean');
    const aggFn = useAvg ? 'AVG' : 'SUM';
    const alias = useAvg ? `avg_${metric}` : `total_${metric}`;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'COMPARISON',
        requestedRowCount: 10,
        requiresVisualization: true,
        recommendedVisualization: 'bar',
        outputFormat: 'chart_and_table'
      },
      content: `Compared ${useAvg ? 'average' : 'total'} ${metric.replace(/_/g, ' ')} across ${dim.replace(/_/g, ' ')} in table "${targetTable}".`,
      sql: `SELECT "${dim}", ROUND(${aggFn}("${metric}"), 2) AS "${alias}", COUNT(*) AS record_count FROM "${targetTable}" GROUP BY "${dim}" ORDER BY "${alias}" DESC LIMIT 10;`,
      chartRecommendation: {
        type: 'bar',
        title: `${useAvg ? 'Average' : 'Total'} ${metric.replace(/_/g, ' ')} by ${dim.replace(/_/g, ' ')}`,
        xKey: dim,
        yKeys: [alias]
      },
      suggestedFollowUps: []
    };
  }

  // 11. TOP N BY METRIC / RANKING (e.g. "Which category has the highest value?", "lowest price")
  if (
    q.includes('top ') ||
    q.includes('highest') ||
    q.includes('maximum') ||
    q.includes('best') ||
    q.includes('most') ||
    q.includes('lowest') ||
    q.includes('minimum') ||
    q.includes('least') ||
    q.includes('smallest')
  ) {
    const isLowest = /\b(lowest|minimum|least|smallest|worst|bottom)\b/i.test(q);
    const sortDir = isLowest ? 'ASC' : 'DESC';
    const rankLabel = isLowest ? 'lowest' : 'highest';
    const count = extractedCount || (q.includes('highest') || q.includes('lowest') || q.includes('minimum') || q.includes('maximum') ? 1 : 5);

    // Multi-table join for customers and sales
    const hasSales = tables.some(t => t.tableName === 'sales');
    const hasCustomers = tables.some(t => t.tableName === 'customers');
    if (q.includes('customer') && (q.includes('revenue') || q.includes('spent') || q.includes('sales')) && hasSales && hasCustomers) {
      return {
        databaseId,
        intent: 'DATA_QUERY',
        intentDetection: {
          operation: 'RANKING',
          requestedRowCount: count,
          requiresVisualization: count > 1,
          recommendedVisualization: count > 1 ? 'bar' : 'none',
          outputFormat: count > 1 ? 'table' : 'direct_answer'
        },
        content: `Identified the ${count === 1 ? 'customer' : `${count} customers`} with the ${rankLabel} total revenue.`,
        sql: `SELECT c.customer_name, c.loyalty_tier, ROUND(SUM(s.revenue), 2) AS total_revenue FROM customers c JOIN sales s ON c.customer_id = s.customer_id GROUP BY c.customer_id, c.customer_name ORDER BY total_revenue ${sortDir} LIMIT ${count};`,
        chartRecommendation: {
          type: count > 1 ? 'bar' : 'none',
          title: `${isLowest ? 'Lowest' : 'Top'} ${count} Customers by Revenue`,
          xKey: 'customer_name',
          yKeys: ['total_revenue']
        },
        suggestedFollowUps: []
      };
    }

    // Single table ranking
    const dim = textCol;
    const metric = numericCol;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'RANKING',
        requestedRowCount: count,
        requiresVisualization: count > 1,
        recommendedVisualization: count > 1 ? 'bar' : 'none',
        outputFormat: count > 1 ? 'table' : 'direct_answer'
      },
      content: `Identified the ${count === 1 ? 'entry' : `top ${count} entries`} in "${targetTable}" with the ${rankLabel} ${metric.replace(/_/g, ' ')}.`,
      sql: `SELECT "${dim}", ROUND(SUM("${metric}"), 2) AS total_${metric} FROM "${targetTable}" GROUP BY "${dim}" ORDER BY total_${metric} ${sortDir} LIMIT ${count};`,
      chartRecommendation: {
        type: count > 1 ? 'bar' : 'none',
        title: `${isLowest ? 'Lowest' : 'Top'} ${count} by ${metric.replace(/_/g, ' ')}`,
        xKey: dim,
        yKeys: [`total_${metric}`]
      },
      suggestedFollowUps: []
    };
  }

  // 12. AVERAGE / MEAN
  if (q.includes('average') || q.includes('mean')) {
    const targetCol = numericCol;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'AGGREGATION',
        requestedRowCount: 1,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'kpi_metric'
      },
      content: `Calculated the average ${targetCol.replace(/_/g, ' ')} in table "${targetTable}".`,
      sql: `SELECT ROUND(AVG("${targetCol}"), 2) AS average_${targetCol} FROM "${targetTable}";`,
      chartRecommendation: {
        type: 'none',
        title: `Average ${targetCol.replace(/_/g, ' ')}`,
        xKey: '',
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }

  // 13. SUM / TOTAL OF METRIC
  if ((q.includes('sum') || q.includes('total')) && !q.includes('records') && !q.includes('rows')) {
    const targetCol = numericCol;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'AGGREGATION',
        requestedRowCount: 1,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'kpi_metric'
      },
      content: `Calculated the sum of ${targetCol.replace(/_/g, ' ')} in table "${targetTable}".`,
      sql: `SELECT ROUND(SUM("${targetCol}"), 2) AS total_${targetCol} FROM "${targetTable}";`,
      chartRecommendation: {
        type: 'none',
        title: `Total ${targetCol.replace(/_/g, ' ')}`,
        xKey: '',
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }

  // 14. FIRST N / EXPLICIT COUNT RECORD RETRIEVAL
  if (
    isFirst ||
    (extractedCount !== null && (q.includes('record') || q.includes('row') || q.includes('display') || q.includes('show') || q.includes('fetch') || q.includes('get') || q.includes('list'))) ||
    q.startsWith('display ') ||
    q.startsWith('show ')
  ) {
    const count = extractedCount !== null ? extractedCount : 10;
    const orderClause = primaryKeyCol ? ` ORDER BY "${primaryKeyCol}" ASC` : '';
    const sql = `SELECT * FROM "${targetTable}"${orderClause} LIMIT ${count};`;
    return {
      databaseId,
      intent: 'DATA_QUERY',
      intentDetection: {
        operation: 'RECORD_RETRIEVAL',
        requestedRowCount: count,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'table'
      },
      content: `Displaying the first ${count} records from "${targetTable}".`,
      sql,
      chartRecommendation: {
        type: 'none',
        title: `First ${count} Records from ${targetTable}`,
        xKey: primaryKeyCol || 'id',
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }

  // 15. Ambiguous Queries (Clarification Needed)
  if (
    q === 'show data' ||
    q === 'analytics' ||
    q === 'best performance' ||
    q === 'show performance'
  ) {
    return {
      databaseId,
      intent: 'CLARIFICATION_NEEDED',
      intentDetection: {
        operation: 'GENERAL',
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: 'none',
        outputFormat: 'direct_answer'
      },
      content: `Would you like to review record totals, analyze metrics across categories, or inspect individual entries in "${targetTable}"?`,
      clarificationOptions: [
        `Display the first 10 records from ${targetTable}`,
        `Show total number of records in ${targetTable}`,
        `Compare metrics across ${textCol}`
      ],
      sql: '',
      suggestedFollowUps: []
    };
  }

  // 16. General Record Sampling (Safe Unspecified Limit)
  const defaultLimit = 20;
  return {
    databaseId,
    intent: 'DATA_QUERY',
    intentDetection: {
      operation: 'RECORD_RETRIEVAL',
      requestedRowCount: defaultLimit,
      requiresVisualization: false,
      recommendedVisualization: 'none',
      outputFormat: 'table'
    },
    content: `Retrieved ${defaultLimit} records from table "${targetTable}".`,
    sql: `SELECT * FROM "${targetTable}" LIMIT ${defaultLimit};`,
    chartRecommendation: {
      type: 'none',
      title: `Records from ${targetTable}`,
      xKey: primaryKeyCol || 'id',
      yKeys: []
    },
    suggestedFollowUps: []
  };
}

/**
 * Build a grounded, query-aware interpretation strictly from the returned rows
 */
function buildGroundedLocalInterpretation(
  query: string,
  sql: string,
  columns: string[],
  rows: (string | number | boolean | null)[][],
  rowCount: number,
  databaseName?: string
): { headline: string; interpretation: string; observations: string[] } {
  const q = (query || '').toLowerCase();
  if (rowCount === 0 || rows.length === 0) {
    return {
      headline: `No records matched your query in "${databaseName || 'the connected database'}".`,
      interpretation: 'The SQL query executed cleanly against the database schema, but zero rows satisfied the filter conditions.',
      observations: ['0 matching records returned.']
    };
  }

  // Single scalar value (1 row, 1 column)
  if (rowCount === 1 && columns.length === 1) {
    const colLabel = columns[0].replace(/_/g, ' ');
    const rawVal = rows[0][0];
    const formattedVal = typeof rawVal === 'number' ? Number(rawVal.toFixed(2)).toLocaleString() : String(rawVal ?? 'N/A');
    return {
      headline: `The ${colLabel} is ${formattedVal}.`,
      interpretation: `Computed directly from "${databaseName || 'the database'}" using SQLite aggregation.`,
      observations: [`${colLabel}: ${formattedVal}`]
    };
  }

  // Single entity ranking result (1 row, >= 2 columns)
  if (rowCount === 1 && columns.length >= 2) {
    const entity = String(rows[0][0] ?? 'Result');
    const metricCol = columns[columns.length - 1].replace(/_/g, ' ');
    const rawVal = rows[0][columns.length - 1];
    const formattedVal = typeof rawVal === 'number' ? Number(rawVal.toFixed(2)).toLocaleString() : String(rawVal ?? '');
    const isLowest = /\b(lowest|minimum|least|smallest|bottom|worst)\b/i.test(q);
    const descriptor = isLowest ? 'lowest' : 'highest';
    return {
      headline: `${entity} has the ${descriptor} ${metricCol} at ${formattedVal}.`,
      interpretation: `Based on the query results from "${databaseName || 'the database'}", ${entity} ranks #1 with a ${metricCol} of ${formattedVal}.`,
      observations: [`Top matched entity: ${entity} (${metricCol}: ${formattedVal})`]
    };
  }

  // Record retrieval (first N / last N / filtered rows)
  const isLast = /\blast\b|\bbottom\b|\btail\b/i.test(q);
  const isFirst = /\bfirst\b|\binitial\b/i.test(q);
  const isLatest = /\blatest\b|\bmost recent\b|\bnewest\b/i.test(q);

  if (isLast) {
    const firstId = rows[0]?.[0];
    const lastId = rows[rows.length - 1]?.[0];
    return {
      headline: `Displaying the last ${rowCount} records from the dataset (${columns[0]}: ${firstId} to ${lastId}).`,
      interpretation: `Retrieved the final ${rowCount} records in ascending order by ${columns[0]}, spanning from ${firstId} to ${lastId}.`,
      observations: [
        `Returned ${rowCount} records across ${columns.length} columns.`,
        `Range of ${columns[0]}: ${firstId} through ${lastId}.`
      ]
    };
  }

  if (isFirst || isLatest) {
    const firstId = rows[0]?.[0];
    const lastId = rows[rows.length - 1]?.[0];
    const label = isLatest ? 'most recent' : 'first';
    return {
      headline: `Displaying the ${label} ${rowCount} records from the dataset (${columns[0]}: ${firstId} to ${lastId}).`,
      interpretation: `Retrieved ${rowCount} records ordered by ${columns[0]} (${firstId} to ${lastId}).`,
      observations: [
        `Returned ${rowCount} records with columns: ${columns.join(', ')}.`
      ]
    };
  }

  // Multi-row comparison / ranking / trend
  let numColIdx = -1;
  // Prefer a column mentioned in the query or the first non-ID, non-count metric column
  for (let c = 1; c < columns.length; c++) {
    if (!/^(id|.*_id|record_count|total_count)$/i.test(columns[c]) && typeof rows[0][c] === 'number') {
      numColIdx = c;
      break;
    }
  }
  if (numColIdx === -1) {
    for (let c = columns.length - 1; c >= 0; c--) {
      if (!/^(id|.*_id)$/i.test(columns[c]) && typeof rows[0][c] === 'number') {
        numColIdx = c;
        break;
      }
    }
  }

  if (numColIdx !== -1 && columns.length >= 2) {
    const metricName = columns[numColIdx].replace(/_/g, ' ');
    const groupCols = columns.slice(0, numColIdx);
    const groupColLabel = groupCols.map(c => c.replace(/_/g, ' ')).join(' & ');
    const isGroupedSql = /\bGROUP\s+BY\b/i.test(sql || '');

    const formatEntityLabel = (r: (string | number | boolean | null)[]) =>
      groupCols.map((_, idx) => String(r[idx] ?? '')).filter(Boolean).join(' • ') || String(r[0]);

    let maxRow = rows[0];
    let minRow = rows[0];
    let sum = 0;
    for (const r of rows) {
      const val = Number(r[numColIdx]) || 0;
      sum += val;
      if (val > (Number(maxRow[numColIdx]) || 0)) maxRow = r;
      if (val < (Number(minRow[numColIdx]) || 0)) minRow = r;
    }
    const avg = sum / rows.length;
    const maxEntity = formatEntityLabel(maxRow);
    const maxVal = Number(Number(maxRow[numColIdx]).toFixed(2)).toLocaleString();
    const minEntity = formatEntityLabel(minRow);
    const minVal = Number(Number(minRow[numColIdx]).toFixed(2)).toLocaleString();
    const avgVal = Number(avg.toFixed(2)).toLocaleString();
    const sumVal = Number(sum.toFixed(2)).toLocaleString();

    if (isGroupedSql) {
      return {
        headline: `Across ${rowCount} ${groupColLabel} groups, ${maxEntity} leads in ${metricName} (${maxVal}), while ${minEntity} is lowest (${minVal}).`,
        interpretation: `Grouped breakdown by ${groupColLabel} returned ${rowCount} distinct groups. ${maxEntity} recorded the highest ${metricName} at ${maxVal}, and ${minEntity} recorded the lowest at ${minVal} (average per group: ${avgVal}, combined total: ${sumVal}).`,
        observations: [
          `Groups (${groupColLabel}): ${rowCount}`,
          `Highest ${metricName}: ${maxEntity} (${maxVal})`,
          `Lowest ${metricName}: ${minEntity} (${minVal})`,
          `Average ${metricName} per group: ${avgVal}`
        ]
      };
    }

    return {
      headline: `Across ${rowCount} results, ${maxEntity} leads in ${metricName} (${maxVal}), while ${minEntity} is lowest (${minVal}).`,
      interpretation: `The query returned ${rowCount} records. The average ${metricName} across the returned set is ${avgVal}, ranging from ${minVal} (${minEntity}) to ${maxVal} (${maxEntity}).`,
      observations: [
        `Highest ${metricName}: ${maxEntity} (${maxVal})`,
        `Lowest ${metricName}: ${minEntity} (${minVal})`,
        `Average ${metricName} across ${rowCount} rows: ${avgVal}`
      ]
    };
  }

  return {
    headline: `Retrieved ${rowCount} record${rowCount === 1 ? '' : 's'} matching your query.`,
    interpretation: `The query returned ${rowCount} rows across ${columns.length} columns (${columns.join(', ')}).`,
    observations: [`Total rows returned: ${rowCount}`]
  };
}

function generateBasicKPIs(columns: string[], rows: (string | number | boolean | null)[][], sql?: string) {
  const kpis: { label: string; value: string; trend: 'up' | 'down' | 'neutral' }[] = [];
  if (!rows || rows.length === 0) return kpis;

  // Single scalar value (e.g. Overall SUM/AVG/COUNT)
  if (rows.length === 1 && columns.length === 1) {
    const rawVal = rows[0][0];
    const formattedVal = typeof rawVal === 'number' ? Number(rawVal.toFixed(2)).toLocaleString() : String(rawVal ?? 'N/A');
    kpis.push({
      label: columns[0].replace(/_/g, ' '),
      value: formattedVal,
      trend: 'up' as const
    });
    return kpis;
  }

  const isGroupedSql = /\bGROUP\s+BY\b/i.test(sql || '');

  // Find primary numeric metric column
  let numColIdx = -1;
  for (let c = 1; c < columns.length; c++) {
    if (!/^(id|.*_id|record_count|total_count)$/i.test(columns[c]) && typeof rows[0][c] === 'number') {
      numColIdx = c;
      break;
    }
  }
  if (numColIdx === -1) {
    for (let c = columns.length - 1; c >= 0; c--) {
      if (!/^(id|.*_id)$/i.test(columns[c]) && typeof rows[0][c] === 'number') {
        numColIdx = c;
        break;
      }
    }
  }

  if (isGroupedSql && rows.length > 1 && numColIdx !== -1) {
    const groupCols = columns.slice(0, numColIdx);
    const groupColLabel = groupCols.map(c => c.replace(/_/g, ' ')).join(' & ');
    const formatEntityLabel = (r: (string | number | boolean | null)[]) =>
      groupCols.map((_, idx) => String(r[idx] ?? '')).filter(Boolean).join(' • ') || String(r[0]);

    let maxRow = rows[0];
    let minRow = rows[0];
    let sum = 0;
    for (const r of rows) {
      const val = Number(r[numColIdx]) || 0;
      sum += val;
      if (val > (Number(maxRow[numColIdx]) || 0)) maxRow = r;
      if (val < (Number(minRow[numColIdx]) || 0)) minRow = r;
    }
    const avg = sum / rows.length;
    const maxEntity = formatEntityLabel(maxRow);
    const maxVal = Number(Number(maxRow[numColIdx]).toFixed(2)).toLocaleString();
    const minEntity = formatEntityLabel(minRow);
    const minVal = Number(Number(minRow[numColIdx]).toFixed(2)).toLocaleString();

    kpis.push({
      label: `Groups (${groupColLabel})`,
      value: rows.length.toLocaleString(),
      trend: 'neutral' as const
    });
    kpis.push({
      label: `Highest (${maxEntity})`,
      value: maxVal,
      trend: 'up' as const
    });
    kpis.push({
      label: `Lowest (${minEntity})`,
      value: minVal,
      trend: 'down' as const
    });
    kpis.push({
      label: `Group Avg`,
      value: Number(avg.toFixed(2)).toLocaleString(),
      trend: 'neutral' as const
    });
    return kpis;
  }

  kpis.push({
    label: 'Total Rows',
    value: rows.length.toLocaleString(),
    trend: 'neutral' as const
  });

  if (numColIdx !== -1) {
    const col = columns[numColIdx];
    const sum = rows.reduce((acc, r) => acc + (typeof r[numColIdx] === 'number' ? (r[numColIdx] as number) : 0), 0);
    const avg = sum / rows.length;
    kpis.push({
      label: `Avg ${col.replace(/_/g, ' ')}`,
      value: Number(avg.toFixed(2)).toLocaleString(),
      trend: 'neutral' as const
    });
    kpis.push({
      label: `Sum of ${col.replace(/_/g, ' ')}`,
      value: Number(sum.toFixed(2)).toLocaleString(),
      trend: 'up' as const
    });
  }

  return kpis;
}

// Full-stack Vite setup
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development mode: mount Vite dev server as middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: serve built assets
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QueryWise server running at http://0.0.0.0:${PORT}`);
  });
}

// Export Express app for Vercel Serverless Functions (api/index.ts)
export { app };
export default app;

// Only start standalone HTTP listener when not running as a Vercel Serverless Function
if (!process.env.VERCEL) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
  });
}
