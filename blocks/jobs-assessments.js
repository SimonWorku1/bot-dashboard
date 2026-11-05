import { onMinute } from '../js/clock.js';
import { pacificStamp } from '../js/format.js';
import { partitionAssessments } from '../js/jobs-data.js';
import { findBot } from '../js/query.js';
import { blockHead, emptyNote, h, textLink } from '../js/ui.js';

export const meta = {
  id: 'jobs-assessments',
  name: 'Pending assessments',
  description: 'Indi assessments still to take, soonest deadline first.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const scanName = options.scanBot || 'Indi';
  const bot = findBot(ctx.feed, scanName);
  const title = ctx.block.title || 'Pending assessments';

  if (!bot) {
    container.replaceChildren(blockHead(title), emptyNote(`${scanName} is not in the feed yet.`));
    return undefined;
  }

  let pastOpen = false;

  const draw = () => {
    const now = new Date();
    const { pending, expired } = partitionAssessments(bot.assessments, now);
    if (!pending.length && !expired.length) {
      container.replaceChildren(blockHead(title), emptyNote('No pending assessments.'));
      return;
    }
    const aside = pendingAside(pending);
    container.replaceChildren(
      blockHead(title, aside ? h('span', { class: 'block-aside' }, aside) : null),
      pending.length
        ? h('div', { class: 'stack assessment-list' }, pending.map((item) => assessmentRow(item, now)))
        : emptyNote('No pending assessments.'),
      expired.length ? pastFold(expired, now, pastOpen, (open) => {
        pastOpen = open;
      }) : null,
    );
  };

  draw();
  return onMinute(draw);
}

function pendingAside(pending) {
  if (!pending.length) return '';
  const overdue = pending.filter((item) => item.urgency === 'overdue').length;
  const soon = pending.filter((item) => item.urgency === 'soon').length;
  const bits = [
    overdue ? `${overdue} overdue` : '',
    soon ? `${soon} due soon` : '',
  ].filter(Boolean);
  if (bits.length) return bits.join(' · ');
  return pending.length === 1 ? '1 pending' : `${pending.length} pending`;
}

function pastFold(expired, now, open, onToggle) {
  const details = h('details', { class: 'fold assessment-past' }, [
    h('summary', {}, expired.length === 1 ? 'Past · 1' : `Past · ${expired.length}`),
    h('div', { class: 'stack assessment-list' }, expired.map((item) => assessmentRow(item, now))),
  ]);
  details.open = Boolean(open);
  details.addEventListener('toggle', () => onToggle(details.open));
  return details;
}

function assessmentRow(item, now) {
  const urgency = item.status === 'expired' ? 'expired' : item.urgency;
  const chips = [
    urgency === 'overdue' ? dueTag('overdue', 'Overdue') : null,
    urgency === 'soon' ? dueTag('soon', 'Due soon') : null,
    urgency === 'expired' ? dueTag('expired', 'Expired') : null,
    item.kind ? h('span', { class: 'chip' }, item.kind) : null,
    item.duration ? h('span', { class: 'chip' }, item.duration) : null,
  ].filter(Boolean);
  const heading = item.company || item.role || 'Assessment';
  const role = item.company && item.role ? item.role : '';
  return h('article', { class: 'assessment-row', 'data-urgency': urgency }, [
    h('div', { class: 'assessment-main' }, [
      chips.length ? h('div', { class: 'chip-row' }, chips) : null,
      h('h3', { class: 'assessment-company' }, heading),
      role ? h('p', { class: 'assessment-role' }, role) : null,
      h('p', { class: 'assessment-meta' }, dueLine(item, now)),
      item.dueNote ? h('p', { class: 'assessment-note' }, item.dueNote) : null,
      item.assessmentId ? idLine(item.assessmentId) : null,
    ]),
    h('div', { class: 'assessment-side' }, [
      textLink(item.link, 'Take assessment'),
    ]),
  ]);
}

function dueTag(bucket, label) {
  return h('span', { class: 'chip', 'data-kind': 'due', 'data-due': bucket }, label);
}

function dueLine(item, now) {
  if (!item.due) return 'No deadline';
  return h('span', {}, [
    'Due ',
    h('time', { datetime: item.dueIso || item.due.toISOString() }, pacificStamp(item.due, now)),
  ]);
}

function idLine(id) {
  const code = h('code', {}, id);
  const button = h('button', {
    type: 'button',
    class: 'ghost assessment-copy',
    'aria-label': `Copy assessment ID ${id}`,
  }, 'Copy');
  button.addEventListener('click', async () => {
    const copied = await copyText(id);
    if (!copied) selectText(code);
    button.textContent = copied ? 'Copied' : 'Select the ID';
    if (copied) button.dataset.copied = 'true';
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = 'Copy';
      delete button.dataset.copied;
    }, 2000);
  });
  return h('p', { class: 'assessment-id' }, [
    h('span', { class: 'assessment-id-label' }, 'Assessment ID'),
    code,
    button,
  ]);
}

async function copyText(value) {
  if (copyWithCommand(value)) return true;
  try {
    if (!navigator.clipboard?.writeText) return false;
    const write = navigator.clipboard.writeText(value).then(() => true, () => false);
    const timeout = new Promise((resolve) => {
      window.setTimeout(() => resolve(false), 700);
    });
    return await Promise.race([write, timeout]);
  } catch {
    return false;
  }
}

function copyWithCommand(value) {
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

function selectText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}
