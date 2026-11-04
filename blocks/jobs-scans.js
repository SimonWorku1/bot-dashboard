import { shortDate } from '../js/format.js';
import { isScan } from '../js/jobs-data.js';
import { findBot } from '../js/query.js';
import { blockHead, emptyNote, h, statusChip } from '../js/ui.js';

export const meta = {
  id: 'jobs-scans',
  name: 'Recent scans',
  description: 'Indi activities whose title starts with Scanned.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const scanName = options.scanBot || 'Indi';
  const bot = findBot(ctx.feed, scanName);
  const pageSize = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 4;
  let limit = pageSize;

  if (!bot) {
    container.replaceChildren(blockHead(ctx.block.title || 'Recent scans'), emptyNote(`${scanName} is not in the feed yet.`));
    return undefined;
  }

  const rows = (bot.activities || [])
    .filter(isScan)
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const list = h('div', { class: 'stack' });
  const moreSlot = h('div', {});
  container.replaceChildren(
    blockHead(ctx.block.title || 'Recent scans', h('span', { class: 'block-aside' }, bot.bot)),
    rows.length ? list : emptyNote('No scans yet.'),
    moreSlot,
  );

  const paint = () => {
    const shown = rows.slice(0, limit);
    list.replaceChildren(...shown.map(scanRow));
    moreSlot.replaceChildren(rows.length > shown.length
      ? h('button', {
        type: 'button',
        class: 'ghost show-more',
        onClick: () => {
          limit += pageSize;
          paint();
        },
      }, `Show more · ${shown.length} of ${rows.length}`)
      : null);
  };
  if (rows.length) paint();
  return undefined;
}

function scanRow(activity) {
  const when = shortDate(activity.date);
  return h('article', { class: 'due-row' }, [
    h('div', { class: 'chip-row' }, [
      when ? h('span', { class: 'course' }, when) : null,
      statusChip(activity.status),
    ]),
    h('h3', { class: 'note-title' }, activity.title || 'Scan'),
    activity.summary ? h('p', { class: 'note-summary' }, activity.summary) : null,
  ]);
}
