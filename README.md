# Assistant desk

A static desk for Simon Worku’s assistants. GitHub Pages serves this repo from `main` at the site root. There is no build step. The page is plain HTML, CSS, and ES modules.

The site is public. The feed is not. `data/feed.enc.json` is encrypted, and the browser decrypts it with a passcode after the lock screen. The sample feed unlocks with **`demo`**. That feed is fake. Replace it by running the sync against the real agent folder and a real passcode.

## Pages

In the repo settings, set GitHub Pages to deploy from branch `main` and folder `/` (root). `.nojekyll` is already here so Jekyll leaves the files alone. Paths are relative, so the same files work at a project-site URL.

## What’s on the desk

`layout.json` chooses the blocks, their order, titles, and options. The sample layout shows:

- totals
- search, plus filters for bot, category, and status
- a Job hunt block with Indi and Link side by side and a combined funnel
- schooly’s upcoming work, sorted by due date, with overdue / today / this week called out
- toob’s uploads, with status and views
- highlights, a category chart, one card per bot, and a timeline

Each bot card shows that bot’s `updated` time as a relative time (`2h ago`). Bots do not all refresh on the same schedule. Dash-style bots move after an action, schooly about daily, toob about twice a week. The timestamp is the freshness signal.

Stats are whatever keys the bot file contains. `people_replied` is shown as “People replied”. A value from 0 to 1 on a key like `reply_rate` is shown as a percent.

## Bot files

Each bot writes one JSON file outside this repo. The default folder is `/home/box/shared/bot-dashboard/agents`. Missing fields are filled in. Extra fields are kept. Unknown categories are kept. `tasks_completed` defaults to 0.

```json
{
  "bot": "Display name",
  "role": "one line",
  "updated": "2026-10-30T22:05:00Z",
  "stats": { "tasks_completed": 1, "people_replied": 11, "reply_rate": 0.262 },
  "activities": [
    {
      "date": "2026-10-30",
      "title": "",
      "summary": "",
      "category": "jobs",
      "status": "done",
      "link": "https://example.com/optional"
    }
  ],
  "upcoming": [
    { "due": "2026-11-03", "course": "Intro to Economics", "title": "Problem set 4", "type": "problem set", "status": "not started" }
  ],
  "uploads": [
    { "title": "Desk tour", "status": "published", "date": "2026-10-27", "views": 18420, "link": "https://example.com/toob/desk-tour" }
  ]
}
```

Activity `category` is usually `jobs`, `school`, `social`, `finance`, `coding`, or `other`. Activity `status` is usually `done`, `in_progress`, or `waiting`. Other values still show up.

`upcoming` is optional (schooly). `uploads` is optional (toob). Both are rendered only by their blocks.

`examples/agents/` is a fake folder in the shape the sync expects. It is not the live feed. Do not put real bot output in this repo.

## Sync

`scripts/sync.mjs` reads every `*.json` in the agents folder, merges them in memory, and writes `data/feed.enc.json`. It never writes the merged plaintext. The passcode comes from the environment, not from arguments.

```bash
export DASHBOARD_PASSCODE='use a long secret, not demo'
./scripts/sync.sh /home/box/shared/bot-dashboard/agents
```

`DASHBOARD_AGENTS_DIR` is the folder when you omit the argument. `scripts/sync.sh` runs the sync, then `git add`, `commit`, and `push` of `data/feed.enc.json` only when that file changed. If the merge is unchanged it prints nothing and does not commit.

The sync is meant to run every few hours. Unchanged runs stay quiet because the file stores an HMAC of the canonical plaintext, keyed with the second half of a PBKDF2-SHA256 derivation (at least 250,000 iterations, same salt as the ciphertext). The next run recomputes that HMAC. Same plaintext, same passcode, same file: no rewrite, no commit.

```cron
15 */3 * * * cd /path/to/bot-dashboard && DASHBOARD_PASSCODE='…' ./scripts/sync.sh /home/box/shared/bot-dashboard/agents
```

Regenerate the committed sample after editing the fake fixtures:

```bash
DASHBOARD_PASSCODE=demo node scripts/sync.mjs examples/agents
```

Check the Node encrypt against the browser decrypt:

```bash
node scripts/test-roundtrip.mjs
```

Needs Node 18 or newer. No npm packages.

### Envelope

`data/feed.enc.json` is the only data file the site fetches.

| Field | Meaning |
| --- | --- |
| `updated` | When this ciphertext was written. Not inside the plaintext, so a no-op sync does not touch it. |
| `iterations` | PBKDF2-SHA256 count, 250000 or more. |
| `salt`, `iv` | Base64. A new salt and iv are used only when the plaintext changes. |
| `ciphertext` | Base64 of AES-256-GCM ciphertext with the 16-byte tag appended. |
| `mac` | Base64 HMAC-SHA256 of the canonical plaintext. Not the plaintext, and not a faster way to brute-force than the ciphertext. |

The AES key is the first 32 bytes of PBKDF2. The HMAC key is the next 32 bytes. Canonical JSON sorts keys and arrays so whitespace and key order in the bot files do not count as a change.

## Lock screen

The passcode is turned into the key with WebCrypto in the browser. A wrong passcode shakes the card. “Remember the key in this tab” keeps the raw AES key in `sessionStorage` only, and only until the tab closes or you press Lock. The passcode itself is not stored. The theme choice (Auto, Light, Dark) is the only thing kept in `localStorage`. Auto follows `prefers-color-scheme`.

After a real sync, the salt changes and a remembered key stops working. Type the passcode again.

## Layout and theme

Edit `layout.json` to add, remove, reorder, or retitle blocks. Reload to see it. Sizes, the Job hunt bots and funnel, the schoolwork bot, the uploads bot, and the bot order are all options in that file.

`css/tokens.css` holds color, blur, radius, and type. Light tokens are on `:root`. Dark tokens are on `:root[data-resolved="dark"]`.

See [blocks/README.md](blocks/README.md) for how to add a block.

## Run it locally

From the repo root:

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173` and enter `demo`.
