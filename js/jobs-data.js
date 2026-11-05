import { formatStat, isCalendarDay } from './format.js';

export const TREND_SERIES = [
  { key: 'sent', label: 'Applications sent' },
  { key: 'heard_back', label: 'Heard back' },
  { key: 'rejected', label: 'Rejected' },
];

export const INDI_TILES = [
  { stat: 'applications_submitted', label: 'Applications submitted' },
  { stat: 'applications_in_progress', label: 'In progress' },
  { stat: 'rejections', label: 'Rejections' },
  { stat: 'interviews', label: 'Interviews' },
  { stat: 'jobs_scanned', label: 'Jobs scanned' },
  { stat: 'applications_blocked', label: 'Blocked' },
];

export const LINK_TILES = [
  { stat: 'people_contacted', label: 'People contacted' },
  { stat: 'people_replied', label: 'People replied' },
  { stat: 'reply_rate', label: 'Reply rate' },
  { stat: 'awaiting_reply', label: 'Awaiting reply' },
];

export function applicationSeries(bot) {
  const daily = cleanDaily(bot?.daily);
  if (daily.length) return { points: daily, derived: false };
  return { points: seriesFromActivities(bot), derived: true };
}

export function cumulative(points) {
  let sent = 0;
  let heard = 0;
  let rejected = 0;
  return (points || []).map((point) => {
    sent += point.sent;
    heard += point.heard_back;
    rejected += point.rejected;
    return { date: point.date, sent, heard_back: heard, rejected };
  });
}

export function seriesTotals(points) {
  return (points || []).reduce((totals, point) => {
    totals.sent += point.sent;
    totals.heard_back += point.heard_back;
    totals.rejected += point.rejected;
    return totals;
  }, { sent: 0, heard_back: 0, rejected: 0 });
}

export function responseRate(points) {
  const totals = seriesTotals(points);
  if (totals.sent <= 0) return null;
  return totals.heard_back / totals.sent;
}

export function isApplication(activity) {
  const title = String(activity?.title || '');
  return title.startsWith('Applied:') || title.startsWith('Applied to ');
}

export function isScan(activity) {
  return String(activity?.title || '').startsWith('Scanned');
}

export function companyName(activity) {
  if (typeof activity?.company === 'string' && activity.company.trim()) return activity.company.trim();
  const title = String(activity?.title || '');
  if (title.startsWith('Applied:')) return title.slice('Applied:'.length).trim();
  if (title.startsWith('Applied to ')) return title.slice('Applied to '.length).trim();
  return '';
}

export function readStat(stats, key) {
  if (!stats || typeof stats !== 'object' || !key) return null;
  const value = stats[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function statText(key, value) {
  if (typeof value === 'number' && Number.isFinite(value)) return formatStat(key, value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '—';
}

export function axisMax(value) {
  const max = Number.isFinite(value) ? value : 0;
  if (max <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const frac = max / pow;
  const steps = [1, 2, 4, 5, 10];
  const step = steps.find((item) => frac <= item + 1e-9) || 10;
  return step * pow;
}

export const ASSESSMENT_SOON_MS = 48 * 60 * 60 * 1000;

export function partitionAssessments(list, now = new Date()) {
  const pending = [];
  const expired = [];
  if (!Array.isArray(list)) return { pending, expired };
  for (const raw of list) {
    const item = cleanAssessment(raw);
    if (!item || item.status === 'done') continue;
    item.urgency = item.status === 'expired' ? 'expired' : assessmentUrgency(item.due, now);
    if (item.status === 'expired') expired.push(item);
    else pending.push(item);
  }
  pending.sort(compareByDue);
  expired.sort(compareExpired);
  return { pending, expired };
}

export function assessmentUrgency(due, now = new Date()) {
  if (!due) return 'none';
  const delta = due.getTime() - now.getTime();
  if (delta < 0) return 'overdue';
  if (delta <= ASSESSMENT_SOON_MS) return 'soon';
  return 'later';
}

export function tileSpecs(option, fallback) {
  const source = Array.isArray(option) && option.length ? option : fallback;
  return source
    .filter((item) => item && typeof item.stat === 'string' && item.stat.trim())
    .map((item) => ({
      stat: item.stat.trim(),
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : item.stat.trim(),
    }));
}

function cleanAssessment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const company = textField(raw.company);
  const role = textField(raw.role);
  if (!company && !role) return null;
  const dueIso = typeof raw.due === 'string' ? raw.due.trim() : '';
  return {
    company,
    role,
    kind: textField(raw.kind),
    duration: textField(raw.duration),
    due: parseDue(raw.due),
    dueIso,
    dueNote: textField(raw.due_note),
    link: textField(raw.link),
    status: assessmentStatus(raw.status),
    assessmentId: textField(raw.assessment_id),
  };
}

function textField(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function assessmentStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'done' || raw === 'expired' || raw === 'pending') return raw;
  return raw || 'pending';
}

function parseDue(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareByDue(a, b) {
  return compareDue(a, b, 1);
}

function compareExpired(a, b) {
  return compareDue(a, b, -1);
}

function compareDue(a, b, direction) {
  const left = a.due ? a.due.getTime() : null;
  const right = b.due ? b.due.getTime() : null;
  if (left == null && right == null) return tieAssessment(a, b);
  if (left == null) return 1;
  if (right == null) return -1;
  if (left !== right) return (left - right) * direction;
  return tieAssessment(a, b);
}

function tieAssessment(a, b) {
  const company = a.company.localeCompare(b.company);
  if (company) return company;
  return a.role.localeCompare(b.role);
}

function cleanDaily(daily) {
  if (!Array.isArray(daily)) return [];
  const points = [];
  for (const row of daily) {
    const point = pointFrom(row);
    if (point) points.push(point);
  }
  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const merged = [];
  for (const point of points) {
    const last = merged[merged.length - 1];
    if (last && last.date === point.date) {
      last.sent += point.sent;
      last.heard_back += point.heard_back;
      last.rejected += point.rejected;
    } else {
      merged.push({ ...point });
    }
  }
  return merged;
}

function pointFrom(row) {
  if (!row || typeof row !== 'object') return null;
  const date = typeof row.date === 'string' ? row.date.slice(0, 10) : '';
  if (!isCalendarDay(date)) return null;
  const sent = countOrNull(row.sent);
  const heard = countOrNull(row.heard_back);
  const rejected = countOrNull(row.rejected);
  if (sent == null || heard == null || rejected == null) return null;
  return { date, sent, heard_back: heard, rejected };
}

function countOrNull(value) {
  if (value == null || value === '') return 0;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function seriesFromActivities(bot) {
  const byDate = new Map();
  for (const activity of bot?.activities || []) {
    if (!String(activity?.title || '').startsWith('Applied:')) continue;
    const date = typeof activity.date === 'string' ? activity.date.slice(0, 10) : '';
    if (!isCalendarDay(date)) continue;
    const row = byDate.get(date) || { date, sent: 0, heard_back: 0, rejected: 0 };
    row.sent += 1;
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
