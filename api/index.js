// Pre-bundled Vercel Serverless Function entrypoint generated from server.ts

// server.ts
import express from "express";
import dotenv2 from "dotenv";
import path2 from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

// src/lib/sql-explainer.ts
function deconstructSqlClauses(rawSql) {
  if (!rawSql || typeof rawSql !== "string") {
    return {
      overview: "No SQL query provided for analysis.",
      breakdown: [],
      businessContext: "Please specify an active SQL query to inspect its clauses.",
      complexity: "Simple"
    };
  }
  const sql = rawSql.trim().replace(/;+\s*$/, "");
  const clauseKeywords = [
    "WITH",
    "SELECT",
    "FROM",
    "LEFT OUTER JOIN",
    "RIGHT OUTER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "INNER JOIN",
    "CROSS JOIN",
    "JOIN",
    "WHERE",
    "GROUP BY",
    "HAVING",
    "ORDER BY",
    "LIMIT"
  ];
  const pattern = new RegExp(
    `\\b(${clauseKeywords.map((k) => k.replace(/\s+/g, "\\s+")).join("|")})\\b`,
    "gi"
  );
  const sections = [];
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    sections.push({
      keyword: match[1].toUpperCase().replace(/\s+/g, " "),
      startIndex: match.index,
      text: ""
    });
  }
  if (sections.length === 0) {
    return {
      overview: "Custom SQL query statement.",
      breakdown: [
        {
          clause: "STATEMENT",
          keyword: "STATEMENT",
          expression: sql,
          description: "Executes the raw SQL statement as provided.",
          purpose: "Database execution"
        }
      ],
      businessContext: "Executes against the active database instance.",
      complexity: "Simple"
    };
  }
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startIndex + sections[i].keyword.length;
    const end = i + 1 < sections.length ? sections[i + 1].startIndex : sql.length;
    sections[i].text = sql.slice(start, end).trim();
  }
  const breakdown = [];
  let hasAggregates = false;
  let hasJoins = false;
  let hasFilters = false;
  let hasGrouping = false;
  let hasSorting = false;
  let targetTable = "";
  for (const sec of sections) {
    const kw = sec.keyword;
    const expr = sec.text;
    const cleanExpr = expr.replace(/\s+/g, " ");
    if (kw === "WITH") {
      breakdown.push({
        clause: `WITH ${cleanExpr}`,
        keyword: "WITH",
        expression: cleanExpr,
        description: `Defines Common Table Expressions (temporary named result sets) to structure modular query logic.`,
        purpose: "Temporary CTE definition"
      });
    } else if (kw === "SELECT") {
      const isWildcard = cleanExpr.trim() === "*" || cleanExpr.startsWith("*");
      const isDistinct = /^\s*DISTINCT\b/i.test(cleanExpr);
      const isAvg = /\bAVG\s*\(/i.test(cleanExpr);
      const isSum = /\bSUM\s*\(/i.test(cleanExpr);
      const isCount = /\bCOUNT\s*\(/i.test(cleanExpr);
      const isMinMax = /\b(MIN|MAX)\s*\(/i.test(cleanExpr);
      const isRound = /\bROUND\s*\(/i.test(cleanExpr);
      if (isAvg || isSum || isCount || isMinMax) {
        hasAggregates = true;
      }
      let desc = "";
      if (isWildcard) {
        desc = `Returns all columns (*) available in the queried table without column restrictions.`;
      } else {
        const parts = [];
        if (isDistinct) parts.push("unique values (DISTINCT)");
        if (isAvg) parts.push("computes average values");
        if (isSum) parts.push("sums numerical totals");
        if (isCount) parts.push("counts matching record rows");
        if (isMinMax) parts.push("identifies minimum / maximum bounds");
        if (isRound) parts.push("rounds decimal precision for clean display");
        if (parts.length > 0) {
          desc = `Projects calculated metrics and output attributes: ${parts.join(", ")}.`;
        } else {
          const colList = cleanExpr.split(",").map((c) => c.trim().replace(/^"|"$/g, "").split(/\s+AS\s+/i)[0]).filter(Boolean).slice(0, 5).join(", ");
          desc = `Projects specific attributes (${colList}${cleanExpr.split(",").length > 5 ? "..." : ""}) for the result set.`;
        }
      }
      breakdown.push({
        clause: `SELECT ${cleanExpr}`,
        keyword: "SELECT",
        expression: cleanExpr,
        description: desc,
        purpose: "Defines target columns & calculated output metrics"
      });
    } else if (kw === "FROM") {
      targetTable = cleanExpr.split(/\s+/)[0].replace(/["']/g, "");
      const aliasMatch = cleanExpr.match(/\bAS\s+([a-zA-Z0-9_]+)|\s+([a-zA-Z0-9_]+)$/i);
      const alias = aliasMatch ? aliasMatch[1] || aliasMatch[2] : "";
      breakdown.push({
        clause: `FROM ${cleanExpr}`,
        keyword: "FROM",
        expression: cleanExpr,
        description: `Designates "${targetTable}" as the primary source table${alias && alias !== targetTable ? ` (aliased as "${alias}")` : ""} from which records are read.`,
        purpose: "Designates data source table"
      });
    } else if (kw.includes("JOIN")) {
      hasJoins = true;
      const onMatch = cleanExpr.match(/\bON\s+(.+)$/i);
      const joinCondition = onMatch ? onMatch[1] : "";
      const joinedTable = cleanExpr.split(/\s+/)[0].replace(/["']/g, "");
      breakdown.push({
        clause: `${kw} ${cleanExpr}`,
        keyword: kw,
        expression: cleanExpr,
        description: `Relates data from "${joinedTable}"${joinCondition ? ` matching key constraint: ${joinCondition}` : ""} to enrich each record with associated details.`,
        purpose: "Table relationship mapping"
      });
    } else if (kw === "WHERE") {
      hasFilters = true;
      breakdown.push({
        clause: `WHERE ${cleanExpr}`,
        keyword: "WHERE",
        expression: cleanExpr,
        description: `Restricts records before any grouping: only rows satisfying (${cleanExpr}) are evaluated.`,
        purpose: "Row-level filtering criteria"
      });
    } else if (kw === "GROUP BY") {
      hasGrouping = true;
      const groupCols = cleanExpr.replace(/["']/g, "");
      breakdown.push({
        clause: `GROUP BY ${cleanExpr}`,
        keyword: "GROUP BY",
        expression: cleanExpr,
        description: `Clusters records into discrete summary buckets partitioned by (${groupCols}) to compute aggregate totals per group.`,
        purpose: "Dimensional clustering for aggregations"
      });
    } else if (kw === "HAVING") {
      breakdown.push({
        clause: `HAVING ${cleanExpr}`,
        keyword: "HAVING",
        expression: cleanExpr,
        description: `Filters the aggregated group buckets: only groups satisfying the metric condition (${cleanExpr}) are preserved.`,
        purpose: "Aggregate-level post-filter"
      });
    } else if (kw === "ORDER BY") {
      hasSorting = true;
      const isDesc = /\bDESC\b/i.test(cleanExpr);
      const sortCol = cleanExpr.replace(/\s+(DESC|ASC)\b/gi, "").replace(/["']/g, "").trim();
      breakdown.push({
        clause: `ORDER BY ${cleanExpr}`,
        keyword: "ORDER BY",
        expression: cleanExpr,
        description: `Orders the output dataset by ${sortCol} in ${isDesc ? "descending order (highest / newest first)" : "ascending order (lowest / oldest first)"}.`,
        purpose: "Sorting & ranking results"
      });
    } else if (kw === "LIMIT") {
      const limitVal = cleanExpr.match(/\d+/)?.[0] || cleanExpr;
      breakdown.push({
        clause: `LIMIT ${cleanExpr}`,
        keyword: "LIMIT",
        expression: cleanExpr,
        description: `Caps the total number of returned rows to at most ${limitVal} records to ensure fast execution and clean UI display.`,
        purpose: "Row count bounding"
      });
    }
  }
  let complexity = "Simple";
  if (hasJoins || hasGrouping && hasAggregates && hasFilters) {
    complexity = "Advanced";
  } else if (hasGrouping || hasAggregates || hasFilters || hasSorting) {
    complexity = "Intermediate";
  }
  let overview = "";
  if (hasAggregates && hasGrouping) {
    overview = `This query aggregates records from "${targetTable || "the active dataset"}", grouping rows to calculate summary metrics with sorted ranking.`;
  } else if (hasAggregates) {
    overview = `This query performs mathematical aggregation across "${targetTable || "the dataset"}" to compute summary statistics.`;
  } else if (hasSorting) {
    overview = `This query retrieves and ranks records from "${targetTable || "the dataset"}" in ordered sequence.`;
  } else {
    overview = `This query reads and projects records directly from "${targetTable || "the dataset"}" with targeted constraints.`;
  }
  const businessContext = hasAggregates ? `Useful for analytics, reporting, and KPI dashboards to evaluate overall performance and trends.` : `Useful for inspecting raw transaction records, operational audits, or drill-down details.`;
  return {
    overview,
    breakdown,
    businessContext,
    complexity
  };
}

// src/lib/server-db.ts
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ override: true });
function resolveWritableStorePath() {
  const isServerless = Boolean(
    "1"
  );
  if (!isServerless) {
    try {
      const localDataDir = path.resolve(process.cwd(), "data");
      if (!fs.existsSync(localDataDir)) {
        fs.mkdirSync(localDataDir, { recursive: true });
      }
      const testFile = path.join(localDataDir, ".write-test");
      fs.writeFileSync(testFile, "ok");
      fs.unlinkSync(testFile);
      return path.join(localDataDir, "querywise_auth.json");
    } catch {
    }
  }
  try {
    const tmpDataDir = path.join(os.tmpdir(), "querywise-data");
    if (!fs.existsSync(tmpDataDir)) {
      fs.mkdirSync(tmpDataDir, { recursive: true });
    }
    return path.join(tmpDataDir, "querywise_auth.json");
  } catch {
    return null;
  }
}
var storeFilePath = resolveWritableStorePath();
var memoryStore = {
  users: {},
  sessions: {},
  passwordResets: {}
};
function loadStoreFromDisk() {
  if (!storeFilePath) return;
  try {
    if (fs.existsSync(storeFilePath)) {
      const raw = fs.readFileSync(storeFilePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.users && typeof parsed.users === "object") {
        Object.assign(memoryStore.users, parsed.users);
      }
      if (parsed.sessions && typeof parsed.sessions === "object") {
        Object.assign(memoryStore.sessions, parsed.sessions);
      }
      if (parsed.passwordResets && typeof parsed.passwordResets === "object") {
        Object.assign(memoryStore.passwordResets, parsed.passwordResets);
      }
    }
  } catch {
  }
}
function saveStoreToDisk() {
  if (!storeFilePath) return;
  try {
    fs.writeFileSync(storeFilePath, JSON.stringify(memoryStore, null, 2), "utf8");
  } catch {
  }
}
loadStoreFromDisk();
var revokedTokens = /* @__PURE__ */ new Set();
function getSigningSecret() {
  return process.env.AUTH_SECRET || process.env.GEMINI_API_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "querywise-production-hmac-secret-v1";
}
function signPayload(prefix, payloadObj) {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningSecret()).update(`${prefix}.${payloadB64}`).digest("base64url");
  return `${prefix}.${payloadB64}.${sig}`;
}
function verifySignedPayload(token, expectedPrefix) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== expectedPrefix) return null;
    const [, payloadB64, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", getSigningSecret()).update(`${expectedPrefix}.${payloadB64}`).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return parsed;
  } catch {
    return null;
  }
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  try {
    const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(testHash, "hex"));
  } catch {
    return false;
  }
}
function resolveValidSupabaseUrl() {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL
  ];
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed && /^https?:\/\//i.test(trimmed) && trimmed !== "https://your-project.supabase.co") {
      return trimmed;
    }
  }
  return "";
}
var SUPABASE_URL = resolveValidSupabaseUrl();
var SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
var supabaseClient = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== "your-anon-key" && SUPABASE_ANON_KEY !== "your-supabase-anon-key") {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase client initialization skipped:", e);
  }
}
function findUserById(userId) {
  loadStoreFromDisk();
  for (const u of Object.values(memoryStore.users)) {
    if (u.id === userId) return u;
  }
  return void 0;
}
var ServerAuthDatabase = class {
  /**
   * Re-hydrate a signed account proof into the store if cold-started on Serverless
   */
  static restoreAccountProofIfNeeded(accountProof) {
    if (!accountProof) return;
    const payload = verifySignedPayload(accountProof, "qwa1");
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
  static createAccountProof(row) {
    const proofPayload = {
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
    return signPayload("qwa1", proofPayload);
  }
  /**
   * Register a new user in the database
   */
  static async register(email, password, fullName, accountProof) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || cleanEmail.split("@")[0];
    if (!cleanEmail || !cleanEmail.includes("@")) {
      throw new Error("Valid email address is required.");
    }
    if (!password || password.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }
    loadStoreFromDisk();
    this.restoreAccountProofIfNeeded(accountProof);
    const existing = memoryStore.users[cleanEmail];
    if (existing) {
      throw new Error("An account with this email already exists. Please sign in instead.");
    }
    const { hash, salt } = hashPassword(password);
    const userId = `usr_${crypto.randomUUID()}`;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const newRecord = {
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
          throw new Error("An account with this email already exists. Please sign in instead.");
        }
      } catch (sbErr) {
        if (sbErr instanceof Error && sbErr.message.includes("already exists")) {
          throw sbErr;
        }
        console.warn("Supabase mirror note:", sbErr);
      }
    }
    memoryStore.users[cleanEmail] = newRecord;
    saveStoreToDisk();
    const generatedProof = this.createAccountProof(newRecord);
    return {
      token: "",
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
  static async login(email, password, accountProof) {
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
        if (data?.user || error && error.code === "email_not_confirmed") {
          const { hash, salt } = hashPassword(password);
          const userId = data?.user?.id || row?.id || `usr_${crypto.randomUUID()}`;
          const cleanName = data?.user?.user_metadata?.full_name || row?.full_name || cleanEmail.split("@")[0];
          const createdAt = data?.user?.created_at || row?.created_at || (/* @__PURE__ */ new Date()).toISOString();
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
        } else if (error && error.code === "invalid_credentials") {
          if (row) {
            throw new Error('Invalid password. Please check your credentials or click "Forgot password?".');
          }
        }
      } catch (sbErr) {
        if (sbErr instanceof Error && sbErr.message.includes("Invalid password")) {
          throw sbErr;
        }
        console.warn("Supabase bridge error:", sbErr);
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
    const user = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      createdAt: row.created_at,
      onboardingCompleted: Boolean(row.onboarding_completed),
      firstLoginCompleted: Boolean(row.first_login_completed),
      loginCount: newLoginCount
    };
    const now = /* @__PURE__ */ new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1e3);
    const token = signPayload("qws1", {
      user,
      exp: expires.getTime()
    });
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
  static validateSession(token) {
    if (!token || revokedTokens.has(token)) return null;
    loadStoreFromDisk();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
    const stateless = verifySignedPayload(token, "qws1");
    if (stateless && stateless.user && stateless.exp > Date.now()) {
      return stateless.user;
    }
    return null;
  }
  /**
   * Terminate session
   */
  static logout(token) {
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
  static async requestPasswordReset(email, accountProof) {
    const cleanEmail = email.trim().toLowerCase();
    loadStoreFromDisk();
    this.restoreAccountProofIfNeeded(accountProof);
    let user = memoryStore.users[cleanEmail];
    if (!user && supabaseClient) {
      const userId = `usr_${crypto.randomUUID()}`;
      const { hash, salt } = hashPassword("temp-reset-password");
      user = {
        id: userId,
        email: cleanEmail,
        password_hash: hash,
        password_salt: salt,
        full_name: cleanEmail.split("@")[0],
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        onboarding_completed: 0,
        first_login_completed: 0,
        login_count: 0
      };
      memoryStore.users[cleanEmail] = user;
    }
    if (!user) {
      throw new Error("No account found with this email address.");
    }
    const code = Math.floor(1e5 + Math.random() * 9e5).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1e3).toISOString();
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
  static async resetPassword(email, newPassword, code, accountProof) {
    const cleanEmail = email.trim().toLowerCase();
    loadStoreFromDisk();
    this.restoreAccountProofIfNeeded(accountProof);
    const user = memoryStore.users[cleanEmail];
    if (!user) {
      throw new Error("No account found with this email address.");
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }
    if (code) {
      const reset = memoryStore.passwordResets[cleanEmail];
      if (!reset || reset.code !== code || reset.expires_at <= (/* @__PURE__ */ new Date()).toISOString()) {
        throw new Error("Invalid or expired verification code.");
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
  static updateProfile(userId, fullName) {
    const cleanName = fullName.trim();
    const updated = findUserById(userId);
    if (!updated) {
      return {
        id: userId,
        email: "",
        fullName: cleanName,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
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
  static completeOnboarding(userId) {
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
  static completeFirstLogin(userId) {
    const user = findUserById(userId);
    if (user) {
      user.first_login_completed = 1;
      user.onboarding_completed = 1;
      memoryStore.users[user.email] = user;
      saveStoreToDisk();
    }
  }
};

// src/lib/sql-semantics.ts
function stemToken(word) {
  const clean = word.toLowerCase().trim().replace(/^["'`[]+|["'`\]]+$/g, "");
  if (clean.length <= 3) return clean;
  if (clean.endsWith("ies") && clean.length > 4) {
    return clean.slice(0, -3) + "y";
  }
  if (clean.endsWith("ses") || clean.endsWith("xes") || clean.endsWith("zes") || clean.endsWith("ches") || clean.endsWith("shes")) {
    return clean.slice(0, -2);
  }
  if (clean.endsWith("s") && !clean.endsWith("ss") && !clean.endsWith("us") && !clean.endsWith("is")) {
    return clean.slice(0, -1);
  }
  return clean;
}
function parseSchemaTables(schemaText) {
  const tables = [];
  const blocks = (schemaText || "").split(/Table:\s*"?/i).slice(1);
  for (const block of blocks) {
    const nameMatch = block.match(/^([a-zA-Z0-9_]+)["\s(:]/);
    if (!nameMatch) continue;
    const tableName = nameMatch[1];
    let rowCount = 0;
    const countMatch = block.match(/\((\d+)\s+records?\)/i);
    if (countMatch) {
      rowCount = parseInt(countMatch[1], 10);
    }
    const columns = [];
    const lines = block.split("\n");
    for (const line of lines) {
      const colMatch = line.match(/^\s*-\s*([a-zA-Z0-9_]+)\s*\(([^)]+)\)/);
      if (colMatch) {
        const colName = colMatch[1];
        const colMeta = colMatch[2];
        const colType = colMeta.split(",")[0].trim().toUpperCase();
        const isPk = /primary\s*key/i.test(colMeta) || colName.toLowerCase() === "id" || colName.toLowerCase() === `${tableName.toLowerCase()}_id` || colName.toLowerCase() === `${stemToken(tableName)}_id`;
        let foreignKeyTarget;
        const fkMatch = colMeta.match(/FOREIGN\s+KEY\s*->\s*"?([a-zA-Z0-9_]+)"?\."?([a-zA-Z0-9_]+)"?/i);
        if (fkMatch) {
          foreignKeyTarget = { table: fkMatch[1], column: fkMatch[2] };
        }
        const isFk = Boolean(foreignKeyTarget) || !isPk && /_id$/i.test(colName);
        const isDate = /date|time|timestamp/i.test(colType) || /created_at|updated_at|timestamp|date/i.test(colName);
        const isNumeric = !isPk && !isFk && !isDate && (/int|real|float|double|decimal|numeric|number/i.test(colType) || /revenue|amount|salary|balance|spent|price|marks|attendance|units|score|age|rate|cost|fee|quantity|level|rating|pct|percent|ph|nitrogen|phosphorus|potassium|value|total|weight|height|distance|duration/i.test(colName));
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
    const primaryKeyCol = columns.find((c) => c.isPrimaryKey)?.name;
    const dateCol = columns.find((c) => c.isDate)?.name;
    const numericCols = columns.filter((c) => c.isNumeric).map((c) => c.name);
    const textCols = columns.filter((c) => c.isText).map((c) => c.name);
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
  for (const tbl of tables) {
    for (const col of tbl.columns) {
      if (col.isForeignKey && !col.foreignKeyTarget && /_id$/i.test(col.name)) {
        const prefix = col.name.replace(/_id$/i, "").toLowerCase();
        const refTable = tables.find(
          (other) => other.tableName !== tbl.tableName && (other.tableName.toLowerCase() === prefix || stemToken(other.tableName) === stemToken(prefix))
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
function splitTopLevelCommas(str) {
  const result = [];
  let current = "";
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
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      else if (ch === "," && depth === 0) {
        if (current.trim()) result.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}
function normalizeIdentifier(expr) {
  const withoutAlias = expr.trim().replace(/\s+AS\s+["'`[]?[a-zA-Z0-9_]+["'`\]]?$/i, "").trim();
  const parts = withoutAlias.split(".");
  const last = parts[parts.length - 1].trim();
  return last.replace(/^["'`[]+|["'`\]]+$/g, "").toLowerCase();
}
function parseSqlStructure(sql) {
  const cleanSql = (sql || "").replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/;+\s*$/, "");
  const selectMatch = cleanSql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+)$/i);
  if (!selectMatch) {
    return {
      sql: cleanSql,
      selectItems: [],
      aggregateFunctions: [],
      nonAggregatedSelectCols: [],
      fromTable: "",
      joinTables: [],
      hasWhere: false,
      whereClause: "",
      hasGroupBy: false,
      groupByColumns: [],
      hasHaving: false,
      havingClause: "",
      hasOrderBy: false,
      orderByClause: "",
      limitValue: null
    };
  }
  const selectPart = selectMatch[1].trim();
  const restPart = selectMatch[2].trim();
  const selectItems = splitTopLevelCommas(selectPart);
  const aggregateFunctions = [];
  const nonAggregatedSelectCols = [];
  const aggRegex = /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/gi;
  for (const item of selectItems) {
    let hasAgg = false;
    let match;
    aggRegex.lastIndex = 0;
    while ((match = aggRegex.exec(item)) !== null) {
      hasAgg = true;
      const fn = match[1].toUpperCase();
      if (!aggregateFunctions.includes(fn)) {
        aggregateFunctions.push(fn);
      }
    }
    if (!hasAgg) {
      nonAggregatedSelectCols.push(normalizeIdentifier(item));
    }
  }
  const fromMatch = restPart.match(/^["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i);
  const fromTable = fromMatch ? fromMatch[1].toLowerCase() : "";
  const joinTables = [];
  const joinRegex = /\bJOIN\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/gi;
  let jMatch;
  while ((jMatch = joinRegex.exec(restPart)) !== null) {
    joinTables.push(jMatch[1].toLowerCase());
  }
  const whereMatch = restPart.match(/\bWHERE\s+([\s\S]+?)(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i);
  const groupMatch = restPart.match(/\bGROUP\s+BY\s+([\s\S]+?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i);
  const havingMatch = restPart.match(/\bHAVING\s+([\s\S]+?)(?=\bORDER\s+BY\b|\bLIMIT\b|$)/i);
  const orderMatch = restPart.match(/\bORDER\s+BY\s+([\s\S]+?)(?=\bLIMIT\b|$)/i);
  const limitMatch = restPart.match(/\bLIMIT\s+(\d+)/i);
  const groupByColumns = groupMatch ? splitTopLevelCommas(groupMatch[1]).map(normalizeIdentifier).filter(Boolean) : [];
  let orderDirection;
  if (orderMatch) {
    orderDirection = /\bASC\b/i.test(orderMatch[1]) && !/\bDESC\b/i.test(orderMatch[1]) ? "ASC" : "DESC";
  }
  return {
    sql: cleanSql,
    selectItems,
    aggregateFunctions,
    nonAggregatedSelectCols,
    fromTable,
    joinTables,
    hasWhere: Boolean(whereMatch),
    whereClause: whereMatch ? whereMatch[1].trim() : "",
    hasGroupBy: Boolean(groupMatch && groupByColumns.length > 0),
    groupByColumns,
    hasHaving: Boolean(havingMatch),
    havingClause: havingMatch ? havingMatch[1].trim() : "",
    hasOrderBy: Boolean(orderMatch),
    orderByClause: orderMatch ? orderMatch[1].trim() : "",
    orderDirection,
    limitValue: limitMatch ? parseInt(limitMatch[1], 10) : null
  };
}
function resolvePhraseToColumns(phrase, targetTable, allTables) {
  const matches = [];
  const cleanPhrase = phrase.toLowerCase().replace(/\b(different|all|each|every|the|their|its|individual|separate|various|distinct)\b/g, " ").trim();
  const segments = cleanPhrase.split(/\s*(?:,|\band\b|&)\s*/i).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const segTokens = seg.split(/[\s_]+/).filter(Boolean);
    const segStemJoined = segTokens.map(stemToken).join("_");
    const firstTokenStem = segTokens[0] ? stemToken(segTokens[0]) : "";
    let matchedCol;
    for (const col of targetTable.columns) {
      const colLow = col.name.toLowerCase();
      const colBase = colLow.replace(/_id$/i, "");
      const colStem = colLow.split("_").map(stemToken).join("_");
      if (colLow === seg.replace(/\s+/g, "_") || colStem === segStemJoined || stemToken(colLow) === firstTokenStem || col.isForeignKey && stemToken(colBase) === firstTokenStem || segTokens.length === 1 && (colLow === `${firstTokenStem}_id` || colLow === `${firstTokenStem}_name`)) {
        matchedCol = col;
        break;
      }
    }
    let matchedJoinInfo;
    if (!matchedCol) {
      for (const otherTbl of allTables) {
        const otherStem = stemToken(otherTbl.tableName);
        if (otherStem === firstTokenStem || otherTbl.tableName.toLowerCase() === seg.replace(/\s+/g, "_")) {
          const fkCol = targetTable.columns.find(
            (c) => c.foreignKeyTarget?.table.toLowerCase() === otherTbl.tableName.toLowerCase() || stemToken(c.name.replace(/_id$/i, "")) === otherStem
          );
          if (fkCol) {
            matchedCol = fkCol;
            break;
          }
        }
      }
    }
    if (!matchedCol) {
      for (const fkCol of targetTable.columns.filter((c) => c.isForeignKey && c.foreignKeyTarget)) {
        const dimTbl = allTables.find(
          (t) => t.tableName.toLowerCase() === fkCol.foreignKeyTarget.table.toLowerCase()
        );
        if (!dimTbl) continue;
        for (const dCol of dimTbl.columns) {
          if (dCol.isNumeric || dCol.isPrimaryKey) continue;
          const dLow = dCol.name.toLowerCase();
          const dStem = dLow.split("_").map(stemToken).join("_");
          if (dLow === seg.replace(/\s+/g, "_") || dStem === segStemJoined || stemToken(dLow) === firstTokenStem) {
            matchedCol = dCol;
            matchedJoinInfo = {
              foreignKeyCol: fkCol.name,
              joinTable: dimTbl.tableName,
              joinPkCol: fkCol.foreignKeyTarget.column
            };
            break;
          }
        }
        if (matchedCol) break;
      }
    }
    if (matchedCol) {
      let labelColumn;
      if (matchedCol.isForeignKey && matchedCol.foreignKeyTarget && !matchedJoinInfo) {
        const dimTbl = allTables.find(
          (t) => t.tableName.toLowerCase() === matchedCol.foreignKeyTarget.table.toLowerCase()
        );
        const nameCol = dimTbl?.columns.find((c) => /name|title|label/i.test(c.name));
        if (dimTbl && nameCol) {
          labelColumn = {
            joinTable: dimTbl.tableName,
            joinPk: matchedCol.foreignKeyTarget.column,
            labelCol: nameCol.name
          };
        }
      }
      if (!matches.some((m) => m.columnName.toLowerCase() === matchedCol.name.toLowerCase())) {
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
function analyzeQueryGroupingIntent(query, tables, conversationHistory = [], aiIntentDetection) {
  const q = (query || "").toLowerCase().trim();
  let targetTable;
  const queryWords = q.split(/[\s,?.!;'"]+/).filter(Boolean);
  const queryStems = queryWords.map(stemToken);
  let bestTableScore = -1;
  for (const t of tables) {
    let score = 0;
    const tLow = t.tableName.toLowerCase();
    const tStem = stemToken(tLow);
    if (queryWords.includes(tLow) || queryStems.includes(tStem)) {
      score += 3;
    }
    for (const c of t.columns) {
      const cLow = c.name.toLowerCase();
      const cWords = cLow.split("_");
      const cStem = cWords.map(stemToken).join("_");
      if (q.includes(cLow.replace(/_/g, " ")) || q.includes(cLow)) {
        score += c.isNumeric ? 5 : 4;
      } else if (cWords.length === 1 && queryStems.includes(cStem)) {
        score += c.isNumeric ? 4 : 3;
      } else if (c.isForeignKey) {
        const fkBaseStem = stemToken(cLow.replace(/_id$/i, ""));
        if (queryStems.includes(fkBaseStem)) {
          score += 3;
        }
      }
    }
    if (score > 0 && t.numericCols.length > 0) {
      score += 1;
      if (t.columns.some((c) => c.isForeignKey)) {
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
  if (!targetTable && Array.isArray(conversationHistory)) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const prevSql = (conversationHistory[i].sql || "").toLowerCase();
      const prevContent = (conversationHistory[i].content || "").toLowerCase();
      for (const t of tables) {
        if (prevSql.includes(t.tableName.toLowerCase()) || prevContent.includes(t.tableName.toLowerCase())) {
          targetTable = t;
          break;
        }
      }
      if (targetTable) break;
    }
  }
  if (!targetTable && tables.length > 0) {
    targetTable = [...tables].sort((a, b) => {
      const aScore = (a.numericCols.length > 0 ? 1e3 : 0) + (a.dateCol ? 300 : 0) + a.rowCount;
      const bScore = (b.numericCols.length > 0 ? 1e3 : 0) + (b.dateCol ? 300 : 0) + b.rowCount;
      return bScore - aScore;
    })[0];
  }
  const expectedAggFunctions = [];
  const asksSum = /\b(total|sum|combined|overall\s+revenue|overall\s+sales|total\s+quantity|total\s+amount|total\s+revenue|total\s+spent|total\s+cost)\b/i.test(q) && !/\b(total\s+number|total\s+count|total\s+records|total\s+rows|total\s+customers|total\s+products|total\s+sales\s+count)\b/i.test(q);
  const asksAvg = /\b(average|avg|mean)\b/i.test(q);
  const asksCount = /\b(count|number\s+of|how\s+many|total\s+number|total\s+records|total\s+rows|frequency)\b/i.test(q) || /\bcount\s+of\b/i.test(q);
  const asksMax = /\b(highest|maximum|max|largest|biggest|most\s+expensive|peak|best|top)\b/i.test(q);
  const asksMin = /\b(lowest|minimum|min|smallest|least|cheapest|worst|bottom)\b/i.test(q);
  if (asksSum) expectedAggFunctions.push("SUM");
  if (asksAvg) expectedAggFunctions.push("AVG");
  if (asksCount) expectedAggFunctions.push("COUNT");
  const groupingDimensions = [];
  const subjectFirstRegex = /\b(?:rank|compare|list|show|display|find|which|what)\s+(?:all\s+|the\s+|different\s+|top\s+\d+\s+)?([a-z0-9_]+(?:\s+[a-z0-9_]+)?)\s+(?:by|where|with|having|ordered\s+by|ranked\s+by)\b/i;
  const subjMatch = q.match(subjectFirstRegex);
  if (targetTable) {
    const groupPhraseRegexes = [
      /\b(?:for\s+each|for\s+every|in\s+each|in\s+every|per|grouped\s+by|group\s+by|broken\s+down\s+by|across(?:\s+different|\s+all|\s+each|\s+various)?)\s+([a-z0-9_]+(?:\s+(?:and|,)\s+[a-z0-9_]+|\s+[a-z0-9_]+){0,4}?)(?=\s+(?:where|having|with|ordered|sorted|in|from|for|limit|exceeds|greater|less|above|below|>|<|=|$)|[?.!,;]|$)/gi,
      /\bby\s+([a-z0-9_]+(?:\s*(?:,|\band\b)\s*[a-z0-9_]+|\s+[a-z0-9_]+){0,3}?)(?=\s+(?:where|having|with|ordered|sorted|in|from|desc|asc|limit|$)|[?.!,;]|$)/gi,
      /\b([a-z0-9_]+)-wise\b/gi
    ];
    for (const rg of groupPhraseRegexes) {
      let m;
      while ((m = rg.exec(q)) !== null) {
        const candidatePhrase = m[1].trim();
        const resolved = resolvePhraseToColumns(candidatePhrase, targetTable, tables).filter(
          (dim) => {
            const colInfo = targetTable.columns.find((c) => c.name === dim.columnName);
            return !colInfo?.isNumeric;
          }
        );
        for (const r of resolved) {
          if (!groupingDimensions.some((g) => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
            groupingDimensions.push(r);
          }
        }
      }
    }
    if (subjMatch && groupingDimensions.length === 0) {
      const candidate = subjMatch[1].trim();
      if (!/^(records|rows|entries|data|items|results|values)$/i.test(candidate)) {
        const resolved = resolvePhraseToColumns(candidate, targetTable, tables).filter((dim) => {
          const colInfo = targetTable.columns.find((c) => c.name === dim.columnName);
          return !colInfo?.isNumeric;
        });
        for (const r of resolved) {
          if (!groupingDimensions.some((g) => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
            groupingDimensions.push(r);
          }
        }
      }
    }
    const whichDimRegex = /\b(?:which|what)\s+([a-z0-9_]+(?:\s+[a-z0-9_]+)?)\s+(?:has|have|had|with|shows)\s+the\s+(?:highest|lowest|maximum|minimum|most|least|best|worst|largest|smallest)\b/i;
    const whichMatch = q.match(whichDimRegex);
    if (whichMatch && groupingDimensions.length === 0) {
      const candidate = whichMatch[1].trim();
      const resolved = resolvePhraseToColumns(candidate, targetTable, tables).filter((dim) => {
        const colInfo = targetTable.columns.find((c) => c.name === dim.columnName);
        return !colInfo?.isNumeric;
      });
      for (const r of resolved) {
        if (!groupingDimensions.some((g) => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
          groupingDimensions.push(r);
        }
      }
    }
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
                if (!groupingDimensions.some((g) => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
                  groupingDimensions.push(r);
                }
              }
            }
            break;
          }
        }
      }
    }
    if (aiIntentDetection?.groupByColumns && aiIntentDetection.groupByColumns.length > 0) {
      for (const aiCol of aiIntentDetection.groupByColumns) {
        const resolved = resolvePhraseToColumns(aiCol, targetTable, tables);
        for (const r of resolved) {
          if (!groupingDimensions.some((g) => g.columnName.toLowerCase() === r.columnName.toLowerCase())) {
            groupingDimensions.push(r);
          }
        }
      }
    }
  }
  const hasPerEachPhrase = /\b(for\s+each|in\s+each|per|for\s+every|in\s+every|each)\b/i.test(q);
  const isWhichSingleWinner = /\b(which|what)\s+[a-z0-9_\s]+\s+(?:has|have|is)\s+the\s+(?:highest|lowest|maximum|minimum|most|least|best|worst)\b/i.test(q) || /\bshow\s+only\s+the\b/i.test(q);
  if ((asksMax || asksMin) && hasPerEachPhrase && !isWhichSingleWinner) {
    if (asksMax && !expectedAggFunctions.includes("MAX")) expectedAggFunctions.push("MAX");
    if (asksMin && !expectedAggFunctions.includes("MIN")) expectedAggFunctions.push("MIN");
  } else if ((asksMax || asksMin) && expectedAggFunctions.length === 0) {
    if (groupingDimensions.length > 0 && isWhichSingleWinner) {
      expectedAggFunctions.push("SUM");
    } else {
      if (asksMax) expectedAggFunctions.push("MAX");
      if (asksMin) expectedAggFunctions.push("MIN");
    }
  }
  if (groupingDimensions.length > 0 && expectedAggFunctions.length === 0) {
    const mentionsNumericCol = targetTable?.numericCols.some(
      (c) => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, " "))
    );
    if (mentionsNumericCol || /\b(revenue|amount|salary|price|cost|quantity|score|value|levels)\b/i.test(q)) {
      expectedAggFunctions.push(/\b(compare|levels)\b/i.test(q) ? "AVG" : "SUM");
    } else {
      expectedAggFunctions.push("COUNT");
    }
  }
  const metricColumns = [];
  let countDistinctColumn;
  if (targetTable) {
    if (expectedAggFunctions.includes("COUNT") && groupingDimensions.length > 0) {
      const countTargetMatch = q.match(/\b(?:count|number)\s+of\s+(?:distinct\s+|unique\s+)?([a-z0-9_]+)\b/i);
      if (countTargetMatch) {
        const entityWord = countTargetMatch[1].toLowerCase();
        const entityStem = stemToken(entityWord);
        const tableStem = stemToken(targetTable.tableName);
        if (entityStem !== tableStem && !/^(record|row|entry|item|transaction|sale|order)$/i.test(entityStem)) {
          const fkOrCol = targetTable.columns.find(
            (c) => stemToken(c.name.replace(/_id$/i, "")) === entityStem || stemToken(c.name) === entityStem
          );
          if (fkOrCol && !groupingDimensions.some((g) => g.columnName === fkOrCol.name)) {
            countDistinctColumn = fkOrCol.name;
          }
        }
      }
    }
    for (const numCol of targetTable.numericCols) {
      const nLow = numCol.toLowerCase();
      const nPhrase = nLow.replace(/_/g, " ");
      if (q.includes(nPhrase) || q.includes(nLow)) {
        metricColumns.push(numCol);
      }
    }
    if (metricColumns.length === 0) {
      for (const numCol of targetTable.numericCols) {
        const parts = numCol.toLowerCase().split("_");
        if (parts.some((p) => p.length > 2 && queryStems.includes(stemToken(p)))) {
          metricColumns.push(numCol);
        }
      }
    }
    if (metricColumns.length === 0 && targetTable.numericCols.length > 0) {
      const preferredOrder = ["revenue", "amount", "salary", "balance", "unit_price", "price", "soil_score", "nitrogen", "marks", "score", "cost_price", "cost", "quantity"];
      const preferred = preferredOrder.map((p) => targetTable.numericCols.find((c) => c.toLowerCase() === p)).find((c) => Boolean(c));
      metricColumns.push(preferred || targetTable.numericCols[0]);
    }
  }
  let requiresHaving = false;
  let havingFilter;
  const thresholdMatch = q.match(/\b(?:exceeds|greater\s+than|more\s+than|above|over|at\s+least|>=|<=|>|<|=)\s*\$?(-?\d+(?:,\d{3})*(?:\.\d+)?)/i);
  if (thresholdMatch && groupingDimensions.length > 0) {
    const rawNum = Number(thresholdMatch[1].replace(/,/g, ""));
    const opStr = thresholdMatch[0].toLowerCase();
    let operator = ">";
    if (opStr.includes(">=") || opStr.includes("at least")) operator = ">=";
    else if (opStr.includes("<=") || opStr.includes("at most")) operator = "<=";
    else if (opStr.includes("<") || opStr.includes("less") || opStr.includes("below") || opStr.includes("under")) operator = "<";
    else if (opStr.includes("=") && !opStr.includes(">") && !opStr.includes("<")) operator = "=";
    if (asksSum || asksAvg || asksCount || asksMax || asksMin || /\bhaving\b/i.test(q) || subjMatch) {
      requiresHaving = true;
      const aggFn = expectedAggFunctions[0] || "SUM";
      if (!expectedAggFunctions.includes(aggFn)) {
        expectedAggFunctions.push(aggFn);
      }
      havingFilter = {
        aggFn,
        metricCol: metricColumns[0] || "revenue",
        operator,
        threshold: rawNum
      };
    }
  }
  const requiresGroupBy = groupingDimensions.length > 0;
  const isRankedGroup = requiresGroupBy && (/\b(rank|ranked|top\s+\d+|order\s+by|sort\s+by|highest|lowest)\b/i.test(q) && !hasPerEachPhrase);
  let aggregationType = "NONE";
  if (requiresGroupBy) {
    if (requiresHaving) {
      aggregationType = "FILTERED_GROUPED";
    } else if (isRankedGroup) {
      aggregationType = "RANKED_GROUPED";
    } else {
      aggregationType = "GROUPED";
    }
  } else if (expectedAggFunctions.length > 0 && !/\b(first|last|latest|oldest)\s+\d+\b/i.test(q)) {
    aggregationType = "OVERALL";
  }
  const orderDirection = asksMin && !asksMax ? "ASC" : "DESC";
  let requestedLimit = null;
  if (isWhichSingleWinner) {
    requestedLimit = 1;
  } else {
    const topMatch = q.match(/\b(?:top|bottom|first|limit)\s+(\d+)\b/i);
    if (topMatch) {
      requestedLimit = parseInt(topMatch[1], 10);
    }
  }
  let whereInFilter;
  if (requiresGroupBy && /\b(their|those|them|these|each of them|for each of those|in each of them|from those|among those)\b/i.test(q) && conversationHistory.length > 0) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const prevSummary = conversationHistory[i].resultSummary;
      const prevSql = conversationHistory[i].sql || "";
      if (prevSummary && (/\b(LIMIT|HAVING|WHERE)\b/i.test(prevSql) || /\b(those|their|them)\b/i.test(q))) {
        try {
          const parsedPrev = JSON.parse(prevSummary);
          const prevRows = Array.isArray(parsedPrev.rows) ? parsedPrev.rows : [];
          const prevCols = Array.isArray(parsedPrev.columns) ? parsedPrev.columns : [];
          const primaryGroupCol = groupingDimensions[0]?.columnName;
          if (primaryGroupCol && prevRows.length > 0 && prevCols.length > 0) {
            let colIdx = prevCols.findIndex((c) => c.toLowerCase() === primaryGroupCol.toLowerCase());
            if (colIdx === -1) colIdx = 0;
            const vals = Array.from(
              new Set(
                prevRows.map((r) => r[colIdx]).filter((v) => v !== null && v !== void 0 && String(v).trim() !== "").map((v) => typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
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
function validateSqlSemantics(query, sql, schemaText, conversationHistory = [], aiIntentDetection) {
  const tables = parseSchemaTables(schemaText);
  const intent = analyzeQueryGroupingIntent(query, tables, conversationHistory, aiIntentDetection);
  const sqlStructure = parseSqlStructure(sql);
  if (!sql || !sql.trim()) {
    return { valid: true, intent, sqlStructure };
  }
  if (intent.requiresGroupBy) {
    if (!sqlStructure.hasGroupBy) {
      const expectedCols = intent.groupingDimensions.map((d) => d.columnName).join(", ");
      return {
        valid: false,
        reason: `Question requires grouping by (${expectedCols}), but generated SQL is missing a GROUP BY clause and would return an overall scalar instead of one row per group.`,
        intent,
        sqlStructure
      };
    }
    if (sqlStructure.nonAggregatedSelectCols.length === 0 || sqlStructure.selectItems.length < 2) {
      return {
        valid: false,
        reason: "Grouped aggregation SQL must SELECT both the grouping column(s) and the aggregated value(s).",
        intent,
        sqlStructure
      };
    }
    if (sqlStructure.aggregateFunctions.length === 0) {
      return {
        valid: false,
        reason: "Grouped aggregation SQL must include an aggregate function (SUM, AVG, COUNT, MIN, MAX) in the SELECT clause.",
        intent,
        sqlStructure
      };
    }
    for (const expectedDim of intent.groupingDimensions) {
      const expColLow = expectedDim.columnName.toLowerCase();
      const expBaseStem = stemToken(expColLow.replace(/_id$/i, ""));
      const hasMatchingGroupCol = sqlStructure.groupByColumns.some((gCol) => {
        const gBaseStem = stemToken(gCol.replace(/_id$/i, "").replace(/_name$/i, ""));
        return gCol === expColLow || gBaseStem === expBaseStem;
      });
      if (!hasMatchingGroupCol) {
        return {
          valid: false,
          reason: `Generated SQL GROUP BY (${sqlStructure.groupByColumns.join(", ")}) does not include the requested grouping dimension "${expectedDim.columnName}".`,
          intent,
          sqlStructure
        };
      }
    }
    if (intent.expectedAggFunctions.length > 0) {
      const primaryExpectedAgg = intent.expectedAggFunctions[0];
      if (!sqlStructure.aggregateFunctions.includes(primaryExpectedAgg)) {
        return {
          valid: false,
          reason: `Question requested ${primaryExpectedAgg} aggregation per group, but SQL used ${sqlStructure.aggregateFunctions.join(", ") || "none"}.`,
          intent,
          sqlStructure
        };
      }
    }
    if (intent.requiresHaving && !sqlStructure.hasHaving) {
      return {
        valid: false,
        reason: "Question filters groups based on an aggregated value, which requires a HAVING clause with GROUP BY.",
        intent,
        sqlStructure
      };
    }
    if (!intent.isSingleWinnerRanking && intent.requestedLimit === null && sqlStructure.limitValue === 1) {
      return {
        valid: false,
        reason: "Question asks for values across each group, but SQL has LIMIT 1 which only returns a single row.",
        intent,
        sqlStructure
      };
    }
  }
  if (intent.aggregationType === "OVERALL" && !intent.requiresGroupBy && sqlStructure.hasGroupBy) {
    return {
      valid: false,
      reason: "Question asks for a single overall aggregate value, but generated SQL includes an unrequested GROUP BY clause.",
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
function synthesizeGroupedOrOverallSql(intent) {
  const tbl = intent.targetTable;
  if (!tbl) return null;
  const aggFn = intent.expectedAggFunctions[0] || "SUM";
  const metricCol = intent.metricColumns[0] || tbl.numericCols[0] || "id";
  if (intent.aggregationType === "OVERALL" && !intent.requiresGroupBy) {
    let aggExpr = "";
    let alias = "";
    if (aggFn === "COUNT") {
      if (intent.countDistinctColumn) {
        aggExpr = `COUNT(DISTINCT "${intent.countDistinctColumn}")`;
        alias = `total_${intent.countDistinctColumn}_count`;
      } else {
        aggExpr = "COUNT(*)";
        alias = "total_count";
      }
    } else if (aggFn === "AVG") {
      aggExpr = `ROUND(AVG("${metricCol}"), 2)`;
      alias = `avg_${metricCol}`;
    } else if (aggFn === "MAX") {
      aggExpr = `ROUND(MAX("${metricCol}"), 2)`;
      alias = `max_${metricCol}`;
    } else if (aggFn === "MIN") {
      aggExpr = `ROUND(MIN("${metricCol}"), 2)`;
      alias = `min_${metricCol}`;
    } else {
      aggExpr = `ROUND(SUM("${metricCol}"), 2)`;
      alias = `total_${metricCol}`;
    }
    const sql = `SELECT ${aggExpr} AS "${alias}" FROM "${tbl.tableName}";`;
    return {
      sql,
      operation: "AGGREGATION",
      requiresVisualization: false,
      recommendedVisualization: "none",
      outputFormat: "kpi_metric",
      chartTitle: `Overall ${alias.replace(/_/g, " ")}`,
      xKey: "",
      yKeys: [alias],
      description: `Calculated the overall ${alias.replace(/_/g, " ")} across "${tbl.tableName}".`
    };
  }
  if (intent.requiresGroupBy && intent.groupingDimensions.length > 0) {
    const dims = intent.groupingDimensions;
    const primaryDim = dims[0];
    const hasJoinedDims = dims.some((d) => Boolean(d.joinInfo));
    const tblPrefix = hasJoinedDims ? "t." : "";
    let aggExpr = "";
    let rawAggExpr = "";
    let alias = "";
    if (aggFn === "COUNT") {
      if (intent.countDistinctColumn) {
        rawAggExpr = `COUNT(DISTINCT ${tblPrefix}"${intent.countDistinctColumn}")`;
        aggExpr = rawAggExpr;
        alias = `${intent.countDistinctColumn.replace(/_id$/i, "")}_count`;
      } else {
        rawAggExpr = "COUNT(*)";
        aggExpr = "COUNT(*)";
        alias = `${tbl.tableName}_count`;
      }
    } else if (aggFn === "AVG") {
      rawAggExpr = `AVG(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(AVG(${tblPrefix}"${metricCol}"), 2)`;
      alias = `avg_${metricCol}`;
    } else if (aggFn === "MAX") {
      rawAggExpr = `MAX(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(MAX(${tblPrefix}"${metricCol}"), 2)`;
      alias = `max_${metricCol}`;
    } else if (aggFn === "MIN") {
      rawAggExpr = `MIN(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(MIN(${tblPrefix}"${metricCol}"), 2)`;
      alias = `min_${metricCol}`;
    } else {
      rawAggExpr = `SUM(${tblPrefix}"${metricCol}")`;
      aggExpr = `ROUND(SUM(${tblPrefix}"${metricCol}"), 2)`;
      alias = `total_${metricCol}`;
    }
    const joinMap = /* @__PURE__ */ new Map();
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
    const selectCols = dims.map((d) => {
      if (d.joinInfo) {
        const j = joinMap.get(d.joinInfo.joinTable);
        return `${j.alias}."${d.columnName}"`;
      }
      return `${tblPrefix}"${d.columnName}"`;
    }).join(", ");
    const groupCols = selectCols;
    let fromAndJoins = `"${tbl.tableName}"${hasJoinedDims ? " t" : ""}`;
    for (const [jTable, jMeta] of joinMap.entries()) {
      fromAndJoins += ` JOIN "${jTable}" ${jMeta.alias} ON t."${jMeta.foreignKeyCol}" = ${jMeta.alias}."${jMeta.joinPkCol}"`;
    }
    let whereClause = "";
    if (intent.whereInFilter && intent.whereInFilter.values.length > 0) {
      whereClause = ` WHERE ${tblPrefix}"${intent.whereInFilter.columnName}" IN (${intent.whereInFilter.values.join(", ")})`;
    }
    let havingClause = "";
    if (intent.requiresHaving && intent.havingFilter) {
      const hf = intent.havingFilter;
      const hfExpr = hf.aggFn === "COUNT" ? rawAggExpr : `${hf.aggFn}(${tblPrefix}"${hf.metricCol}")`;
      havingClause = ` HAVING ${hfExpr} ${hf.operator} ${hf.threshold}`;
    }
    const orderClause = ` ORDER BY "${alias}" ${intent.orderDirection}`;
    const limitClause = intent.requestedLimit !== null ? ` LIMIT ${intent.requestedLimit}` : "";
    const sql = `SELECT ${selectCols}, ${aggExpr} AS "${alias}" FROM ${fromAndJoins}${whereClause} GROUP BY ${groupCols}${havingClause}${orderClause}${limitClause};`;
    const isSingleRow = intent.requestedLimit === 1;
    const groupNamesLabel = dims.map((d) => d.columnName.replace(/_/g, " ")).join(" & ");
    return {
      sql,
      operation: isSingleRow ? "RANKING" : "COMPARISON",
      requiresVisualization: !isSingleRow,
      recommendedVisualization: isSingleRow ? "none" : "bar",
      outputFormat: isSingleRow ? "direct_answer" : "chart_and_table",
      chartTitle: `${alias.replace(/_/g, " ")} by ${groupNamesLabel}`,
      xKey: primaryDim.columnName,
      yKeys: [alias],
      description: `Calculated ${alias.replace(/_/g, " ")} grouped by ${groupNamesLabel} in "${tbl.tableName}"${havingClause ? ` (filtered with${havingClause})` : ""}.`
    };
  }
  return null;
}

// server.ts
dotenv2.config({ override: true });
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
app.use((req, _res, next) => {
  try {
    const parsedUrl = new URL(req.url, "http://localhost");
    const forwardedPath = parsedUrl.searchParams.get("__pathname");
    if (forwardedPath) {
      parsedUrl.searchParams.delete("__pathname");
      const search = parsedUrl.searchParams.toString();
      const normalized = forwardedPath.startsWith("/") ? forwardedPath : `/${forwardedPath}`;
      const apiPath = normalized.startsWith("/api/") ? normalized : `/api${normalized}`;
      req.url = `${apiPath}${search ? `?${search}` : ""}`;
    } else if (!req.url.startsWith("/api/") && !req.url.startsWith("/api?")) {
      const clean = req.url.startsWith("/") ? req.url : `/${req.url}`;
      if (clean.startsWith("/health") || clean.startsWith("/auth/") || clean.startsWith("/chat/") || clean.startsWith("/sql/")) {
        req.url = `/api${clean}`;
      }
    }
  } catch {
  }
  next();
});
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json({ limit: "10mb" }));
function getApiKey() {
  return (process.env.GEMINI_API_KEY || "").trim();
}
var apiKey = getApiKey();
var ai = new GoogleGenAI({
  apiKey: apiKey || "placeholder-key",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
function callWithTimeout(promise, ms = 4500) {
  return Promise.race([
    promise,
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`AI generation timed out after ${ms}ms`)), ms)
    )
  ]);
}
var modelCooldownUntil = {};
async function generateWithGeminiModels(params, timeoutMs = 12e3) {
  const models = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest"
  ];
  let lastError;
  for (const modelName of models) {
    if (modelCooldownUntil[modelName] && Date.now() < modelCooldownUntil[modelName]) {
      continue;
    }
    try {
      const activeConfig = { ...params.config };
      return await callWithTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: activeConfig
        }),
        timeoutMs
      );
    } catch (err) {
      lastError = err;
      const errStr = err instanceof Error ? err.message : String(err);
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("404") || errStr.includes("NOT_FOUND")) {
        modelCooldownUntil[modelName] = Date.now() + 6e4;
        continue;
      }
      if (errStr.includes("thinking") || errStr.includes("INVALID_ARGUMENT")) {
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
        } catch (retryErr) {
          lastError = retryErr;
          continue;
        }
      }
      continue;
    }
  }
  throw lastError || new Error("All Gemini models rate-limited");
}
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "QueryWise Backend",
    database: "SQLite Server Database Active",
    hasApiKey: Boolean(apiKey && apiKey !== "MY_GEMINI_API_KEY"),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, fullName, accountProof: existingProof } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email address is required." });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }
    const { user, accountProof } = await ServerAuthDatabase.register(
      email,
      password,
      typeof fullName === "string" ? fullName : "",
      typeof existingProof === "string" ? existingProof : void 0
    );
    res.status(201).json({
      success: true,
      message: "Account created successfully! Please sign in with your credentials.",
      user,
      accountProof
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("already exists") ? 409 : 400;
    res.status(status).json({ error: msg });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password, accountProof } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("No account found") ? 404 : 401;
    res.status(status).json({ error: msg });
  }
});
app.get("/api/auth/session", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : req.query.token;
    if (!token) {
      res.status(401).json({ error: "No session token provided." });
      return;
    }
    const user = ServerAuthDatabase.validateSession(token);
    if (!user) {
      res.status(401).json({ error: "Invalid or expired session." });
      return;
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: "Session check failed." });
  }
});
app.post("/api/auth/logout", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : req.body.token;
    if (token) {
      ServerAuthDatabase.logout(token);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Logout failed." });
  }
});
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email, accountProof } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email is required." });
      return;
    }
    const { code } = await ServerAuthDatabase.requestPasswordReset(email, accountProof);
    res.json({
      success: true,
      message: "Password reset code generated and issued.",
      resetCode: code
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: msg });
  }
});
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, password, code, accountProof } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and new password are required." });
      return;
    }
    const result = await ServerAuthDatabase.resetPassword(email, password, code, accountProof);
    res.json({
      success: true,
      message: "Password updated successfully! Please sign in with your new credentials.",
      accountProof: result.accountProof
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});
app.post("/api/auth/update-profile", (req, res) => {
  try {
    const { userId, fullName } = req.body;
    if (!userId || !fullName) {
      res.status(400).json({ error: "User ID and full name are required." });
      return;
    }
    const updated = ServerAuthDatabase.updateProfile(userId, fullName);
    res.json({ success: true, user: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});
app.post("/api/auth/complete-onboarding", (req, res) => {
  try {
    const { userId } = req.body;
    if (userId) {
      ServerAuthDatabase.completeOnboarding(userId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to record onboarding completion." });
  }
});
app.post("/api/auth/complete-welcome", (req, res) => {
  try {
    const { userId } = req.body;
    if (userId) {
      ServerAuthDatabase.completeFirstLogin(userId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to record welcome completion." });
  }
});
function validateGeneratedSql(sql, schemaContext) {
  const trimmed = (sql || "").trim();
  if (!trimmed) {
    return { safe: true, sanitizedSql: "" };
  }
  const withoutComments = trimmed.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!withoutComments) {
    return { safe: false, reason: "Empty SQL query." };
  }
  const upper = withoutComments.toUpperCase();
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH") && !upper.startsWith("PRAGMA") && !upper.startsWith("EXPLAIN")) {
    return {
      safe: false,
      reason: "Security Policy Violation: Only read-only SELECT queries are permitted."
    };
  }
  if (upper.startsWith("PRAGMA") && withoutComments.includes("=")) {
    return {
      safe: false,
      reason: "Security Policy Violation: Write PRAGMA statements are forbidden."
    };
  }
  const forbiddenKeywords = [
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "ALTER",
    "TRUNCATE",
    "REPLACE",
    "CREATE",
    "GRANT",
    "REVOKE",
    "ATTACH",
    "DETACH",
    "VACUUM",
    "REINDEX",
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
    "SAVEPOINT"
  ];
  const withoutStringLiterals = withoutComments.replace(/'[^']*'/g, "''");
  for (const kw of forbiddenKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(withoutStringLiterals)) {
      return {
        safe: false,
        reason: `Security Policy Violation: Destructive keyword "${kw}" is strictly forbidden.`
      };
    }
  }
  const statements = withoutStringLiterals.split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length > 1) {
    return {
      safe: false,
      reason: "Security Policy Violation: Multiple stacked SQL statements are not allowed."
    };
  }
  if (schemaContext) {
    const tables = parseSchemaStructure(schemaContext);
    if (tables.length > 0) {
      const allowedSet = new Set(tables.map((t) => t.tableName.toLowerCase()));
      allowedSet.add("sqlite_master");
      allowedSet.add("sqlite_schema");
      const cteRegex = /\b(?:WITH(?:\s+RECURSIVE)?|,)\s+["`[]?([a-zA-Z_][a-zA-Z0-9_]*)["`\]]?\s+AS\s*\(/gi;
      let cteMatch;
      while ((cteMatch = cteRegex.exec(withoutStringLiterals)) !== null) {
        allowedSet.add(cteMatch[1].toLowerCase());
      }
      const tableRefRegex = /\b(?:FROM|JOIN)\s+["`[]?([a-zA-Z_][a-zA-Z0-9_]*)["`\]]?(?!\s*\()/gi;
      let match;
      while ((match = tableRefRegex.exec(withoutStringLiterals)) !== null) {
        const refTable = match[1].toLowerCase();
        if (!allowedSet.has(refTable)) {
          return {
            safe: false,
            reason: `Unauthorized or unknown table "${match[1]}". Available tables: ${tables.map((t) => t.tableName).join(", ")}.`
          };
        }
      }
    }
  }
  return { safe: true, sanitizedSql: trimmed };
}
app.post("/api/chat/process", async (req, res) => {
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
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Query is required." });
      return;
    }
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      const fallbackResult = generateLocalFallback(query, schemaContext, databaseName, conversationHistory, databaseId);
      res.json(fallbackResult);
      return;
    }
    const formattedHistory = Array.isArray(conversationHistory) && conversationHistory.length > 0 ? `
Prior Conversation Context (Multi-Turn Memory - use this to resolve pronouns like "their", "those", "it", "only the one with...", or references to previous entities, tables, columns, and SQL queries):
${conversationHistory.slice(-8).map((m, idx) => {
      let entry = `[Turn ${idx + 1}] ${m.role.toUpperCase()}: ${m.content}`;
      if (m.sql) {
        entry += `
  Executed SQL: ${m.sql}`;
      }
      if (m.resultSummary) {
        entry += `
  Query Result Summary: ${m.resultSummary}`;
      }
      return entry;
    }).join("\n\n")}
` : "";
    const systemInstruction = `You are QueryWise, an intelligent, conversational AI database analyst and SQL architect powered by Google Gemini.
You are communicating with a user about their currently connected SQLite database:
- Database ID: "${databaseId || "active-db"}"
- Database Name: "${databaseName || "Active Database"}"
- Database Type: "${databaseType || "SQLite"}"
- Domain / Category: "${databaseCategory || "Analytics"}"

Connected Database Schema (Tables, Columns, Data Types, Primary Keys, Foreign Key Relationships):
${schemaContext || "No schema provided"}

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
        contents: `${formattedHistory}Current User Question (Database: "${databaseName || "Active DB"}", ID: "${databaseId || "active"}"): "${query}"`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: {
                type: Type.STRING,
                description: "One of: GREETING, GENERAL_CONVERSATION, DATA_QUERY, FOLLOW_UP_QUERY, CLARIFICATION_NEEDED, EXPLAIN_SQL, OPTIMIZE_SQL"
              },
              intentDetection: {
                type: Type.OBJECT,
                properties: {
                  operation: { type: Type.STRING, description: "RECORD_RETRIEVAL, AGGREGATION, COMPARISON, RANKING, FILTERING, SUMMARY, GENERAL" },
                  isGrouped: { type: Type.BOOLEAN, description: "True if the query groups results by one or more columns using GROUP BY" },
                  groupByColumns: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Columns used in GROUP BY clause, if any"
                  },
                  requestedRowCount: { type: Type.INTEGER, description: "Exact requested row limit or 0 if none" },
                  requiresVisualization: { type: Type.BOOLEAN },
                  recommendedVisualization: { type: Type.STRING, description: "bar, line, pie, area, or none" },
                  outputFormat: { type: Type.STRING, description: "direct_answer, kpi_metric, table, chart_and_table" }
                },
                required: ["operation", "requiresVisualization", "outputFormat"]
              },
              content: {
                type: Type.STRING,
                description: "Clear, direct, conversational response answering the user question"
              },
              sql: {
                type: Type.STRING,
                description: "Valid read-only SQLite SELECT query strictly honoring requested limits, GROUP BY, and HAVING requirements"
              },
              chartRecommendation: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "bar, line, pie, area, or none" },
                  title: { type: Type.STRING, description: "Descriptive chart title" },
                  xKey: { type: Type.STRING, description: "Column name for x-axis / categories" },
                  yKeys: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Numeric metric column names for y-axis"
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
            required: ["intent", "intentDetection", "content", "chartRecommendation"]
          }
        }
      },
      15e3
    );
    const parsed = JSON.parse(response.text || "{}");
    parsed.suggestedFollowUps = [];
    parsed.databaseId = databaseId;
    if (parsed.sql && parsed.sql.trim() && parsed.intent !== "GREETING" && parsed.intent !== "CLARIFICATION_NEEDED") {
      let semanticCheck = validateSqlSemantics(
        query,
        parsed.sql,
        schemaContext || "",
        conversationHistory || [],
        parsed.intentDetection
      );
      if (!semanticCheck.valid) {
        console.warn(`[Semantic SQL Validator] Rejected initial SQL for "${query}": ${semanticCheck.reason}`);
        let regeneratedSuccess = false;
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
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    sql: { type: Type.STRING },
                    content: { type: Type.STRING }
                  },
                  required: ["sql", "content"]
                }
              }
            },
            8e3
          );
          const regenParsed = JSON.parse(regenResponse.text || "{}");
          if (regenParsed.sql) {
            const recheck = validateSqlSemantics(
              query,
              regenParsed.sql,
              schemaContext || "",
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
          console.warn("[Semantic SQL Validator] Gemini regeneration failed, synthesizing verified SQL:", regenErr);
        }
        if (!regeneratedSuccess) {
          const synthesized = synthesizeGroupedOrOverallSql(semanticCheck.intent);
          if (synthesized) {
            parsed.sql = synthesized.sql;
            parsed.content = synthesized.description;
            parsed.intentDetection = {
              operation: synthesized.operation,
              isGrouped: semanticCheck.intent.requiresGroupBy,
              groupByColumns: semanticCheck.intent.groupingDimensions.map((d) => d.columnName),
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
              schemaContext || "",
              conversationHistory || [],
              parsed.intentDetection
            );
          }
        }
      }
      if (semanticCheck.sqlStructure.hasGroupBy && semanticCheck.sqlStructure.limitValue !== 1) {
        const groupCols = semanticCheck.sqlStructure.groupByColumns;
        parsed.intentDetection = {
          ...parsed.intentDetection || {},
          operation: parsed.intentDetection?.operation === "SUMMARY" ? "SUMMARY" : "COMPARISON",
          isGrouped: true,
          groupByColumns: groupCols,
          requiresVisualization: true,
          recommendedVisualization: parsed.intentDetection?.recommendedVisualization && parsed.intentDetection.recommendedVisualization !== "none" ? parsed.intentDetection.recommendedVisualization : "bar",
          outputFormat: "chart_and_table"
        };
        if (!parsed.chartRecommendation || parsed.chartRecommendation.type === "none" || !parsed.chartRecommendation.xKey) {
          parsed.chartRecommendation = {
            type: "bar",
            title: parsed.chartRecommendation?.title || `Grouped Analysis by ${groupCols.join(" & ")}`,
            xKey: groupCols[0] || "",
            yKeys: parsed.chartRecommendation?.yKeys || []
          };
        }
      } else if (semanticCheck.intent.aggregationType === "OVERALL" && !semanticCheck.sqlStructure.hasGroupBy) {
        parsed.intentDetection = {
          ...parsed.intentDetection || {},
          operation: "AGGREGATION",
          isGrouped: false,
          groupByColumns: [],
          requiresVisualization: false,
          recommendedVisualization: "none",
          outputFormat: "kpi_metric"
        };
      }
    }
    if (parsed.sql && parsed.sql.trim()) {
      const validation = validateGeneratedSql(parsed.sql, schemaContext);
      if (!validation.safe) {
        res.json({
          intent: "DATA_QUERY",
          intentDetection: parsed.intentDetection || {
            operation: "GENERAL",
            requestedRowCount: 0,
            requiresVisualization: false,
            recommendedVisualization: "none",
            outputFormat: "direct_answer"
          },
          content: `I cannot execute that operation. ${validation.reason}`,
          sql: "",
          error: validation.reason,
          suggestedFollowUps: [],
          databaseId
        });
        return;
      }
    }
    res.json(parsed);
  } catch (error) {
    console.warn("Gemini generateContent timed out or threw error, using schema-aware fallback:", error);
    const { query, schemaContext, databaseName, conversationHistory, databaseId } = req.body;
    const fallback = generateLocalFallback(query || "", schemaContext || "", databaseName || "", conversationHistory || [], databaseId);
    res.json(fallback);
  }
});
app.post("/api/chat/interpret", async (req, res) => {
  try {
    const { databaseId, databaseName, query, sql, columns, rows, rowCount } = req.body;
    const safeColumns = Array.isArray(columns) ? columns : [];
    const safeRows = Array.isArray(rows) ? rows : [];
    const actualCount = typeof rowCount === "number" ? rowCount : safeRows.length;
    const localSummary = buildGroundedLocalInterpretation(query || "", sql || "", safeColumns, safeRows, actualCount, databaseName);
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
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
    const formattedRows = sampleRows.map((r) => {
      const obj = {};
      safeColumns.forEach((col, i) => {
        obj[col] = r[i];
      });
      return obj;
    });
    const prompt = `You are QueryWise, an intelligent conversational database analyst.
The user asked a question against database "${databaseName || "Connected Database"}" (ID: "${databaseId || "active"}"):
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
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING, description: "Direct 1-2 sentence answer grounded in exact returned values" },
              interpretation: { type: Type.STRING, description: "Clear explanation and observations of the returned data" },
              observations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "2-4 specific observations grounded in the query result"
              },
              kpis: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.STRING },
                    change: { type: Type.STRING },
                    trend: { type: Type.STRING, description: "up, down, or neutral" }
                  },
                  required: ["label", "value"]
                }
              }
            },
            required: ["headline", "interpretation"]
          }
        }
      },
      12e3
    );
    const parsed = JSON.parse(response.text || "{}");
    res.json({
      databaseId,
      headline: parsed.headline || localSummary.headline,
      interpretation: parsed.interpretation || localSummary.interpretation,
      observations: Array.isArray(parsed.observations) ? parsed.observations : localSummary.observations,
      kpis: Array.isArray(parsed.kpis) && parsed.kpis.length > 0 ? parsed.kpis : generateBasicKPIs(safeColumns, safeRows, sql),
      suggestedFollowUps: []
    });
  } catch (error) {
    console.warn("Interpret fallback used:", error);
    const { databaseId, databaseName, query, sql, columns, rows, rowCount } = req.body;
    const safeColumns = Array.isArray(columns) ? columns : [];
    const safeRows = Array.isArray(rows) ? rows : [];
    const actualCount = typeof rowCount === "number" ? rowCount : safeRows.length;
    const localSummary = buildGroundedLocalInterpretation(query || "", sql || "", safeColumns, safeRows, actualCount, databaseName);
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
app.post("/api/sql/repair", async (req, res) => {
  try {
    const { query, failedSql, sqlError, schemaContext, databaseId, databaseName, conversationHistory } = req.body;
    if (!failedSql || !sqlError) {
      res.status(400).json({ error: "failedSql and sqlError are required." });
      return;
    }
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
      try {
        const response = await generateWithGeminiModels(
          {
            contents: `The following SQLite query failed against database "${databaseName || "Active DB"}" (ID: "${databaseId || "active"}"):
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
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  repairedSql: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["repairedSql", "explanation"]
              }
            }
          },
          1e4
        );
        const parsed = JSON.parse(response.text || "{}");
        if (parsed.repairedSql) {
          const check = validateGeneratedSql(parsed.repairedSql, schemaContext);
          const semCheck = validateSqlSemantics(query || "", parsed.repairedSql, schemaContext || "", conversationHistory || []);
          if (check.safe && semCheck.valid) {
            res.json({
              repairedSql: parsed.repairedSql,
              explanation: parsed.explanation
            });
            return;
          }
        }
      } catch (e) {
        console.warn("Gemini SQL repair failed, falling back to local schema repair:", e);
      }
    }
    const fallback = generateLocalFallback(query || "", schemaContext || "", databaseName || "", conversationHistory || [], databaseId);
    res.json({
      repairedSql: fallback.sql || "",
      explanation: fallback.content || "Adjusted SQL query to match available schema columns."
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
app.post("/api/sql/optimize", async (req, res) => {
  try {
    const { sql, schemaContext } = req.body;
    if (!sql) {
      res.status(400).json({ error: "SQL query required." });
      return;
    }
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.json({
        optimizedSql: sql,
        explanation: "Local optimization: Ensure proper indexes exist on JOIN foreign keys and WHERE filtering columns."
      });
      return;
    }
    const response = await generateWithGeminiModels(
      {
        contents: `Schema:
${schemaContext || "Standard SQLite"}

Original SQL:
${sql}

Optimize this query for SQLite. Suggest index creations if helpful, improve joins or subqueries, and explain improvements accurately.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
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
            required: ["optimizedSql", "explanation"]
          }
        }
      },
      1e4
    );
    res.json(JSON.parse(response.text || "{}"));
  } catch (err) {
    console.warn("Optimize fallback:", err);
    const { sql } = req.body;
    res.json({
      optimizedSql: sql,
      explanation: "Query structure is already standard. Recommend ensuring indexes exist on foreign key columns and WHERE clause filters to optimize scan performance.",
      suggestedIndexes: ["CREATE INDEX IF NOT EXISTS idx_perf ON sales(sale_date);"]
    });
  }
});
app.post("/api/sql/explain", async (req, res) => {
  try {
    const { sql, schemaContext } = req.body;
    if (!sql) {
      res.status(400).json({ error: "SQL query required." });
      return;
    }
    const localAnalysis = deconstructSqlClauses(sql);
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.json({
        explanation: localAnalysis.overview,
        breakdown: localAnalysis.breakdown,
        businessContext: localAnalysis.businessContext,
        complexity: localAnalysis.complexity
      });
      return;
    }
    try {
      const response = await generateWithGeminiModels(
        {
          contents: `Explain this SQL query step-by-step for a business analyst and developer:
${sql}

Schema:
${schemaContext || ""}`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                explanation: { type: Type.STRING, description: "High level summary of what the query produces" },
                breakdown: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      clause: { type: Type.STRING },
                      description: { type: Type.STRING }
                    },
                    required: ["clause", "description"]
                  }
                },
                businessContext: { type: Type.STRING }
              },
              required: ["explanation", "breakdown"]
            }
          }
        },
        1e4
      );
      const parsed = JSON.parse(response.text || "{}");
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
    }
    res.json({
      explanation: localAnalysis.overview,
      breakdown: localAnalysis.breakdown,
      businessContext: localAnalysis.businessContext,
      complexity: localAnalysis.complexity
    });
  } catch (err) {
    console.warn("Explain endpoint error, returning instant local breakdown:", err);
    const { sql } = req.body;
    const fallback = deconstructSqlClauses(sql || "SELECT * FROM data;");
    res.json({
      explanation: fallback.overview,
      breakdown: fallback.breakdown,
      businessContext: fallback.businessContext,
      complexity: fallback.complexity
    });
  }
});
function parseWordNumber(text) {
  const map = {
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
  if (map[clean] !== void 0) return map[clean];
  const num = parseInt(clean, 10);
  return isNaN(num) ? null : num;
}
function parseSchemaStructure(schemaText) {
  const tables = [];
  const blocks = (schemaText || "").split(/Table:\s*"?/i).slice(1);
  for (const block of blocks) {
    const nameMatch = block.match(/^([a-zA-Z0-9_]+)["\s(:]/);
    if (!nameMatch) continue;
    const tableName = nameMatch[1];
    let rowCount = 0;
    const countMatch = block.match(/\((\d+)\s+records?\)/i);
    if (countMatch) {
      rowCount = parseInt(countMatch[1], 10);
    }
    const columns = [];
    const lines = block.split("\n");
    for (const line of lines) {
      const colMatch = line.match(/^\s*-\s*([a-zA-Z0-9_]+)\s*\(([^)]+)\)/);
      if (colMatch) {
        const colName = colMatch[1];
        const colMeta = colMatch[2];
        const colType = colMeta.split(",")[0].trim().toUpperCase();
        const isPk = /primary\s*key/i.test(colMeta) || colName.toLowerCase() === "id" || colName.toLowerCase() === `${tableName.toLowerCase()}_id` || colName.toLowerCase() === `${tableName.toLowerCase().replace(/s$/, "")}_id`;
        const isFk = /foreign\s*key/i.test(colMeta) || !isPk && /_id$/i.test(colName);
        const isDate = /date|time|timestamp/i.test(colType) || /created_at|updated_at|timestamp|sale_date|order_date|join_date|appointment_date|date|transaction_date|admit_date/i.test(colName);
        const isNumeric = !isPk && !isFk && (/int|real|float|double|decimal|numeric/i.test(colType) || /revenue|amount|salary|balance|spent|price|marks|attendance|units|score|age|rate|cost|fee|quantity|level|rating|pct|percent|ph|nitrogen|phosphorus|potassium|value/i.test(colName));
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
    const primaryKeyCol = columns.find((c) => c.isPrimaryKey)?.name;
    const dateCol = columns.find((c) => c.isDate)?.name;
    const numericCols = columns.filter((c) => c.isNumeric).map((c) => c.name);
    const textCols = columns.filter((c) => c.isText).map((c) => c.name);
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
function generateLocalFallback(query, schema, dbName, conversationHistory = [], databaseId) {
  const q = query.toLowerCase().trim();
  const tables = parseSchemaStructure(schema);
  if (/^\s*(drop|delete|update|insert|alter|truncate|create|replace)\b/i.test(q)) {
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "GENERAL",
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "direct_answer"
      },
      content: "Security Policy Violation: Destructive or write operations (DROP, DELETE, UPDATE, INSERT, ALTER) are strictly forbidden. QueryWise operates in read-only mode.",
      sql: "",
      error: "Security Policy Violation: Only read-only SELECT queries are permitted.",
      suggestedFollowUps: []
    };
  }
  let activeTable;
  for (const t of tables) {
    const tName = t.tableName.toLowerCase();
    const tSingular = tName.replace(/s$/, "");
    if (new RegExp(`\\b${tName}\\b|\\b${tSingular}\\b`, "i").test(q)) {
      activeTable = t;
      break;
    }
  }
  if (!activeTable && tables.length > 0) {
    const queryTokens = q.split(/[\s,?.!;'"]+/).filter((tok) => tok.length > 2);
    let bestScore = 0;
    for (const t of tables) {
      let score = 0;
      for (const c of t.columns) {
        const cLow = c.name.toLowerCase();
        if (q.includes(cLow.replace(/_/g, " ")) || queryTokens.some((tok) => tok === cLow || tok.length > 3 && cLow.includes(tok))) {
          score += c.isNumeric ? 2 : 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        activeTable = t;
      }
    }
  }
  let lastAssistantSql = "";
  let lastResultSummary = "";
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
        const prev = `${item.content || ""} ${item.sql || ""}`.toLowerCase();
        for (const t of tables) {
          if (prev.includes(t.tableName.toLowerCase())) {
            activeTable = t;
            break;
          }
        }
      }
    }
  }
  if (!activeTable && tables.length > 0) {
    activeTable = [...tables].sort((a, b) => {
      const aScore = (a.numericCols.length > 0 ? 1e3 : 0) + (a.dateCol ? 500 : 0) + a.rowCount;
      const bScore = (b.numericCols.length > 0 ? 1e3 : 0) + (b.dateCol ? 500 : 0) + b.rowCount;
      return bScore - aScore;
    })[0];
  }
  const targetTable = activeTable?.tableName || "records";
  const primaryKeyCol = activeTable?.primaryKeyCol;
  const dateCol = activeTable?.dateCol;
  const preferredMetricNames = ["revenue", "amount", "salary", "balance", "price", "soil_score", "nitrogen", "marks", "score", "cost", "unit_price", "quantity"];
  const preferredCol = preferredMetricNames.map((p) => activeTable?.numericCols.find((c) => c.toLowerCase() === p)).find((c) => Boolean(c));
  const numericCol = activeTable?.numericCols.find((c) => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, " "))) || preferredCol || activeTable?.numericCols[0] || "amount";
  const textCol = activeTable?.textCols.find((c) => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, " "))) || activeTable?.textCols[0] || "name";
  if (q === "hi" || q === "hello" || q === "hey" || q.startsWith("hi ") || q.startsWith("hello ") || q === "who are you") {
    return {
      databaseId,
      intent: "GREETING",
      intentDetection: {
        operation: "GENERAL",
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "direct_answer"
      },
      content: `Hello! I'm QueryWise, your conversational database analyst. I'm connected to "${dbName || "your database"}" (${tables.length} table${tables.length === 1 ? "" : "s"}: ${tables.map((t) => t.tableName).join(", ")}). Ask me anything about your data!`,
      sql: "",
      suggestedFollowUps: []
    };
  }
  if (q.includes("what information") || q.includes("what data") || q.includes("what tables") || q.includes("describe this database") || q.includes("about this database") || q.includes("database contain") || q.includes("schema of") || q.includes("overview of this database")) {
    const tableDescriptions = tables.map((t) => {
      const colNames = t.columns.map((c) => `${c.name} (${c.type})`).join(", ");
      return `- **${t.tableName}** (${t.rowCount} records): ${colNames}`;
    }).join("\n");
    const unionSql = tables.length > 0 ? `${tables.map((t) => `SELECT '${t.tableName}' AS table_name, COUNT(*) AS record_count FROM "${t.tableName}"`).join(" UNION ALL ")};` : "";
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "SUMMARY",
        requestedRowCount: tables.length,
        requiresVisualization: tables.length > 1,
        recommendedVisualization: tables.length > 1 ? "bar" : "none",
        outputFormat: "table"
      },
      content: `The connected database **"${dbName || "Active Database"}"** contains **${tables.length} table${tables.length === 1 ? "" : "s"}**:

${tableDescriptions}`,
      sql: unionSql,
      chartRecommendation: {
        type: tables.length > 1 ? "bar" : "none",
        title: `Record Counts Across Tables in ${dbName || "Database"}`,
        xKey: "table_name",
        yKeys: ["record_count"]
      },
      suggestedFollowUps: []
    };
  }
  if (q.includes("clause") || q.includes("explain") || q.includes("how does this work") || q.includes("how does this query work") || q.includes("how does this sql work") || q.includes("break down") || q.includes("deconstruct")) {
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
    const breakdownFormatted = analysis.breakdown.map((b) => `* **\`${b.keyword}\`** (\`${b.expression}\`):
  ${b.description}`).join("\n\n");
    return {
      databaseId,
      intent: "EXPLAIN_SQL",
      intentDetection: {
        operation: "SUMMARY",
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "direct_answer"
      },
      content: `### SQL Clause-by-Clause Explanation

**Query Analyzed**:
\`\`\`sql
${targetSql}
\`\`\`

**Overview**: ${analysis.overview} (${analysis.complexity} Complexity)

**Clause Breakdown**:

${breakdownFormatted}

**Business Context**:
${analysis.businessContext}`,
      sql: targetSql,
      chartRecommendation: {
        type: "none",
        title: "SQL Clause Breakdown",
        xKey: "",
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }
  const isFollowUpRef = /\b(their|those|them|these|each of them|for each of those|from those|among those|only the)\b/i.test(q);
  const explicitNumericMatch = activeTable?.numericCols.find(
    (c) => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace(/_/g, " "))
  );
  if (isFollowUpRef && lastResultSummary) {
    try {
      const parsedPrev = JSON.parse(lastResultSummary);
      const prevRows = Array.isArray(parsedPrev.rows) ? parsedPrev.rows : [];
      const prevCols = Array.isArray(parsedPrev.columns) ? parsedPrev.columns : [];
      if (prevRows.length > 0 && prevCols.length > 0) {
        let entityColIndex = prevCols.findIndex(
          (c) => activeTable?.columns.some((ac) => ac.name.toLowerCase() === c.toLowerCase() && (ac.isText || ac.isPrimaryKey))
        );
        if (entityColIndex === -1) entityColIndex = 0;
        const matchedSchemaCol = activeTable?.columns.find((ac) => ac.name.toLowerCase() === prevCols[entityColIndex]?.toLowerCase())?.name || textCol;
        const entityValues = Array.from(
          new Set(
            prevRows.map((r) => r[entityColIndex]).filter((v) => v !== null && v !== void 0 && String(v).trim() !== "").map((v) => typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
          )
        );
        if (entityValues.length > 0) {
          const inClause = `"${matchedSchemaCol}" IN (${entityValues.join(", ")})`;
          if (q.includes("only the") || (q.includes("highest") || q.includes("lowest")) && !/\b(for each|in each|per|each of)\b/i.test(q)) {
            const isLowest = q.includes("lowest") || q.includes("minimum") || q.includes("least");
            const dir = isLowest ? "ASC" : "DESC";
            const sql = `SELECT "${matchedSchemaCol}", ROUND(AVG("${numericCol}"), 2) AS avg_${numericCol} FROM "${targetTable}" WHERE ${inClause} GROUP BY "${matchedSchemaCol}" ORDER BY avg_${numericCol} ${dir} LIMIT 1;`;
            return {
              databaseId,
              intent: "FOLLOW_UP_QUERY",
              intentDetection: {
                operation: "RANKING",
                isGrouped: true,
                groupByColumns: [matchedSchemaCol],
                requestedRowCount: 1,
                requiresVisualization: false,
                recommendedVisualization: "none",
                outputFormat: "direct_answer"
              },
              content: `Refining the previous selection to find the ${matchedSchemaCol.replace(/_/g, " ")} with the ${isLowest ? "lowest" : "highest"} ${numericCol.replace(/_/g, " ")}.`,
              sql,
              chartRecommendation: {
                type: "none",
                title: `${isLowest ? "Lowest" : "Highest"} ${numericCol.replace(/_/g, " ")}`,
                xKey: matchedSchemaCol,
                yKeys: [`avg_${numericCol}`]
              },
              suggestedFollowUps: []
            };
          }
          if (!explicitNumericMatch) {
            const metricsToAvg = (activeTable?.numericCols || [numericCol]).slice(0, 3);
            const selectMetrics = metricsToAvg.map((m) => `ROUND(AVG("${m}"), 2) AS avg_${m}`).join(", ");
            const yKeys = metricsToAvg.map((m) => `avg_${m}`);
            const sql = `SELECT "${matchedSchemaCol}", ${selectMetrics} FROM "${targetTable}" WHERE ${inClause} GROUP BY "${matchedSchemaCol}" ORDER BY ${yKeys[0]} DESC;`;
            return {
              databaseId,
              intent: "FOLLOW_UP_QUERY",
              intentDetection: {
                operation: "COMPARISON",
                isGrouped: true,
                groupByColumns: [matchedSchemaCol],
                requestedRowCount: entityValues.length,
                requiresVisualization: true,
                recommendedVisualization: "bar",
                outputFormat: "chart_and_table"
              },
              content: `Comparing average ${metricsToAvg.map((m) => m.replace(/_/g, " ")).join(", ")} across the ${entityValues.length} previously selected ${matchedSchemaCol.replace(/_/g, " ")}s.`,
              sql,
              chartRecommendation: {
                type: "bar",
                title: `Comparison Across Selected ${matchedSchemaCol.replace(/_/g, " ")}s`,
                xKey: matchedSchemaCol,
                yKeys
              },
              suggestedFollowUps: []
            };
          }
        }
      }
    } catch {
    }
  }
  const isPositionalRecordRequest = /\b(first|last|latest|newest|most recent|oldest|earliest)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty)\s*(records|rows|items|entries)?\b/i.test(q) || /\b(all records|all rows|show all|display all|every record|every row)\b/i.test(q);
  if (!isPositionalRecordRequest && !q.includes("trend") && !q.includes("over time") && !q.includes("time series")) {
    const schemaTables = parseSchemaTables(schema);
    const semanticIntent = analyzeQueryGroupingIntent(query, schemaTables, conversationHistory);
    if (semanticIntent.requiresGroupBy) {
      const synthesized = synthesizeGroupedOrOverallSql(semanticIntent);
      if (synthesized) {
        return {
          databaseId,
          intent: isFollowUpRef ? "FOLLOW_UP_QUERY" : "DATA_QUERY",
          intentDetection: {
            operation: synthesized.operation,
            isGrouped: true,
            groupByColumns: semanticIntent.groupingDimensions.map((d) => d.columnName),
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
  const numWordPattern = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twentyfive|thirty|forty|fifty|hundred";
  let extractedCount = null;
  const countRegexes = [
    new RegExp(`(?:last|latest|recent|newest|bottom|end)\\s+(${numWordPattern})\\s*(?:records|rows|items|entries|results)?`, "i"),
    new RegExp(`(${numWordPattern})\\s+(?:last|recent|latest|newest)\\s*(?:records|rows|items|entries|results)?`, "i"),
    new RegExp(`(?:first|top|earliest|oldest|initial|start)\\s+(${numWordPattern})\\s*(?:records|rows|items|entries|results)?`, "i"),
    new RegExp(`(?:display|show|fetch|get|select|list|limit)\\s+(${numWordPattern})\\s*(?:records|rows|items|entries|results)?`, "i"),
    new RegExp(`(${numWordPattern})\\s+(?:records|rows|items|entries|results)`, "i")
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
  const filterMatch = q.match(/(?:greater than|more than|above|over|exceeds|>)\s*(-?\d+(?:\.\d+)?)/i) || q.match(/(?:less than|below|under|<)\s*(-?\d+(?:\.\d+)?)/i) || q.match(/(?:equal to|equals|=)\s*(-?\d+(?:\.\d+)?)/i);
  if (filterMatch && (q.includes("where") || q.includes("greater than") || q.includes("less than") || q.includes("above") || q.includes("below") || q.includes("over") || q.includes("under") || q.includes(">") || q.includes("<"))) {
    const threshold = Number(filterMatch[1]);
    const isLess = /less than|below|under|</i.test(filterMatch[0]);
    const isEqual = /equal to|equals|=/i.test(filterMatch[0]) && !isLess && !/greater|more|above|over|>/i.test(filterMatch[0]);
    const op = isEqual ? "=" : isLess ? "<" : ">";
    const limitClause = extractedCount ? ` LIMIT ${extractedCount}` : "";
    const sql = `SELECT * FROM "${targetTable}" WHERE "${numericCol}" ${op} ${threshold} ORDER BY "${numericCol}" DESC${limitClause};`;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "FILTERING",
        requestedRowCount: extractedCount || 0,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "table"
      },
      content: `Filtering records from "${targetTable}" where "${numericCol}" is ${op} ${threshold}.`,
      sql,
      chartRecommendation: {
        type: "none",
        title: `Records in ${targetTable} where ${numericCol} ${op} ${threshold}`,
        xKey: primaryKeyCol || textCol,
        yKeys: [numericCol]
      },
      suggestedFollowUps: []
    };
  }
  if (q.includes("trend") || q.includes("over time") || q.includes("time series") || q.includes("monthly") || q.includes("progression")) {
    if (dateCol) {
      const sql = `SELECT substr("${dateCol}", 1, 7) AS period, COUNT(*) AS record_count, ROUND(SUM("${numericCol}"), 2) AS total_${numericCol}, ROUND(AVG("${numericCol}"), 2) AS avg_${numericCol} FROM "${targetTable}" GROUP BY period ORDER BY period ASC;`;
      return {
        databaseId,
        intent: "DATA_QUERY",
        intentDetection: {
          operation: "SUMMARY",
          requestedRowCount: 0,
          requiresVisualization: true,
          recommendedVisualization: "line",
          outputFormat: "chart_and_table"
        },
        content: `Analyzing time-series trends in "${targetTable}" grouped by period (${dateCol}) for ${numericCol.replace(/_/g, " ")}.`,
        sql,
        chartRecommendation: {
          type: "line",
          title: `Trend of ${numericCol.replace(/_/g, " ")} Over Time`,
          xKey: "period",
          yKeys: [`total_${numericCol}`, `avg_${numericCol}`]
        },
        suggestedFollowUps: []
      };
    } else {
      const sql = `SELECT "${textCol}", COUNT(*) AS record_count, ROUND(AVG("${numericCol}"), 2) AS avg_${numericCol}, ROUND(SUM("${numericCol}"), 2) AS total_${numericCol} FROM "${targetTable}" GROUP BY "${textCol}" ORDER BY avg_${numericCol} DESC;`;
      return {
        databaseId,
        intent: "DATA_QUERY",
        intentDetection: {
          operation: "SUMMARY",
          requestedRowCount: 0,
          requiresVisualization: true,
          recommendedVisualization: "bar",
          outputFormat: "chart_and_table"
        },
        content: `Analyzing key patterns and distributions across ${textCol.replace(/_/g, " ")} in "${targetTable}".`,
        sql,
        chartRecommendation: {
          type: "bar",
          title: `Trend & Distribution of ${numericCol.replace(/_/g, " ")} by ${textCol.replace(/_/g, " ")}`,
          xKey: textCol,
          yKeys: [`avg_${numericCol}`]
        },
        suggestedFollowUps: []
      };
    }
  }
  if (q.includes("total") && (q.includes("record") || q.includes("row") || q.includes("count") || q.includes("number of")) || q === "how many records" || q === "how many rows" || q.includes("count all") || q === "total records") {
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "AGGREGATION",
        requestedRowCount: 1,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "kpi_metric"
      },
      content: `Calculated the total number of records in table "${targetTable}".`,
      sql: `SELECT COUNT(*) AS total_records FROM "${targetTable}";`,
      chartRecommendation: {
        type: "none",
        title: `Total Records in ${targetTable}`,
        xKey: "",
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }
  if (isLast) {
    const count = extractedCount || 5;
    const orderCol = primaryKeyCol || dateCol;
    if (!orderCol) {
      return {
        databaseId,
        intent: "CLARIFICATION_NEEDED",
        intentDetection: {
          operation: "RECORD_RETRIEVAL",
          requestedRowCount: count,
          requiresVisualization: false,
          recommendedVisualization: "none",
          outputFormat: "direct_answer"
        },
        content: `Table "${targetTable}" does not have an explicit primary key, ID, or timestamp column to determine the last records. Which column should be used for ordering?`,
        clarificationOptions: (activeTable?.columns || []).slice(0, 3).map((c) => `Order by ${c.name} descending`),
        sql: "",
        suggestedFollowUps: []
      };
    }
    const sql = `SELECT * FROM (SELECT * FROM "${targetTable}" ORDER BY "${orderCol}" DESC LIMIT ${count}) ORDER BY "${orderCol}" ASC;`;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "RECORD_RETRIEVAL",
        requestedRowCount: count,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "table"
      },
      content: `Displaying the last ${count} records from "${targetTable}" ordered by "${orderCol}".`,
      sql,
      chartRecommendation: {
        type: "none",
        title: `Last ${count} Records from ${targetTable}`,
        xKey: orderCol,
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }
  if (isLatest) {
    const count = extractedCount || 5;
    const orderCol = dateCol || primaryKeyCol;
    if (orderCol) {
      const sql = `SELECT * FROM "${targetTable}" ORDER BY "${orderCol}" DESC LIMIT ${count};`;
      return {
        databaseId,
        intent: "DATA_QUERY",
        intentDetection: {
          operation: "RECORD_RETRIEVAL",
          requestedRowCount: count,
          requiresVisualization: false,
          recommendedVisualization: "none",
          outputFormat: "table"
        },
        content: `Displaying the latest ${count} records from "${targetTable}" based on "${orderCol}".`,
        sql,
        chartRecommendation: {
          type: "none",
          title: `Latest ${count} Records from ${targetTable}`,
          xKey: orderCol,
          yKeys: []
        },
        suggestedFollowUps: []
      };
    }
  }
  if (isOldest) {
    const count = extractedCount || 3;
    const orderCol = dateCol || primaryKeyCol;
    if (orderCol) {
      const sql = `SELECT * FROM "${targetTable}" ORDER BY "${orderCol}" ASC LIMIT ${count};`;
      return {
        databaseId,
        intent: "DATA_QUERY",
        intentDetection: {
          operation: "RECORD_RETRIEVAL",
          requestedRowCount: count,
          requiresVisualization: false,
          recommendedVisualization: "none",
          outputFormat: "table"
        },
        content: `Displaying the ${count} oldest records from "${targetTable}" based on "${orderCol}".`,
        sql,
        chartRecommendation: {
          type: "none",
          title: `Oldest ${count} Records from ${targetTable}`,
          xKey: orderCol,
          yKeys: []
        },
        suggestedFollowUps: []
      };
    }
  }
  if (isAll) {
    const sql = `SELECT * FROM "${targetTable}";`;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "RECORD_RETRIEVAL",
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "table"
      },
      content: `Displaying all records from "${targetTable}".`,
      sql,
      chartRecommendation: {
        type: "none",
        title: `All Records from ${targetTable}`,
        xKey: primaryKeyCol || "id",
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }
  if (q.includes("compare") || q.includes("across") || q.includes("breakdown") || q.includes("distribution") || q.includes("by category") || q.includes("by department") || q.includes("by region") || q.includes("by district")) {
    const dim = textCol;
    const metric = numericCol;
    const useAvg = q.includes("average") || q.includes("avg") || q.includes("mean");
    const aggFn = useAvg ? "AVG" : "SUM";
    const alias = useAvg ? `avg_${metric}` : `total_${metric}`;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "COMPARISON",
        requestedRowCount: 10,
        requiresVisualization: true,
        recommendedVisualization: "bar",
        outputFormat: "chart_and_table"
      },
      content: `Compared ${useAvg ? "average" : "total"} ${metric.replace(/_/g, " ")} across ${dim.replace(/_/g, " ")} in table "${targetTable}".`,
      sql: `SELECT "${dim}", ROUND(${aggFn}("${metric}"), 2) AS "${alias}", COUNT(*) AS record_count FROM "${targetTable}" GROUP BY "${dim}" ORDER BY "${alias}" DESC LIMIT 10;`,
      chartRecommendation: {
        type: "bar",
        title: `${useAvg ? "Average" : "Total"} ${metric.replace(/_/g, " ")} by ${dim.replace(/_/g, " ")}`,
        xKey: dim,
        yKeys: [alias]
      },
      suggestedFollowUps: []
    };
  }
  if (q.includes("top ") || q.includes("highest") || q.includes("maximum") || q.includes("best") || q.includes("most") || q.includes("lowest") || q.includes("minimum") || q.includes("least") || q.includes("smallest")) {
    const isLowest = /\b(lowest|minimum|least|smallest|worst|bottom)\b/i.test(q);
    const sortDir = isLowest ? "ASC" : "DESC";
    const rankLabel = isLowest ? "lowest" : "highest";
    const count = extractedCount || (q.includes("highest") || q.includes("lowest") || q.includes("minimum") || q.includes("maximum") ? 1 : 5);
    const hasSales = tables.some((t) => t.tableName === "sales");
    const hasCustomers = tables.some((t) => t.tableName === "customers");
    if (q.includes("customer") && (q.includes("revenue") || q.includes("spent") || q.includes("sales")) && hasSales && hasCustomers) {
      return {
        databaseId,
        intent: "DATA_QUERY",
        intentDetection: {
          operation: "RANKING",
          requestedRowCount: count,
          requiresVisualization: count > 1,
          recommendedVisualization: count > 1 ? "bar" : "none",
          outputFormat: count > 1 ? "table" : "direct_answer"
        },
        content: `Identified the ${count === 1 ? "customer" : `${count} customers`} with the ${rankLabel} total revenue.`,
        sql: `SELECT c.customer_name, c.loyalty_tier, ROUND(SUM(s.revenue), 2) AS total_revenue FROM customers c JOIN sales s ON c.customer_id = s.customer_id GROUP BY c.customer_id, c.customer_name ORDER BY total_revenue ${sortDir} LIMIT ${count};`,
        chartRecommendation: {
          type: count > 1 ? "bar" : "none",
          title: `${isLowest ? "Lowest" : "Top"} ${count} Customers by Revenue`,
          xKey: "customer_name",
          yKeys: ["total_revenue"]
        },
        suggestedFollowUps: []
      };
    }
    const dim = textCol;
    const metric = numericCol;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "RANKING",
        requestedRowCount: count,
        requiresVisualization: count > 1,
        recommendedVisualization: count > 1 ? "bar" : "none",
        outputFormat: count > 1 ? "table" : "direct_answer"
      },
      content: `Identified the ${count === 1 ? "entry" : `top ${count} entries`} in "${targetTable}" with the ${rankLabel} ${metric.replace(/_/g, " ")}.`,
      sql: `SELECT "${dim}", ROUND(SUM("${metric}"), 2) AS total_${metric} FROM "${targetTable}" GROUP BY "${dim}" ORDER BY total_${metric} ${sortDir} LIMIT ${count};`,
      chartRecommendation: {
        type: count > 1 ? "bar" : "none",
        title: `${isLowest ? "Lowest" : "Top"} ${count} by ${metric.replace(/_/g, " ")}`,
        xKey: dim,
        yKeys: [`total_${metric}`]
      },
      suggestedFollowUps: []
    };
  }
  if (q.includes("average") || q.includes("mean")) {
    const targetCol = numericCol;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "AGGREGATION",
        requestedRowCount: 1,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "kpi_metric"
      },
      content: `Calculated the average ${targetCol.replace(/_/g, " ")} in table "${targetTable}".`,
      sql: `SELECT ROUND(AVG("${targetCol}"), 2) AS average_${targetCol} FROM "${targetTable}";`,
      chartRecommendation: {
        type: "none",
        title: `Average ${targetCol.replace(/_/g, " ")}`,
        xKey: "",
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }
  if ((q.includes("sum") || q.includes("total")) && !q.includes("records") && !q.includes("rows")) {
    const targetCol = numericCol;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "AGGREGATION",
        requestedRowCount: 1,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "kpi_metric"
      },
      content: `Calculated the sum of ${targetCol.replace(/_/g, " ")} in table "${targetTable}".`,
      sql: `SELECT ROUND(SUM("${targetCol}"), 2) AS total_${targetCol} FROM "${targetTable}";`,
      chartRecommendation: {
        type: "none",
        title: `Total ${targetCol.replace(/_/g, " ")}`,
        xKey: "",
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }
  if (isFirst || extractedCount !== null && (q.includes("record") || q.includes("row") || q.includes("display") || q.includes("show") || q.includes("fetch") || q.includes("get") || q.includes("list")) || q.startsWith("display ") || q.startsWith("show ")) {
    const count = extractedCount !== null ? extractedCount : 10;
    const orderClause = primaryKeyCol ? ` ORDER BY "${primaryKeyCol}" ASC` : "";
    const sql = `SELECT * FROM "${targetTable}"${orderClause} LIMIT ${count};`;
    return {
      databaseId,
      intent: "DATA_QUERY",
      intentDetection: {
        operation: "RECORD_RETRIEVAL",
        requestedRowCount: count,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "table"
      },
      content: `Displaying the first ${count} records from "${targetTable}".`,
      sql,
      chartRecommendation: {
        type: "none",
        title: `First ${count} Records from ${targetTable}`,
        xKey: primaryKeyCol || "id",
        yKeys: []
      },
      suggestedFollowUps: []
    };
  }
  if (q === "show data" || q === "analytics" || q === "best performance" || q === "show performance") {
    return {
      databaseId,
      intent: "CLARIFICATION_NEEDED",
      intentDetection: {
        operation: "GENERAL",
        requestedRowCount: 0,
        requiresVisualization: false,
        recommendedVisualization: "none",
        outputFormat: "direct_answer"
      },
      content: `Would you like to review record totals, analyze metrics across categories, or inspect individual entries in "${targetTable}"?`,
      clarificationOptions: [
        `Display the first 10 records from ${targetTable}`,
        `Show total number of records in ${targetTable}`,
        `Compare metrics across ${textCol}`
      ],
      sql: "",
      suggestedFollowUps: []
    };
  }
  const defaultLimit = 20;
  return {
    databaseId,
    intent: "DATA_QUERY",
    intentDetection: {
      operation: "RECORD_RETRIEVAL",
      requestedRowCount: defaultLimit,
      requiresVisualization: false,
      recommendedVisualization: "none",
      outputFormat: "table"
    },
    content: `Retrieved ${defaultLimit} records from table "${targetTable}".`,
    sql: `SELECT * FROM "${targetTable}" LIMIT ${defaultLimit};`,
    chartRecommendation: {
      type: "none",
      title: `Records from ${targetTable}`,
      xKey: primaryKeyCol || "id",
      yKeys: []
    },
    suggestedFollowUps: []
  };
}
function buildGroundedLocalInterpretation(query, sql, columns, rows, rowCount, databaseName) {
  const q = (query || "").toLowerCase();
  if (rowCount === 0 || rows.length === 0) {
    return {
      headline: `No records matched your query in "${databaseName || "the connected database"}".`,
      interpretation: "The SQL query executed cleanly against the database schema, but zero rows satisfied the filter conditions.",
      observations: ["0 matching records returned."]
    };
  }
  if (rowCount === 1 && columns.length === 1) {
    const colLabel = columns[0].replace(/_/g, " ");
    const rawVal = rows[0][0];
    const formattedVal = typeof rawVal === "number" ? Number(rawVal.toFixed(2)).toLocaleString() : String(rawVal ?? "N/A");
    return {
      headline: `The ${colLabel} is ${formattedVal}.`,
      interpretation: `Computed directly from "${databaseName || "the database"}" using SQLite aggregation.`,
      observations: [`${colLabel}: ${formattedVal}`]
    };
  }
  if (rowCount === 1 && columns.length >= 2) {
    const entity = String(rows[0][0] ?? "Result");
    const metricCol = columns[columns.length - 1].replace(/_/g, " ");
    const rawVal = rows[0][columns.length - 1];
    const formattedVal = typeof rawVal === "number" ? Number(rawVal.toFixed(2)).toLocaleString() : String(rawVal ?? "");
    const isLowest = /\b(lowest|minimum|least|smallest|bottom|worst)\b/i.test(q);
    const descriptor = isLowest ? "lowest" : "highest";
    return {
      headline: `${entity} has the ${descriptor} ${metricCol} at ${formattedVal}.`,
      interpretation: `Based on the query results from "${databaseName || "the database"}", ${entity} ranks #1 with a ${metricCol} of ${formattedVal}.`,
      observations: [`Top matched entity: ${entity} (${metricCol}: ${formattedVal})`]
    };
  }
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
    const label = isLatest ? "most recent" : "first";
    return {
      headline: `Displaying the ${label} ${rowCount} records from the dataset (${columns[0]}: ${firstId} to ${lastId}).`,
      interpretation: `Retrieved ${rowCount} records ordered by ${columns[0]} (${firstId} to ${lastId}).`,
      observations: [
        `Returned ${rowCount} records with columns: ${columns.join(", ")}.`
      ]
    };
  }
  let numColIdx = -1;
  for (let c = 1; c < columns.length; c++) {
    if (!/^(id|.*_id|record_count|total_count)$/i.test(columns[c]) && typeof rows[0][c] === "number") {
      numColIdx = c;
      break;
    }
  }
  if (numColIdx === -1) {
    for (let c = columns.length - 1; c >= 0; c--) {
      if (!/^(id|.*_id)$/i.test(columns[c]) && typeof rows[0][c] === "number") {
        numColIdx = c;
        break;
      }
    }
  }
  if (numColIdx !== -1 && columns.length >= 2) {
    const metricName = columns[numColIdx].replace(/_/g, " ");
    const groupCols = columns.slice(0, numColIdx);
    const groupColLabel = groupCols.map((c) => c.replace(/_/g, " ")).join(" & ");
    const isGroupedSql = /\bGROUP\s+BY\b/i.test(sql || "");
    const formatEntityLabel = (r) => groupCols.map((_, idx) => String(r[idx] ?? "")).filter(Boolean).join(" \u2022 ") || String(r[0]);
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
    headline: `Retrieved ${rowCount} record${rowCount === 1 ? "" : "s"} matching your query.`,
    interpretation: `The query returned ${rowCount} rows across ${columns.length} columns (${columns.join(", ")}).`,
    observations: [`Total rows returned: ${rowCount}`]
  };
}
function generateBasicKPIs(columns, rows, sql) {
  const kpis = [];
  if (!rows || rows.length === 0) return kpis;
  if (rows.length === 1 && columns.length === 1) {
    const rawVal = rows[0][0];
    const formattedVal = typeof rawVal === "number" ? Number(rawVal.toFixed(2)).toLocaleString() : String(rawVal ?? "N/A");
    kpis.push({
      label: columns[0].replace(/_/g, " "),
      value: formattedVal,
      trend: "up"
    });
    return kpis;
  }
  const isGroupedSql = /\bGROUP\s+BY\b/i.test(sql || "");
  let numColIdx = -1;
  for (let c = 1; c < columns.length; c++) {
    if (!/^(id|.*_id|record_count|total_count)$/i.test(columns[c]) && typeof rows[0][c] === "number") {
      numColIdx = c;
      break;
    }
  }
  if (numColIdx === -1) {
    for (let c = columns.length - 1; c >= 0; c--) {
      if (!/^(id|.*_id)$/i.test(columns[c]) && typeof rows[0][c] === "number") {
        numColIdx = c;
        break;
      }
    }
  }
  if (isGroupedSql && rows.length > 1 && numColIdx !== -1) {
    const groupCols = columns.slice(0, numColIdx);
    const groupColLabel = groupCols.map((c) => c.replace(/_/g, " ")).join(" & ");
    const formatEntityLabel = (r) => groupCols.map((_, idx) => String(r[idx] ?? "")).filter(Boolean).join(" \u2022 ") || String(r[0]);
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
      trend: "neutral"
    });
    kpis.push({
      label: `Highest (${maxEntity})`,
      value: maxVal,
      trend: "up"
    });
    kpis.push({
      label: `Lowest (${minEntity})`,
      value: minVal,
      trend: "down"
    });
    kpis.push({
      label: `Group Avg`,
      value: Number(avg.toFixed(2)).toLocaleString(),
      trend: "neutral"
    });
    return kpis;
  }
  kpis.push({
    label: "Total Rows",
    value: rows.length.toLocaleString(),
    trend: "neutral"
  });
  if (numColIdx !== -1) {
    const col = columns[numColIdx];
    const sum = rows.reduce((acc, r) => acc + (typeof r[numColIdx] === "number" ? r[numColIdx] : 0), 0);
    const avg = sum / rows.length;
    kpis.push({
      label: `Avg ${col.replace(/_/g, " ")}`,
      value: Number(avg.toFixed(2)).toLocaleString(),
      trend: "neutral"
    });
    kpis.push({
      label: `Sum of ${col.replace(/_/g, " ")}`,
      value: Number(sum.toFixed(2)).toLocaleString(),
      trend: "up"
    });
  }
  return kpis;
}
app.all("/api/*", (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.path}`
  });
});
app.use((err, _req, res, _next) => {
  const msg = err instanceof Error ? err.message : "Internal server error";
  console.error("Unhandled API Error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: msg });
  }
});
async function startServer() {
  const isProduction = true;
  if (!isProduction) {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(
      /* @vite-ignore */
      vitePkg
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QueryWise server running at http://0.0.0.0:${PORT}`);
  });
}
var server_default = app;
var isServerlessRuntime = Boolean(
  "1"
);
if (!isServerlessRuntime) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}
export {
  app,
  server_default as default
};
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
