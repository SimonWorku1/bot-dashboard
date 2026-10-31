import { onMinute } from './clock.js';
import {
  absoluteTime,
  DUE_LABELS,
  formatStat,
  humanizeKey,
  relativeTime,
  safeUrl,
  statEntries,
} from './format.js';

export function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'dataset' && value && typeof value === 'object') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    if (child instanceof Node) node.append(child);
    else node.append(document.createTextNode(String(child)));
  }
}

export function emptyNote(message) {
  return h('p', { class: 'empty' }, message);
}

export function blockHead(title, aside) {
  if (!title && !aside) return null;
  return h('header', { class: 'block-head' }, [
    title ? h('h2', {}, title) : null,
    aside || null,
  ]);
}

export function metrics(stats) {
  const entries = statEntries(stats);
  if (!entries.length) return null;
  return h('dl', { class: 'metrics' }, entries.map(([key, value]) => h('div', { class: 'metric' }, [
    h('dt', {}, humanizeKey(key)),
    h('dd', {}, formatStat(key, value)),
  ])));
}

export function ago(iso) {
  const node = h('time', { class: 'ago' });
  const paint = () => {
    if (!iso || Number.isNaN(new Date(iso).getTime())) {
      node.textContent = 'No timestamp';
      node.removeAttribute('datetime');
      node.removeAttribute('title');
      return;
    }
    node.setAttribute('datetime', iso);
    node.textContent = relativeTime(iso);
    node.title = absoluteTime(iso);
  };
  paint();
  return node;
}

export function watchAgo(node, iso) {
  const paint = () => {
    node.textContent = relativeTime(iso);
    node.title = absoluteTime(iso);
  };
  return onMinute(paint);
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '•';
  if (parts.length === 1) {
    const word = parts[0];
    if (word.length <= 5) return word.slice(0, 2).toUpperCase();
    return (word[0] + word[word.length - 1]).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function toneIndex(name) {
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash % 8;
}

export function monogram(name) {
  return h('span', { class: `monogram tone-${toneIndex(name)}`, 'aria-hidden': 'true' }, initials(name));
}

export function identity(bot, heading = 'h3') {
  return h('div', { class: 'identity' }, [
    monogram(bot.bot),
    h('div', { class: 'identity-copy' }, [
      h(heading, { class: 'identity-name' }, bot.bot),
      bot.role ? h('p', { class: 'identity-role' }, bot.role) : null,
      ago(bot.updated),
    ]),
  ]);
}

const KNOWN_CATEGORIES = new Set(['jobs', 'school', 'social', 'finance', 'coding', 'other']);

export function categoryChip(category) {
  const key = KNOWN_CATEGORIES.has(category) ? category : 'unknown';
  return h('span', { class: 'chip', 'data-kind': 'category', 'data-category': key }, humanizeKey(category || 'other'));
}

const KNOWN_STATUSES = new Set([
  'done', 'in_progress', 'waiting', 'published', 'scheduled', 'editing', 'draft', 'other',
]);

export function statusChip(status) {
  const key = KNOWN_STATUSES.has(status) ? status : 'other';
  return h('span', { class: 'chip', 'data-kind': 'status', 'data-status': key }, humanizeKey(status || 'done'));
}

export function dueChip(bucket) {
  return h('span', { class: 'chip', 'data-kind': 'due', 'data-due': bucket }, DUE_LABELS[bucket] || humanizeKey(bucket));
}

export function textLink(url, label) {
  const href = safeUrl(url);
  if (!href) return null;
  return h('a', { class: 'text-link', href, target: '_blank', rel: 'noopener noreferrer' }, label);
}

export function lockIcon() {
  const span = h('span', { class: 'icon', 'aria-hidden': 'true' });
  span.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';
  return span;
}
