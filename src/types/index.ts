export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  createdAt: string;
  onboardingCompleted: boolean;
  firstLoginCompleted?: boolean;
  loginCount?: number;
}

export type DatabaseType = 'demo' | 'sqlite' | 'csv' | 'excel';

export interface ColumnDefinition {
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
  foreignKey?: {
    table: string;
    column: string;
  };
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  rowCount: number;
}

export interface DatabaseInstance {
  id: string;
  name: string;
  type: DatabaseType;
  templateId?: string;
  templateName?: string;
  tables: TableDefinition[];
  createdAt: string;
  updatedAt: string;
  isActive?: boolean;
  fileSize?: string;
}

export interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
  healedSql?: string;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'area';
  title?: string;
  xKey: string;
  yKeys: string[];
  colors?: string[];
}

export interface KPIItem {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export type MessageRole = 'user' | 'assistant' | 'system';

export type AIIntent =
  | 'GREETING'
  | 'GENERAL_CONVERSATION'
  | 'DATA_QUERY'
  | 'FOLLOW_UP_QUERY'
  | 'CLARIFICATION_RESPONSE'
  | 'CLARIFICATION_NEEDED'
  | 'GENERATE_SQL'
  | 'EXPLAIN_SQL'
  | 'OPTIMIZE_SQL'
  | 'RESULT_INTERPRETATION'
  | 'VISUALIZATION_REQUEST'
  | 'HELP';

export interface DetectedIntent {
  operation: 'RECORD_RETRIEVAL' | 'AGGREGATION' | 'COMPARISON' | 'RANKING' | 'FILTERING' | 'SUMMARY' | 'GENERAL';
  isGrouped?: boolean;
  groupByColumns?: string[];
  requestedRowCount?: number | null;
  targetEntity?: string;
  selectedColumns?: string[];
  filtersAndConditions?: string;
  sorting?: { column: string; direction: 'ASC' | 'DESC' };
  grouping?: string[];
  requiresVisualization: boolean;
  recommendedVisualization?: 'bar' | 'line' | 'pie' | 'area' | 'none';
  outputFormat: 'direct_answer' | 'kpi_metric' | 'table' | 'chart_and_table';
}

export interface StructuredAnswer {
  headline: string;
  detailedInsight?: string;
  keyMetrics?: KPIItem[];
  displayMode: 'direct_answer' | 'kpi_metric' | 'table' | 'chart_and_table';
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  intent?: AIIntent;
  detectedIntent?: DetectedIntent;
  structuredAnswer?: StructuredAnswer;
  sql?: string;
  optimizedSql?: string;
  sqlExplanation?: string;
  queryResult?: QueryResult;
  chartConfig?: ChartConfig;
  kpis?: KPIItem[];
  clarificationOptions?: string[];
  suggestedFollowUps?: string[];
  isExecuting?: boolean;
  error?: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  databaseId: string;
  databaseName: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageSnippet?: string;
}

export interface DemoTemplateInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  tables: string[];
  estimatedRows: string;
  popularQuestions: string[];
}
