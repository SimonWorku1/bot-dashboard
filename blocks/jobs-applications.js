import { humanizeKey, shortDate } from '../js/format.js';
import { companyName, isApplication } from '../js/jobs-data.js';
import { findBot, norm } from '../js/query.js';
import { blockHead, emptyNote, h, statusChip, textLink } from '../js/ui.js';

export const meta = {
  id: 'jobs-applications',
  name: 'Applications',
  description: 'Searchable list of Indi application activities.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const scanName = options.scanBot || 'Indi';
  const bot = findBot(ctx.feed, scanName);
  const pageSize = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 6;
  let limit = pageSize;

  if (!bot) {
    container.replaceChildren(
      blockHead(ctx.block.title || 'Applications'),
      emptyNote(`${scanName} is not in the feed yet.`),
    );
    return undefined;
  }

  const rows = (bot.activities || [])
    .filter(isApplication)
    .map((activity) => ({ activity, company: companyName(activity) }))
    .sort(compareApplications);

  const statuses = [...new Set(rows.map((row) => row.activity.status).filter(Boolean))];
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Search company, title, or note',
    'aria-label': 'Search applications',
    autocomplete: 'off',
  });
  const status = h('select', { class: 'select', 'aria-label': 'Application status' }, [
    h('option', { value: '' }, 'All statuses'),
    ...statuses.map((key) => h('option', { value: key }, humanizeKey(key))),
  ]);
  const count = h('p', { class: 'filter-count' });
  const clear = h('button', { type: 'button', class: 'ghost', hidden: true }, 'Clear');
  const list = h('div', { class: 'application-list' });
  const moreSlot = h('div', {});

  search.addEventListener('input', () => {
    limit = pageSize;
    paint();
  });
  status.addEventListener('change', () => {
    limit = pageSize;
    paint();
  });
  clear.addEventListener('click', () => {
    search.value = '';
    status.value = '';
    limit = pageSize;
    paint();
    search.focus();
  });

  container.replaceChildren(
    blockHead(ctx.block.title || 'Applications', h('span', { class: 'block-aside' }, bot.bot)),
    rows.length
      ? h('div', { class: 'filter-bar' }, [search, status, clear, count])
      : null,
    list,
    moreSlot,
  );

  function paint() {
    const query = norm(search.value);
    const wanted = status.value;
    const matched = rows.filter((row) => {
      if (wanted && norm(row.activity.status) !== norm(wanted)) return false;
      if (!query) return true;
      return [
        row.activity.title,
        row.activity.summary,
        row.activity.status,
        row.activity.date,
        row.company,
      ].join('\n').toLowerCase().includes(query);
    });
    const shown = matched.slice(0, limit);
    count.textContent = matched.length === 1 ? '1 application' : `${matched.length} applications`;
    clear.hidden = !query && !wanted;
    list.replaceChildren(...(shown.length
      ? shown.map(rowView)
      : [emptyNote(rows.length ? 'No applications match.' : `${bot.bot} has no application activities yet.`)]));
    moreSlot.replaceChildren(matched.length > shown.length
      ? h('button', {
        type: 'button',
        class: 'ghost show-more',
        onClick: () => {
          limit += pageSize;
          paint();
        },
      }, `Show more · ${shown.length} of ${matched.length}`)
      : null);
  }

  paint();
  return undefined;
}

function compareApplications(a, b) {
  const left = a.activity.date || '';
  const right = b.activity.date || '';
  if (left !== right) {
    if (!left) return 1;
    if (!right) return -1;
    return left < right ? 1 : -1;
  }
  return String(a.activity.title).localeCompare(String(b.activity.title));
}

function rowView(row) {
  const { activity, company } = row;
  const meta = [company, shortDate(activity.date) || (activity.date ? '' : 'No date')].filter(Boolean).join(' · ');
  return h('article', { class: 'application-row' }, [
    h('div', { class: 'application-main' }, [
      h('h3', { class: 'application-title' }, activity.title || 'Untitled'),
      meta ? h('p', { class: 'application-meta' }, meta) : null,
      activity.summary ? h('p', { class: 'application-summary' }, activity.summary) : null,
    ]),
    h('div', { class: 'application-side' }, [
      statusChip(activity.status),
      textLink(activity.link, 'Open'),
    ]),
  ]);
}
