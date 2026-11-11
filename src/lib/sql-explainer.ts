/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClauseExplanation {
  clause: string;
  keyword: string;
  expression: string;
  description: string;
  purpose: string;
}

export interface SqlExplanationResult {
  overview: string;
  breakdown: ClauseExplanation[];
  businessContext: string;
  complexity: 'Simple' | 'Intermediate' | 'Advanced';
}

/**
 * Intelligent, zero-latency SQL parser that extracts and deconstructs
 * clauses from any SQLite/PostgreSQL SELECT query.
 */
export function deconstructSqlClauses(rawSql: string): SqlExplanationResult {
  if (!rawSql || typeof rawSql !== 'string') {
    return {
      overview: 'No SQL query provided for analysis.',
      breakdown: [],
      businessContext: 'Please specify an active SQL query to inspect its clauses.',
      complexity: 'Simple'
    };
  }

  // Normalize query whitespace and strip trailing semicolons
  const sql = rawSql.trim().replace(/;+\s*$/, '');

  // Major SQL Clause regex boundary finder
  const clauseKeywords = [
    'WITH',
    'SELECT',
    'FROM',
    'LEFT OUTER JOIN',
    'RIGHT OUTER JOIN',
    'LEFT JOIN',
    'RIGHT JOIN',
    'INNER JOIN',
    'CROSS JOIN',
    'JOIN',
    'WHERE',
    'GROUP BY',
    'HAVING',
    'ORDER BY',
    'LIMIT'
  ];

  // Regex pattern matching any of the major keywords at word boundary
  const pattern = new RegExp(
    `\\b(${clauseKeywords.map(k => k.replace(/\s+/g, '\\s+')).join('|')})\\b`,
    'gi'
  );

  interface RawSection {
    keyword: string;
    startIndex: number;
    text: string;
  }

  const sections: RawSection[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    sections.push({
      keyword: match[1].toUpperCase().replace(/\s+/g, ' '),
      startIndex: match.index,
      text: ''
    });
  }

  if (sections.length === 0) {
    return {
      overview: 'Custom SQL query statement.',
      breakdown: [
        {
          clause: 'STATEMENT',
          keyword: 'STATEMENT',
          expression: sql,
          description: 'Executes the raw SQL statement as provided.',
          purpose: 'Database execution'
        }
      ],
      businessContext: 'Executes against the active database instance.',
      complexity: 'Simple'
    };
  }

  // Slice content between keywords
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startIndex + sections[i].keyword.length;
    const end = i + 1 < sections.length ? sections[i + 1].startIndex : sql.length;
    sections[i].text = sql.slice(start, end).trim();
  }

  const breakdown: ClauseExplanation[] = [];
  let hasAggregates = false;
  let hasJoins = false;
  let hasFilters = false;
  let hasGrouping = false;
  let hasSorting = false;
  let targetTable = '';

  for (const sec of sections) {
    const kw = sec.keyword;
    const expr = sec.text;
    const cleanExpr = expr.replace(/\s+/g, ' ');

    if (kw === 'WITH') {
      breakdown.push({
        clause: `WITH ${cleanExpr}`,
        keyword: 'WITH',
        expression: cleanExpr,
        description: `Defines Common Table Expressions (temporary named result sets) to structure modular query logic.`,
        purpose: 'Temporary CTE definition'
      });
    } else if (kw === 'SELECT') {
      const isWildcard = cleanExpr.trim() === '*' || cleanExpr.startsWith('*');
      const isDistinct = /^\s*DISTINCT\b/i.test(cleanExpr);
      const isAvg = /\bAVG\s*\(/i.test(cleanExpr);
      const isSum = /\bSUM\s*\(/i.test(cleanExpr);
      const isCount = /\bCOUNT\s*\(/i.test(cleanExpr);
      const isMinMax = /\b(MIN|MAX)\s*\(/i.test(cleanExpr);
      const isRound = /\bROUND\s*\(/i.test(cleanExpr);

      if (isAvg || isSum || isCount || isMinMax) {
        hasAggregates = true;
      }

      let desc = '';
      if (isWildcard) {
        desc = `Returns all columns (*) available in the queried table without column restrictions.`;
      } else {
        const parts: string[] = [];
        if (isDistinct) parts.push('unique values (DISTINCT)');
        if (isAvg) parts.push('computes average values');
        if (isSum) parts.push('sums numerical totals');
        if (isCount) parts.push('counts matching record rows');
        if (isMinMax) parts.push('identifies minimum / maximum bounds');
        if (isRound) parts.push('rounds decimal precision for clean display');

        if (parts.length > 0) {
          desc = `Projects calculated metrics and output attributes: ${parts.join(', ')}.`;
        } else {
          // List column names cleanly
          const colList = cleanExpr
            .split(',')
            .map(c => c.trim().replace(/^"|"$/g, '').split(/\s+AS\s+/i)[0])
            .filter(Boolean)
            .slice(0, 5)
            .join(', ');
          desc = `Projects specific attributes (${colList}${cleanExpr.split(',').length > 5 ? '...' : ''}) for the result set.`;
        }
      }

      breakdown.push({
        clause: `SELECT ${cleanExpr}`,
        keyword: 'SELECT',
        expression: cleanExpr,
        description: desc,
        purpose: 'Defines target columns & calculated output metrics'
      });
    } else if (kw === 'FROM') {
      targetTable = cleanExpr.split(/\s+/)[0].replace(/["']/g, '');
      const aliasMatch = cleanExpr.match(/\bAS\s+([a-zA-Z0-9_]+)|\s+([a-zA-Z0-9_]+)$/i);
      const alias = aliasMatch ? (aliasMatch[1] || aliasMatch[2]) : '';

      breakdown.push({
        clause: `FROM ${cleanExpr}`,
        keyword: 'FROM',
        expression: cleanExpr,
        description: `Designates "${targetTable}" as the primary source table${alias && alias !== targetTable ? ` (aliased as "${alias}")` : ''} from which records are read.`,
        purpose: 'Designates data source table'
      });
    } else if (kw.includes('JOIN')) {
      hasJoins = true;
      const onMatch = cleanExpr.match(/\bON\s+(.+)$/i);
      const joinCondition = onMatch ? onMatch[1] : '';
      const joinedTable = cleanExpr.split(/\s+/)[0].replace(/["']/g, '');

      breakdown.push({
        clause: `${kw} ${cleanExpr}`,
        keyword: kw,
        expression: cleanExpr,
        description: `Relates data from "${joinedTable}"${joinCondition ? ` matching key constraint: ${joinCondition}` : ''} to enrich each record with associated details.`,
        purpose: 'Table relationship mapping'
      });
    } else if (kw === 'WHERE') {
      hasFilters = true;
      breakdown.push({
        clause: `WHERE ${cleanExpr}`,
        keyword: 'WHERE',
        expression: cleanExpr,
        description: `Restricts records before any grouping: only rows satisfying (${cleanExpr}) are evaluated.`,
        purpose: 'Row-level filtering criteria'
      });
    } else if (kw === 'GROUP BY') {
      hasGrouping = true;
      const groupCols = cleanExpr.replace(/["']/g, '');
      breakdown.push({
        clause: `GROUP BY ${cleanExpr}`,
        keyword: 'GROUP BY',
        expression: cleanExpr,
        description: `Clusters records into discrete summary buckets partitioned by (${groupCols}) to compute aggregate totals per group.`,
        purpose: 'Dimensional clustering for aggregations'
      });
    } else if (kw === 'HAVING') {
      breakdown.push({
        clause: `HAVING ${cleanExpr}`,
        keyword: 'HAVING',
        expression: cleanExpr,
        description: `Filters the aggregated group buckets: only groups satisfying the metric condition (${cleanExpr}) are preserved.`,
        purpose: 'Aggregate-level post-filter'
      });
    } else if (kw === 'ORDER BY') {
      hasSorting = true;
      const isDesc = /\bDESC\b/i.test(cleanExpr);
      const sortCol = cleanExpr.replace(/\s+(DESC|ASC)\b/gi, '').replace(/["']/g, '').trim();

      breakdown.push({
        clause: `ORDER BY ${cleanExpr}`,
        keyword: 'ORDER BY',
        expression: cleanExpr,
        description: `Orders the output dataset by ${sortCol} in ${isDesc ? 'descending order (highest / newest first)' : 'ascending order (lowest / oldest first)'}.`,
        purpose: 'Sorting & ranking results'
      });
    } else if (kw === 'LIMIT') {
      const limitVal = cleanExpr.match(/\d+/)?.[0] || cleanExpr;
      breakdown.push({
        clause: `LIMIT ${cleanExpr}`,
        keyword: 'LIMIT',
        expression: cleanExpr,
        description: `Caps the total number of returned rows to at most ${limitVal} records to ensure fast execution and clean UI display.`,
        purpose: 'Row count bounding'
      });
    }
  }

  // Calculate complexity
  let complexity: 'Simple' | 'Intermediate' | 'Advanced' = 'Simple';
  if (hasJoins || (hasGrouping && hasAggregates && hasFilters)) {
    complexity = 'Advanced';
  } else if (hasGrouping || hasAggregates || hasFilters || hasSorting) {
    complexity = 'Intermediate';
  }

  // Compose high-level human overview
  let overview = '';
  if (hasAggregates && hasGrouping) {
    overview = `This query aggregates records from "${targetTable || 'the active dataset'}", grouping rows to calculate summary metrics with sorted ranking.`;
  } else if (hasAggregates) {
    overview = `This query performs mathematical aggregation across "${targetTable || 'the dataset'}" to compute summary statistics.`;
  } else if (hasSorting) {
    overview = `This query retrieves and ranks records from "${targetTable || 'the dataset'}" in ordered sequence.`;
  } else {
    overview = `This query reads and projects records directly from "${targetTable || 'the dataset'}" with targeted constraints.`;
  }

  const businessContext = hasAggregates
    ? `Useful for analytics, reporting, and KPI dashboards to evaluate overall performance and trends.`
    : `Useful for inspecting raw transaction records, operational audits, or drill-down details.`;

  return {
    overview,
    breakdown,
    businessContext,
    complexity
  };
}
