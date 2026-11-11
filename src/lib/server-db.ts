import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ override: true });

/**
 * Resolve a writable SQLite path across local dev, Docker/Render/Railway, and Vercel Serverless (/tmp).
 * Vercel's /var/task directory is read-only; os.tmpdir() (/tmp) is writable.
 */
function resolveWritableDatabasePath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
  if (!isServerless) {
    try {
      const localDataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(localDataDir)) {
        fs.mkdirSync(localDataDir, { recursive: true });
      }
      const testFile = path.join(localDataDir, '.write-test');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return path.join(localDataDir, 'querywise_auth.sqlite');
    } catch {
      // Fall back to os.tmpdir() if working directory is read-only
    }
  }

  try {
    const tmpDataDir = path.join(os.tmpdir(), 'querywise-data');
    if (!fs.existsSync(tmpDataDir)) {
      fs.mkdirSync(tmpDataDir, { recursive: true });
    }
    return path.join(tmpDataDir, 'querywise_auth.sqlite');
  } catch {
    return ':memory:';
  }
}

const dbPath = resolveWritableDatabasePath();

if (dbPath !== ':memory:' && !fs.existsSync(dbPath)) {
  for (const suffix of ['-wal', '-shm']) {
    const walPath = `${dbPath}${suffix}`;
    if (fs.existsSync(walPath)) {
      try {
        fs.unlinkSync(walPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

let db: DatabaseSync;
try {
  db = new DatabaseSync(dbPath);
} catch {
  db = new DatabaseSync(':memory:');
}

// Enable WAL mode where supported
try {
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('Failed to set PRAGMA on server database:', e);
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    full_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    onboarding_completed INTEGER DEFAULT 0,
    first_login_completed INTEGER DEFAULT 0,
    login_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`);

// Dynamic column migrations for existing SQLite databases
try {
  db.exec('ALTER TABLE users ADD COLUMN first_login_completed INTEGER DEFAULT 0;');
} catch {
  // Column already exists
}

try {
  db.exec('ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0;');
} catch {
  // Column already exists
}

export interface DbUser {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  onboardingCompleted: boolean;
  firstLoginCompleted: boolean;
  loginCount: number;
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

const revokedTokens = new Set<string>();

function getSigningSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.GEMINI_API_KEY ||
    process.env.SUPABASE_ANON_KEY ||
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
if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'your-anon-key') {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase client initialization skipped:', e);
  }
}

export class ServerAuthDatabase {
  /**
   * Re-hydrate a signed account proof into the local SQLite instance if cold-started on Serverless
   */
  static restoreAccountProofIfNeeded(accountProof?: string): void {
    if (!accountProof) return;
    const payload = verifySignedPayload<SignedAccountProofPayload>(accountProof, 'qwa1');
    if (!payload || !payload.email || !payload.passwordHash || !payload.passwordSalt) return;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(payload.email);
    if (!existing) {
      try {
        db.prepare(`
          INSERT INTO users (id, email, password_hash, password_salt, full_name, created_at, onboarding_completed, first_login_completed, login_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          payload.id,
          payload.email,
          payload.passwordHash,
          payload.passwordSalt,
          payload.fullName,
          payload.createdAt,
          payload.onboardingCompleted ? 1 : 0,
          payload.firstLoginCompleted ? 1 : 0,
          payload.loginCount ?? 0
        );
      } catch {
        // Ignore duplicate insert race
      }
    }
  }

  private static createAccountProof(row: {
    id: string;
    email: string;
    full_name: string;
    password_hash: string;
    password_salt: string;
    created_at: string;
    onboarding_completed: number;
    first_login_completed?: number;
    login_count?: number;
  }): string {
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
  static async register(email: string, password: string, fullName: string): Promise<{ user: DbUser; token: string; accountProof: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || cleanEmail.split('@')[0];

    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const existing = db.prepare('SELECT id, password_hash, login_count, created_at FROM users WHERE email = ?').get(cleanEmail) as {
      id: string;
      password_hash: string;
      login_count: number;
      created_at: string;
    } | undefined;

    if (existing) {
      const { hash, salt } = hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, full_name = ? WHERE id = ?').run(
        hash,
        salt,
        cleanName,
        existing.id
      );
      const userObj: DbUser = {
        id: existing.id,
        email: cleanEmail,
        fullName: cleanName,
        createdAt: existing.created_at || new Date().toISOString(),
        onboardingCompleted: false,
        firstLoginCompleted: false,
        loginCount: existing.login_count ?? 0
      };
      const accountProof = this.createAccountProof({
        id: existing.id,
        email: cleanEmail,
        full_name: cleanName,
        password_hash: hash,
        password_salt: salt,
        created_at: userObj.createdAt,
        onboarding_completed: 0,
        first_login_completed: 0,
        login_count: userObj.loginCount
      });
      return {
        token: '',
        user: userObj,
        accountProof
      };
    }

    const { hash, salt } = hashPassword(password);
    const userId = `usr_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO users (id, email, password_hash, password_salt, full_name, created_at, onboarding_completed, first_login_completed, login_count)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
    `);
    insert.run(userId, cleanEmail, hash, salt, cleanName, createdAt);

    if (supabaseClient) {
      try {
        await supabaseClient.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: cleanName } }
        });
      } catch (sbErr) {
        console.warn('Supabase mirror note:', sbErr);
      }
    }

    const accountProof = this.createAccountProof({
      id: userId,
      email: cleanEmail,
      full_name: cleanName,
      password_hash: hash,
      password_salt: salt,
      created_at: createdAt,
      onboarding_completed: 0,
      first_login_completed: 0,
      login_count: 0
    });

    return {
      token: '',
      accountProof,
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
    this.restoreAccountProofIfNeeded(accountProof);

    let row = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as {
      id: string;
      email: string;
      password_hash: string;
      password_salt: string;
      full_name: string;
      created_at: string;
      onboarding_completed: number;
      first_login_completed?: number;
      login_count?: number;
    } | undefined;

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

          if (row) {
            db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, row.id);
          } else {
            db.prepare(`
              INSERT INTO users (id, email, password_hash, password_salt, full_name, created_at, onboarding_completed, first_login_completed, login_count)
              VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
            `).run(userId, cleanEmail, hash, salt, cleanName, createdAt);
          }

          row = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as typeof row;
          isValid = true;
        } else if (error && error.code === 'invalid_credentials') {
          throw new Error('Incorrect password. Please verify your credentials or click "Forgot password?".');
        }
      } catch (sbErr: unknown) {
        if (sbErr instanceof Error && sbErr.message.includes('Incorrect password')) {
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

    db.prepare('UPDATE users SET login_count = ? WHERE id = ?').run(newLoginCount, row.id);

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

    try {
      db.prepare(`
        INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, row.id, now.toISOString(), expires.toISOString());
    } catch {
      // Stateless token still valid if SQLite session insert is skipped
    }

    const updatedAccountProof = this.createAccountProof({
      ...row,
      login_count: newLoginCount
    });

    return {
      token,
      isFirstLogin,
      user,
      accountProof: updatedAccountProof
    };
  }

  /**
   * Validate session token (supports both SQLite session lookup and stateless HMAC token verification across serverless cold starts)
   */
  static validateSession(token: string): DbUser | null {
    if (!token || revokedTokens.has(token)) return null;
    const nowIso = new Date().toISOString();

    try {
      const row = db.prepare(`
        SELECT u.id, u.email, u.full_name, u.created_at, u.onboarding_completed, u.first_login_completed, u.login_count
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?
      `).get(token, nowIso) as {
        id: string;
        email: string;
        full_name: string;
        created_at: string;
        onboarding_completed: number;
        first_login_completed?: number;
        login_count?: number;
      } | undefined;

      if (row) {
        return {
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          createdAt: row.created_at,
          onboardingCompleted: Boolean(row.onboarding_completed),
          firstLoginCompleted: Boolean(row.first_login_completed),
          loginCount: row.login_count ?? 1
        };
      }
    } catch {
      // Fall through to stateless HMAC verification
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
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } catch {
      // Ignore if session not in local instance
    }
  }

  /**
   * Generate password reset code
   */
  static async requestPasswordReset(email: string, accountProof?: string): Promise<{ code: string }> {
    const cleanEmail = email.trim().toLowerCase();
    this.restoreAccountProofIfNeeded(accountProof);
    let user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);

    if (!user && supabaseClient) {
      const userId = `usr_${crypto.randomUUID()}`;
      const { hash, salt } = hashPassword('temp-reset-password');
      db.prepare(`
        INSERT INTO users (id, email, password_hash, password_salt, full_name, created_at, onboarding_completed, first_login_completed, login_count)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
      `).run(userId, cleanEmail, hash, salt, cleanEmail.split('@')[0], new Date().toISOString());
      user = { id: userId };
    }

    if (!user) {
      throw new Error('No account found with this email address.');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO password_resets (email, code, expires_at)
      VALUES (?, ?, ?)
    `).run(cleanEmail, code, expires);

    return { code };
  }

  /**
   * Reset password
   */
  static async resetPassword(email: string, newPassword: string, code?: string, accountProof?: string): Promise<{ accountProof: string }> {
    const cleanEmail = email.trim().toLowerCase();
    this.restoreAccountProofIfNeeded(accountProof);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as {
      id: string;
      email: string;
      full_name: string;
      created_at: string;
      onboarding_completed: number;
      first_login_completed?: number;
      login_count?: number;
    } | undefined;
    if (!user) {
      throw new Error('No account found with this email address.');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    if (code) {
      const reset = db.prepare(`
        SELECT * FROM password_resets
        WHERE email = ? AND code = ? AND expires_at > ?
      `).get(cleanEmail, code, new Date().toISOString());

      if (!reset) {
        throw new Error('Invalid or expired verification code.');
      }
    }

    const { hash, salt } = hashPassword(newPassword);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, password_salt = ?
      WHERE email = ?
    `).run(hash, salt, cleanEmail);

    db.prepare('DELETE FROM password_resets WHERE email = ?').run(cleanEmail);

    const newProof = this.createAccountProof({
      ...user,
      password_hash: hash,
      password_salt: salt
    });
    return { accountProof: newProof };
  }

  /**
   * Update full name
   */
  static updateProfile(userId: string, fullName: string): DbUser {
    const cleanName = fullName.trim();
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(cleanName, userId);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
      id: string;
      email: string;
      full_name: string;
      created_at: string;
      onboarding_completed: number;
      first_login_completed?: number;
      login_count?: number;
    } | undefined;

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
    try {
      db.prepare('UPDATE users SET onboarding_completed = 1, first_login_completed = 1 WHERE id = ?').run(userId);
    } catch {
      // Ignore on stateless instance
    }
  }

  /**
   * Mark first login as completed
   */
  static completeFirstLogin(userId: string): void {
    try {
      db.prepare('UPDATE users SET first_login_completed = 1, onboarding_completed = 1 WHERE id = ?').run(userId);
    } catch {
      // Ignore on stateless instance
    }
  }
}
