import { formatCount, shortDate } from '../js/format.js';
import { findBot, sameBot, textMatch } from '../js/query.js';
import { blockHead, emptyNote, h, statusChip, textLink } from '../js/ui.js';

export const meta = {
  id: 'uploads',
  name: 'Uploads',
  description: 'A bot uploads array, with status and views.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const draw = () => {
    const filters = ctx.store.getState();
    let items = collect(ctx.feed, options.bot);
    if (filters.bot && !options.bot) items = items.filter((item) => sameBot(item.bot.bot, filters.bot));
    items = items.filter((item) => textMatch(filters.query, [item.bot.bot, item.title, item.status]));
    items.sort((a, b) => {
      if (a.date === b.date) return a.title.localeCompare(b.title);
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : -1;
    });
    container.replaceChildren(
      blockHead(ctx.block.title || 'Uploads', h('span', { class: 'block-aside' }, items.length ? String(items.length) : '')),
      items.length
        ? h('div', { class: 'stack' }, items.map((item) => row(item)))
        : emptyNote(filters.query ? 'No uploads match this search.' : 'No uploads.'),
    );
  };
  draw();
  return ctx.store.subscribe(draw);
}

function collect(feed, pinned) {
  const bots = pinned ? [findBot(feed, pinned)].filter(Boolean) : (feed.bots || []);
  const items = [];
  for (const bot of bots) {
    for (const item of bot.uploads || []) items.push({ ...item, bot });
  }
  return items;
}

function row(item) {
  const views = typeof item.views === 'number'
    ? (item.views === 0 ? 'No views yet' : `${formatCount(item.views)} views`)
    : '';
  const status = String(item.status || '').toLowerCase().replace(/[\s-]+/g, '_');
  return h('article', { class: 'upload-row' }, [
    h('div', { class: 'chip-row' }, [
      status ? statusChip(status) : null,
      h('span', { class: 'course' }, item.bot.bot),
    ]),
    h('strong', { class: 'upload-title' }, item.title),
    h('p', { class: 'upload-meta' }, [
      [item.date ? shortDate(item.date) : '', views].filter(Boolean).join(' · '),
      ' ',
      textLink(item.link, 'Open'),
    ]),
  ]);
}
