import React, { useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  DatabaseInstance,
  Conversation,
  Message,
  QueryResult,
  AIIntent,
  KPIItem,
  DetectedIntent,
  StructuredAnswer
} from './types';
import { PersistenceService, isSupabaseConfigured } from './lib/supabase';
import { SQLiteEngine } from './lib/sqlite-engine';
import { apiUrl } from './lib/api';
import { validateSqlSemantics, synthesizeGroupedOrOverallSql } from './lib/sql-semantics';
import { ThreeBackground } from './components/ThreeBackground';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveView } from './components/Sidebar';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingModal } from './components/OnboardingModal';
import { DashboardView } from './components/DashboardView';
import { ChatWorkspace } from './components/ChatWorkspace';
import { DatabaseManagerView } from './components/DatabaseManagerView';
import { DatabaseExplorerView } from './components/DatabaseExplorerView';
import { DataInsightsView } from './components/DataInsightsView';
import { UserGuideView } from './components/UserGuideView';
import { SettingsModal } from './components/SettingsModal';

function isIdCol(colName: string): boolean {
  return /^(id|.*_id)$/i.test(colName.trim());
}

function synthesizeInstantMetrics(
  columns: string[],
  rows: (string | number | boolean | null)[][],
  rowCount: number
): KPIItem[] {
  const kpis: KPIItem[] = [];
  kpis.push({
    label: 'Total Records',
    value: rowCount,
    trend: 'neutral'
  });

  if (rowCount === 0) return kpis;

  let numColIdx = -1;
  let textColIdx = -1;

  for (let c = 0; c < columns.length; c++) {
    const isNum = rows.some(r => typeof r[c] === 'number');
    if (isNum && !isIdCol(columns[c]) && numColIdx === -1) numColIdx = c;
    if (!isNum && textColIdx === -1) textColIdx = c;
  }

  if (numColIdx !== -1) {
    const colName = columns[numColIdx];
    const nums = rows
      .map(r => r[numColIdx])
      .filter((v): v is number => typeof v === 'number');

    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      const isMoney = /revenue|amount|salary|balance|spent|bill|price/i.test(colName);
      const isCount = /count|units|volume|enrolled|headcount/i.test(colName);

      const fmt = (v: number) => {
        if (isMoney) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        if (isCount) return Math.round(v).toLocaleString('en-US');
        return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
      };

      kpis.push({
        label: isCount
          ? `Total ${colName.replace(/_/g, ' ')}`
          : (isMoney ? `Total Value` : `Total ${colName.replace(/_/g, ' ')}`),
        value: fmt(sum),
        trend: 'up'
      });

      if (nums.length > 1 && !isCount) {
        kpis.push({
          label: `Average ${colName.replace(/_/g, ' ')}`,
          value: fmt(avg),
          trend: 'neutral'
        });
      }

      if (textColIdx !== -1) {
        let maxIdx = 0;
        let maxVal = -Infinity;
        rows.forEach((r, idx) => {
          const val = r[numColIdx];
          if (typeof val === 'number' && val > maxVal) {
            maxVal = val;
            maxIdx = idx;
          }
        });
        const topEntity = rows[maxIdx]?.[textColIdx];
        if (topEntity !== undefined && topEntity !== null) {
          kpis.push({
            label: `Top: ${String(topEntity)}`,
            value: fmt(maxVal),
            trend: 'up'
          });
        }
      }
    }
  }

  return kpis.slice(0, 4);
}

function formulateStructuredAnswer(
  query: string,
  detectedIntent: DetectedIntent | undefined,
  queryResult: QueryResult,
  baseContent?: string,
  executedSql?: string
): StructuredAnswer {
  const { columns, rows, rowCount } = queryResult;
  const q = query.toLowerCase();
  const isGroupedSql = /\bGROUP\s+BY\b/i.test(executedSql || '') || Boolean(detectedIntent?.isGrouped);

  if (queryResult.error) {
    return {
      headline: baseContent || `Unable to execute SQL query: ${queryResult.error}`,
      detailedInsight: queryResult.error,
      keyMetrics: [],
      displayMode: 'direct_answer'
    };
  }

  if (rowCount === 0) {
    return {
      headline: 'No records found matching your query criteria.',
      detailedInsight: 'The SQL query executed against the active database schema, but zero rows satisfied the filter conditions.',
      keyMetrics: [{ label: 'Returned Records', value: 0, trend: 'neutral' }],
      displayMode: 'direct_answer'
    };
  }

  const op = detectedIntent?.operation;

  // Case 1: RECORD RETRIEVAL or FILTERING of raw ungrouped rows
  if (
    !isGroupedSql &&
    (op === 'RECORD_RETRIEVAL' || op === 'FILTERING' || /\b(first|last|latest|oldest)\s+\d+|\bshow\s+records\b|\bdisplay\s+the\b/i.test(query))
  ) {
    const isLast = /\blast\b|\bbottom\b|\btail\b/i.test(q);
    const isLatest = /\blatest\b|\bmost recent\b|\bnewest\b/i.test(q);
    const isOldest = /\boldest\b|\bearliest\b/i.test(q);
    const isFirst = /\bfirst\b|\binitial\b/i.test(q);

    const firstId = rows[0]?.[0];
    const lastId = rows[rows.length - 1]?.[0];
    const rangeSuffix = columns.length > 0 && firstId !== undefined && lastId !== undefined
      ? ` (${columns[0]}: ${firstId} to ${lastId})`
      : '';

    let positionHeadline = baseContent && baseContent.length > 10
      ? baseContent
      : `Retrieved ${rowCount} ${rowCount === 1 ? 'record' : 'records'} matching your request.`;

    if (isLast) {
      positionHeadline = `Displaying the last ${rowCount} ${rowCount === 1 ? 'record' : 'records'} from the dataset${rangeSuffix}.`;
    } else if (isFirst) {
      positionHeadline = `Displaying the first ${rowCount} ${rowCount === 1 ? 'record' : 'records'} from the dataset${rangeSuffix}.`;
    } else if (isLatest) {
      positionHeadline = `Displaying the ${rowCount} most recent ${rowCount === 1 ? 'record' : 'records'}${rangeSuffix}.`;
    } else if (isOldest) {
      positionHeadline = `Displaying the ${rowCount} oldest ${rowCount === 1 ? 'record' : 'records'}${rangeSuffix}.`;
    }

    return {
      headline: positionHeadline,
      detailedInsight: baseContent && baseContent !== positionHeadline
        ? baseContent
        : `Retrieved ${rowCount} rows across ${columns.length} columns (${columns.join(', ')}) from the connected database.`,
      keyMetrics: synthesizeInstantMetrics(columns, rows, rowCount),
      displayMode: 'table'
    };
  }

  // Case 2: SINGLE VALUE SCALAR (e.g. Overall Average, Sum, Count, Min, Max)
  if (rowCount === 1 && columns.length === 1) {
    const rawVal = rows[0][0];
    const colName = columns[0].replace(/_/g, ' ');
    const isMoney = /revenue|amount|salary|balance|spent|bill|price/i.test(columns[0]);
    const formattedVal = typeof rawVal === 'number'
      ? (isMoney ? `$${rawVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : rawVal.toLocaleString('en-US', { maximumFractionDigits: 2 }))
      : String(rawVal);

    return {
      headline: `The ${colName} is ${formattedVal}.`,
      detailedInsight: baseContent && baseContent.length > 10
        ? baseContent
        : `Computed directly from the active database using SQL aggregation.`,
      keyMetrics: [
        { label: columns[0].replace(/_/g, ' ').toUpperCase(), value: formattedVal, trend: 'up' }
      ],
      displayMode: 'kpi_metric'
    };
  }

  const eIdx = (() => {
    const tIdx = columns.findIndex((_, i) => rows.some(r => typeof r[i] === 'string'));
    return tIdx !== -1 ? tIdx : 0;
  })();
  const mIdx = (() => {
    const nIdx = columns.findIndex((c, i) => i !== eIdx && !isIdCol(c) && rows.some(r => typeof r[i] === 'number'));
    return nIdx !== -1 ? nIdx : (columns.length > 1 ? columns.length - 1 : 0);
  })();

  // Case 3: SINGLE ENTITY RANKING (e.g. "Which category has the highest value?", "Show only the district with the highest nitrogen")
  if (rowCount === 1 && columns.length >= 2) {
    const entity = String(rows[0][eIdx]);
    const rawMetric = rows[0][mIdx];
    const entityCol = columns[eIdx].replace(/_/g, ' ');
    const metricCol = columns[mIdx].replace(/_/g, ' ');
    const isMoney = /revenue|amount|salary|balance|spent|bill|price/i.test(columns[mIdx]);
    const formattedMetric = typeof rawMetric === 'number'
      ? (isMoney ? `$${rawMetric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : rawMetric.toLocaleString('en-US', { maximumFractionDigits: 2 }))
      : String(rawMetric);

    const isLowest = /\b(lowest|minimum|least|smallest|worst|bottom|cheapest)\b/i.test(q);
    const rankWord = isLowest ? 'lowest' : 'highest';
    const rankLabel = isLowest ? 'Lowest' : 'Highest';

    return {
      headline: `${entity} has the ${rankWord} ${metricCol} (${formattedMetric}).`,
      detailedInsight: baseContent && baseContent.length > 10
        ? baseContent
        : `Verified from the database records across ${entityCol} (${metricCol}: ${formattedMetric}).`,
      keyMetrics: [
        { label: `Matched ${entityCol}`, value: entity, trend: isLowest ? 'down' : 'up' },
        { label: `${rankLabel} ${metricCol}`, value: formattedMetric, trend: isLowest ? 'down' : 'up' }
      ],
      displayMode: 'direct_answer'
    };
  }

  // Case 4: GROUPED AGGREGATION / COMPARISON / DISTRIBUTION / TRENDS
  if (
    isGroupedSql ||
    op === 'COMPARISON' ||
    op === 'SUMMARY' ||
    /\b(compare|across|breakdown|trend|for\s+each|in\s+each|per|by\s+[a-z]+)\b/i.test(query)
  ) {
    const groupCols = mIdx > 0 ? columns.slice(0, mIdx) : [columns[eIdx]];
    const entityCol = groupCols.map(c => c.replace(/_/g, ' ')).join(' & ');
    const metricCol = columns[mIdx] ? columns[mIdx].replace(/_/g, ' ') : 'Metric';
    const formatGroupEntity = (r: (string | number | boolean | null)[]) =>
      groupCols.map((_, idx) => String(r[idx] ?? '')).filter(Boolean).join(' • ') || String(r[eIdx] ?? '');

    let maxRow = rows[0];
    let minRow = rows[0];
    let sum = 0;
    for (const r of rows) {
      if (typeof r[mIdx] === 'number') {
        const v = r[mIdx] as number;
        sum += v;
        if (v > (Number(maxRow?.[mIdx]) || -Infinity)) maxRow = r;
        if (v < (Number(minRow?.[mIdx]) || Infinity)) minRow = r;
      }
    }
    const topEntity = maxRow ? formatGroupEntity(maxRow) : '';
    const topVal = maxRow && typeof maxRow[mIdx] === 'number' ? Number((maxRow[mIdx] as number).toFixed(2)).toLocaleString() : String(maxRow?.[mIdx] || '');
    const bottomEntity = minRow ? formatGroupEntity(minRow) : '';
    const bottomVal = minRow && typeof minRow[mIdx] === 'number' ? Number((minRow[mIdx] as number).toFixed(2)).toLocaleString() : String(minRow?.[mIdx] || '');
    const avgVal = rows.length > 0 ? Number((sum / rows.length).toFixed(2)).toLocaleString() : '0';

    return {
      headline: `Across ${rowCount} ${entityCol} groups, ${topEntity} leads in ${metricCol} (${topVal}), while ${bottomEntity} is lowest (${bottomVal}).`,
      detailedInsight: baseContent && baseContent.length > 10
        ? baseContent
        : `Grouped breakdown of ${metricCol} across ${rowCount} ${entityCol} groups. Highest is ${topEntity} (${topVal}); lowest is ${bottomEntity} (${bottomVal}); group average is ${avgVal}.`,
      keyMetrics: [
        { label: `Groups (${entityCol})`, value: rowCount, trend: 'neutral' },
        { label: `Highest: ${topEntity}`, value: topVal, trend: 'up' },
        { label: `Lowest: ${bottomEntity}`, value: bottomVal, trend: 'down' },
        { label: `Group Avg`, value: avgVal, trend: 'neutral' }
      ],
      displayMode: 'chart_and_table'
    };
  }

  // Fallback default
  return {
    headline: baseContent && baseContent.length > 10 ? baseContent : `Retrieved ${rowCount} records from the active database.`,
    detailedInsight: `SQL query executed in ${queryResult.executionTimeMs} ms with ${rowCount} returned rows.`,
    keyMetrics: synthesizeInstantMetrics(columns, rows, rowCount),
    displayMode: columns.length > 1 && rowCount > 1 ? 'chart_and_table' : 'table'
  };
}

export default function App() {
  // Authentication & Profile
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  // Core Data States
  const [databases, setDatabases] = useState<DatabaseInstance[]>([]);
  const [activeDatabase, setActiveDatabase] = useState<DatabaseInstance | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Navigation & Modals
  const [currentView, setCurrentView] = useState<ActiveView>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Execution & Loading States
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatLoadingStep, setChatLoadingStep] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. Initial Authentication Check
  useEffect(() => {
    PersistenceService.getCurrentUser().then(user => {
      if (user) {
        setCurrentUser(user);
        // Display welcome page only if first-time user who has not yet completed first login
        const isFirstTime = !user.firstLoginCompleted && (user.loginCount === 1);
        if (isFirstTime) {
          setShowOnboarding(true);
          setIsFirstLogin(true);
        } else {
          // Returning user: redirect directly to Dashboard
          setShowOnboarding(false);
          setIsFirstLogin(false);
          setCurrentView('dashboard');
        }
      }
      setIsAuthChecking(false);
    });
  }, []);

  // 2. Load User Data (Databases & Conversations)
  const loadUserData = useCallback(async (user: UserProfile) => {
    const loadedDbs = await PersistenceService.getDatabases(user.id);
    let currentDbs = loadedDbs;

    // Seed initial demo database if user has none
    if (currentDbs.length === 0) {
      try {
        const seed = await SQLiteEngine.createDemoDatabase(
          `db_retail-sales_${Date.now()}`,
          'Retail & Sales Analytics',
          'retail-sales'
        );
        currentDbs = [seed.instance];
        await PersistenceService.saveDatabases(user.id, currentDbs);
      } catch (err) {
        console.warn('Initial demo seed error:', err);
      }
    }
    setDatabases(currentDbs);

    // Active Database resolution
    const savedActiveId = PersistenceService.getActiveDatabaseId(user.id);
    const resolvedActive = currentDbs.find(d => d.id === savedActiveId) || currentDbs[0] || null;
    setActiveDatabase(resolvedActive);
    if (resolvedActive) {
      SQLiteEngine.getDatabase(resolvedActive.id, resolvedActive.templateId);
    }

    // Load Conversations
    const loadedConvs = await PersistenceService.getConversations(user.id);
    setConversations(loadedConvs);

    if (loadedConvs.length > 0 && !activeConversationId) {
      setActiveConversationId(loadedConvs[0].id);
      const msgs = await PersistenceService.getMessages(loadedConvs[0].id);
      setMessages(msgs);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (currentUser) {
      loadUserData(currentUser);
    }
  }, [currentUser, loadUserData]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      PersistenceService.getMessages(activeConversationId).then(msgs => {
        setMessages(msgs);
      });
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  // Handle Authentication Success
  // First successful login -> Welcome page
  // Second and subsequent logins -> Direct to Dashboard
  const handleAuthSuccess = (user: UserProfile, isFirstLoginFlag: boolean) => {
    setCurrentUser(user);
    const isFirstTime = isFirstLoginFlag && !user.firstLoginCompleted;
    setIsFirstLogin(isFirstTime);

    if (isFirstTime) {
      // First successful login: display Welcome page
      setShowOnboarding(true);
    } else {
      // Returning user: redirect directly to Dashboard
      setShowOnboarding(false);
      setCurrentView('dashboard');
    }
  };

  const handleLogout = async () => {
    await PersistenceService.saveUser(null);
    setCurrentUser(null);
    setActiveConversationId(null);
    setMessages([]);
    setConversations([]);
    setActiveDatabase(null);
    setIsSettingsOpen(false);
  };

  // Handle Onboarding / Welcome Completion
  const handleOnboardingComplete = async (selectedDb: DatabaseInstance, firstQuestion?: string) => {
    if (!currentUser) return;
    const updatedUser: UserProfile = {
      ...currentUser,
      onboardingCompleted: true,
      firstLoginCompleted: true
    };
    await PersistenceService.saveUser(updatedUser);
    PersistenceService.completeWelcome(currentUser.id);
    PersistenceService.completeOnboarding(currentUser.id);
    setCurrentUser(updatedUser);
    setShowOnboarding(false);

    // Update databases list if new
    if (!databases.some(d => d.id === selectedDb.id)) {
      const updatedDbs = [selectedDb, ...databases];
      setDatabases(updatedDbs);
      await PersistenceService.saveDatabases(currentUser.id, updatedDbs);
    }
    setActiveDatabase(selectedDb);
    PersistenceService.setActiveDatabaseId(currentUser.id, selectedDb.id);

    // Start conversation if first question provided
    if (firstQuestion) {
      handleNewConversation(firstQuestion);
    } else {
      setCurrentView('dashboard');
    }
  };

  // Skip welcome and navigate directly to dashboard
  const handleSkipWelcome = async () => {
    if (!currentUser) return;
    const updatedUser: UserProfile = {
      ...currentUser,
      onboardingCompleted: true,
      firstLoginCompleted: true
    };
    await PersistenceService.saveUser(updatedUser);
    PersistenceService.completeWelcome(currentUser.id);
    PersistenceService.completeOnboarding(currentUser.id);
    setCurrentUser(updatedUser);
    setShowOnboarding(false);
    setCurrentView('dashboard');
  };

  // Database Management
  const handleSelectDatabase = (db: DatabaseInstance) => {
    setActiveDatabase(db);
    if (currentUser) {
      PersistenceService.setActiveDatabaseId(currentUser.id, db.id);
    }
  };

  const handleAddDatabase = async (db: DatabaseInstance) => {
    if (!currentUser) return;
    const updated = [db, ...databases.filter(d => d.id !== db.id)];
    setDatabases(updated);
    setActiveDatabase(db);
    PersistenceService.setActiveDatabaseId(currentUser.id, db.id);
    await PersistenceService.saveDatabases(currentUser.id, updated);
  };

  const handleDeleteDatabase = async (id: string) => {
    if (!currentUser) return;
    await PersistenceService.deleteDatabase(currentUser.id, id);
    const updated = databases.filter(d => d.id !== id);
    setDatabases(updated);
    if (activeDatabase?.id === id) {
      const nextActive = updated[0] || null;
      setActiveDatabase(nextActive);
      PersistenceService.setActiveDatabaseId(currentUser.id, nextActive?.id || null);
    }
  };

  // Conversation Management
  const handleNewConversation = async (initialQuery?: string) => {
    if (!currentUser) return;
    const convId = `conv_${Date.now()}`;
    const newConv: Conversation = {
      id: convId,
      userId: currentUser.id,
      title: initialQuery ? (initialQuery.slice(0, 32) + '...') : 'New Conversation',
      databaseId: activeDatabase?.id || '',
      databaseName: activeDatabase?.name || 'Default Database',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0
    };

    const updated = [newConv, ...conversations];
    setConversations(updated);
    setActiveConversationId(convId);
    setMessages([]);
    await PersistenceService.saveConversations(currentUser.id, updated);
    setCurrentView('chat');

    if (initialQuery) {
      executeChatMessage(convId, initialQuery, []);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!currentUser) return;
    await PersistenceService.deleteConversation(currentUser.id, convId);
    const updated = conversations.filter(c => c.id !== convId);
    setConversations(updated);
    if (activeConversationId === convId) {
      if (updated.length > 0) {
        setActiveConversationId(updated[0].id);
      } else {
        setActiveConversationId(null);
        setMessages([]);
      }
    }
  };

  const handleClearCurrentConversation = async () => {
    if (!activeConversationId) return;
    setMessages([]);
    await PersistenceService.saveMessages(activeConversationId, []);
  };

  // Global Refresh Action (Preserves active chat state)
  const handleRefresh = async () => {
    if (!currentUser) return;
    setIsRefreshing(true);
    try {
      await loadUserData(currentUser);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Chat Execution Pipeline
  const executeChatMessage = async (
    targetConvId: string,
    queryText: string,
    currentHistory: Message[]
  ) => {
    if (!currentUser) return;

    // 1. Append User Message
    const userMsg: Message = {
      id: `msg_u_${Date.now()}`,
      conversationId: targetConvId,
      role: 'user',
      content: queryText,
      createdAt: new Date().toISOString()
    };
    const updatedMessages = [...currentHistory, userMsg];
    setMessages(updatedMessages);

    setIsChatLoading(true);
    setChatLoadingStep('Analyzing natural language intent...');

    try {
      const schemaCtx = activeDatabase
        ? SQLiteEngine.generateSchemaContext(activeDatabase.tables, {
            id: activeDatabase.id,
            name: activeDatabase.name,
            type: activeDatabase.type
          })
        : '';

      // Build rich multi-turn conversation history including SQL and returned data context
      const historyContext = currentHistory.slice(-8).map(m => ({
        role: m.role,
        content: m.structuredAnswer?.headline ? `${m.structuredAnswer.headline} ${m.structuredAnswer.detailedInsight || ''}`.trim() : m.content,
        sql: m.sql,
        resultSummary: m.queryResult && !m.queryResult.error && m.queryResult.rowCount > 0
          ? JSON.stringify({
              columns: m.queryResult.columns,
              rowCount: m.queryResult.rowCount,
              rows: m.queryResult.rows.slice(0, 10)
            })
          : undefined
      }));

      // Step 1: Call /api/chat/process
      setChatLoadingStep('Inspecting schema & generating SQL with Gemini...');
      const processRes = await fetch(apiUrl('/api/chat/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          schemaContext: schemaCtx,
          conversationHistory: historyContext,
          databaseId: activeDatabase?.id,
          databaseName: activeDatabase?.name,
          databaseType: activeDatabase?.type,
          databaseCategory: activeDatabase?.templateName
        })
      });

      if (!processRes.ok) {
        throw new Error('Failed to communicate with AI query processor');
      }

      const processData = await processRes.json();
      const intent: AIIntent = processData.intent || 'DATA_QUERY';

      // 2. Handle Greeting, Clarification, or SQL Explanation when no SQL execution is required
      if (
        intent === 'GREETING' ||
        intent === 'CLARIFICATION_NEEDED' ||
        intent === 'EXPLAIN_SQL' ||
        (intent === 'GENERAL_CONVERSATION' && !processData.sql)
      ) {
        const assistantMsg: Message = {
          id: `msg_a_${Date.now()}`,
          conversationId: targetConvId,
          role: 'assistant',
          content: processData.content,
          intent,
          sql: processData.sql || undefined,
          clarificationOptions: processData.clarificationOptions,
          suggestedFollowUps: [],
          error: processData.error,
          createdAt: new Date().toISOString()
        };

        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        await PersistenceService.saveMessages(targetConvId, finalMessages);
        setIsChatLoading(false);
        return;
      }

      // If SQL validation blocked a destructive query on the server
      if (processData.error && !processData.sql) {
        const blockedMsg: Message = {
          id: `msg_a_${Date.now()}`,
          conversationId: targetConvId,
          role: 'assistant',
          content: processData.content || processData.error,
          intent: 'DATA_QUERY',
          error: processData.error,
          suggestedFollowUps: [],
          createdAt: new Date().toISOString()
        };
        const finalMessages = [...updatedMessages, blockedMsg];
        setMessages(finalMessages);
        await PersistenceService.saveMessages(targetConvId, finalMessages);
        setIsChatLoading(false);
        return;
      }

      // 3. Handle Data Query / SQL Execution against the selected database
      let generatedSql = processData.sql || '';
      let detectedIntent: DetectedIntent | undefined = processData.intentDetection;

      // Pre-Execution Semantic Intent Validation before running against SQLite
      if (generatedSql && schemaCtx) {
        const semValidation = validateSqlSemantics(
          queryText,
          generatedSql,
          schemaCtx,
          historyContext,
          detectedIntent
        );
        if (!semValidation.valid) {
          const synthesized = synthesizeGroupedOrOverallSql(semValidation.intent);
          if (synthesized) {
            generatedSql = synthesized.sql;
            processData.content = synthesized.description;
            detectedIntent = {
              operation: synthesized.operation,
              isGrouped: semValidation.intent.requiresGroupBy,
              groupByColumns: semValidation.intent.groupingDimensions.map(d => d.columnName),
              requestedRowCount: semValidation.intent.requestedLimit || 0,
              requiresVisualization: synthesized.requiresVisualization,
              recommendedVisualization: synthesized.recommendedVisualization,
              outputFormat: synthesized.outputFormat
            };
            processData.chartRecommendation = {
              type: synthesized.recommendedVisualization,
              title: synthesized.chartTitle,
              xKey: synthesized.xKey,
              yKeys: synthesized.yKeys
            };
          }
        }
      }

      let queryResult: QueryResult = {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0
      };

      if (generatedSql && activeDatabase) {
        setChatLoadingStep(`Executing SQL against "${activeDatabase.name}"...`);
        queryResult = await SQLiteEngine.executeQuery(
          activeDatabase.id,
          generatedSql,
          activeDatabase.templateId
        );
        if (queryResult.healedSql) {
          generatedSql = queryResult.healedSql;
        }

        // Self-healing via Gemini /api/sql/repair if SQLite execution failed with a schema/syntax error
        if (queryResult.error && !queryResult.error.includes('Security Policy Violation')) {
          setChatLoadingStep('Self-healing SQL query against schema...');
          try {
            const repairRes = await fetch(apiUrl('/api/sql/repair'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: queryText,
                failedSql: generatedSql,
                sqlError: queryResult.error,
                schemaContext: schemaCtx,
                databaseId: activeDatabase.id,
                databaseName: activeDatabase.name,
                conversationHistory: historyContext
              })
            });
            if (repairRes.ok) {
              const repairData = await repairRes.json();
              if (repairData.repairedSql && repairData.repairedSql !== generatedSql) {
                const retryResult = await SQLiteEngine.executeQuery(
                  activeDatabase.id,
                  repairData.repairedSql,
                  activeDatabase.templateId
                );
                if (!retryResult.error) {
                  generatedSql = retryResult.healedSql || repairData.repairedSql;
                  queryResult = {
                    ...retryResult,
                    healedSql: generatedSql
                  };
                }
              }
            }
          } catch (repairErr) {
            console.warn('SQL repair attempt skipped:', repairErr);
          }
        }
      }

      // 4. Synthesize initial structured answer and KPI metrics based on actual SQL execution results
      let structuredAnswer: StructuredAnswer = formulateStructuredAnswer(
        queryText,
        detectedIntent,
        queryResult,
        processData.content,
        generatedSql
      );

      let finalContent = structuredAnswer.headline;
      let finalKpis = (structuredAnswer.keyMetrics && structuredAnswer.keyMetrics.length > 0)
        ? structuredAnswer.keyMetrics
        : ((processData.kpis && processData.kpis.length > 0)
          ? processData.kpis
          : (queryResult.rowCount > 0 ? synthesizeInstantMetrics(queryResult.columns, queryResult.rows, queryResult.rowCount) : []));

      // 5. Grounded Result Interpretation via Gemini (/api/chat/interpret)
      if (queryResult && !queryResult.error && queryResult.rowCount > 0) {
        setChatLoadingStep('Interpreting query results with Gemini...');
        try {
          const interpRes = await fetch(apiUrl('/api/chat/interpret'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              databaseId: activeDatabase?.id,
              databaseName: activeDatabase?.name,
              query: queryText,
              sql: generatedSql,
              columns: queryResult.columns,
              rows: queryResult.rows.slice(0, 25),
              rowCount: queryResult.rowCount
            })
          });
          if (interpRes.ok) {
            const interpData = await interpRes.json();
            if (interpData) {
              const groundedHeadline = interpData.headline || structuredAnswer.headline;
              const observationsText = Array.isArray(interpData.observations) && interpData.observations.length > 0
                ? `\n\nKey Observations:\n• ${interpData.observations.join('\n• ')}`
                : '';
              const groundedInsight = (interpData.interpretation || structuredAnswer.detailedInsight) + observationsText;

              structuredAnswer = {
                ...structuredAnswer,
                headline: groundedHeadline,
                detailedInsight: groundedInsight,
                keyMetrics: Array.isArray(interpData.kpis) && interpData.kpis.length > 0
                  ? interpData.kpis
                  : structuredAnswer.keyMetrics
              };
              finalContent = groundedHeadline;
              if (Array.isArray(interpData.kpis) && interpData.kpis.length > 0) {
                finalKpis = interpData.kpis;
              }
            }
          }
        } catch (interpErr) {
          console.warn('Result interpretation fallback used:', interpErr);
        }
      }

      // 6. Construct Assistant Message and persist
      const assistantMsgId = `msg_a_${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantMsgId,
        conversationId: targetConvId,
        role: 'assistant',
        content: finalContent,
        intent,
        detectedIntent,
        structuredAnswer,
        sql: generatedSql,
        queryResult,
        chartConfig: processData.chartRecommendation,
        kpis: finalKpis,
        suggestedFollowUps: [],
        error: queryResult.error,
        createdAt: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      await PersistenceService.saveMessages(targetConvId, finalMessages);
      setIsChatLoading(false);

      // Update Conversation title if first message
      if (currentHistory.length === 0) {
        const title = queryText.length > 36 ? queryText.slice(0, 36) + '...' : queryText;
        const updatedConvs = conversations.map(c =>
          c.id === targetConvId
            ? { ...c, title, messageCount: finalMessages.length, lastMessageSnippet: finalContent.slice(0, 60) }
            : c
        );
        setConversations(updatedConvs);
        await PersistenceService.saveConversations(currentUser.id, updatedConvs);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errorMsg: Message = {
        id: `msg_err_${Date.now()}`,
        conversationId: targetConvId,
        role: 'assistant',
        content: `Error processing query: ${errMsg}`,
        error: errMsg,
        createdAt: new Date().toISOString()
      };
      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);
      await PersistenceService.saveMessages(targetConvId, finalMessages);
    } finally {
      setIsChatLoading(false);
      setChatLoadingStep('');
    }
  };

  const handleSendMessage = async (queryText: string) => {
    let targetConvId = activeConversationId;
    let history = messages;

    if (!targetConvId) {
      if (!currentUser) return;
      targetConvId = `conv_${Date.now()}`;
      const newConv: Conversation = {
        id: targetConvId,
        userId: currentUser.id,
        title: queryText.slice(0, 36) + '...',
        databaseId: activeDatabase?.id || '',
        databaseName: activeDatabase?.name || 'Default Database',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0
      };
      const updated = [newConv, ...conversations];
      setConversations(updated);
      setActiveConversationId(targetConvId);
      await PersistenceService.saveConversations(currentUser.id, updated);
      history = [];
    }

    await executeChatMessage(targetConvId, queryText, history);
  };

  // Launch chat from other views with prefilled query
  const handleStartChatWithQuery = (query: string) => {
    setCurrentView('chat');
    if (query) {
      handleSendMessage(query);
    }
  };

  // Active Conversation Object
  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;

  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#060814] text-cyan-600 dark:text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
          <span className="font-mono text-xs text-slate-400">Loading QueryWise Workspace...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated screen
  if (!currentUser) {
    return (
      <>
        <ThreeBackground />
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060814] text-slate-800 dark:text-slate-100 flex flex-col relative selection:bg-cyan-500/30 selection:text-cyan-900 dark:selection:text-cyan-200 transition-colors duration-200">
      {/* 1. Global Live 3D Wallpaper */}
      <ThreeBackground />

      {/* 2. Global Navbar */}
      <Navbar
        user={currentUser}
        activeDatabase={activeDatabase}
        onOpenDatabaseManager={() => setCurrentView('db-manager')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHelp={() => setCurrentView('guide')}
        onRefresh={handleRefresh}
        onLogout={handleLogout}
        isRefreshing={isRefreshing}
        onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />

      {/* 3. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={view => setCurrentView(view)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={id => {
            setActiveConversationId(id);
            setCurrentView('chat');
          }}
          onNewConversation={() => handleNewConversation()}
          onDeleteConversation={handleDeleteConversation}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Central View Area */}
        <main className={`flex-1 lg:pl-64 flex flex-col ${currentView === 'chat' ? 'overflow-hidden p-0 h-[calc(100vh-3.5rem)]' : 'overflow-y-auto px-4 py-6 sm:px-6'}`}>
          {currentView === 'dashboard' && (
            <DashboardView
              activeDatabase={activeDatabase}
              databases={databases}
              conversations={conversations}
              allMessages={messages}
              onStartChatWithQuery={handleStartChatWithQuery}
              onOpenExplorer={() => setCurrentView('db-explorer')}
              onOpenInsights={() => setCurrentView('insights')}
              onOpenDatabaseManager={() => setCurrentView('db-manager')}
              onSelectConversation={id => {
                setActiveConversationId(id);
                setCurrentView('chat');
              }}
              onDeleteConversation={handleDeleteConversation}
            />
          )}

          {currentView === 'chat' && (
            <ChatWorkspace
              activeDatabase={activeDatabase}
              activeConversation={activeConversation}
              messages={messages}
              databases={databases}
              onSelectDatabase={handleSelectDatabase}
              onSendMessage={handleSendMessage}
              onClearConversation={handleClearCurrentConversation}
              onOpenDatabaseManager={() => setCurrentView('db-manager')}
              isLoading={isChatLoading}
              loadingStep={chatLoadingStep}
            />
          )}

          {(currentView === 'db-manager' || currentView === 'managed-dbs') && (
            <DatabaseManagerView
              databases={databases}
              activeDatabase={activeDatabase}
              onSelectDatabase={handleSelectDatabase}
              onAddDatabase={handleAddDatabase}
              onDeleteDatabase={handleDeleteDatabase}
            />
          )}

          {currentView === 'db-explorer' && (
            <DatabaseExplorerView
              activeDatabase={activeDatabase}
              onQueryTable={tableName => {
                handleStartChatWithQuery(`Show me the schema and sample data for table "${tableName}"`);
              }}
              onOpenDatabaseManager={() => setCurrentView('db-manager')}
            />
          )}

          {currentView === 'insights' && (
            <DataInsightsView
              activeDatabase={activeDatabase}
              onOpenChatWithQuery={handleStartChatWithQuery}
              onOpenDatabaseManager={() => setCurrentView('db-manager')}
            />
          )}

          {currentView === 'guide' && (
            <UserGuideView
              onStartChat={() => setCurrentView('chat')}
              onOpenDatabaseManager={() => setCurrentView('db-manager')}
            />
          )}

          {currentView === 'settings' && (
            <div className="py-4">
              <SettingsModal
                isOpen={true}
                onClose={() => setCurrentView('dashboard')}
                user={currentUser}
                onUpdateUser={updated => {
                  setCurrentUser(updated);
                  PersistenceService.saveUser(updated);
                }}
                onLogout={handleLogout}
              />
            </div>
          )}
        </main>
      </div>

      {/* 4. Onboarding Modal Wizard */}
      {showOnboarding && currentUser && (
        <OnboardingModal
          user={currentUser}
          isFirstLogin={isFirstLogin}
          onComplete={handleOnboardingComplete}
          onSkipToDashboard={handleSkipWelcome}
        />
      )}

      {/* 5. Settings Modal (from Navbar click) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={currentUser}
        onUpdateUser={updated => {
          setCurrentUser(updated);
          PersistenceService.saveUser(updated);
        }}
        onLogout={handleLogout}
      />
    </div>
  );
}
