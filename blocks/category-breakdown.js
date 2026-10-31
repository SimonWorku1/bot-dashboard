import { humanizeKey } from '../js/format.js';
import { categoryCounts, sameBot, visibleActivities } from '../js/query.js';
import { blockHead, emptyNote, h } from '../js/ui.js';

export const meta = {
  id: 'category-breakdown',
  name: 'Category breakdown',
  description: 'How activities split across categories.',
};

const KNOWN = new Set(['jobs', 'school', 'social', 'finance', 'coding', 'other']);

export function render(container, ctx) {
  const draw = () => {
    const filters = ctx.store.getState();
    const rows = visibleActivities(ctx.feed, { ...filters, category: '' }, ctx.block.options || {});
    const counts = categoryCounts(rows);
    const max = counts.reduce((highest, [, count]) => Math.max(highest, count), 0);
    container.replaceChildren(
      blockHead(ctx.block.title || 'By category'),
      counts.length
        ? h('div', { class: 'bars' }, counts.map(([category, count]) => {
          const pressed = sameBot(filters.category, category);
          const width = max ? Math.max(6, Math.round((count / max) * 100)) : 0;
          const dot = KNOWN.has(category) ? `var(--cat-${category})` : 'var(--cat-unknown)';
          return h('button', {
            type: 'button',
            class: 'bar-button',
            'aria-pressed': pressed ? 'true' : 'false',
            onClick: () => ctx.store.setFilters({ category: pressed ? '' : category }),
          }, [
            h('span', { class: 'bar-name' }, humanizeKey(category)),
            h('span', { class: 'bar-count' }, String(count)),
            h('span', { class: 'bar-track', 'aria-hidden': 'true' }, [
              h('span', { style: `--w:${width}%;--dot:${dot}` }),
            ]),
          ]);
        }))
        : emptyNote('No categories to chart.'),
    );
  };
  draw();
  return ctx.store.subscribe(draw);
}
