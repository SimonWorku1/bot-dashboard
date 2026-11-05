import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptFeed } from '../js/crypto.js';
import {
  dueBucket,
  formatStat,
  humanizeKey,
  isCalendarDay,
  pacificStamp,
  relativeTime,
  safeUrl,
} from '../js/format.js';
import {
  applicationSeries,
  assessmentUrgency,
  axisMax,
  companyName,
  cumulative,
  isApplication,
  isScan,
  partitionAssessments,
  responseRate,
} from '../js/jobs-data.js';
import { navItems, pageIdFromHash, resolvePage } from '../js/pages.js';
import {
  canonicalize,
  mergePlaintext,
  readAgentDir,
  syncFeed,
} from './sync.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok ${name}`);
    });
}

await check('format helpers', async () => {
  assert.equal(humanizeKey('people_replied'), 'People replied');
  assert.equal(humanizeKey('reply_rate'), 'Reply rate');
  assert.equal(humanizeKey('tasks_completed'), 'Tasks completed');
  assert.equal(formatStat('reply_rate', 0.262), '26.2%');
  assert.equal(formatStat('reply_rate', 0), '0%');
  assert.equal(formatStat('reply_rate', 1), '100%');
  assert.equal(formatStat('reply_rate', 1.2), '1.2');
  assert.equal(formatStat('tasks_completed', 0), '0');
  assert.equal(formatStat('tasks_completed', 1), '1');
  assert.equal(formatStat('jobs_scanned', 186), '186');
  const noon = new Date(2026, 9, 31, 15, 0, 0);
  assert.equal(relativeTime('2026-10-30T22:00:00Z', new Date('2026-10-31T00:00:00Z')), '2h ago');
  assert.equal(relativeTime('2026-10-30T23:20:00Z', new Date('2026-10-31T00:00:00Z')), '40m ago');
  assert.equal(relativeTime('2026-10-30T23:59:40Z', new Date('2026-10-31T00:00:00Z')), 'just now');
  assert.equal(dueBucket('2026-10-28', noon), 'overdue');
  assert.equal(dueBucket('2026-10-31', noon), 'today');
  assert.equal(dueBucket('2026-11-03', noon), 'this-week');
  assert.equal(dueBucket('2026-11-20', noon), 'later');
  assert.equal(safeUrl('https://example.com/job'), 'https://example.com/job');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('http://user:pass@example.com'), '');
  assert.equal(isCalendarDay('2026-10-30'), true);
  assert.equal(isCalendarDay('2026-02-31'), false);
  assert.equal(isCalendarDay('nope'), false);
});

await check('jobs series', async () => {
  const derived = applicationSeries({
    activities: [
      { date: '2026-10-30', title: 'Applied: Harborline' },
      { date: '2026-10-30', title: 'Applied: Glasspine' },
      { date: '2026-10-29', title: 'Applied to Somewhere' },
      { date: '2026-10-28', title: 'Scanned 4 roles' },
      { date: '2026-02-31', title: 'Applied: Impossible' },
    ],
  });
  assert.equal(derived.derived, true);
  assert.deepEqual(derived.points, [
    { date: '2026-10-30', sent: 2, heard_back: 0, rejected: 0 },
  ]);
  const direct = applicationSeries({
    daily: [
      { date: '2026-10-30', sent: 2, heard_back: 1, rejected: 0 },
      { date: '2026-10-30', sent: 1, heard_back: 0, rejected: 1 },
      { date: '2026-10-29', sent: '1', heard_back: 0, rejected: 0 },
      { date: 'nope', sent: 9, heard_back: 9, rejected: 9 },
    ],
    activities: [{ date: '2026-10-30', title: 'Applied: Ignore me for the chart' }],
  });
  assert.equal(direct.derived, false);
  assert.deepEqual(direct.points, [
    { date: '2026-10-29', sent: 1, heard_back: 0, rejected: 0 },
    { date: '2026-10-30', sent: 3, heard_back: 1, rejected: 1 },
  ]);
  assert.equal(responseRate(direct.points), 1 / 4);
  assert.equal(responseRate([{ sent: 0, heard_back: 0, rejected: 0 }]), null);
  const running = cumulative(direct.points);
  assert.equal(running[1].sent, 4);
  assert.equal(running[1].heard_back, 1);
  assert.equal(running[1].rejected, 1);
  assert.equal(axisMax(0), 1);
  assert.equal(axisMax(2), 2);
  assert.equal(axisMax(14), 20);
  assert.equal(isApplication({ title: 'Applied: Glasspine' }), true);
  assert.equal(isApplication({ title: 'Applied to Harborline' }), true);
  assert.equal(isApplication({ title: 'Scanned 22 new roles' }), false);
  assert.equal(isScan({ title: 'Scanned 22 new roles' }), true);
  assert.equal(companyName({ title: 'Applied: Glasspine' }), 'Glasspine');
  assert.equal(companyName({ title: 'Applied to Harborline', company: 'Harborline' }), 'Harborline');
  const layout = JSON.parse(fs.readFileSync(path.join(root, 'layout.json'), 'utf8'));
  assert.equal(pageIdFromHash('', layout), 'desk');
  assert.equal(pageIdFromHash('#jobs', layout), 'jobs');
  assert.equal(pageIdFromHash('#jobs?x', layout), 'jobs');
  assert.equal(pageIdFromHash('#nope', layout), 'desk');
  assert.equal(resolvePage(layout, 'jobs').blocks.some((block) => block.type === 'jobs-trend'), true);
  assert.deepEqual(navItems(layout).map((item) => item.id), ['desk', 'jobs']);
});

await check('layout blocks load', async () => {
  const layout = JSON.parse(fs.readFileSync(path.join(root, 'layout.json'), 'utf8'));
  assert.ok(Array.isArray(layout.blocks) && layout.blocks.length >= 6);
  const sizes = new Set(['full', 'wide', 'half', 'third']);
  const lists = [layout.blocks, ...(layout.pages ? Object.values(layout.pages).map((page) => page.blocks) : [])];
  for (const blocks of lists) {
    assert.ok(Array.isArray(blocks) && blocks.length >= 1);
    for (const block of blocks) {
      assert.match(block.type, /^[a-z0-9-]+$/);
      if (block.size) assert.ok(sizes.has(block.size));
      const mod = await import(pathToFileURL(path.join(root, 'blocks', `${block.type}.js`)).href);
      assert.equal(typeof mod.render, 'function');
    }
  }
  const types = layout.blocks.map((block) => block.type);
  for (const required of ['stats-hero', 'filter-bar', 'activity-timeline', 'bot-grid', 'job-hunt', 'upcoming-schoolwork', 'uploads']) {
    assert.ok(types.includes(required), required);
  }
  const jobs = layout.pages.jobs.blocks.map((block) => block.type);
  for (const required of ['jobs-assessments', 'jobs-kpis', 'jobs-trend', 'jobs-applications', 'jobs-scans', 'jobs-outreach', 'jobs-note']) {
    assert.ok(jobs.includes(required), required);
  }
  assert.ok(jobs.indexOf('jobs-assessments') < jobs.indexOf('jobs-kpis'));
});

await check('assessment order', async () => {
  const now = new Date('2026-11-05T20:09:00Z');
  const grouped = partitionAssessments([
    { company: 'IBM', role: 'Software developer', kind: 'Coding test', duration: '90 min', due: '2026-10-22T17:00:00-07:00', status: 'DONE', link: 'https://example.com/ibm' },
    { company: 'Brightfold', role: 'Support', kind: 'Screen', duration: '30 min', due: null, due_note: 'No window', status: 'pending', link: 'https://example.com/b' },
    { company: 'Rokt', role: 'Engineer', kind: 'Criteria', duration: '75 min', due: '2026-11-06T17:00:00-08:00', status: 'pending', assessment_id: 'C-204817', link: 'https://example.com/r' },
    { company: 'Lumen Archive', role: 'Research', kind: 'Writing', duration: '60 min', due: '2026-10-28T18:00:00-07:00', status: 'expired', link: 'https://example.com/l' },
    { company: 'Older', role: 'Research', kind: 'Quiz', duration: '20 min', due: '2026-10-01T12:00:00-07:00', status: 'expired', link: 'https://example.com/o' },
    { company: 'Harborline', role: 'Product ops', kind: 'Case', duration: '2 hours', due: '2026-11-09T09:00:00-08:00', status: 'pending', link: 'https://example.com/h' },
    { company: 'Glasspine', role: 'Ops', kind: 'Work sample', duration: '90 min', due: '2026-11-04T17:00:00-08:00', status: 'pending', link: 'https://example.com/g' },
    { company: 'Zed', role: 'B', due: '2026-11-10T12:00:00-08:00', status: 'pending' },
    { company: 'Ada', role: 'A', due: '2026-11-10T12:00:00-08:00', status: 'pending' },
    { company: '', role: '', status: 'pending' },
    null,
  ], now);
  assert.deepEqual(grouped.pending.map((item) => item.company), [
    'Glasspine', 'Rokt', 'Harborline', 'Ada', 'Zed', 'Brightfold',
  ]);
  assert.equal(grouped.pending.some((item) => item.company === 'IBM'), false);
  assert.equal(grouped.expired.some((item) => item.company === 'IBM'), false);
  assert.deepEqual(grouped.expired.map((item) => item.company), ['Lumen Archive', 'Older']);
  assert.equal(grouped.pending[0].urgency, 'overdue');
  assert.equal(grouped.pending[1].urgency, 'soon');
  assert.equal(grouped.pending[1].assessmentId, 'C-204817');
  assert.equal(grouped.pending[2].urgency, 'later');
  assert.equal(grouped.pending.at(-1).urgency, 'none');
  assert.equal(grouped.pending.at(-1).dueNote, 'No window');
  const edge = new Date('2026-11-05T20:00:00Z');
  assert.equal(assessmentUrgency(new Date(edge.getTime() + 48 * 60 * 60 * 1000), edge), 'soon');
  assert.equal(assessmentUrgency(new Date(edge.getTime() + 48 * 60 * 60 * 1000 + 1), edge), 'later');
  assert.equal(assessmentUrgency(new Date(edge.getTime() - 1), edge), 'overdue');
  assert.equal(assessmentUrgency(null, edge), 'none');
  assert.deepEqual(partitionAssessments(undefined, now), { pending: [], expired: [] });
  const stamp = pacificStamp(new Date('2026-11-06T17:00:00-08:00'), now);
  assert.match(stamp, /Nov/);
  assert.match(stamp, /PST|PDT/);
});

await check('encrypt in node, decrypt with webcrypto', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-'));
  const agents = path.join(tmp, 'agents');
  const outDir = path.join(tmp, 'out');
  fs.mkdirSync(agents);
  fs.mkdirSync(outDir);
  const out = path.join(outDir, 'feed.enc.json');
  const pass = 'test-passcode';
  const indi = {
    bot: 'Indi',
    role: 'scans',
    updated: '2026-10-30T23:00:00Z',
    mood: 'steady',
    extra_list: [{ name: 'keep' }],
    assessments: [
      {
        company: 'Rokt',
        role: 'Engineer',
        kind: 'Criteria',
        duration: '75 min',
        due: '2026-11-06T17:00:00-08:00',
        due_note: 'Enter the ID',
        link: 'https://example.com/rokt',
        status: 'pending',
        assessment_id: 'RK-1',
      },
      {
        company: 'Quiet Co',
        role: 'Ops',
        kind: 'screen',
        duration: '20 min',
        due: null,
        due_note: 'No window yet',
        link: 'https://example.com/quiet',
        status: 'pending',
      },
    ],
    daily: [
      { date: '2026-10-30', sent: 2, heard_back: 1, rejected: 0, source: 'desk' },
      { date: 'nope', sent: 4, heard_back: 0, rejected: 0 },
      { date: '2026-10-29', sent: '1', heard_back: 0, rejected: 1 },
    ],
    stats: { applied: 2, jobs_scanned: 10, tasks_completed: 4, reply_rate: '0.5' },
    activities: [
      {
        date: '2026-10-30',
        title: 'Secret title café',
        summary: 'Applied to Example Co',
        category: 'Jobs',
        status: 'DONE',
        link: 'https://example.com/job',
        note: 'keep me',
      },
      {
        date: '2026-10-29',
        title: 'Earlier',
        summary: '',
        category: 'errands',
        status: 'waiting',
        link: 'javascript:alert(1)',
      },
    ],
  };
  fs.writeFileSync(path.join(agents, 'indi.json'), JSON.stringify(indi));
  fs.writeFileSync(path.join(agents, 'schooly.json'), JSON.stringify({
    bot: 'schooly',
    role: 'classes',
    updated: '2026-10-30T07:00:00Z',
    upcoming: [
      { due: '2026-11-20', course: 'Econ', title: 'Later paper', type: 'essay', status: 'not started' },
      { due: '2026-10-28', course: 'Math', title: 'Late proof', type: 'worksheet', status: 'late' },
    ],
  }));
  fs.writeFileSync(path.join(agents, 'toob.json'), JSON.stringify({
    bot: 'toob',
    role: 'videos',
    uploads: [
      { title: 'Desk tour', status: 'published', date: '2026-10-27', views: 10, link: 'https://example.com/v' },
    ],
  }));
  fs.writeFileSync(path.join(agents, 'link.json'), JSON.stringify({
    bot: 'Link',
    stats: { people_contacted: 4, people_replied: 1, reply_rate: 0.262 },
    activities: [{ date: '2026-10-30', title: 'Wrote to people', summary: 'One reply', category: 'jobs', status: 'done' }],
  }));
  fs.writeFileSync(path.join(agents, 'bad.json'), '{');
  fs.writeFileSync(path.join(agents, 'notes.txt'), '{"bot":"nope"}');

  assert.throws(
    () => syncFeed({ dir: agents, passcode: pass, out: path.join(outDir, 'feed.json') }),
    /feed\.enc\.json/,
  );
  assert.throws(() => syncFeed({ dir: agents, passcode: '', out }), /DASHBOARD_PASSCODE/);

  const first = syncFeed({ dir: agents, passcode: pass, out });
  assert.equal(first.changed, true);
  assert.ok(first.warnings.some((warning) => warning.includes('bad.json')));
  const bytes = fs.readFileSync(out);
  const envelope = JSON.parse(bytes.toString('utf8'));
  assert.ok(envelope.iterations >= 250000);
  assert.equal(envelope.kdf, 'PBKDF2-SHA256');
  assert.equal(envelope.cipher, 'AES-256-GCM');
  assert.equal(bytes.includes(Buffer.from('"bot"')), false);
  assert.equal(bytes.toString('utf8').includes('Secret title'), false);
  assert.equal(bytes.toString('utf8').includes('café'), false);
  assert.equal(fs.readdirSync(outDir).filter((name) => name !== 'feed.enc.json').length, 0);

  const expected = JSON.parse(canonicalize(mergePlaintext(readAgentDir(agents).bots)));
  const opened = await decryptFeed(envelope, pass);
  assert.deepEqual(opened.data, expected);
  const indiBot = opened.data.bots.find((bot) => bot.bot === 'Indi');
  assert.equal(indiBot.mood, 'steady');
  assert.equal(indiBot.extra_list[0].name, 'keep');
  assert.equal(indiBot.daily.length, 2);
  assert.equal(indiBot.daily.find((row) => row.date === '2026-10-30').source, 'desk');
  assert.equal(indiBot.daily.find((row) => row.date === '2026-10-30').sent, 2);
  assert.equal(indiBot.daily.find((row) => row.date === '2026-10-29').sent, 1);
  assert.equal(indiBot.daily.some((row) => row.date === 'nope'), false);
  assert.equal(indiBot.activities.find((item) => item.title.startsWith('Secret')).category, 'jobs');
  assert.equal(indiBot.activities.find((item) => item.title === 'Earlier').category, 'errands');
  assert.equal(indiBot.stats.reply_rate, 0.5);
  assert.equal(indiBot.assessments.find((item) => item.company === 'Rokt').assessment_id, 'RK-1');
  assert.equal(indiBot.assessments.find((item) => item.company === 'Rokt').due, '2026-11-06T17:00:00-08:00');
  assert.equal(indiBot.assessments.find((item) => item.company === 'Quiet Co').due, null);
  assert.equal(indiBot.assessments.find((item) => item.company === 'Quiet Co').due_note, 'No window yet');
  assert.ok(opened.data.bots.find((bot) => bot.bot === 'schooly').upcoming.length === 2);
  assert.equal(opened.data.bots.find((bot) => bot.bot === 'toob').uploads[0].views, 10);
  assert.equal(safeUrl(indiBot.activities.find((item) => item.title === 'Earlier').link), '');

  await assert.rejects(() => decryptFeed(envelope, 'wrong-passcode'));
  await assert.rejects(() => decryptFeed({ ...envelope, iterations: 1000 }, pass));

  const stamped = fs.statSync(out).mtimeNs;
  fs.writeFileSync(path.join(agents, 'indi.json'), JSON.stringify({
    activities: indi.activities.slice().reverse(),
    stats: { tasks_completed: 4, reply_rate: '0.5', jobs_scanned: 10, applied: 2 },
    updated: indi.updated,
    role: indi.role,
    mood: indi.mood,
    bot: indi.bot,
    daily: indi.daily.slice().reverse(),
    extra_list: indi.extra_list,
    assessments: indi.assessments,
  }, null, 2));
  const second = syncFeed({ dir: agents, passcode: pass, out });
  assert.equal(second.changed, false);
  assert.equal(fs.statSync(out).mtimeNs, stamped);
  assert.deepEqual(fs.readFileSync(out), bytes);

  const changed = JSON.parse(fs.readFileSync(path.join(agents, 'indi.json'), 'utf8'));
  changed.activities[0].title = 'A real change';
  fs.writeFileSync(path.join(agents, 'indi.json'), JSON.stringify(changed));
  const third = syncFeed({ dir: agents, passcode: pass, out });
  assert.equal(third.changed, true);
  assert.notDeepEqual(fs.readFileSync(out), bytes);
  const again = await decryptFeed(JSON.parse(fs.readFileSync(out, 'utf8')), pass);
  assert.ok(again.data.bots.some((bot) => (bot.activities || []).some((item) => item.title === 'A real change')));

  const emptyDir = path.join(tmp, 'empty');
  fs.mkdirSync(emptyDir);
  fs.writeFileSync(path.join(emptyDir, 'bad.json'), '{');
  const blocked = path.join(tmp, 'blocked', 'feed.enc.json');
  assert.throws(() => syncFeed({ dir: emptyDir, passcode: pass, out: blocked }), /No valid agent files/);
  assert.equal(fs.existsSync(blocked), false);
});

await check('sample feed unlocks with demo', async () => {
  const live = path.join(root, 'data', 'feed.enc.json');
  const out = path.join(root, 'examples', 'feed.enc.json');
  const liveBefore = fs.readFileSync(live);
  const before = fs.readFileSync(out);
  const result = syncFeed({
    dir: path.join(root, 'examples', 'agents'),
    passcode: 'demo',
    out,
  });
  assert.equal(result.changed, false);
  assert.deepEqual(fs.readFileSync(out), before);
  assert.deepEqual(fs.readFileSync(live), liveBefore);
  const envelope = JSON.parse(before.toString('utf8'));
  assert.ok(envelope.iterations >= 250000);
  const opened = await decryptFeed(envelope, 'demo');
  const names = opened.data.bots.map((bot) => bot.bot).sort();
  for (const name of ['Dash', 'Indi', 'Link', 'Project Get Me A Job', 'schooly', 'Audit', 'Social Media Team', 'fin', 'finnias', 'iggy', 'jacky', 'tik', 'toob']) {
    assert.ok(names.includes(name), name);
  }
  const sampleIndi = opened.data.bots.find((bot) => bot.bot === 'Indi');
  assert.equal(sampleIndi.stats.jobs_scanned, 186);
  assert.equal(sampleIndi.stats.applications_submitted, 14);
  assert.equal(sampleIndi.stats.rejections, 4);
  assert.equal(sampleIndi.daily.reduce((sum, row) => sum + row.sent, 0), 14);
  assert.equal(sampleIndi.daily.reduce((sum, row) => sum + row.heard_back, 0), 6);
  assert.equal(sampleIndi.daily.reduce((sum, row) => sum + row.rejected, 0), 4);
  assert.equal(typeof sampleIndi.stats_note, 'string');
  assert.ok(sampleIndi.stats_note.includes('Heard back'));
  assert.ok(Array.isArray(sampleIndi.assessments));
  assert.equal(sampleIndi.assessments.find((item) => item.company === 'IBM').status, 'done');
  assert.equal(sampleIndi.assessments.find((item) => item.company === 'Rokt').assessment_id, 'C-204817');
  assert.equal(sampleIndi.assessments.find((item) => item.company === 'Brightfold').due, null);
  const viewedAt = new Date('2026-11-05T20:09:00Z');
  const visible = partitionAssessments(sampleIndi.assessments, viewedAt);
  assert.deepEqual(visible.pending.map((item) => item.company), ['Glasspine', 'Rokt', 'Harborline', 'Brightfold']);
  assert.equal(visible.pending.some((item) => item.company === 'IBM'), false);
  assert.equal(visible.expired.some((item) => item.company === 'IBM'), false);
  assert.deepEqual(visible.expired.map((item) => item.company), ['Lumen Archive']);
  assert.equal(visible.pending[0].urgency, 'overdue');
  assert.equal(visible.pending[1].urgency, 'soon');
  const sampleLink = opened.data.bots.find((bot) => bot.bot === 'Link');
  assert.equal(sampleLink.stats.reply_rate, 0.262);
  assert.equal(sampleLink.stats.awaiting_reply, 18);
  assert.equal(typeof sampleLink.stats_note, 'string');
  assert.ok(opened.data.bots.find((bot) => bot.bot === 'schooly').upcoming.some((item) => item.title === 'Proof worksheet 6'));
  assert.ok(opened.data.bots.find((bot) => bot.bot === 'toob').uploads.some((item) => item.views === 18420));
  assert.equal(opened.data.bots.find((bot) => bot.bot === 'Dash').mood, 'steady');
  assert.equal(before.includes(Buffer.from('Proof worksheet 6')), false);
  assert.equal(before.toString('utf8').includes('"activities"'), false);
});

function pathToFileURL(file) {
  return new URL(`file://${file}`);
}

console.log('all checks passed');
