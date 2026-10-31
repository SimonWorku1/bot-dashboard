import { onMinute } from '../js/clock.js';
import { DUE_LABELS, dueBucket, shortDate } from '../js/format.js';
import { findBot, sameBot, textMatch } from '../js/query.js';
import { blockHead, dueChip, emptyNote, h, statusChip } from '../js/ui.js';

export const meta = {
  id: 'upcoming-schoolwork',
  name: 'Upcoming schoolwork',
  description: 'Due dates from a bot upcoming array, soonest first.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const draw = () => {
    const filters = ctx.store.getState();
    let items = collect(ctx.feed, options.bot);
    if (filters.bot && !options.bot) items = items.filter((item) => sameBot(item.bot.bot, filters.bot));
    items = items.filter((item) => textMatch(filters.query, [
      item.bot.bot,
      item.course,
      item.title,
      item.type,
      item.status,
    ]));
    items.sort((a, b) => {
      if (a.due === b.due) return a.title.localeCompare(b.title);
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : 1;
    });
    const buckets = { overdue: 0, today: 0, 'this-week': 0, later: 0 };
    for (const item of items) buckets[dueBucket(item.due)] += 1;
    const summary = [
      buckets.overdue ? `${buckets.overdue} overdue` : '',
      buckets.today ? `${buckets.today} today` : '',
      buckets['this-week'] ? `${buckets['this-week']} this week` : '',
    ].filter(Boolean).join(' · ');
    container.replaceChildren(
      blockHead(ctx.block.title || 'Upcoming schoolwork', summary ? h('span', { class: 'block-aside' }, summary) : null),
      items.length
        ? h('div', { class: 'stack' }, items.map((item) => row(item, options.bot)))
        : emptyNote(filters.query ? 'No schoolwork matches this search.' : 'No upcoming schoolwork.'),
    );
  };
  draw();
  const unsub = ctx.store.subscribe(draw);
  const tick = onMinute(draw);
  return () => {
    unsub();
    tick();
  };
}

function collect(feed, pinned) {
  const bots = pinned ? [findBot(feed, pinned)].filter(Boolean) : (feed.bots || []);
  const items = [];
  for (const bot of bots) {
    for (const item of bot.upcoming || []) {
      items.push({ ...item, bot });
    }
  }
  return items;
}

function row(item, pinned) {
  const bucket = dueBucket(item.due);
  return h('article', { class: 'due-row', 'data-due': bucket }, [
    h('div', { class: 'chip-row' }, [
      item.course ? h('span', { class: 'course' }, item.course) : null,
      dueChip(bucket),
      item.status ? statusChip(item.status.toLowerCase().replace(/[\s-]+/g, '_')) : null,
    ]),
    h('strong', { class: 'note-title' }, item.title),
    h('p', { class: 'upload-meta' }, [
      item.due ? `${DUE_LABELS[bucket] || 'Due'} · ${shortDate(item.due)}` : 'No due date',
      item.type ? ` · ${item.type}` : '',
      !pinned && item.bot ? ` · ${item.bot.bot}` : '',
    ].join('')),
  ]);
}
