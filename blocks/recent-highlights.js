import { visibleActivities } from '../js/query.js';
import { blockHead, categoryChip, emptyNote, h, textLink } from '../js/ui.js';

export const meta = {
  id: 'recent-highlights',
  name: 'Recent highlights',
  description: 'The newest finished notes.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const limit = Number.isFinite(options.limit) ? options.limit : 4;
  const draw = () => {
    const rows = visibleActivities(ctx.feed, ctx.store.getState(), options)
      .filter((row) => row.activity.status === 'done')
      .slice(0, limit);
    container.replaceChildren(
      blockHead(ctx.block.title || 'Highlights'),
      rows.length
        ? h('div', { class: 'highlights' }, rows.map(({ bot, activity }) => h('article', { class: 'highlight' }, [
          h('div', { class: 'chip-row' }, [
            h('span', { class: 'chip' }, bot.bot),
            categoryChip(activity.category),
          ]),
          h('h3', {}, activity.title),
          activity.summary ? h('p', { class: 'note-summary' }, activity.summary) : null,
          textLink(activity.link, 'Open'),
        ])))
        : emptyNote('No finished notes match these filters.'),
    );
  };
  draw();
  return ctx.store.subscribe(draw);
}
