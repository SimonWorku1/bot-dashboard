import { onMinute } from '../js/clock.js';
import { dayLabel } from '../js/format.js';
import { visibleActivities } from '../js/query.js';
import { blockHead, categoryChip, emptyNote, h, statusChip, textLink } from '../js/ui.js';

export const meta = {
  id: 'activity-timeline',
  name: 'Activity timeline',
  description: 'Dated feed of what the bots did.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  let limit = Number.isFinite(options.limit) ? options.limit : 8;

  const draw = () => {
    const rows = visibleActivities(ctx.feed, ctx.store.getState(), options);
    const shown = rows.slice(0, limit);
    const groups = new Map();
    for (const row of shown) {
      const key = row.activity.date || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const days = [...groups.entries()].map(([date, items]) => h('section', { class: 'day' }, [
      h('h3', {}, dayLabel(date)),
      ...items.map(note),
    ]));
    const more = rows.length > shown.length
      ? h('button', {
        type: 'button',
        class: 'ghost show-more',
        onClick: () => {
          limit += options.limit && options.limit > 0 ? options.limit : 8;
          draw();
        },
      }, `Show more · ${shown.length} of ${rows.length}`)
      : null;
    container.replaceChildren(
      blockHead(ctx.block.title || 'Timeline', h('span', { class: 'block-aside' }, rows.length ? `${rows.length}` : '')),
      rows.length ? h('div', {}, days) : emptyNote('Nothing matches these filters.'),
      more,
    );
  };
  draw();
  const unsub = ctx.store.subscribe(() => {
    limit = Number.isFinite(options.limit) ? options.limit : 8;
    draw();
  });
  const tick = onMinute(draw);
  return () => {
    unsub();
    tick();
  };
}

function note(row) {
  const { bot, activity } = row;
  const known = ['jobs', 'school', 'social', 'finance', 'coding', 'other'];
  return h('article', { class: 'note' }, [
    h('span', {
      class: 'note-dot',
      'data-category': known.includes(activity.category) ? activity.category : 'unknown',
      'aria-hidden': 'true',
    }),
    h('div', {}, [
      h('div', { class: 'note-top' }, [
        h('strong', { class: 'note-title' }, activity.title),
      ]),
      activity.summary ? h('p', { class: 'note-summary' }, activity.summary) : null,
      h('div', { class: 'chip-row' }, [
        h('span', { class: 'chip' }, bot.bot),
        categoryChip(activity.category),
        statusChip(activity.status),
        textLink(activity.link, 'Open'),
      ]),
    ]),
  ]);
}
