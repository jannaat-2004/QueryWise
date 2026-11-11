import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, Conversation, Message, DatabaseInstance } from '../types';
import { apiUrl } from './api';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseUrl = /^https?:\/\//i.test(rawSupabaseUrl) ? rawSupabaseUrl : '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  /^https?:\/\//i.test(supabaseUrl) &&
  supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key'
);

let supabaseInstance: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn('Supabase client init failed:', e);
  }
}
export const supabase: SupabaseClient | null = supabaseInstance;

// Track whether the remote Supabase project has QueryWise tables provisioned
let supabaseSchemaReady = isSupabaseConfigured;
function checkSupabaseError(error: { code?: string; status?: number } | null | undefined) {
  if (!error) return;
  if (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.code === '22P02' ||
    error.status === 404
  ) {
    supabaseSchemaReady = false;
  }
}

// Storage keys
const STORAGE_USER = 'querywise_auth_user';
const STORAGE_TOKEN = 'querywise_session_token';
const STORAGE_CONVERSATIONS = 'querywise_conversations';
const STORAGE_MESSAGES_PREFIX = 'querywise_messages_';
const STORAGE_DATABASES = 'querywise_databases';
const STORAGE_ACTIVE_DB = 'querywise_active_db_id';

export class PersistenceService {
  // Authentication & Profile (Direct Database, No Email Verification Required)
  static async getCurrentUser(): Promise<UserProfile | null> {
    // 1. Primary: Server database session check
    const token = localStorage.getItem(STORAGE_TOKEN);
    if (token) {
      try {
        const res = await fetch(apiUrl('/api/auth/session'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            localStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
            return data.user;
          }
        } else {
          // Token invalid or expired
          localStorage.removeItem(STORAGE_TOKEN);
          localStorage.removeItem(STORAGE_USER);
          return null;
        }
      } catch {
        // Fallback to cached user if network temporarily unavailable
      }
    }

    // 2. Local storage cached user
    const raw = localStorage.getItem(STORAGE_USER);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return null;
  }

  static async saveUser(user: UserProfile | null, token?: string) {
    if (!user) {
      const currentToken = localStorage.getItem(STORAGE_TOKEN);
      if (currentToken) {
        try {
          await fetch(apiUrl('/api/auth/logout'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${currentToken}` }
          });
        } catch {
          // Ignore network errors on logout
        }
      }
      localStorage.removeItem(STORAGE_USER);
      localStorage.removeItem(STORAGE_TOKEN);
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      }
      return;
    }

    if (token) {
      localStorage.setItem(STORAGE_TOKEN, token);
    } else if (user.id && user.fullName) {
      try {
        await fetch(apiUrl('/api/auth/update-profile'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, fullName: user.fullName })
        });
      } catch {
        // Ignore network errors on profile update
      }
    }
    localStorage.setItem(STORAGE_USER, JSON.stringify(user));

    if (supabaseSchemaReady && supabase) {
      try {
        const { error } = await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          onboarding_completed: user.onboardingCompleted,
          updated_at: new Date().toISOString()
        });
        checkSupabaseError(error);
      } catch (e) {
        console.warn('Supabase profile sync failed:', e);
      }
    }
  }

  static async completeOnboarding(userId: string) {
    try {
      await fetch(apiUrl('/api/auth/complete-onboarding'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
    } catch {
      // Ignore network errors
    }
  }

  static async completeWelcome(userId: string) {
    try {
      await fetch(apiUrl('/api/auth/complete-welcome'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
    } catch {
      // Ignore network errors
    }
  }

  // Database Metadata
  static async getDatabases(userId: string): Promise<DatabaseInstance[]> {
    const isSupportedDatabase = (d: { id?: string; type?: string; templateId?: string; template_id?: string }) => {
      if (d.type === 'demo') {
        const tId = d.templateId || d.template_id;
        if (tId && tId !== 'retail-sales' && tId !== 'sales-analytics') return false;
        if (d.id && /hospital-mgmt|hr-analytics|ecommerce-platform|education-students|banking-finance/i.test(d.id)) return false;
      }
      return true;
    };

    if (supabaseSchemaReady && supabase) {
      try {
        const { data, error } = await supabase
          .from('managed_databases')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        checkSupabaseError(error);
        if (data && data.length > 0) {
          return data
            .filter(isSupportedDatabase)
            .map(d => ({
              id: d.id,
              name: d.name,
              type: d.type,
              templateId: d.template_id,
              templateName: d.template_name,
              tables: d.tables_schema || [],
              createdAt: d.created_at,
              updatedAt: d.updated_at,
              fileSize: d.file_size
            }));
        }
      } catch (err) {
        console.warn('Supabase fetch databases failed:', err);
      }
    }

    const raw = localStorage.getItem(`${STORAGE_DATABASES}_${userId}`);
    if (raw) {
      try {
        const parsed: DatabaseInstance[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(isSupportedDatabase);
          if (filtered.length !== parsed.length) {
            for (const removed of parsed) {
              if (!isSupportedDatabase(removed) && removed.id) {
                localStorage.removeItem(`querywise_db_blob_${removed.id}`);
              }
            }
            localStorage.setItem(`${STORAGE_DATABASES}_${userId}`, JSON.stringify(filtered));
          }
          return filtered;
        }
        return [];
      } catch {
        return [];
      }
    }
    return [];
  }

  static async saveDatabases(userId: string, dbs: DatabaseInstance[]) {
    localStorage.setItem(`${STORAGE_DATABASES}_${userId}`, JSON.stringify(dbs));
    if (supabaseSchemaReady && supabase) {
      try {
        for (const db of dbs) {
          const { error } = await supabase.from('managed_databases').upsert({
            id: db.id,
            user_id: userId,
            name: db.name,
            type: db.type,
            template_id: db.templateId,
            template_name: db.templateName,
            tables_schema: db.tables,
            file_size: db.fileSize,
            updated_at: new Date().toISOString()
          });
          checkSupabaseError(error);
          if (!supabaseSchemaReady) break;
        }
      } catch (e) {
        console.warn('Supabase database sync failed:', e);
      }
    }
  }

  static async deleteDatabase(userId: string, dbId: string) {
    const list = await this.getDatabases(userId);
    const updated = list.filter(d => d.id !== dbId);
    await this.saveDatabases(userId, updated);

    if (supabaseSchemaReady && supabase) {
      try {
        const { error } = await supabase.from('managed_databases').delete().eq('id', dbId);
        checkSupabaseError(error);
      } catch (e) {
        console.warn('Supabase db delete error:', e);
      }
    }
  }

  static getActiveDatabaseId(userId: string): string | null {
    return localStorage.getItem(`${STORAGE_ACTIVE_DB}_${userId}`) || null;
  }

  static setActiveDatabaseId(userId: string, dbId: string | null) {
    if (!dbId) {
      localStorage.removeItem(`${STORAGE_ACTIVE_DB}_${userId}`);
    } else {
      localStorage.setItem(`${STORAGE_ACTIVE_DB}_${userId}`, dbId);
    }
  }

  // Conversations
  static async getConversations(userId: string): Promise<Conversation[]> {
    if (supabaseSchemaReady && supabase) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        checkSupabaseError(error);
        if (data && data.length > 0) {
          return data.map(c => ({
            id: c.id,
            userId: c.user_id,
            title: c.title,
            databaseId: c.database_id,
            databaseName: c.database_name,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            messageCount: c.message_count || 0,
            lastMessageSnippet: c.last_snippet
          }));
        }
      } catch (err) {
        console.warn('Supabase conversations fetch failed:', err);
      }
    }

    const raw = localStorage.getItem(`${STORAGE_CONVERSATIONS}_${userId}`);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return [];
  }

  static async saveConversations(userId: string, convs: Conversation[]) {
    localStorage.setItem(`${STORAGE_CONVERSATIONS}_${userId}`, JSON.stringify(convs));
    if (supabaseSchemaReady && supabase) {
      try {
        for (const c of convs) {
          const { error } = await supabase.from('conversations').upsert({
            id: c.id,
            user_id: userId,
            title: c.title,
            database_id: c.databaseId,
            database_name: c.databaseName,
            message_count: c.messageCount,
            last_snippet: c.lastMessageSnippet,
            updated_at: new Date().toISOString()
          });
          checkSupabaseError(error);
          if (!supabaseSchemaReady) break;
        }
      } catch (e) {
        console.warn('Supabase save conversations failed:', e);
      }
    }
  }

  static async deleteConversation(userId: string, convId: string) {
    const list = await this.getConversations(userId);
    const updated = list.filter(c => c.id !== convId);
    await this.saveConversations(userId, updated);
    localStorage.removeItem(`${STORAGE_MESSAGES_PREFIX}${convId}`);

    if (supabaseSchemaReady && supabase) {
      try {
        await supabase.from('messages').delete().eq('conversation_id', convId);
        await supabase.from('conversations').delete().eq('id', convId);
      } catch (e) {
        console.warn('Supabase conv delete error:', e);
      }
    }
  }

  // Messages
  static async getMessages(convId: string): Promise<Message[]> {
    if (supabaseSchemaReady && supabase) {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true });
        checkSupabaseError(error);
        if (data && data.length > 0) {
          return data.map(m => ({
            id: m.id,
            conversationId: m.conversation_id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
            intent: m.intent,
            sql: m.sql,
            optimizedSql: m.optimized_sql,
            sqlExplanation: m.sql_explanation,
            queryResult: m.query_result,
            chartConfig: m.chart_config,
            kpis: m.kpis,
            clarificationOptions: m.clarification_options,
            suggestedFollowUps: m.suggested_follow_ups,
            error: m.error
          }));
        }
      } catch (err) {
        console.warn('Supabase messages fetch failed:', err);
      }
    }

    const raw = localStorage.getItem(`${STORAGE_MESSAGES_PREFIX}${convId}`);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return [];
  }

  static async saveMessages(convId: string, messages: Message[]) {
    localStorage.setItem(`${STORAGE_MESSAGES_PREFIX}${convId}`, JSON.stringify(messages));
    if (supabaseSchemaReady && supabase) {
      try {
        for (const m of messages) {
          const { error } = await supabase.from('messages').upsert({
            id: m.id,
            conversation_id: convId,
            role: m.role,
            content: m.content,
            intent: m.intent,
            sql: m.sql,
            optimized_sql: m.optimizedSql,
            sql_explanation: m.sqlExplanation,
            query_result: m.queryResult,
            chart_config: m.chartConfig,
            kpis: m.kpis,
            clarification_options: m.clarificationOptions,
            suggested_follow_ups: m.suggestedFollowUps,
            error: m.error,
            created_at: m.createdAt
          });
          checkSupabaseError(error);
          if (!supabaseSchemaReady) break;
        }
      } catch (e) {
        console.warn('Supabase save messages failed:', e);
      }
    }
  }
}

export const SUPABASE_SETUP_SQL = `-- QueryWise Supabase Database Schema & RLS Policies
-- Run this in your Supabase SQL Editor if you are using your own Supabase instance.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS managed_databases (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  template_id TEXT,
  template_name TEXT,
  tables_schema JSONB DEFAULT '[]'::jsonb,
  file_size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  database_id TEXT NOT NULL,
  database_name TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  last_snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  sql TEXT,
  optimized_sql TEXT,
  sql_explanation TEXT,
  query_result JSONB,
  chart_config JSONB,
  kpis JSONB,
  clarification_options JSONB,
  suggested_follow_ups JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE managed_databases ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Policies for managed_databases
CREATE POLICY "Users can view own databases" ON managed_databases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own databases" ON managed_databases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own databases" ON managed_databases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own databases" ON managed_databases FOR DELETE USING (auth.uid() = user_id);

-- Policies for conversations
CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON conversations FOR DELETE USING (auth.uid() = user_id);

-- Policies for messages
CREATE POLICY "Users can manage own messages" ON messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);
`;
