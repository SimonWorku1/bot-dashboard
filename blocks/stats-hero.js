import { onMinute } from '../js/clock.js';
import { formatCount } from '../js/format.js';
import { filtersActive, visibleActivities, visibleBots } from '../js/query.js';
import { blockHead, h } from '../js/ui.js';

export const meta = {
  id: 'stats-hero',
  name: 'Stats hero',
  description: 'Totals for assistants, activities, and status.',
};

export function render(container, ctx) {
  const draw = () => {
    const filters = ctx.store.getState();
    const bots = visibleBots(ctx.feed, filters);
    const rows = visibleActivities(ctx.feed, filters, ctx.block.options || {});
    const tasks = bots.reduce((sum, bot) => {
      const value = bot.stats?.tasks_completed;
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);
    const count = (status) => rows.filter((row) => row.activity.status === status).length;
    const aside = filtersActive(filters) ? h('span', { class: 'chip' }, 'Filtered') : null;
    const items = [
      ['Assistants', bots.length],
      ['Activities', rows.length],
      ['Tasks completed', tasks],
      ['Done', count('done')],
      ['In progress', count('in_progress')],
      ['Waiting', count('waiting')],
    ];
    container.replaceChildren(
      blockHead(ctx.block.title || 'Overview', aside),
      h('ul', { class: 'hero-stats' }, items.map(([label, value]) => h('li', { class: 'hero-stat' }, [
        h('b', {}, formatCount(value)),
        h('span', {}, label),
      ]))),
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
