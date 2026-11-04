import { shortDate } from '../js/format.js';
import { LINK_TILES, readStat, statText, tileSpecs } from '../js/jobs-data.js';
import { findBot } from '../js/query.js';
import { blockHead, emptyNote, h, identity, statusChip, textLink } from '../js/ui.js';

export const meta = {
  id: 'jobs-outreach',
  name: 'Outreach',
  description: 'Link’s reply stats and recent outreach.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const outreachName = options.outreachBot || 'Link';
  const bot = findBot(ctx.feed, outreachName);
  const pageSize = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 4;
  let limit = pageSize;

  if (!bot) {
    container.replaceChildren(blockHead(ctx.block.title || 'Outreach'), emptyNote(`${outreachName} is not in the feed yet.`));
    return undefined;
  }

  const specs = tileSpecs(options.stats, LINK_TILES);
  const rows = (bot.activities || [])
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.title).localeCompare(String(b.title)));
  const list = h('div', { class: 'stack outreach-list' });
  const moreSlot = h('div', {});

  container.replaceChildren(
    blockHead(ctx.block.title || 'Outreach'),
    identity(bot),
    h('dl', { class: 'metrics' }, specs.map((spec) => h('div', { class: 'metric' }, [
      h('dt', {}, spec.label),
      h('dd', {}, statText(spec.stat, readStat(bot.stats, spec.stat))),
    ]))),
    rows.length ? list : emptyNote('No outreach notes yet.'),
    moreSlot,
  );

  const paint = () => {
    const shown = rows.slice(0, limit);
    list.replaceChildren(...shown.map(outreachRow));
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

function outreachRow(activity) {
  const when = shortDate(activity.date);
  return h('article', { class: 'due-row' }, [
    h('div', { class: 'chip-row' }, [
      when ? h('span', { class: 'course' }, when) : null,
      statusChip(activity.status),
      textLink(activity.link, 'Open'),
    ]),
    h('h3', { class: 'note-title' }, activity.title || 'Note'),
    activity.summary ? h('p', { class: 'note-summary' }, activity.summary) : null,
  ]);
}
