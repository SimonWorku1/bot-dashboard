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
  relativeTime,
  safeUrl,
} from '../js/format.js';
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
});

await check('layout blocks load', async () => {
  const layout = JSON.parse(fs.readFileSync(path.join(root, 'layout.json'), 'utf8'));
  assert.ok(Array.isArray(layout.blocks) && layout.blocks.length >= 6);
  const sizes = new Set(['full', 'wide', 'half', 'third']);
  for (const block of layout.blocks) {
    assert.match(block.type, /^[a-z0-9-]+$/);
    if (block.size) assert.ok(sizes.has(block.size));
    const mod = await import(pathToFileURL(path.join(root, 'blocks', `${block.type}.js`)).href);
    assert.equal(typeof mod.render, 'function');
  }
  const types = layout.blocks.map((block) => block.type);
  for (const required of ['stats-hero', 'filter-bar', 'activity-timeline', 'bot-grid', 'job-hunt', 'upcoming-schoolwork', 'uploads']) {
    assert.ok(types.includes(required), required);
  }
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
  assert.equal(indiBot.activities.find((item) => item.title.startsWith('Secret')).category, 'jobs');
  assert.equal(indiBot.activities.find((item) => item.title === 'Earlier').category, 'errands');
  assert.equal(indiBot.stats.reply_rate, 0.5);
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
  const out = path.join(root, 'data', 'feed.enc.json');
  const before = fs.readFileSync(out);
  const result = syncFeed({
    dir: path.join(root, 'examples', 'agents'),
    passcode: 'demo',
    out,
  });
  assert.equal(result.changed, false);
  assert.deepEqual(fs.readFileSync(out), before);
  const envelope = JSON.parse(before.toString('utf8'));
  assert.ok(envelope.iterations >= 250000);
  const opened = await decryptFeed(envelope, 'demo');
  const names = opened.data.bots.map((bot) => bot.bot).sort();
  for (const name of ['Dash', 'Indi', 'Link', 'Project Get Me A Job', 'schooly', 'Audit', 'Social Media Team', 'fin', 'finnias', 'iggy', 'jacky', 'tik', 'toob']) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(opened.data.bots.find((bot) => bot.bot === 'Indi').stats.jobs_scanned, 186);
  assert.equal(opened.data.bots.find((bot) => bot.bot === 'Link').stats.reply_rate, 0.262);
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
