import { findBot } from '../js/query.js';
import { blockHead, emptyNote, h } from '../js/ui.js';

export const meta = {
  id: 'jobs-note',
  name: 'Stats note',
  description: 'Collapsed stats_note text from the job bots.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const names = [options.scanBot || 'Indi', options.outreachBot || 'Link'];
  const seen = new Set();
  const notes = [];
  for (const name of names) {
    const bot = findBot(ctx.feed, name);
    if (!bot || seen.has(bot.bot)) continue;
    seen.add(bot.bot);
    if (typeof bot.stats_note !== 'string' || !bot.stats_note.trim()) continue;
    notes.push(bot);
  }

  container.replaceChildren(
    blockHead(ctx.block.title || 'How the numbers are counted'),
    notes.length
      ? h('div', { class: 'fold-list' }, notes.map((bot) => h('details', { class: 'fold' }, [
        h('summary', {}, bot.bot),
        h('p', {}, bot.stats_note.trim()),
      ])))
      : emptyNote('No stats note on these assistants.'),
  );
  return undefined;
}
