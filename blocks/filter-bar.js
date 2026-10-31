import { humanizeKey } from '../js/format.js';
import {
  filterOptions,
  filtersActive,
  orderedBots,
  visibleActivities,
} from '../js/query.js';
import { h } from '../js/ui.js';

export const meta = {
  id: 'filter-bar',
  name: 'Search and filters',
  description: 'Search plus bot, category, and status filters for the feed.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const lists = filterOptions(ctx.feed);
  const bots = orderedBots(ctx.feed.bots, options.order);

  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Search notes, bots, classes',
    'aria-label': 'Search the desk',
    autocomplete: 'off',
  });
  const botSelect = selectControl('Bot', 'All assistants', bots.map((bot) => [bot.bot, bot.bot]));
  const categorySelect = selectControl('Category', 'All categories', lists.categories.map((key) => [key, humanizeKey(key)]));
  const statusSelect = selectControl('Status', 'All statuses', lists.statuses.map((key) => [key, humanizeKey(key)]));
  const count = h('p', { class: 'filter-count' });
  const clear = h('button', { type: 'button', class: 'ghost', hidden: true }, 'Clear');

  const push = () => {
    ctx.store.setFilters({
      query: search.value,
      bot: botSelect.value,
      category: categorySelect.value,
      status: statusSelect.value,
    });
  };

  search.addEventListener('input', push);
  botSelect.addEventListener('change', push);
  categorySelect.addEventListener('change', push);
  statusSelect.addEventListener('change', push);
  clear.addEventListener('click', () => {
    search.value = '';
    botSelect.value = '';
    categorySelect.value = '';
    statusSelect.value = '';
    ctx.store.setFilters({ query: '', bot: '', category: '', status: '' });
  });

  const bar = h('div', { class: 'filter-bar' }, [search, botSelect, categorySelect, statusSelect, clear, count]);
  container.setAttribute('aria-label', ctx.block.title || 'Search and filters');
  container.replaceChildren(bar);

  const paint = () => {
    const state = ctx.store.getState();
    if (document.activeElement !== search && search.value !== state.query) search.value = state.query;
    if (botSelect.value !== state.bot) botSelect.value = state.bot;
    if (categorySelect.value !== state.category) categorySelect.value = state.category;
    if (statusSelect.value !== state.status) statusSelect.value = state.status;
    const rows = visibleActivities(ctx.feed, state, options);
    const noun = rows.length === 1 ? 'activity' : 'activities';
    count.textContent = `${rows.length} ${noun}`;
    clear.hidden = !filtersActive(state);
  };
  paint();
  return ctx.store.subscribe(paint);
}

function selectControl(label, placeholder, pairs) {
  const node = h('select', { class: 'select', 'aria-label': label }, [
    h('option', { value: '' }, placeholder),
    ...pairs.map(([value, text]) => h('option', { value }, text)),
  ]);
  return node;
}
