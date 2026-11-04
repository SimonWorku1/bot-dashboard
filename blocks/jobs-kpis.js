import { formatStat } from '../js/format.js';
import {
  INDI_TILES,
  LINK_TILES,
  applicationSeries,
  readStat,
  responseRate,
  seriesTotals,
  statText,
  tileSpecs,
} from '../js/jobs-data.js';
import { findBot } from '../js/query.js';
import { blockHead, emptyNote, h } from '../js/ui.js';

export const meta = {
  id: 'jobs-kpis',
  name: 'Jobs pipeline',
  description: 'Indi and Link totals, plus heard back divided by sent.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const scanName = options.scanBot || 'Indi';
  const outreachName = options.outreachBot || 'Link';
  const indiSpecs = tileSpecs(options.indi, INDI_TILES);
  const linkSpecs = tileSpecs(options.link, LINK_TILES);

  const scan = findBot(ctx.feed, scanName);
  const outreach = findBot(ctx.feed, outreachName);
  if (!scan && !outreach) {
    container.replaceChildren(
      blockHead(ctx.block.title || 'Pipeline'),
      emptyNote('Indi and Link are not in the feed yet.'),
    );
    return undefined;
  }

  const series = applicationSeries(scan);
  const rate = responseRate(series.points);
  const totals = seriesTotals(series.points);
  const indiTiles = indiSpecs.map((spec) => [spec.label, statText(spec.stat, readStat(scan?.stats, spec.stat))]);
  indiTiles.push(['Response rate', rate == null ? '—' : formatStat('response_rate', rate)]);
  const linkTiles = linkSpecs.map((spec) => [spec.label, statText(spec.stat, readStat(outreach?.stats, spec.stat))]);

  const note = ['Response rate is heard back divided by sent.'];
  if (!scan) note.push(`${scanName} is not in the feed yet.`);
  else if (series.derived && totals.sent === 0) {
    note.push(`No daily series on ${scan.bot}, and no activities titled “Applied:”, so heard back and rejected stay at 0.`);
  } else if (series.derived) {
    note.push(`No daily series on ${scan.bot}. Heard back and rejected stay at 0 until one is added.`);
  }

  container.replaceChildren(
    blockHead(ctx.block.title || 'Pipeline'),
    h('div', { class: 'kpi-groups' }, [
      group(scan?.bot || scanName, indiTiles, note.join(' ')),
      group(outreach?.bot || outreachName, linkTiles, outreach ? '' : `${outreachName} is not in the feed yet.`),
    ]),
  );
  return undefined;
}

function group(name, tiles, note) {
  return h('section', { class: 'kpi-group' }, [
    h('h3', { class: 'kpi-heading' }, name),
    h('ul', { class: 'hero-stats kpi-stats' }, tiles.map(([label, value]) => h('li', { class: 'hero-stat' }, [
      h('b', {}, value),
      h('span', {}, label),
    ]))),
    note ? h('p', { class: 'kpi-note' }, note) : null,
  ]);
}
