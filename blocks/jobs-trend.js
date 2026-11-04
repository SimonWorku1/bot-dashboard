import { formatCount, mediumDate, shortDate } from '../js/format.js';
import {
  TREND_SERIES,
  applicationSeries,
  axisMax,
  cumulative,
  seriesTotals,
} from '../js/jobs-data.js';
import { findBot } from '../js/query.js';
import { blockHead, emptyNote, h } from '../js/ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const meta = {
  id: 'jobs-trend',
  name: 'Applications trend',
  description: 'Daily line chart of applications sent, heard back, and rejected.',
};

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const scanName = options.scanBot || 'Indi';
  const bot = findBot(ctx.feed, scanName);
  const headTitle = ctx.block.title || 'Applications over time';
  if (!bot) {
    container.replaceChildren(blockHead(headTitle), emptyNote(`${scanName} is not in the feed yet.`));
    return undefined;
  }

  const series = applicationSeries(bot);
  let mode = 'daily';
  let frame = 0;
  let chartSvg = null;
  let view = null;
  let paintedKey = '';

  const dailyBtn = h('button', { type: 'button', 'aria-pressed': 'true' }, 'Daily');
  const cumulativeBtn = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Cumulative');
  const toggle = h('div', { class: 'theme-switch', role: 'group', 'aria-label': 'Chart values' }, [
    dailyBtn,
    cumulativeBtn,
  ]);
  const note = h('p', { class: 'chart-note' }, derivedNote(bot));
  note.hidden = !series.derived;
  const stage = h('div', { class: 'trend-stage' });
  const tipDate = h('p', { class: 'trend-tip-date' });
  const tipMode = h('p', { class: 'trend-tip-mode' });
  const tipRows = h('div', {});
  const tooltip = h('div', { class: 'trend-tooltip', hidden: true }, [tipDate, tipMode, tipRows]);
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const legend = h('ul', { class: 'trend-legend' });
  const tableWrap = h('div', { class: 'trend-table-wrap' });
  const tableFold = h('details', { class: 'fold' }, [
    h('summary', {}, 'Numbers behind the chart'),
    tableWrap,
  ]);

  container.replaceChildren(
    blockHead(headTitle, toggle),
    note,
    stage,
    legend,
    tableFold,
    live,
  );
  const setMode = (next) => {
    if (next === mode) return;
    mode = next;
    dailyBtn.setAttribute('aria-pressed', mode === 'daily' ? 'true' : 'false');
    cumulativeBtn.setAttribute('aria-pressed', mode === 'cumulative' ? 'true' : 'false');
    paint();
  };
  dailyBtn.addEventListener('click', () => setMode('daily'));
  cumulativeBtn.addEventListener('click', () => setMode('cumulative'));

  function paint() {
    const width = Math.max(280, Math.floor(stage.clientWidth || container.clientWidth || 640));
    const key = `${mode}:${width}:${series.points.length}:${series.derived ? 1 : 0}`;
    if (key === paintedKey && chartSvg?.isConnected) return;
    paintedKey = key;
    const points = mode === 'cumulative' ? cumulative(series.points) : series.points;
    const totals = seriesTotals(series.points);
    legend.replaceChildren(...TREND_SERIES.map((item) => h('li', {}, [
      h('i', { 'data-series': item.key, 'aria-hidden': 'true' }),
      item.label,
      h('b', {}, formatCount(totals[item.key])),
    ])));
    tableFold.querySelector('summary').textContent = mode === 'cumulative'
      ? 'Cumulative numbers'
      : 'Daily numbers';
    tableWrap.replaceChildren(dataTable(points, mode));

    if (!points.length) {
      chartSvg = null;
      view = null;
      stage.replaceChildren(
        emptyNote(series.derived
          ? `No activities titled “Applied:” yet.`
          : 'No daily points to chart.'),
        tooltip,
      );
      tooltip.hidden = true;
      return;
    }

    const built = drawChart(points, width, mode, totals);
    chartSvg = built.svg;
    view = built.view;
    stage.replaceChildren(chartSvg, tooltip);
    tooltip.hidden = true;
    chartSvg.addEventListener('pointerdown', (event) => show(event, false));
    chartSvg.addEventListener('pointermove', (event) => show(event, false));
    chartSvg.addEventListener('pointerleave', () => {
      tooltip.hidden = true;
      setCursor(-1);
    });
    chartSvg.addEventListener('keydown', (event) => {
      if (!view?.points.length) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const current = view.active;
      let next = current < 0 ? (event.key === 'ArrowLeft' || event.key === 'End' ? view.points.length - 1 : 0) : current;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = view.points.length - 1;
      else if (event.key === 'ArrowLeft') next = Math.max(0, current < 0 ? 0 : current - 1);
      else if (event.key === 'ArrowRight') next = Math.min(view.points.length - 1, current < 0 ? 0 : current + 1);
      focusIndex(next, true);
    });
  }

  function show(event, announce) {
    if (!view || !chartSvg) return;
    const rect = chartSvg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * view.width;
    const index = nearestIndex(view, x);
    focusIndex(index, announce);
    placeTooltip(event.clientX, event.clientY);
  }

  function focusIndex(index, announce) {
    if (!view || index < 0 || index >= view.points.length) return;
    view.active = index;
    setCursor(index);
    const point = view.points[index];
    tipDate.textContent = mediumDate(point.date) || point.date;
    tipMode.textContent = mode === 'cumulative' ? 'Through this day' : 'That day';
    tipRows.replaceChildren(...TREND_SERIES.map((item) => h('p', { class: 'trend-tip-row' }, [
      h('span', {}, [
        h('i', { class: 'trend-swatch', 'data-series': item.key, 'aria-hidden': 'true' }),
        item.label,
      ]),
      h('b', {}, formatCount(point[item.key])),
    ])));
    tooltip.hidden = false;
    if (chartSvg) {
      const rect = chartSvg.getBoundingClientRect();
      const x = rect.left + (view.xAt(index) / view.width) * rect.width;
      const y = rect.top + (view.yAt(point.sent) / view.height) * rect.height;
      placeTooltip(x, y);
    }
    if (announce) {
      const bits = TREND_SERIES.map((item) => `${item.label} ${formatCount(point[item.key])}`).join(', ');
      live.textContent = `${tipDate.textContent}. ${tipMode.textContent}. ${bits}.`;
    }
  }

  function setCursor(index) {
    if (!chartSvg || !view) return;
    const cursor = chartSvg.querySelector('.trend-cursor');
    const focus = chartSvg.querySelector('.trend-focus');
    if (!cursor || !focus) return;
    if (index < 0) {
      cursor.setAttribute('visibility', 'hidden');
      focus.replaceChildren();
      return;
    }
    const x = view.xAt(index);
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('y1', view.padT);
    cursor.setAttribute('y2', view.height - view.padB);
    cursor.setAttribute('visibility', 'visible');
    const point = view.points[index];
    focus.replaceChildren(...TREND_SERIES.map((item) => svg('circle', {
      cx: x,
      cy: view.yAt(point[item.key]),
      r: 5,
      class: 'trend-dot trend-dot-active',
      'data-series': item.key,
    })));
  }

  function placeTooltip(clientX, clientY) {
    if (!chartSvg || tooltip.hidden) return;
    const host = stage.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    let x = clientX - host.left + 14;
    let y = clientY - host.top - height - 14;
    if (x + width > host.width - 8) x = clientX - host.left - width - 14;
    if (x < 8) x = 8;
    if (y < 8) y = clientY - host.top + 16;
    if (y + height > host.height - 8) y = Math.max(8, host.height - height - 8);
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  const observer = new ResizeObserver(() => paint());
  observer.observe(stage);
  frame = requestAnimationFrame(paint);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

function derivedNote(bot) {
  return `${bot.bot} has no daily series. Sent counts activities whose title starts with “Applied:”. Heard back and rejected are 0.`;
}

function drawChart(points, width, mode, totals) {
  const narrow = width < 520;
  const padL = narrow ? 32 : 44;
  const padR = 8;
  const padT = 18;
  const padB = 32;
  const height = narrow ? 220 : 280;
  const peak = Math.max(...points.flatMap((point) => TREND_SERIES.map((item) => point[item.key])), 0);
  const max = axisMax(peak);
  const plotW = Math.max(1, width - padL - padR);
  const plotH = Math.max(1, height - padT - padB);
  const xAt = (index) => (points.length <= 1 ? padL + plotW / 2 : padL + (plotW * index) / (points.length - 1));
  const yAt = (value) => padT + plotH - (value / max) * plotH;
  const view = { points, width, height, padL, padR, padT, padB, xAt, yAt, active: -1 };

  const grid = svg('g', { class: 'trend-grid', 'aria-hidden': 'true' });
  for (const tick of [max, max / 2, 0]) {
    const y = yAt(tick);
    grid.append(
      svg('line', { x1: padL, x2: width - padR, y1: y, y2: y }),
      text(formatTick(tick), padL - 8, y, { 'text-anchor': 'end', 'dominant-baseline': 'middle' }),
    );
  }

  const axis = svg('g', { class: 'trend-axis', 'aria-hidden': 'true' });
  for (const index of labelIndexes(points.length, narrow ? 4 : 6)) {
    const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
    axis.append(text(shortDate(points[index].date) || points[index].date, xAt(index), height - 10, { 'text-anchor': anchor }));
  }

  const order = [...TREND_SERIES].sort((a, b) => totals[b.key] - totals[a.key]);
  const lines = svg('g', { class: 'trend-lines' });
  if (points.length > 1) {
    for (const item of order) {
      const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(2)} ${yAt(point[item.key]).toFixed(2)}`).join(' ');
      lines.append(svg('path', { d, class: 'trend-line', 'data-series': item.key }));
    }
  }
  const dots = svg('g', { class: 'trend-dots' });
  if (points.length <= 48) {
    for (const item of order) {
      for (let index = 0; index < points.length; index += 1) {
        dots.append(svg('circle', {
          cx: xAt(index).toFixed(2),
          cy: yAt(points[index][item.key]).toFixed(2),
          r: points.length > 24 ? 2.4 : 3.2,
          class: 'trend-dot',
          'data-series': item.key,
        }));
      }
    }
  }

  const summary = `${mode === 'cumulative' ? 'Cumulative' : 'Daily'} line chart. ${TREND_SERIES.map((item) => `${item.label} ${formatCount(totals[item.key])}`).join(', ')}.`;
  const root = svg('svg', {
    class: 'trend-chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
    tabindex: '0',
    'aria-label': summary,
  }, [
    grid,
    lines,
    dots,
    axis,
    svg('line', {
      class: 'trend-cursor',
      x1: 0,
      x2: 0,
      y1: padT,
      y2: height - padB,
      visibility: 'hidden',
    }),
    svg('g', { class: 'trend-focus' }),
    svg('rect', { class: 'trend-hit', x: 0, y: 0, width, height }),
  ]);
  return { svg: root, view };
}

function dataTable(points, mode) {
  const table = h('table', { class: 'trend-table' });
  const head = h('tr', {}, [
    h('th', { scope: 'col' }, 'Date'),
    ...TREND_SERIES.map((item) => h('th', { scope: 'col' }, item.label)),
  ]);
  table.append(
    h('thead', {}, head),
    h('tbody', {}, points.map((point) => h('tr', {}, [
      h('th', { scope: 'row' }, mediumDate(point.date) || point.date),
      ...TREND_SERIES.map((item) => h('td', {}, formatCount(point[item.key]))),
    ]))),
  );
  table.dataset.mode = mode;
  return table;
}

function labelIndexes(count, target) {
  if (count <= 1) return [0];
  const ticks = Math.min(target, count);
  const indexes = [];
  for (let i = 0; i < ticks; i += 1) indexes.push(Math.round((i * (count - 1)) / (ticks - 1)));
  return [...new Set(indexes)];
}

function nearestIndex(view, x) {
  const { points, xAt } = view;
  if (points.length <= 1) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const dist = Math.abs(xAt(index) - x);
    if (dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  }
  return best;
}

function formatTick(value) {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
  return value.toFixed(1);
}

function svg(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children || []) node.append(child);
  return node;
}

function text(value, x, y, attrs) {
  const node = svg('text', { x, y, ...attrs });
  node.textContent = value;
  return node;
}
