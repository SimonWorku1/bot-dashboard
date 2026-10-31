# Making a block

Each block is one file in this folder. The page does not import them by name. `layout.json` lists the files to show, in order.

## Add a block

1. Create `blocks/my-block.js`.
2. Export `render(container, ctx)`.
3. Add an entry to `layout.json`.
4. Reload the page.

```json
{ "type": "my-block", "title": "My block", "size": "half", "options": { "bot": "Dash", "limit": 4 } }
```

`type` must match the file name without `.js`, and may only use lowercase letters, numbers, and hyphens. `size` is `full` (12 columns), `wide` (8), `half` (6), or `third` (4). On a phone every block is full width.

`options` is yours. Blocks in this folder already use `bot`, `category`, `limit`, and `order`.

## What `render` receives

- `container` — an empty `<section>` that already has the glass panel styles.
- `ctx.feed` — the decrypted feed: `{ bots: [...] }`.
- `ctx.block` — the `layout.json` entry (`title`, `size`, `options`).
- `ctx.store` — `getState()`, `setFilters({ query, bot, category, status })`, and `subscribe(fn)`.

Return a function if you subscribe to the store or the clock. The page calls it when the desk locks.

```js
import { h, blockHead, emptyNote } from '../js/ui.js';

export function render(container, ctx) {
  const options = ctx.block.options || {};
  const draw = () => {
    const filters = ctx.store.getState();
    container.replaceChildren(
      blockHead(ctx.block.title || 'My block'),
      emptyNote(options.bot || 'All bots'),
    );
    // filters.query, filters.bot, filters.category, filters.status
  };
  draw();
  return ctx.store.subscribe(draw);
}
```

Put feed text in the page with `h()` or `textContent`. Do not assign feed strings to `innerHTML`.

Open links with `textLink()` from `js/ui.js`. It keeps only `http:` and `https:` URLs.

Stats are an open set of keys. `metrics(bot.stats)` humanizes `people_replied` to “People replied” and shows `reply_rate` values from 0 to 1 as percents.

A bot may also have `upcoming` (`due`, `course`, `title`, `type`, `status`) and `uploads` (`title`, `status`, `date`, `views`, `link`). Unknown activity categories are kept.

Colors, blur, and corner radius live in `css/tokens.css`, not in the block.
