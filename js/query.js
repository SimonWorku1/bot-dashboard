const CATEGORY_ORDER = ['jobs', 'school', 'social', 'finance', 'coding', 'other'];
const STATUS_ORDER = ['done', 'in_progress', 'waiting'];

export function norm(value) {
  return String(value || '').trim().toLowerCase();
}

export function sameBot(a, b) {
  return norm(a) === norm(b);
}

export function textMatch(query, parts) {
  const needle = norm(query);
  if (!needle) return true;
  return parts
    .filter((part) => part != null && part !== false)
    .join('\n')
    .toLowerCase()
    .includes(needle);
}

export function findBot(feed, name) {
  if (!name) return null;
  return (feed?.bots || []).find((bot) => sameBot(bot.bot, name)) || null;
}

export function activityMatches(bot, activity, filters = {}, pinned = {}) {
  if (pinned.bot && !sameBot(bot.bot, pinned.bot)) return false;
  if (pinned.category && norm(activity.category) !== norm(pinned.category)) return false;
  if (filters.bot && !sameBot(bot.bot, filters.bot)) return false;
  if (filters.category && norm(activity.category) !== norm(filters.category)) return false;
  if (filters.status && norm(activity.status) !== norm(filters.status)) return false;
  return textMatch(filters.query, [
    bot.bot,
    bot.role,
    activity.title,
    activity.summary,
    activity.category,
    activity.status,
  ]);
}

function compareRows(a, b) {
  const left = a.activity.date || '';
  const right = b.activity.date || '';
  if (left !== right) {
    if (!left) return 1;
    if (!right) return -1;
    return left < right ? 1 : -1;
  }
  return String(a.activity.title).localeCompare(String(b.activity.title));
}

export function allActivities(feed) {
  const rows = [];
  for (const bot of feed?.bots || []) {
    for (const activity of bot.activities || []) rows.push({ bot, activity });
  }
  rows.sort(compareRows);
  return rows;
}

export function visibleActivities(feed, filters, pinned) {
  return allActivities(feed).filter((row) => activityMatches(row.bot, row.activity, filters, pinned));
}

export function visibleBots(feed, filters) {
  return (feed?.bots || []).filter((bot) => {
    if (filters.bot && !sameBot(bot.bot, filters.bot)) return false;
    if (filters.category || filters.status) {
      const hit = (bot.activities || []).some((activity) => activityMatches(
        bot,
        activity,
        { ...filters, query: '' },
      ));
      if (!hit) return false;
    }
    return textMatch(filters.query, botHaystack(bot));
  });
}

export function botHaystack(bot) {
  return [
    bot.bot,
    bot.role,
    ...Object.keys(bot.stats || {}),
    ...(bot.activities || []).flatMap((activity) => [activity.title, activity.summary, activity.category]),
    ...(bot.upcoming || []).flatMap((item) => [item.title, item.course, item.type, item.status]),
    ...(bot.uploads || []).flatMap((item) => [item.title, item.status]),
  ];
}

export function orderedBots(bots, order = []) {
  const rank = new Map(order.map((name, index) => [norm(name), index]));
  return [...(bots || [])].sort((a, b) => {
    const left = rank.has(norm(a.bot)) ? rank.get(norm(a.bot)) : 1000;
    const right = rank.has(norm(b.bot)) ? rank.get(norm(b.bot)) : 1000;
    if (left !== right) return left - right;
    return String(a.bot).localeCompare(String(b.bot), undefined, { sensitivity: 'base' });
  });
}

export function categoryCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.activity.category || 'other';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a[0]);
    const ib = CATEGORY_ORDER.indexOf(b[0]);
    const left = ia === -1 ? 100 : ia;
    const right = ib === -1 ? 100 : ib;
    if (left !== right) return left - right;
    return a[0].localeCompare(b[0]);
  });
}

export function filterOptions(feed) {
  const categories = new Set();
  const statuses = new Set();
  for (const bot of feed?.bots || []) {
    for (const activity of bot.activities || []) {
      if (activity.category) categories.add(activity.category);
      if (activity.status) statuses.add(activity.status);
    }
  }
  const categoryList = [
    ...CATEGORY_ORDER.filter((key) => categories.has(key)),
    ...[...categories].filter((key) => !CATEGORY_ORDER.includes(key)).sort(),
  ];
  const statusList = [
    ...STATUS_ORDER.filter((key) => statuses.has(key)),
    ...[...statuses].filter((key) => !STATUS_ORDER.includes(key)).sort(),
  ];
  return { categories: categoryList, statuses: statusList };
}

export function filtersActive(filters) {
  return Boolean(filters.query || filters.bot || filters.category || filters.status);
}
