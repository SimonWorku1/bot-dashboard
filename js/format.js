const RATE_KEY = /rate|ratio|percent|pct/i;

const LEADING_STATS = [
  'tasks_completed',
  'jobs_scanned',
  'applied',
  'interviews',
  'follow_ups',
  'people_contacted',
  'people_replied',
  'reply_rate',
];

export function humanizeKey(key) {
  const spaced = String(key ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatStat(key, value) {
  if (typeof value === 'number' && Number.isFinite(value) && RATE_KEY.test(String(key)) && value >= 0 && value <= 1) {
    const pct = value * 100;
    const nearest = Math.round(pct);
    const text = Math.abs(pct - nearest) < 0.05 ? String(nearest) : pct.toFixed(1);
    return `${text}%`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '');
}

export function formatCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function statEntries(stats) {
  const source = stats && typeof stats === 'object' ? stats : {};
  const keys = Object.keys(source);
  keys.sort((a, b) => {
    const ia = LEADING_STATS.indexOf(a);
    const ib = LEADING_STATS.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.localeCompare(b);
  });
  return keys.map((key) => [key, source[key]]);
}

export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return '';
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return '';
  }
  return '';
}

function parseDay(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function shortDate(isoDate, now = new Date()) {
  const day = parseDay(isoDate);
  if (!day) return '';
  const options = { month: 'short', day: 'numeric' };
  if (day.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat('en-US', options).format(day);
}

export function dayLabel(isoDate, now = new Date()) {
  const day = parseDay(isoDate);
  if (!day) return 'No date';
  const diff = Math.round((startOfDay(now) - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return shortDate(isoDate, now);
}

export function dueBucket(isoDate, now = new Date()) {
  const day = parseDay(isoDate);
  if (!day) return 'later';
  const diff = Math.round((day - startOfDay(now)) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'this-week';
  return 'later';
}

export const DUE_LABELS = {
  overdue: 'Overdue',
  today: 'Today',
  'this-week': 'This week',
  later: 'Later',
};

export function relativeTime(iso, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  const future = seconds < 0;
  const abs = Math.abs(seconds);
  const phrase = (count, unit) => (future ? `in ${count}${unit}` : `${count}${unit} ago`);
  if (abs < 45) return future ? 'soon' : 'just now';
  if (abs < 3600) return phrase(Math.max(1, Math.round(abs / 60)), 'm');
  if (abs < 86400) return phrase(Math.max(1, Math.round(abs / 3600)), 'h');
  if (abs < 86400 * 14) return phrase(Math.max(1, Math.round(abs / 86400)), 'd');
  return shortDate(String(iso).slice(0, 10), now) || '';
}

export function absoluteTime(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(then);
}
