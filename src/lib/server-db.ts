import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ override: true });

export interface DbUser {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  onboardingCompleted: boolean;
  firstLoginCompleted: boolean;
  loginCount: number;
}

interface StoredUserRecord {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  full_name: string;
  created_at: string;
  onboarding_completed: number;
  first_login_completed: number;
  login_count: number;
}

interface StoredSessionRecord {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

interface StoredPasswordResetRecord {
  email: string;
  code: string;
  expires_at: string;
}

interface AuthStoreData {
  users: Record<string, StoredUserRecord>;
  sessions: Record<string, StoredSessionRecord>;
  passwordResets: Record<string, StoredPasswordResetRecord>;
}

interface SignedAccountProofPayload {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  onboardingCompleted: boolean;
  firstLoginCompleted: boolean;
  loginCount: number;
}

interface SignedSessionPayload {
  user: DbUser;
  exp: number;
}

/**
 * Resolve a writable JSON persistence path across local dev, Docker/Render/Railway, and Vercel Serverless (/tmp).
 * Avoids any dependency on experimental `node:sqlite` or native C++ addons so Vercel Serverless Functions
 * start instantaneously on Node 18, 20, 22, and 24 without `FUNCTION_INVOCATION_FAILED`.
 */
function resolveWritableStorePath(): string | null {
  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY
  );

  if (!isServerless) {
    try {
      const localDataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(localDataDir)) {
        fs.mkdirSync(localDataDir, { recursive: true });
      }
      const testFile = path.join(localDataDir, '.write-test');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return path.join(localDataDir, 'querywise_auth.json');
    } catch {
      // Fall back to os.tmpdir() if working directory is read-only
    }
  }

  try {
    const tmpDataDir = path.join(os.tmpdir(), 'querywise-data');
    if (!fs.existsSync(tmpDataDir)) {
      fs.mkdirSync(tmpDataDir, { recursive: true });
    }
    return path.join(tmpDataDir, 'querywise_auth.json');
  } catch {
    return null;
  }
}

const storeFilePath = resolveWritableStorePath();

const memoryStore: AuthStoreData = {
  users: {},
  sessions: {},
  passwordResets: {}
};

function loadStoreFromDisk(): void {
  if (!storeFilePath) return;
  try {
    if (fs.existsSync(storeFilePath)) {
      const raw = fs.readFileSync(storeFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AuthStoreData>;
      if (parsed.users && typeof parsed.users === 'object') {
        Object.assign(memoryStore.users, parsed.users);
      }
      if (parsed.sessions && typeof parsed.sessions === 'object') {
        Object.assign(memoryStore.sessions, parsed.sessions);
      }
      if (parsed.passwordResets && typeof parsed.passwordResets === 'object') {
        Object.assign(memoryStore.passwordResets, parsed.passwordResets);
      }
    }
  } catch {
    // Ignore corrupted or concurrent read errors; in-memory + HMAC tokens remain authoritative
  }
}

function saveStoreToDisk(): void {
  if (!storeFilePath) return;
  try {
    fs.writeFileSync(storeFilePath, JSON.stringify(memoryStore, null, 2), 'utf8');
  } catch {
    // Ignore write errors on ephemeral/read-only filesystems
  }
}

// Initial load
loadStoreFromDisk();

const revokedTokens = new Set<string>();

function getSigningSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.GEMINI_API_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'querywise-production-hmac-secret-v1'
  );
}

function signPayload(prefix: string, payloadObj: unknown): string {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${prefix}.${payloadB64}`)
    .digest('base64url');
  return `${prefix}.${payloadB64}.${sig}`;
}

function verifySignedPayload<T>(token: string, expectedPrefix: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== expectedPrefix) return null;
    const [, payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(`${expectedPrefix}.${payloadB64}`)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T;
    return parsed;
  } catch {
    return null;
  }
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): { hash: string; salt: string } {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
  } catch {
    return false;
  }
}

function resolveValidSupabaseUrl(): string {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL
  ];
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed && /^https?:\/\//i.test(trimmed) && trimmed !== 'https://your-project.supabase.co') {
      return trimmed;
    }
  }
  return '';
}

const SUPABASE_URL = resolveValidSupabaseUrl();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

let supabaseClient: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'your-anon-key' && SUPABASE_ANON_KEY !== 'your-supabase-anon-key') {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase client initialization skipped:', e);
  }
}

function findUserById(userId: string): StoredUserRecord | undefined {
  loadStoreFromDisk();
  for (const u of Object.values(memoryStore.users)) {
    if (u.id === userId) return u;
  }
  return undefined;
}

export class ServerAuthDatabase {
  /**
   * Re-hydrate a signed account proof into the store if cold-started on Serverless
   */
  static restoreAccountProofIfNeeded(accountProof?: string): void {
    if (!accountProof) return;
    const payload = verifySignedPayload<SignedAccountProofPayload>(accountProof, 'qwa1');
    if (!payload || !payload.email || !payload.passwordHash || !payload.passwordSalt) return;

    const cleanEmail = payload.email.trim().toLowerCase();
    loadStoreFromDisk();
    if (!memoryStore.users[cleanEmail]) {
      memoryStore.users[cleanEmail] = {
        id: payload.id,
        email: cleanEmail,
        password_hash: payload.passwordHash,
        password_salt: payload.passwordSalt,
        full_name: payload.fullName,
        created_at: payload.createdAt,
        onboarding_completed: payload.onboardingCompleted ? 1 : 0,
        first_login_completed: payload.firstLoginCompleted ? 1 : 0,
        login_count: payload.loginCount ?? 0
      };
      saveStoreToDisk();
    }
  }

  private static createAccountProof(row: StoredUserRecord): string {
    const proofPayload: SignedAccountProofPayload = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      createdAt: row.created_at,
      onboardingCompleted: Boolean(row.onboarding_completed),
      firstLoginCompleted: Boolean(row.first_login_completed),
      loginCount: row.login_count ?? 0
    };
    return signPayload('qwa1', proofPayload);
  }

  /**
   * Register a new user in the database
   */
  static async register(
    email: string,
    password: string,
    fullName: string,
    accountProof?: string
  ): Promise<{ user: DbUser; token: string; accountProof: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || cleanEmail.split('@')[0];

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Valid email address is required.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    loadStoreFromDisk();
    this.restoreAccountProofIfNeeded(accountProof);

    const existing = memoryStore.users[cleanEmail];
    if (existing) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }

    const { hash, salt } = hashPassword(password);
    const userId = `usr_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const newRecord: StoredUserRecord = {
      id: userId,
      email: cleanEmail,
      password_hash: hash,
      password_salt: salt,
      full_name: cleanName,
      created_at: createdAt,
      onboarding_completed: 0,
      first_login_completed: 0,
      login_count: 0
    };

    if (supabaseClient) {
      try {
        const { error } = await supabaseClient.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: cleanName } }
        });
        if (error && /already registered|already exists/i.test(error.message)) {
          throw new Error('An account with this email already exists. Please sign in instead.');
        }
      } catch (sbErr: unknown) {
        if (sbErr instanceof Error && sbErr.message.includes('already exists')) {
          throw sbErr;
        }
        console.warn('Supabase mirror note:', sbErr);
      }
    }

    memoryStore.users[cleanEmail] = newRecord;
    saveStoreToDisk();

    const generatedProof = this.createAccountProof(newRecord);

    return {
      token: '',
      accountProof: generatedProof,
      user: {
        id: userId,
        email: cleanEmail,
        fullName: cleanName,
        createdAt,
        onboardingCompleted: false,
        firstLoginCompleted: false,
        loginCount: 0
      }
    };
  }

  /**
   * Authenticate user with email and password
   */
  static async login(
    email: string,
    password: string,
    accountProof?: string
  ): Promise<{ user: DbUser; token: string; isFirstLogin: boolean; accountProof: string }> {
    const cleanEmail = email.trim().toLowerCase();
    loadStoreFromDisk();
    this.restoreAccountProofIfNeeded(accountProof);

    let row = memoryStore.users[cleanEmail];
    let isValid = false;

    if (row) {
      isValid = verifyPassword(password, row.password_hash, row.password_salt);
    }

    if (!isValid && supabaseClient) {
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (data?.user || (error && error.code === 'email_not_confirmed')) {
          const { hash, salt } = hashPassword(password);
          const userId = data?.user?.id || row?.id || `usr_${crypto.randomUUID()}`;
          const cleanName = data?.user?.user_metadata?.full_name || row?.full_name || cleanEmail.split('@')[0];
          const createdAt = data?.user?.created_at || row?.created_at || new Date().toISOString();

          row = {
            id: userId,
            email: cleanEmail,
            password_hash: hash,
            password_salt: salt,
            full_name: cleanName,
            created_at: createdAt,
            onboarding_completed: row?.onboarding_completed ?? 0,
            first_login_completed: row?.first_login_completed ?? 0,
            login_count: row?.login_count ?? 0
          };
          memoryStore.users[cleanEmail] = row;
          saveStoreToDisk();
          isValid = true;
        } else if (error && error.code === 'invalid_credentials') {
          if (row) {
            throw new Error('Invalid password. Please check your credentials or click "Forgot password?".');
          }
        }
      } catch (sbErr: unknown) {
        if (sbErr instanceof Error && sbErr.message.includes('Invalid password')) {
          throw sbErr;
        }
        console.warn('Supabase bridge error:', sbErr);
      }
    }

    if (!row) {
      throw new Error('No account found with this email. Please click "Sign Up" to create an account in seconds.');
    }

    if (!isValid) {
      throw new Error('Invalid password. Please check your credentials or click "Forgot password?".');
    }

    const prevLoginCount = row.login_count ?? 0;
    const isFirstLogin = prevLoginCount === 0 || !Boolean(row.first_login_completed);
    const newLoginCount = prevLoginCount + 1;

    row.login_count = newLoginCount;
    memoryStore.users[cleanEmail] = row;

    const user: DbUser = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      createdAt: row.created_at,
      onboardingCompleted: Boolean(row.onboarding_completed),
      firstLoginCompleted: Boolean(row.first_login_completed),
      loginCount: newLoginCount
    };

    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const token = signPayload('qws1', {
      user,
      exp: expires.getTime()
    } satisfies SignedSessionPayload);

    memoryStore.sessions[token] = {
      token,
      user_id: row.id,
      created_at: now.toISOString(),
      expires_at: expires.toISOString()
    };
    saveStoreToDisk();

    const updatedAccountProof = this.createAccountProof(row);

    return {
      token,
      isFirstLogin,
      user,
      accountProof: updatedAccountProof
    };
  }

  /**
   * Validate session token (supports both local store lookup and stateless HMAC token verification across serverless cold starts)
   */
  static validateSession(token: string): DbUser | null {
    if (!token || revokedTokens.has(token)) return null;
    loadStoreFromDisk();
    const nowIso = new Date().toISOString();

    const session = memoryStore.sessions[token];
    if (session && session.expires_at > nowIso) {
      const userRow = findUserById(session.user_id);
      if (userRow) {
        return {
          id: userRow.id,
          email: userRow.email,
          fullName: userRow.full_name,
          createdAt: userRow.created_at,
          onboardingCompleted: Boolean(userRow.onboarding_completed),
          firstLoginCompleted: Boolean(userRow.first_login_completed),
          loginCount: userRow.login_count ?? 1
        };
      }
    }

    const stateless = verifySignedPayload<SignedSessionPayload>(token, 'qws1');
    if (stateless && stateless.user && stateless.exp > Date.now()) {
      return stateless.user;
    }

    return null;
  }

  /**
   * Terminate session
   */
  static logout(token: string): void {
    if (!token) return;
    revokedTokens.add(token);
    loadStoreFromDisk();
    if (memoryStore.sessions[token]) {
      delete memoryStore.sessions[token];
      saveStoreToDisk();
    }
  }

  /**
   * Generate password reset code
   */
  static async requestPasswordReset(email: string, accountProof?: string): Promise<{ code: string }> {
    const cleanEmail = email.trim().toLowerCase();
    loadStoreFromDisk();
    this.restoreAccountProofIfNeeded(accountProof);
    let user = memoryStore.users[cleanEmail];

    if (!user && supabaseClient) {
      const userId = `usr_${crypto.randomUUID()}`;
      const { hash, salt } = hashPassword('temp-reset-password');
      user = {
        id: userId,
        email: cleanEmail,
        password_hash: hash,
        password_salt: salt,
        full_name: cleanEmail.split('@')[0],
        created_at: new Date().toISOString(),
        onboarding_completed: 0,
        first_login_completed: 0,
        login_count: 0
      };
      memoryStore.users[cleanEmail] = user;
    }

    if (!user) {
      throw new Error('No account found with this email address.');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    memoryStore.passwordResets[cleanEmail] = {
      email: cleanEmail,
      code,
      expires_at: expires
    };
    saveStoreToDisk();

    return { code };
  }

  /**
   * Reset password
   */
  static async resetPassword(
    email: string,
    newPassword: string,
    code?: string,
    accountProof?: string
  ): Promise<{ accountProof: string }> {
    const cleanEmail = email.trim().toLowerCase();
    loadStoreFromDisk();
    this.restoreAccountProofIfNeeded(accountProof);

    const user = memoryStore.users[cleanEmail];
    if (!user) {
      throw new Error('No account found with this email address.');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    if (code) {
      const reset = memoryStore.passwordResets[cleanEmail];
      if (!reset || reset.code !== code || reset.expires_at <= new Date().toISOString()) {
        throw new Error('Invalid or expired verification code.');
      }
    }

    const { hash, salt } = hashPassword(newPassword);
    user.password_hash = hash;
    user.password_salt = salt;
    memoryStore.users[cleanEmail] = user;
    delete memoryStore.passwordResets[cleanEmail];
    saveStoreToDisk();

    const newProof = this.createAccountProof(user);
    return { accountProof: newProof };
  }

  /**
   * Update full name
   */
  static updateProfile(userId: string, fullName: string): DbUser {
    const cleanName = fullName.trim();
    const updated = findUserById(userId);

    if (!updated) {
      return {
        id: userId,
        email: '',
        fullName: cleanName,
        createdAt: new Date().toISOString(),
        onboardingCompleted: true,
        firstLoginCompleted: true,
        loginCount: 1
      };
    }

    updated.full_name = cleanName;
    memoryStore.users[updated.email] = updated;
    saveStoreToDisk();

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.full_name,
      createdAt: updated.created_at,
      onboardingCompleted: Boolean(updated.onboarding_completed),
      firstLoginCompleted: Boolean(updated.first_login_completed),
      loginCount: updated.login_count ?? 1
    };
  }

  /**
   * Mark onboarding and first login as completed
   */
  static completeOnboarding(userId: string): void {
    const user = findUserById(userId);
    if (user) {
      user.onboarding_completed = 1;
      user.first_login_completed = 1;
      memoryStore.users[user.email] = user;
      saveStoreToDisk();
    }
  }

  /**
   * Mark first login as completed
   */
  static completeFirstLogin(userId: string): void {
    const user = findUserById(userId);
    if (user) {
      user.first_login_completed = 1;
      user.onboarding_completed = 1;
      memoryStore.users[user.email] = user;
      saveStoreToDisk();
    }
  }
}
