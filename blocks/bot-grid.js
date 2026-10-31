import { onMinute } from '../js/clock.js';
import { orderedBots, sameBot, visibleActivities, visibleBots } from '../js/query.js';
import { ago, blockHead, emptyNote, h, metrics, monogram } from '../js/ui.js';

export const meta = {
  id: 'bot-grid',
  name: 'Bot grid',
  description: 'One card per assistant, with stats and freshness.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const draw = () => {
    const filters = ctx.store.getState();
    const bots = orderedBots(visibleBots(ctx.feed, filters), options.order);
    container.replaceChildren(
      blockHead(ctx.block.title || 'Assistants', h('span', { class: 'block-aside' }, String(bots.length))),
      bots.length
        ? h('div', { class: 'bot-grid' }, bots.map((bot) => card(bot, filters, ctx)))
        : emptyNote('No assistants match these filters.'),
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

function card(bot, filters, ctx) {
  const selected = sameBot(filters.bot, bot.bot);
  const latest = visibleActivities({ bots: [bot] }, { ...filters, bot: '' }, {})[0];
  return h('article', { class: `inset bot-card${selected ? ' is-selected' : ''}` }, [
    h('div', { class: 'identity' }, [
      monogram(bot.bot),
      h('div', { class: 'identity-copy' }, [
        h('h3', { class: 'identity-name' }, h('button', {
          type: 'button',
          class: 'text-button',
          'aria-pressed': selected ? 'true' : 'false',
          onClick: () => ctx.store.setFilters({ bot: selected ? '' : bot.bot }),
        }, bot.bot)),
        bot.role ? h('p', { class: 'identity-role' }, bot.role) : null,
        ago(bot.updated),
      ]),
    ]),
    metrics(bot.stats),
    latest ? h('p', { class: 'latest' }, `Latest · ${latest.activity.title}`) : null,
  ]);
}
