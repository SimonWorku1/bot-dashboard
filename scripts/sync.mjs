#!/usr/bin/env node
/**
 * Merge bot JSON files and publish an encrypted feed.
 *
 * The merged plaintext is kept in memory only. The only file this script
 * writes is feed.enc.json (AES-256-GCM). A passcode-keyed HMAC detects an
 * unchanged merge so the file is left untouched and git stays quiet.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_ITERATIONS = 250_000;
export const ITERATIONS = 250_000;
const MAX_ITERATIONS = 2_000_000;
const MAX_FILE_BYTES = 2_000_000;

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function sortDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sortDeep(item))
      .sort((a, b) => {
        const left = canonicalize(a);
        const right = canonicalize(b);
        if (left < right) return -1;
        if (left > right) return 1;
        return 0;
      });
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortDeep(value[key]);
    return out;
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function validKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 64 && !RESERVED_KEYS.has(key);
}

export function sanitize(value, depth = 0) {
  if (value === null) return null;
  if (depth > 6) return undefined;
  const type = typeof value;
  if (type === 'string') return value.length > 8000 ? value.slice(0, 8000) : value;
  if (type === 'boolean') return value;
  if (type === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value.slice(0, 1000)) {
      const clean = sanitize(item, depth + 1);
      if (clean !== undefined) out.push(clean);
    }
    return out;
  }
  if (type === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 200)) {
      if (!validKey(key)) continue;
      const clean = sanitize(item, depth + 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return undefined;
}

function coerceStat(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const number = Number(trimmed);
      if (Number.isFinite(number)) return number;
    }
    if (trimmed.length > 0 && trimmed.length <= 200) return trimmed;
  }
  return undefined;
}

const KNOWN_CATEGORIES = new Set(['jobs', 'school', 'social', 'finance', 'coding', 'other']);

function normalizeCategory(value) {
  const raw = asString(value, 'other').toLowerCase();
  if (!raw) return 'other';
  if (KNOWN_CATEGORIES.has(raw)) return raw;
  return raw.slice(0, 40);
}

function normalizeStatus(value, fallback = 'done') {
  const raw = asString(value, fallback).toLowerCase().replace(/[\s-]+/g, '_');
  return raw ? raw.slice(0, 40) : fallback;
}

function takeLink(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2000) : '';
}

function copyPrimitiveExtras(target, source, known) {
  for (const [key, value] of Object.entries(source)) {
    if (known.has(key) || !validKey(key)) continue;
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      target[key] = typeof value === 'string' ? value.slice(0, 2000) : value;
    }
  }
}

function normalizeActivity(raw) {
  if (!isPlainObject(raw)) return null;
  const title = asString(raw.title);
  const summary = asString(raw.summary);
  if (!title && !summary) return null;
  const date = asString(raw.date);
  const activity = {
    date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : '',
    title: title || 'Untitled',
    summary,
    category: normalizeCategory(raw.category),
    status: normalizeStatus(raw.status, 'done'),
  };
  const link = takeLink(raw.link);
  if (link) activity.link = link;
  copyPrimitiveExtras(activity, raw, new Set(['date', 'title', 'summary', 'category', 'status', 'link']));
  return activity;
}

function normalizeUpcoming(raw) {
  if (!isPlainObject(raw)) return null;
  const title = asString(raw.title);
  if (!title) return null;
  const due = asString(raw.due);
  const item = {
    due: /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : '',
    course: asString(raw.course).slice(0, 200),
    title: title.slice(0, 300),
    type: asString(raw.type).slice(0, 80),
    status: asString(raw.status).slice(0, 80),
  };
  copyPrimitiveExtras(item, raw, new Set(['due', 'course', 'title', 'type', 'status']));
  return item;
}

function normalizeUpload(raw) {
  if (!isPlainObject(raw)) return null;
  const title = asString(raw.title);
  if (!title) return null;
  const date = asString(raw.date);
  const upload = {
    title: title.slice(0, 300),
    status: asString(raw.status).slice(0, 80),
    date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : '',
  };
  if (typeof raw.views === 'number' && Number.isFinite(raw.views)) upload.views = raw.views;
  else if (typeof raw.views === 'string' && /^\d+$/.test(raw.views.trim())) upload.views = Number(raw.views.trim());
  const link = takeLink(raw.link);
  if (link) upload.link = link;
  copyPrimitiveExtras(upload, raw, new Set(['title', 'status', 'date', 'views', 'link']));
  return upload;
}

export function normalizeBot(raw, filename) {
  if (!isPlainObject(raw)) return null;
  if (raw.ciphertext && raw.salt && !raw.bot) return null;
  const fallbackName = filename.replace(/\.json$/i, '').replace(/[-_]+/g, ' ').trim();
  const bot = asString(raw.bot) || fallbackName;
  if (!bot) return null;

  const stats = {};
  if (isPlainObject(raw.stats)) {
    for (const [key, value] of Object.entries(raw.stats)) {
      if (!validKey(key)) continue;
      const clean = coerceStat(value);
      if (clean !== undefined) stats[key] = clean;
    }
  }
  if (typeof stats.tasks_completed !== 'number') stats.tasks_completed = 0;

  const activities = Array.isArray(raw.activities)
    ? raw.activities.map(normalizeActivity).filter(Boolean)
    : [];

  const botObj = {
    bot: bot.slice(0, 120),
    role: asString(raw.role).slice(0, 300),
    updated: asString(raw.updated).slice(0, 80),
    stats,
    activities,
  };

  if (Array.isArray(raw.upcoming)) {
    const upcoming = raw.upcoming.map(normalizeUpcoming).filter(Boolean);
    if (upcoming.length) botObj.upcoming = upcoming;
  }
  if (Array.isArray(raw.uploads)) {
    const uploads = raw.uploads.map(normalizeUpload).filter(Boolean);
    if (uploads.length) botObj.uploads = uploads;
  }

  const known = new Set(['bot', 'role', 'updated', 'stats', 'activities', 'upcoming', 'uploads']);
  for (const [key, value] of Object.entries(raw)) {
    if (known.has(key) || !validKey(key)) continue;
    const clean = sanitize(value, 1);
    if (clean !== undefined) botObj[key] = clean;
  }
  return botObj;
}

export function readAgentDir(dir) {
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && !name.startsWith('.')).sort();
  const bots = [];
  const warnings = [];
  for (const name of names) {
    if (name === 'feed.enc.json') continue;
    const full = path.join(dir, name);
    let fileStat;
    try {
      fileStat = fs.statSync(full);
    } catch {
      warnings.push(`${name}: unreadable`);
      continue;
    }
    if (!fileStat.isFile()) continue;
    if (fileStat.size > MAX_FILE_BYTES) {
      warnings.push(`${name}: too large, skipped`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      warnings.push(`${name}: invalid JSON, skipped`);
      continue;
    }
    const bot = normalizeBot(parsed, name);
    if (!bot) {
      warnings.push(`${name}: skipped`);
      continue;
    }
    bots.push(bot);
  }
  return { bots, warnings };
}

function assertIterations(iterations) {
  return Number.isInteger(iterations) && iterations >= MIN_ITERATIONS && iterations <= MAX_ITERATIONS;
}

function deriveMaster(passcode, salt, iterations) {
  return crypto.pbkdf2Sync(Buffer.from(String(passcode), 'utf8'), salt, iterations, 64, 'sha256');
}

export function contentMac(passcode, salt, iterations, canonicalText) {
  const master = deriveMaster(passcode, salt, iterations);
  return crypto.createHmac('sha256', master.subarray(32)).update(canonicalText, 'utf8').digest();
}

export function sameContent(existing, passcode, canonicalText) {
  if (!existing || typeof existing !== 'object') return false;
  if (typeof existing.mac !== 'string' || typeof existing.salt !== 'string') return false;
  if (!assertIterations(existing.iterations)) return false;
  try {
    const salt = Buffer.from(existing.salt, 'base64');
    const previous = Buffer.from(existing.mac, 'base64');
    if (salt.length < 16 || previous.length !== 32) return false;
    const next = contentMac(passcode, salt, existing.iterations, canonicalText);
    return crypto.timingSafeEqual(previous, next);
  } catch {
    return false;
  }
}

export function encryptPayload(passcode, canonicalText, iterations = ITERATIONS) {
  if (!assertIterations(iterations)) throw new Error('iterations too low');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const master = deriveMaster(passcode, salt, iterations);
  const cipher = crypto.createCipheriv('aes-256-gcm', master.subarray(0, 32), iv);
  const ciphertext = Buffer.concat([cipher.update(canonicalText, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const mac = crypto.createHmac('sha256', master.subarray(32)).update(canonicalText, 'utf8').digest();
  return {
    v: 1,
    updated: new Date().toISOString(),
    kdf: 'PBKDF2-SHA256',
    cipher: 'AES-256-GCM',
    iterations,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    mac: mac.toString('base64'),
  };
}

export function mergePlaintext(bots) {
  return sortDeep({ bots });
}

function assertOutputPath(out) {
  if (path.basename(out) !== 'feed.enc.json') {
    throw new Error('Refusing to write anything except feed.enc.json');
  }
}

export function syncFeed({ dir, passcode, out, iterations = ITERATIONS }) {
  assertOutputPath(out);
  if (typeof passcode !== 'string' || passcode.length === 0) {
    throw new Error('DASHBOARD_PASSCODE is required');
  }
  if (!assertIterations(iterations)) throw new Error('iterations too low');
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Agents folder not found: ${dir}`);
  }
  const { bots, warnings } = readAgentDir(dir);
  if (bots.length === 0) {
    const error = new Error('No valid agent files to publish');
    error.warnings = warnings;
    throw error;
  }
  const canonicalText = canonicalize(mergePlaintext(bots));
  let existing = null;
  if (fs.existsSync(out)) {
    try {
      existing = JSON.parse(fs.readFileSync(out, 'utf8'));
    } catch {
      existing = null;
    }
  }
  if (existing && existing.iterations >= iterations && sameContent(existing, passcode, canonicalText)) {
    return { changed: false, warnings, out };
  }
  const envelope = encryptPayload(passcode, canonicalText, iterations);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o644 });
    fs.renameSync(tmp, out);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw error;
  }
  return { changed: true, warnings, out };
}

function printWarnings(warnings) {
  for (const warning of warnings || []) console.error(`warning: ${warning}`);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  const dir = process.argv[2] || process.env.DASHBOARD_AGENTS_DIR || '/home/box/shared/bot-dashboard/agents';
  const passcode = process.env.DASHBOARD_PASSCODE || '';
  const out = process.env.DASHBOARD_OUT || path.join(process.cwd(), 'data', 'feed.enc.json');
  try {
    const result = syncFeed({ dir, passcode, out });
    printWarnings(result.warnings);
    if (result.changed) console.log(`updated ${path.relative(process.cwd(), result.out) || result.out}`);
  } catch (error) {
    printWarnings(error.warnings);
    console.error(error.message);
    process.exit(1);
  }
}
