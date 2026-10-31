import { onMinute } from '../js/clock.js';
import { formatCount, formatStat, humanizeKey, statEntries } from '../js/format.js';
import { botHaystack, findBot, textMatch } from '../js/query.js';
import { blockHead, emptyNote, h, identity, metrics } from '../js/ui.js';

export const meta = {
  id: 'job-hunt',
  name: 'Job hunt',
  description: 'Indi and Link side by side, with a combined funnel.',
};

const DEFAULT_FUNNEL = [
  { bot: 'Indi', stat: 'jobs_scanned', label: 'Jobs scanned' },
  { bot: 'Indi', stat: 'applied', label: 'Applied' },
  { bot: 'Link', stat: 'people_contacted', label: 'People contacted' },
  { bot: 'Link', stat: 'people_replied', label: 'Replies' },
];

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const draw = () => {
    const scan = findBot(ctx.feed, options.scanBot || 'Indi');
    const outreach = findBot(ctx.feed, options.outreachBot || 'Link');
    const filters = ctx.store.getState();
    const intro = options.intro || 'Indi finds roles. Link starts the conversations.';
    const hay = [
      intro,
      ctx.block.title,
      ...(scan ? botHaystack(scan) : []),
      ...(outreach ? botHaystack(outreach) : []),
    ];
    if (!textMatch(filters.query, hay)) {
      container.replaceChildren(
        blockHead(ctx.block.title || 'Job hunt'),
        emptyNote('Nothing in this block matches the search.'),
      );
      return;
    }
    const steps = (Array.isArray(options.funnel) && options.funnel.length ? options.funnel : DEFAULT_FUNNEL)
      .map((step) => {
        const bot = findBot(ctx.feed, step.bot) || (step.bot === (options.outreachBot || 'Link') ? outreach : scan);
        const raw = bot?.stats?.[step.stat];
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        return {
          label: step.label || humanizeKey(step.stat || ''),
          value,
        };
      });
    const max = steps.reduce((highest, step) => Math.max(highest, step.value || 0), 0);
    const rate = rateLine(outreach);
    container.replaceChildren(
      blockHead(ctx.block.title || 'Job hunt'),
      h('p', { class: 'lede' }, intro),
      h('div', { class: 'funnel', role: 'list' }, steps.map((step) => h('div', { class: 'funnel-step', role: 'listitem' }, [
        h('b', {}, step.value == null ? '—' : formatCount(step.value)),
        h('span', {}, step.label),
        h('i', {
          'aria-hidden': 'true',
          style: `--w:${max && step.value ? Math.max(4, Math.round((step.value / max) * 100)) : 0}%`,
        }),
      ]))),
      rate ? h('p', { class: 'rate-line' }, rate) : null,
      h('div', { class: 'pair' }, [
        column(scan, options.scanBot || 'Indi'),
        column(outreach, options.outreachBot || 'Link'),
      ]),
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

function column(bot, name) {
  if (!bot) return h('article', { class: 'inset' }, emptyNote(`${name} is not in the feed yet.`));
  return h('article', { class: 'inset' }, [
    identity(bot),
    metrics(bot.stats),
  ]);
}

function rateLine(bot) {
  if (!bot?.stats) return '';
  const entry = statEntries(bot.stats).find(([key, value]) => (
    typeof value === 'number' && /rate|ratio|percent|pct/i.test(key) && value >= 0 && value <= 1
  ));
  if (!entry) return '';
  return `${bot.bot} ${humanizeKey(entry[0]).toLowerCase()} ${formatStat(entry[0], entry[1])}`;
}
