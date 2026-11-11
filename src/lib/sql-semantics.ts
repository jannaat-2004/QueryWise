/**
 * Dynamic Schema-Aware SQL Semantic Analyzer, Intent Validator & Query Synthesizer
 *
 * Ensures QueryWise accurately distinguishes between:
 * 1. Overall Aggregations (single scalar result, no GROUP BY)
 * 2. Grouped Aggregations (for each / per / by / in each / across -> GROUP BY + group column + aggregate)
 * 3. Filtered Grouped Aggregations (GROUP BY + HAVING aggregate filter)
 * 4. Ranked Grouped Aggregations (GROUP BY + ORDER BY aggregate metric)
 * 5. Multi-column Grouped Aggregations (GROUP BY col1, col2)
 * 6. Single-winner Ranking ("Which X has the highest Y?" -> GROUP BY X ORDER BY Y DESC LIMIT 1)
 *    vs Per-group Extremum ("Highest Y in each X" -> SELECT X, MAX(Y) ... GROUP BY X)
 */

export interface SchemaColumnInfo {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyTarget?: { table: string; column: string };
  isDate: boolean;
  isNumeric: boolean;
  isText: boolean;
}

export interface SchemaTableInfo {
  tableName: string;
  rowCount: number;
  columns: SchemaColumnInfo[];
  primaryKeyCol?: string;
  dateCol?: string;
  numericCols: string[];
  textCols: string[];
}

export interface SqlStructureAnalysis {
  sql: string;
  selectItems: string[];
  aggregateFunctions: ('SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX')[];
  nonAggregatedSelectCols: string[];
  fromTable: string;
  joinTables: string[];
  hasWhere: boolean;
  whereClause: string;
  hasGroupBy: boolean;
  groupByColumns: string[];
  hasHaving: boolean;
  havingClause: string;
  hasOrderBy: boolean;
  orderByClause: string;
  orderDirection?: 'ASC' | 'DESC';
  limitValue: number | null;
}

export interface GroupingDimensionMatch {
  tableName: string;
  columnName: string;
  /** Present when the grouping column lives on a joined dimension table */
  joinInfo?: {
    foreignKeyCol: string;
    joinTable: string;
    joinPkCol: string;
  };
  /** Optional descriptive column from a joined dimension table (e.g. customer_name when grouping by customer_id) */
  labelColumn?: {
    joinTable: string;
    joinPk: string;
    labelCol: string;
  };
}

export interface SemanticQueryIntent {
  aggregationType: 'NONE' | 'OVERALL' | 'GROUPED' | 'FILTERED_GROUPED' | 'RANKED_GROUPED';
  requiresGroupBy: boolean;
  isSingleWinnerRanking: boolean;
  expectedAggFunctions: ('SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX')[];
  targetTable: SchemaTableInfo | undefined;
  metricColumns: string[];
  countDistinctColumn?: string;
  groupingDimensions: GroupingDimensionMatch[];
  whereInFilter?: {
    columnName: string;
    values: string[];
  };
  requiresHaving: boolean;
  havingFilter?: {
    aggFn: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
    metricCol: string;
    operator: '>' | '<' | '>=' | '<=' | '=';
    threshold: number;
  };
  requiresOrderBy: boolean;
  orderDirection: 'ASC' | 'DESC';
  requestedLimit: number | null;
}

export interface SemanticValidationResult {
  valid: boolean;
  reason?: string;
  intent: SemanticQueryIntent;
  sqlStructure: SqlStructureAnalysis;
}

/**
 * Normalize an English word or identifier token to its singular base stem
 * without hardcoding domain-specific column names.
 */
export function stemToken(word: string): string {
  const clean = word.toLowerCase().trim().replace(/^["'`[]+|["'`\]]+$/g, '');
  if (clean.length <= 3) return clean;
  if (clean.endsWith('ies') && clean.length > 4) {
    return clean.slice(0, -3) + 'y'; // categories -> category, cities -> city
  }
  if (clean.endsWith('ses') || clean.endsWith('xes') || clean.endsWith('zes') || clean.endsWith('ches') || clean.endsWith('shes')) {
    return clean.slice(0, -2); // statuses -> status, boxes -> box
  }
  if (clean.endsWith('s') && !clean.endsWith('ss') && !clean.endsWith('us') && !clean.endsWith('is')) {
    return clean.slice(0, -1); // customers -> customer, products -> product
  }
  return clean;
}

/**
 * Parse the textual schema context produced by SQLiteEngine.generateSchemaContext
 */
export function parseSchemaTables(schemaText: string): SchemaTableInfo[] {
  const tables: SchemaTableInfo[] = [];
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

    const columns: SchemaColumnInfo[] = [];
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
          colName.toLowerCase() === `${stemToken(tableName)}_id`;

        let foreignKeyTarget: { table: string; column: string } | undefined;
        const fkMatch = colMeta.match(/FOREIGN\s+KEY\s*->\s*"?([a-zA-Z0-9_]+)"?\."?([a-zA-Z0-9_]+)"?/i);
        if (fkMatch) {
          foreignKeyTarget = { table: fkMatch[1], column: fkMatch[2] };
        }

        const isFk = Boolean(foreignKeyTarget) || (!isPk && /_id$/i.test(colName));
        const isDate =
          /date|time|timestamp/i.test(colType) ||
          /created_at|updated_at|timestamp|date/i.test(colName);
        const isNumeric =
          !isPk &&
          !isFk &&
          !isDate &&
          (/int|real|float|double|decimal|numeric|number/i.test(colType) ||
            /revenue|amount|salary|balance|spent|price|marks|attendance|units|score|age|rate|cost|fee|quantity|level|rating|pct|percent|ph|nitrogen|phosphorus|potassium|value|total|weight|height|distance|duration/i.test(colName));
        const isText = !isDate && !isNumeric && !isPk && !isFk;

        columns.push({
          name: colName,
          type: colType,
          isPrimaryKey: isPk,
          isForeignKey: isFk,
          foreignKeyTarget,
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

  // Infer implicit foreignKeyTarget if not explicitly annotated
  for (const tbl of tables) {
    for (const col of tbl.columns) {
      if (col.isForeignKey && !col.foreignKeyTarget && /_id$/i.test(col.name)) {
        const prefix = col.name.replace(/_id$/i, '').toLowerCase();
        const refTable = tables.find(
          other =>
            other.tableName !== tbl.tableName &&
            (other.tableName.toLowerCase() === prefix ||
              stemToken(other.tableName) === stemToken(prefix))
        );
        if (refTable && refTable.primaryKeyCol) {
          col.foreignKeyTarget = {
            table: refTable.tableName,
            column: refTable.primaryKeyCol
          };
        }
      }
    }
  }

  return tables;
}

/**
 * Split a comma-separated SQL clause at top-level commas (ignoring commas inside parentheses)
 */
function splitTopLevelCommas(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        if (current.trim()) result.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/**
 * Strip outer quotes and table alias prefixes (e.g. `s."category"` -> `category`)
 */
export function normalizeIdentifier(expr: string): string {
  const withoutAlias = expr
    .trim()
    .replace(/\s+AS\s+["'`[]?[a-zA-Z0-9_]+["'`\]]?$/i, '')
    .trim();
  const parts = withoutAlias.split('.');
  const last = parts[parts.length - 1].trim();
  return last.replace(/^["'`[]+|["'`\]]+$/g, '').toLowerCase();
}

/**
 * Parse a SQL query into its structural components for semantic validation
 */
export function parseSqlStructure(sql: string): SqlStructureAnalysis {
  const cleanSql = (sql || '')
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .replace(/;+\s*$/, '');

  // If the query is a nested subquery for "last N records", inspect the outer/inner structure
  const selectMatch = cleanSql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+)$/i);
  if (!selectMatch) {
    return {
      sql: cleanSql,
      selectItems: [],
      aggregateFunctions: [],
      nonAggregatedSelectCols: [],
      fromTable: '',
      joinTables: [],
      hasWhere: false,
      whereClause: '',
      hasGroupBy: false,
      groupByColumns: [],
      hasHaving: false,
      havingClause: '',
      hasOrderBy: false,
      orderByClause: '',
      limitValue: null
    };
  }

  const selectPart = selectMatch[1].trim();
  const restPart = selectMatch[2].trim();

  const selectItems = splitTopLevelCommas(selectPart);
  const aggregateFunctions: ('SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX')[] = [];
  const nonAggregatedSelectCols: string[] = [];

  const aggRegex = /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/gi;
  for (const item of selectItems) {
    let hasAgg = false;
    let match: RegExpExecArray | null;
    aggRegex.lastIndex = 0;
    while ((match = aggRegex.exec(item)) !== null) {
      hasAgg = true;
      const fn = match[1].toUpperCase() as 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
      if (!aggregateFunctions.includes(fn)) {
        aggregateFunctions.push(fn);
      }
    }
    if (!hasAgg) {
      nonAggregatedSelectCols.push(normalizeIdentifier(item));
    }
  }

  // Extract FROM and JOIN tables
  const fromMatch = restPart.match(/^["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i);
  const fromTable = fromMatch ? fromMatch[1].toLowerCase() : '';

  const joinTables: string[] = [];
  const joinRegex = /\bJOIN\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/gi;
  let jMatch: RegExpExecArray | null;
  while ((jMatch = joinRegex.exec(restPart)) !== null) {
    joinTables.push(jMatch[1].toLowerCase());
  }

  // Extract WHERE, GROUP BY, HAVING, ORDER BY, LIMIT at top level
  const whereMatch = restPart.match(/\bWHERE\s+([\s\S]+?)(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i);
  const groupMatch = restPart.match(/\bGROUP\s+BY\s+([\s\S]+?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i);
  const havingMatch = restPart.match(/\bHAVING\s+([\s\S]+?)(?=\bORDER\s+BY\b|\bLIMIT\b|$)/i);
  const orderMatch = restPart.match(/\bORDER\s+BY\s+([\s\S]+?)(?=\bLIMIT\b|$)/i);
  const limitMatch = restPart.match(/\bLIMIT\s+(\d+)/i);

  const groupByColumns = groupMatch
    ? splitTopLevelCommas(groupMatch[1]).map(normalizeIdentifier).filter(Boolean)
    : [];

  let orderDirection: 'ASC' | 'DESC' | undefined;
  if (orderMatch) {
    orderDirection = /\bASC\b/i.test(orderMatch[1]) && !/\bDESC\b/i.test(orderMatch[1]) ? 'ASC' : 'DESC';
  }

  return {
    sql: cleanSql,
    selectItems,
    aggregateFunctions,
    nonAggregatedSelectCols,
    fromTable,
    joinTables,
    hasWhere: Boolean(whereMatch),
    whereClause: whereMatch ? whereMatch[1].trim() : '',
    hasGroupBy: Boolean(groupMatch && groupByColumns.length > 0),
    groupByColumns,
    hasHaving: Boolean(havingMatch),
    havingClause: havingMatch ? havingMatch[1].trim() : '',
    hasOrderBy: Boolean(orderMatch),
    orderByClause: orderMatch ? orderMatch[1].trim() : '',
    orderDirection,
    limitValue: limitMatch ? parseInt(limitMatch[1], 10) : null
  };
}

/**
 * Match a phrase segment (e.g. "category", "customer", "category and loyalty tier")
 * to concrete column(s) in the target table or related tables in the schema.
 */
function resolvePhraseToColumns(
  phrase: string,
  targetTable: SchemaTableInfo,
  allTables: SchemaTableInfo[]
): GroupingDimensionMatch[] {
  const matches: GroupingDimensionMatch[] = [];
  const cleanPhrase = phrase
    .toLowerCase()
    .replace(/\b(different|all|each|every|the|their|its|individual|separate|various|distinct)\b/g, ' ')
    .trim();

  // Split on "and", ",", "&" to support multi-column grouping
  const segments = cleanPhrase
    .split(/\s*(?:,|\band\b|&)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const segTokens = seg.split(/[\s_]+/).filter(Boolean);
    const segStemJoined = segTokens.map(stemToken).join('_');
    const firstTokenStem = segTokens[0] ? stemToken(segTokens[0]) : '';

    // 1. Direct column match on targetTable (e.g. "category" -> "category", "loyalty tier" -> "loyalty_tier", "customer" -> "customer_id")
    let matchedCol: SchemaColumnInfo | undefined;

    for (const col of targetTable.columns) {
      const colLow = col.name.toLowerCase();
      const colBase = colLow.replace(/_id$/i, '');
      const colStem = colLow.split('_').map(stemToken).join('_');

      if (
        colLow === seg.replace(/\s+/g, '_') ||
        colStem === segStemJoined ||
        stemToken(colLow) === firstTokenStem ||
        (col.isForeignKey && stemToken(colBase) === firstTokenStem) ||
        (segTokens.length === 1 && (colLow === `${firstTokenStem}_id` || colLow === `${firstTokenStem}_name`))
      ) {
        matchedCol = col;
        break;
      }
    }

    // 2. Check if segment matches a related table name (e.g. "customer" -> "customers" table via foreign key "customer_id" on targetTable)
    let matchedJoinInfo: GroupingDimensionMatch['joinInfo'] | undefined;
    if (!matchedCol) {
      for (const otherTbl of allTables) {
        const otherStem = stemToken(otherTbl.tableName);
        if (otherStem === firstTokenStem || otherTbl.tableName.toLowerCase() === seg.replace(/\s+/g, '_')) {
          // Does targetTable have a foreign key to otherTbl?
          const fkCol = targetTable.columns.find(
            c =>
              c.foreignKeyTarget?.table.toLowerCase() === otherTbl.tableName.toLowerCase() ||
              stemToken(c.name.replace(/_id$/i, '')) === otherStem
          );
          if (fkCol) {
            matchedCol = fkCol;
            break;
          }
        }
      }
    }

    // 3. Check if segment matches a dimension column on a related table connected by a foreign key (e.g. "loyalty tier" or "city" on "customers" when targetTable is "sales")
    if (!matchedCol) {
      for (const fkCol of targetTable.columns.filter(c => c.isForeignKey && c.foreignKeyTarget)) {
        const dimTbl = allTables.find(
          t => t.tableName.toLowerCase() === fkCol.foreignKeyTarget!.table.toLowerCase()
        );
        if (!dimTbl) continue;
        for (const dCol of dimTbl.columns) {
          if (dCol.isNumeric || dCol.isPrimaryKey) continue;
          const dLow = dCol.name.toLowerCase();
          const dStem = dLow.split('_').map(stemToken).join('_');
          if (
            dLow === seg.replace(/\s+/g, '_') ||
            dStem === segStemJoined ||
            stemToken(dLow) === firstTokenStem
          ) {
            matchedCol = dCol;
            matchedJoinInfo = {
              foreignKeyCol: fkCol.name,
              joinTable: dimTbl.tableName,
              joinPkCol: fkCol.foreignKeyTarget!.column
            };
            break;
          }
        }
        if (matchedCol) break;
      }
    }

    if (matchedCol) {
      // Check if matchedCol is a foreign key to a dimension table that has a readable name column
      let labelColumn: GroupingDimensionMatch['labelColumn'] | undefined;
      if (matchedCol.isForeignKey && matchedCol.foreignKeyTarget && !matchedJoinInfo) {
        const dimTbl = allTables.find(
          t => t.tableName.toLowerCase() === matchedCol!.foreignKeyTarget!.table.toLowerCase()
        );
        const nameCol = dimTbl?.columns.find(c => /name|title|label/i.test(c.name));
        if (dimTbl && nameCol) {
          labelColumn = {
            joinTable: dimTbl.tableName,
            joinPk: matchedCol.foreignKeyTarget.column,
            labelCol: nameCol.name
          };
        }
      }

      if (!matches.some(m => m.columnName.toLowerCase() === matchedCol!.name.toLowerCase())) {
        matches.push({
          tableName: matchedJoinInfo ? matchedJoinInfo.joinTable : targetTable.tableName,
          columnName: matchedCol.name,
          joinInfo: matchedJoinInfo,
          labelColumn
        });
      }
    }
  }

  return matches;
}

/**
 * Analyze a user's natural language question against the dynamic schema
 * to determine its exact grouping, aggregation, HAVING, and ranking semantics.
 */
export function analyzeQueryGroupingIntent(
  query: string,
  tables: SchemaTableInfo[],
  conversationHistory: { role: string; content: string; sql?: string; resultSummary?: string }[] = [],
  aiIntentDetection?: {
    operation?: string;
    isGrouped?: boolean;
    groupByColumns?: string[];
  }
): SemanticQueryIntent {
  const q = (query || '').toLowerCase().trim();

  // 1. Identify target table dynamically from schema
  let targetTable: SchemaTableInfo | undefined;

  // Score each table based on column and table mentions in the query
  const queryWords = q.split(/[\s,?.!;'"]+/).filter(Boolean);
  const queryStems = queryWords.map(stemToken);

  let bestTableScore = -1;
  for (const t of tables) {
    let score = 0;
    const tLow = t.tableName.toLowerCase();
    const tStem = stemToken(tLow);

    // Table name mentioned
    if (queryWords.includes(tLow) || queryStems.includes(tStem)) {
      score += 3;
    }

    // Columns mentioned
    for (const c of t.columns) {
      const cLow = c.name.toLowerCase();
      const cWords = cLow.split('_');
      const cStem = cWords.map(stemToken).join('_');
      if (q.includes(cLow.replace(/_/g, ' ')) || q.includes(cLow)) {
        score += c.isNumeric ? 5 : 4;
      } else if (cWords.length === 1 && queryStems.includes(cStem)) {
        score += c.isNumeric ? 4 : 3;
      } else if (c.isForeignKey) {
        const fkBaseStem = stemToken(cLow.replace(/_id$/i, ''));
        if (queryStems.includes(fkBaseStem)) {
          score += 3;
        }
      }
    }

    // Prefer fact tables that have numeric metric columns and foreign keys when scores tie
    if (score > 0 && t.numericCols.length > 0) {
      score += 1;
      if (t.columns.some(c => c.isForeignKey)) {
        score += 0.5;
      }
      if (t.dateCol) {
        score += 0.25;
      }
    }

    if (score > bestTableScore && score > 0) {
      bestTableScore = score;
      targetTable = t;
    }
  }

  // Check recent conversation history if no table matched directly
  if (!targetTable && Array.isArray(conversationHistory)) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const prevSql = (conversationHistory[i].sql || '').toLowerCase();
      const prevContent = (conversationHistory[i].content || '').toLowerCase();
      for (const t of tables) {
        if (prevSql.includes(t.tableName.toLowerCase()) || prevContent.includes(t.tableName.toLowerCase())) {
          targetTable = t;
          break;
        }
      }
      if (targetTable) break;
    }
  }

  // Fallback to primary fact table (most numeric columns + rows)
  if (!targetTable && tables.length > 0) {
    targetTable = [...tables].sort((a, b) => {
      const aScore = (a.numericCols.length > 0 ? 1000 : 0) + (a.dateCol ? 300 : 0) + a.rowCount;
      const bScore = (b.numericCols.length > 0 ? 1000 : 0) + (b.dateCol ? 300 : 0) + b.rowCount;
      return bScore - aScore;
    })[0];
  }

  // 2. Detect Aggregate Function(s) requested in the question
  const expectedAggFunctions: ('SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX')[] = [];

  const asksSum = /\b(total|sum|combined|overall\s+revenue|overall\s+sales|total\s+quantity|total\s+amount|total\s+revenue|total\s+spent|total\s+cost)\b/i.test(q) &&
    !/\b(total\s+number|total\s+count|total\s+records|total\s+rows|total\s+customers|total\s+products|total\s+sales\s+count)\b/i.test(q);
  const asksAvg = /\b(average|avg|mean)\b/i.test(q);
  const asksCount =
    /\b(count|number\s+of|how\s+many|total\s+number|total\s+records|total\s+rows|frequency)\b/i.test(q) ||
    /\bcount\s+of\b/i.test(q);
  const asksMax = /\b(highest|maximum|max|largest|biggest|most\s+expensive|peak|best|top)\b/i.test(q);
  const asksMin = /\b(lowest|minimum|min|smallest|least|cheapest|worst|bottom)\b/i.test(q);

  if (asksSum) expectedAggFunctions.push('SUM');
  if (asksAvg) expectedAggFunctions.push('AVG');
  if (asksCount) expectedAggFunctions.push('COUNT');

  // 3. Detect Grouping Dimensions in the question
  const groupingDimensions: GroupingDimensionMatch[] = [];
  const subjectFirstRegex = /\b(?:rank|compare|list|show|display|find|which|what)\s+(?:all\s+|the\s+|different\s+|top\s+\d+\s+)?([a-z0-9_]+(?:\s+[a-z0-9_]+)?)\s+(?:by|where|with|having|ordered\s+by|ranked\s+by)\b/i;
  const subjMatch = q.match(subjectFirstRegex);

  if (targetTable) {
    // Pattern A: Explicit prepositional grouping phrases:
    // "for each <X>", "per <X>", "by <X>", "in each <X>", "for every <X>", "across (different|all)? <X>", "broken down by <X>", "grouped by <X>", "<X>-wise"
    const groupPhraseRegexes = [
      /\b(?:for\s+each|for\s+every|in\s+each|in\s+every|per|grouped\s+by|group\s+by|broken\s+down\s+by|across(?:\s+different|\s+all|\s+each|\s+various)?)\s+([a-z0-9_]+(?:\s+(?:and|,)\s+[a-z0-9_]+|\s+[a-z0-9_]+){0,4}?)(?=\s+(?:where|having|with|ordered|sorted|in|from|for|limit|exceeds|greater|less|above|below|>|<|=|$)|[?.!,;]|$)/gi,
      /\bby\s+([a-z0-9_]+(?:\s*(?:,|\band\b)\s*[a-z0-9_]+|\s+[a-z0-9_]+){0,3}?)(?=\s+(?:where|having|with|ordered|sorted|in|from|desc|asc|limit|$)|[?.!,;]|$)/gi,
      /\b([a-z0-9_]+)-wise\b/gi
    ];

    for (const rg of groupPhraseRegexes) {
      let m: RegExpExecArray | null;
      while ((m = rg.exec(q)) !== null) {
        const candidatePhrase = m[1].trim();
        // Avoid treating "by total revenue" (in "Rank categories by total revenue") as grouping by revenue
        const resolved = resolvePhraseToColumns(candidatePhrase, targetTable, tables).filter(
          dim => {
            const colInfo = targetTable!.columns.find(c => c.name === dim.columnName);
            // A grouping dimension should be text, PK, FK, or date (not a pure continuous metric when preceded by "by" in "rank X by metric")
            return !colInfo?.isNumeric;
          }
        );
        for (const r of resolved) {
          if (!groupingDimensions.some(g => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
            groupingDimensions.push(r);
          }
        }
      }
    }

    // Pattern B: Subject-first group queries:
    // e.g. "Rank categories by total revenue", "Show categories where total revenue exceeds 1000", "Compare categories by average price"
    if (subjMatch && groupingDimensions.length === 0) {
      const candidate = subjMatch[1].trim();
      if (!/^(records|rows|entries|data|items|results|values)$/i.test(candidate)) {
        const resolved = resolvePhraseToColumns(candidate, targetTable, tables).filter(dim => {
          const colInfo = targetTable!.columns.find(c => c.name === dim.columnName);
          return !colInfo?.isNumeric;
        });
        for (const r of resolved) {
          if (!groupingDimensions.some(g => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
            groupingDimensions.push(r);
          }
        }
      }
    }

    // Pattern C: "Which <dimension> has the highest/lowest <metric>?"
    const whichDimRegex = /\b(?:which|what)\s+([a-z0-9_]+(?:\s+[a-z0-9_]+)?)\s+(?:has|have|had|with|shows)\s+the\s+(?:highest|lowest|maximum|minimum|most|least|best|worst|largest|smallest)\b/i;
    const whichMatch = q.match(whichDimRegex);
    if (whichMatch && groupingDimensions.length === 0) {
      const candidate = whichMatch[1].trim();
      const resolved = resolvePhraseToColumns(candidate, targetTable, tables).filter(dim => {
        const colInfo = targetTable!.columns.find(c => c.name === dim.columnName);
        return !colInfo?.isNumeric;
      });
      for (const r of resolved) {
        if (!groupingDimensions.some(g => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
          groupingDimensions.push(r);
        }
      }
    }

    // Pattern D: Follow-up grouping reference ("for each of them", "their average ...", "also group by ...")
    const isFollowUpGroupRef = /\b(for each of them|each of them|for each of those|in each of them|in each of those|per one|their\s+average|their\s+total|their\s+count|their\s+highest|their\s+lowest|those\s+groups|those\s+categories|same\s+groups)\b/i.test(q);
    if (groupingDimensions.length === 0 && isFollowUpGroupRef && conversationHistory.length > 0) {
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const prevSql = conversationHistory[i].sql;
        if (prevSql) {
          const prevStruct = parseSqlStructure(prevSql);
          if (prevStruct.groupByColumns.length > 0) {
            for (const gCol of prevStruct.groupByColumns) {
              const resolved = resolvePhraseToColumns(gCol, targetTable, tables);
              for (const r of resolved) {
                if (!groupingDimensions.some(g => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
                  groupingDimensions.push(r);
                }
              }
            }
            break;
          }
        }
      }
    }

    // Pattern E: Incorporate AI-detected groupByColumns if valid in schema
    if (aiIntentDetection?.groupByColumns && aiIntentDetection.groupByColumns.length > 0) {
      for (const aiCol of aiIntentDetection.groupByColumns) {
        const resolved = resolvePhraseToColumns(aiCol, targetTable, tables);
        for (const r of resolved) {
          if (!groupingDimensions.some(g => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
            groupingDimensions.push(r);
          }
        }
      }
    }
  }

  // Distinguish between:
  // 1) "Highest revenue in each category" / "Max revenue per category" -> MAX(revenue) grouped by category (all groups)
  // 2) "Which category has the highest revenue?" / "Top 5 categories by revenue" -> SUM/AVG(revenue) grouped by category, ordered DESC, LIMIT 1 / N
  const hasPerEachPhrase = /\b(for\s+each|in\s+each|per|for\s+every|in\s+every|each)\b/i.test(q);
  const isWhichSingleWinner =
    /\b(which|what)\s+[a-z0-9_\s]+\s+(?:has|have|is)\s+the\s+(?:highest|lowest|maximum|minimum|most|least|best|worst)\b/i.test(q) ||
    /\bshow\s+only\s+the\b/i.test(q);

  if ((asksMax || asksMin) && hasPerEachPhrase && !isWhichSingleWinner) {
    if (asksMax && !expectedAggFunctions.includes('MAX')) expectedAggFunctions.push('MAX');
    if (asksMin && !expectedAggFunctions.includes('MIN')) expectedAggFunctions.push('MIN');
  } else if ((asksMax || asksMin) && expectedAggFunctions.length === 0) {
    // e.g. "Which category has the highest revenue?" or "What is the highest revenue?"
    if (groupingDimensions.length > 0 && isWhichSingleWinner) {
      // Grouping by category to find which category has highest total/metric
      expectedAggFunctions.push('SUM');
    } else {
      if (asksMax) expectedAggFunctions.push('MAX');
      if (asksMin) expectedAggFunctions.push('MIN');
    }
  }

  // If grouping dimensions exist and no explicit aggregate function was named yet (e.g. "Revenue by category" or "Sales per category"), infer SUM or COUNT
  if (groupingDimensions.length > 0 && expectedAggFunctions.length === 0) {
    const mentionsNumericCol = targetTable?.numericCols.some(
      c => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, ' '))
    );
    if (mentionsNumericCol || /\b(revenue|amount|salary|price|cost|quantity|score|value|levels)\b/i.test(q)) {
      expectedAggFunctions.push(/\b(compare|levels)\b/i.test(q) ? 'AVG' : 'SUM');
    } else {
      expectedAggFunctions.push('COUNT');
    }
  }

  // 4. Identify Metric Column(s) and COUNT(DISTINCT ...) target
  const metricColumns: string[] = [];
  let countDistinctColumn: string | undefined;

  if (targetTable) {
    // Check if user asks for "Count of <entity> in each <group>" where <entity> is a foreign key or column on targetTable
    // e.g., "Count of customers in each category" -> COUNT(DISTINCT "customer_id")
    if (expectedAggFunctions.includes('COUNT') && groupingDimensions.length > 0) {
      const countTargetMatch = q.match(/\b(?:count|number)\s+of\s+(?:distinct\s+|unique\s+)?([a-z0-9_]+)\b/i);
      if (countTargetMatch) {
        const entityWord = countTargetMatch[1].toLowerCase();
        const entityStem = stemToken(entityWord);
        const tableStem = stemToken(targetTable.tableName);
        // If the entity being counted is NOT the target table itself (e.g. counting "customers" in "sales" table)
        if (entityStem !== tableStem && !/^(record|row|entry|item|transaction|sale|order)$/i.test(entityStem)) {
          const fkOrCol = targetTable.columns.find(
            c =>
              stemToken(c.name.replace(/_id$/i, '')) === entityStem ||
              stemToken(c.name) === entityStem
          );
          if (fkOrCol && !groupingDimensions.some(g => g.columnName === fkOrCol.name)) {
            countDistinctColumn = fkOrCol.name;
          }
        }
      }
    }

    // Match explicit numeric columns mentioned in the query
    for (const numCol of targetTable.numericCols) {
      const nLow = numCol.toLowerCase();
      const nPhrase = nLow.replace(/_/g, ' ');
      if (q.includes(nPhrase) || q.includes(nLow)) {
        metricColumns.push(numCol);
      }
    }

    // Partial token match on numeric columns (e.g. "price" -> "unit_price", "quantity sold" -> "quantity")
    if (metricColumns.length === 0) {
      for (const numCol of targetTable.numericCols) {
        const parts = numCol.toLowerCase().split('_');
        if (parts.some(p => p.length > 2 && queryStems.includes(stemToken(p)))) {
          metricColumns.push(numCol);
        }
      }
    }

    // Default to primary business metric column if still empty
    if (metricColumns.length === 0 && targetTable.numericCols.length > 0) {
      const preferredOrder = ['revenue', 'amount', 'salary', 'balance', 'unit_price', 'price', 'soil_score', 'nitrogen', 'marks', 'score', 'cost_price', 'cost', 'quantity'];
      const preferred = preferredOrder
        .map(p => targetTable!.numericCols.find(c => c.toLowerCase() === p))
        .find((c): c is string => Boolean(c));
      metricColumns.push(preferred || targetTable.numericCols[0]);
    }
  }

  // 5. Detect Filtered Grouped Aggregation (HAVING)
  // e.g. "Show categories where total revenue exceeds 1000", "categories with average price > 50", "categories having more than 20 sales"
  let requiresHaving = false;
  let havingFilter: SemanticQueryIntent['havingFilter'] | undefined;

  const thresholdMatch =
    q.match(/\b(?:exceeds|greater\s+than|more\s+than|above|over|at\s+least|>=|<=|>|<|=)\s*\$?(-?\d+(?:,\d{3})*(?:\.\d+)?)/i);

  if (thresholdMatch && groupingDimensions.length > 0) {
    const rawNum = Number(thresholdMatch[1].replace(/,/g, ''));
    const opStr = thresholdMatch[0].toLowerCase();
    let operator: '>' | '<' | '>=' | '<=' | '=' = '>';
    if (opStr.includes('>=') || opStr.includes('at least')) operator = '>=';
    else if (opStr.includes('<=') || opStr.includes('at most')) operator = '<=';
    else if (opStr.includes('<') || opStr.includes('less') || opStr.includes('below') || opStr.includes('under')) operator = '<';
    else if (opStr.includes('=') && !opStr.includes('>') && !opStr.includes('<')) operator = '=';

    // If the query has a grouping dimension AND either an aggregate keyword (total/sum/avg/count/having) OR the subject is the grouping dimension ("Show categories where ...")
    if (
      asksSum ||
      asksAvg ||
      asksCount ||
      asksMax ||
      asksMin ||
      /\bhaving\b/i.test(q) ||
      subjMatch
    ) {
      requiresHaving = true;
      const aggFn = expectedAggFunctions[0] || 'SUM';
      if (!expectedAggFunctions.includes(aggFn)) {
        expectedAggFunctions.push(aggFn);
      }
      havingFilter = {
        aggFn,
        metricCol: metricColumns[0] || 'revenue',
        operator,
        threshold: rawNum
      };
    }
  }

  // 6. Determine overall vs grouped classification
  const requiresGroupBy = groupingDimensions.length > 0;
  const isRankedGroup =
    requiresGroupBy &&
    (/\b(rank|ranked|top\s+\d+|order\s+by|sort\s+by|highest|lowest)\b/i.test(q) && !hasPerEachPhrase);

  let aggregationType: SemanticQueryIntent['aggregationType'] = 'NONE';
  if (requiresGroupBy) {
    if (requiresHaving) {
      aggregationType = 'FILTERED_GROUPED';
    } else if (isRankedGroup) {
      aggregationType = 'RANKED_GROUPED';
    } else {
      aggregationType = 'GROUPED';
    }
  } else if (expectedAggFunctions.length > 0 && !/\b(first|last|latest|oldest)\s+\d+\b/i.test(q)) {
    aggregationType = 'OVERALL';
  }

  const orderDirection: 'ASC' | 'DESC' = asksMin && !asksMax ? 'ASC' : 'DESC';

  let requestedLimit: number | null = null;
  if (isWhichSingleWinner) {
    requestedLimit = 1;
  } else {
    const topMatch = q.match(/\b(?:top|bottom|first|limit)\s+(\d+)\b/i);
    if (topMatch) {
      requestedLimit = parseInt(topMatch[1], 10);
    }
  }

  // Extract whereInFilter when follow-up references previous turn's filtered/limited groups
  let whereInFilter: SemanticQueryIntent['whereInFilter'] | undefined;
  if (
    requiresGroupBy &&
    /\b(their|those|them|these|each of them|for each of those|in each of them|from those|among those)\b/i.test(q) &&
    conversationHistory.length > 0
  ) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const prevSummary = conversationHistory[i].resultSummary;
      const prevSql = conversationHistory[i].sql || '';
      if (prevSummary && (/\b(LIMIT|HAVING|WHERE)\b/i.test(prevSql) || /\b(those|their|them)\b/i.test(q))) {
        try {
          const parsedPrev = JSON.parse(prevSummary);
          const prevRows: unknown[][] = Array.isArray(parsedPrev.rows) ? parsedPrev.rows : [];
          const prevCols: string[] = Array.isArray(parsedPrev.columns) ? parsedPrev.columns : [];
          const primaryGroupCol = groupingDimensions[0]?.columnName;
          if (primaryGroupCol && prevRows.length > 0 && prevCols.length > 0) {
            let colIdx = prevCols.findIndex(c => c.toLowerCase() === primaryGroupCol.toLowerCase());
            if (colIdx === -1) colIdx = 0;
            const vals = Array.from(
              new Set(
                prevRows
                  .map(r => r[colIdx])
                  .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
                  .map(v => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`))
              )
            );
            if (vals.length > 0) {
              whereInFilter = {
                columnName: primaryGroupCol,
                values: vals
              };
            }
          }
          break;
        } catch {
          // Ignore malformed summary JSON
        }
      }
    }
  }

  return {
    aggregationType,
    requiresGroupBy,
    isSingleWinnerRanking: isWhichSingleWinner,
    expectedAggFunctions,
    targetTable,
    metricColumns,
    countDistinctColumn,
    groupingDimensions,
    whereInFilter,
    requiresHaving,
    havingFilter,
    requiresOrderBy: requiresGroupBy || isRankedGroup,
    orderDirection,
    requestedLimit
  };
}

/**
 * Validate whether a generated SQL query satisfies the semantic intent of the user's question.
 * Specifically catches cases where the user asked for a grouped calculation ("for each category", "per customer", etc.)
 * but the generated SQL omitted GROUP BY or collapsed the result into a single overall aggregate.
 */
export function validateSqlSemantics(
  query: string,
  sql: string,
  schemaText: string,
  conversationHistory: { role: string; content: string; sql?: string; resultSummary?: string }[] = [],
  aiIntentDetection?: {
    operation?: string;
    isGrouped?: boolean;
    groupByColumns?: string[];
  }
): SemanticValidationResult {
  const tables = parseSchemaTables(schemaText);
  const intent = analyzeQueryGroupingIntent(query, tables, conversationHistory, aiIntentDetection);
  const sqlStructure = parseSqlStructure(sql);

  if (!sql || !sql.trim()) {
    return { valid: true, intent, sqlStructure };
  }

  // 1. User requested a GROUPED aggregation, but SQL has NO GROUP BY
  if (intent.requiresGroupBy) {
    if (!sqlStructure.hasGroupBy) {
      const expectedCols = intent.groupingDimensions.map(d => d.columnName).join(', ');
      return {
        valid: false,
        reason: `Question requires grouping by (${expectedCols}), but generated SQL is missing a GROUP BY clause and would return an overall scalar instead of one row per group.`,
        intent,
        sqlStructure
      };
    }

    // 2. Check that SELECT projects at least one non-aggregated grouping column AND at least one aggregate metric
    if (sqlStructure.nonAggregatedSelectCols.length === 0 || sqlStructure.selectItems.length < 2) {
      return {
        valid: false,
        reason: 'Grouped aggregation SQL must SELECT both the grouping column(s) and the aggregated value(s).',
        intent,
        sqlStructure
      };
    }

    if (sqlStructure.aggregateFunctions.length === 0) {
      return {
        valid: false,
        reason: 'Grouped aggregation SQL must include an aggregate function (SUM, AVG, COUNT, MIN, MAX) in the SELECT clause.',
        intent,
        sqlStructure
      };
    }

    // 3. Verify that all expected grouping dimensions are represented in GROUP BY
    for (const expectedDim of intent.groupingDimensions) {
      const expColLow = expectedDim.columnName.toLowerCase();
      const expBaseStem = stemToken(expColLow.replace(/_id$/i, ''));
      const hasMatchingGroupCol = sqlStructure.groupByColumns.some(gCol => {
        const gBaseStem = stemToken(gCol.replace(/_id$/i, '').replace(/_name$/i, ''));
        return gCol === expColLow || gBaseStem === expBaseStem;
      });
      if (!hasMatchingGroupCol) {
        return {
          valid: false,
          reason: `Generated SQL GROUP BY (${sqlStructure.groupByColumns.join(', ')}) does not include the requested grouping dimension "${expectedDim.columnName}".`,
          intent,
          sqlStructure
        };
      }
    }

    // 4. Verify expected aggregate function matches (e.g. AVG vs SUM vs MAX vs MIN vs COUNT)
    if (intent.expectedAggFunctions.length > 0) {
      const primaryExpectedAgg = intent.expectedAggFunctions[0];
      if (!sqlStructure.aggregateFunctions.includes(primaryExpectedAgg)) {
        return {
          valid: false,
          reason: `Question requested ${primaryExpectedAgg} aggregation per group, but SQL used ${sqlStructure.aggregateFunctions.join(', ') || 'none'}.`,
          intent,
          sqlStructure
        };
      }
    }

    // 5. Verify HAVING clause when filtering on grouped aggregates
    if (intent.requiresHaving && !sqlStructure.hasHaving) {
      return {
        valid: false,
        reason: 'Question filters groups based on an aggregated value, which requires a HAVING clause with GROUP BY.',
        intent,
        sqlStructure
      };
    }

    // 6. Verify that "for each / in each" queries do not erroneously collapse to LIMIT 1
    if (!intent.isSingleWinnerRanking && intent.requestedLimit === null && sqlStructure.limitValue === 1) {
      return {
        valid: false,
        reason: 'Question asks for values across each group, but SQL has LIMIT 1 which only returns a single row.',
        intent,
        sqlStructure
      };
    }
  }

  // 7. User requested an OVERALL scalar aggregation (e.g. "What is the total revenue?"), but SQL added an unrequested GROUP BY
  if (intent.aggregationType === 'OVERALL' && !intent.requiresGroupBy && sqlStructure.hasGroupBy) {
    return {
      valid: false,
      reason: 'Question asks for a single overall aggregate value, but generated SQL includes an unrequested GROUP BY clause.',
      intent,
      sqlStructure
    };
  }

  return {
    valid: true,
    intent,
    sqlStructure
  };
}

/**
 * Dynamically synthesize an accurate, schema-grounded SQLite query from SemanticQueryIntent
 * when a generated query fails semantic validation or when running in fallback mode.
 */
export function synthesizeGroupedOrOverallSql(
  intent: SemanticQueryIntent
): {
  sql: string;
  operation: 'AGGREGATION' | 'COMPARISON' | 'RANKING';
  requiresVisualization: boolean;
  recommendedVisualization: 'bar' | 'line' | 'pie' | 'area' | 'none';
  outputFormat: 'direct_answer' | 'kpi_metric' | 'table' | 'chart_and_table';
  chartTitle: string;
  xKey: string;
  yKeys: string[];
  description: string;
} | null {
  const tbl = intent.targetTable;
  if (!tbl) return null;

  const aggFn = intent.expectedAggFunctions[0] || 'SUM';
  const metricCol = intent.metricColumns[0] || tbl.numericCols[0] || 'id';

  // Case A: OVERALL AGGREGATION (no GROUP BY)
  if (intent.aggregationType === 'OVERALL' && !intent.requiresGroupBy) {
    let aggExpr = '';
    let alias = '';
    if (aggFn === 'COUNT') {
      if (intent.countDistinctColumn) {
        aggExpr = `COUNT(DISTINCT "${intent.countDistinctColumn}")`;
        alias = `total_${intent.countDistinctColumn}_count`;
      } else {
        aggExpr = 'COUNT(*)';
        alias = 'total_count';
      }
    } else if (aggFn === 'AVG') {
      aggExpr = `ROUND(AVG("${metricCol}"), 2)`;
      alias = `avg_${metricCol}`;
    } else if (aggFn === 'MAX') {
      aggExpr = `ROUND(MAX("${metricCol}"), 2)`;
      alias = `max_${metricCol}`;
    } else if (aggFn === 'MIN') {
      aggExpr = `ROUND(MIN("${metricCol}"), 2)`;
      alias = `min_${metricCol}`;
    } else {
      aggExpr = `ROUND(SUM("${metricCol}"), 2)`;
      alias = `total_${metricCol}`;
    }

    const sql = `SELECT ${aggExpr} AS "${alias}" FROM "${tbl.tableName}";`;
    return {
      sql,
      operation: 'AGGREGATION',
      requiresVisualization: false,
      recommendedVisualization: 'none',
      outputFormat: 'kpi_metric',
      chartTitle: `Overall ${alias.replace(/_/g, ' ')}`,
      xKey: '',
      yKeys: [alias],
      description: `Calculated the overall ${alias.replace(/_/g, ' ')} across "${tbl.tableName}".`
    };
  }

  // Case B: GROUPED / FILTERED_GROUPED / RANKED_GROUPED AGGREGATION
  if (intent.requiresGroupBy && intent.groupingDimensions.length > 0) {
    const dims = intent.groupingDimensions;
    const primaryDim = dims[0];
    const hasJoinedDims = dims.some(d => Boolean(d.joinInfo));
    const tblPrefix = hasJoinedDims ? 't.' : '';

    // Build aggregate expression and alias
    let aggExpr = '';
    let rawAggExpr = '';
    let alias = '';

    if (aggFn === 'COUNT') {
      if (intent.countDistinctColumn) {
        rawAggExpr = `COUNT(DISTINCT ${tblPrefix}"${intent.countDistinctColumn}")`;
        aggExpr = rawAggExpr;
        alias = `${intent.countDistinctColumn.replace(/_id$/i, '')}_count`;
      } else {
        rawAggExpr = 'COUNT(*)';
        aggExpr = 'COUNT(*)';
        alias = `${tbl.tableName}_count`;
      }
    } else if (aggFn === 'AVG') {
      rawAggExpr = `AVG(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(AVG(${tblPrefix}"${metricCol}"), 2)`;
      alias = `avg_${metricCol}`;
    } else if (aggFn === 'MAX') {
      rawAggExpr = `MAX(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(MAX(${tblPrefix}"${metricCol}"), 2)`;
      alias = `max_${metricCol}`;
    } else if (aggFn === 'MIN') {
      rawAggExpr = `MIN(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(MIN(${tblPrefix}"${metricCol}"), 2)`;
      alias = `min_${metricCol}`;
    } else {
      rawAggExpr = `SUM(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(SUM(${tblPrefix}"${metricCol}"), 2)`;
      alias = `total_${metricCol}`;
    }

    const joinMap = new Map<string, { alias: string; foreignKeyCol: string; joinPkCol: string }>();
    let joinIdx = 1;
    for (const d of dims) {
      if (d.joinInfo && !joinMap.has(d.joinInfo.joinTable)) {
        joinMap.set(d.joinInfo.joinTable, {
          alias: `j${joinIdx++}`,
          foreignKeyCol: d.joinInfo.foreignKeyCol,
          joinPkCol: d.joinInfo.joinPkCol
        });
      }
    }

    const selectCols = dims
      .map(d => {
        if (d.joinInfo) {
          const j = joinMap.get(d.joinInfo.joinTable)!;
          return `${j.alias}."${d.columnName}"`;
        }
        return `${tblPrefix}"${d.columnName}"`;
      })
      .join(', ');

    const groupCols = selectCols;

    let fromAndJoins = `"${tbl.tableName}"${hasJoinedDims ? ' t' : ''}`;
    for (const [jTable, jMeta] of joinMap.entries()) {
      fromAndJoins += ` JOIN "${jTable}" ${jMeta.alias} ON t."${jMeta.foreignKeyCol}" = ${jMeta.alias}."${jMeta.joinPkCol}"`;
    }

    let whereClause = '';
    if (intent.whereInFilter && intent.whereInFilter.values.length > 0) {
      whereClause = ` WHERE ${tblPrefix}"${intent.whereInFilter.columnName}" IN (${intent.whereInFilter.values.join(', ')})`;
    }

    let havingClause = '';
    if (intent.requiresHaving && intent.havingFilter) {
      const hf = intent.havingFilter;
      const hfExpr = hf.aggFn === 'COUNT' ? rawAggExpr : `${hf.aggFn}(${tblPrefix}"${hf.metricCol}")`;
      havingClause = ` HAVING ${hfExpr} ${hf.operator} ${hf.threshold}`;
    }

    const orderClause = ` ORDER BY "${alias}" ${intent.orderDirection}`;
    const limitClause = intent.requestedLimit !== null ? ` LIMIT ${intent.requestedLimit}` : '';

    const sql = `SELECT ${selectCols}, ${aggExpr} AS "${alias}" FROM ${fromAndJoins}${whereClause} GROUP BY ${groupCols}${havingClause}${orderClause}${limitClause};`;

    const isSingleRow = intent.requestedLimit === 1;
    const groupNamesLabel = dims.map(d => d.columnName.replace(/_/g, ' ')).join(' & ');

    return {
      sql,
      operation: isSingleRow ? 'RANKING' : 'COMPARISON',
      requiresVisualization: !isSingleRow,
      recommendedVisualization: isSingleRow ? 'none' : 'bar',
      outputFormat: isSingleRow ? 'direct_answer' : 'chart_and_table',
      chartTitle: `${alias.replace(/_/g, ' ')} by ${groupNamesLabel}`,
      xKey: primaryDim.columnName,
      yKeys: [alias],
      description: `Calculated ${alias.replace(/_/g, ' ')} grouped by ${groupNamesLabel} in "${tbl.tableName}"${havingClause ? ` (filtered with${havingClause})` : ''}.`
    };
  }

  return null;
}
