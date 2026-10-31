import { onMinute } from './clock.js';
import { clearSession, decryptFeed, decryptWithKey, readSession, saveSession } from './crypto.js';
import { relativeTime } from './format.js';
import { mountLayout } from './layout.js';
import { mountThemeSwitch, watchTheme } from './theme.js';
import { ago, h, lockIcon } from './ui.js';

const app = document.querySelector('#app');
const themeDock = document.querySelector('#theme-dock');

watchTheme();
mountThemeSwitch(themeDock);

let unmount = null;
let envelope = null;

boot();

async function boot() {
  try {
    envelope = await loadJson('./data/feed.enc.json');
  } catch {
    renderMessage('The encrypted feed is missing.');
    return;
  }
  const sessionKey = await readSession(envelope);
  if (sessionKey) {
    try {
      const data = await decryptWithKey(sessionKey, envelope);
      await openDesk(data);
      return;
    } catch {
      clearSession();
    }
  }
  showLock();
}

function showLock(message = '') {
  unmount?.();
  unmount = null;
  mountThemeSwitch(themeDock);
  const input = h('input', {
    class: 'field',
    type: 'password',
    name: 'passcode',
    autocomplete: 'current-password',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': 'Passcode',
    required: true,
  });
  const remember = h('input', { type: 'checkbox', id: 'remember-key' });
  const error = h('p', { class: 'form-error', role: 'alert', 'aria-live': 'polite' }, message);
  const button = h('button', { class: 'primary', type: 'submit' }, 'Unlock');
  const form = h('form', { class: 'lock-form' }, [
    h('label', { class: 'field-label' }, ['Passcode', input]),
    error,
    button,
    h('label', { class: 'check' }, [remember, 'Remember the key in this tab']),
  ]);
  const card = h('section', { class: 'glass lock-card' }, [
    h('p', { class: 'eyebrow' }, 'Private'),
    h('h1', {}, 'Assistant desk'),
    h('p', { class: 'lede' }, 'The notes are sealed. Enter the passcode to open them on this device.'),
    form,
    envelope?.updated ? h('p', { class: 'sealed' }, ['Last sealed ', ago(envelope.updated), '.']) : null,
  ]);
  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!input.value) {
      fail('Enter a passcode.');
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Unlocking…';
    error.textContent = '';
    try {
      const result = await decryptFeed(envelope, input.value);
      const keep = remember.checked;
      input.value = '';
      if (keep) await saveSession(result.key, envelope);
      await openDesk(result.data);
    } catch {
      busy = false;
      button.disabled = false;
      button.textContent = 'Unlock';
      fail('That passcode did not open the desk.');
    }
  });

  function fail(text) {
    error.textContent = text;
    card.classList.remove('is-shaking');
    void card.offsetWidth;
    card.classList.add('is-shaking');
    input.focus();
    input.select();
  }

  app.replaceChildren(h('main', { class: 'lock' }, card));
  const tick = onMinute(() => {
    const sealed = card.querySelector('.sealed');
    if (!sealed || !envelope?.updated) return;
    const time = sealed.querySelector('time');
    if (!time) return;
    time.textContent = relativeTime(envelope.updated);
  });
  unmount = tick;
  requestAnimationFrame(() => input.focus());
}

async function openDesk(feed) {
  unmount?.();
  unmount = null;
  themeDock.replaceChildren();
  let layout;
  try {
    layout = await loadJson('./layout.json');
  } catch {
    renderMessage('The feed unlocked, but layout.json could not be read.');
    return;
  }
  document.title = layout.title || 'Assistant desk';
  const store = createStore();
  const shell = h('div', { class: 'shell' });
  const age = h('span', { class: 'feed-age' }, envelope?.updated ? `Sealed ${relativeTime(envelope.updated)}` : '');
  const themeSlot = h('div', {});
  const topbar = h('header', { class: 'topbar glass' }, [
    h('div', {}, [
      layout.owner ? h('p', { class: 'eyebrow' }, layout.owner) : null,
      h('h1', {}, layout.title || 'Assistant desk'),
      layout.subtitle ? h('p', { class: 'subtitle' }, layout.subtitle) : null,
    ]),
    h('div', { class: 'topbar-actions' }, [
      age,
      themeSlot,
      h('button', {
        type: 'button',
        class: 'lock-button',
        onClick: () => {
          clearSession();
          showLock();
        },
      }, [lockIcon(), 'Lock']),
    ]),
  ]);
  const grid = h('div', { class: 'dashboard-grid' });
  shell.append(
    topbar,
    grid,
    h('p', { class: 'footnote' }, 'Decrypted in this browser. The passcode is not stored. Lock forgets the key unless this tab was asked to remember it.'),
  );
  app.replaceChildren(shell);
  mountThemeSwitch(themeSlot);
  const stopBlocks = await mountLayout(grid, layout, { feed, store, layout });
  const tick = onMinute(() => {
    if (envelope?.updated) age.textContent = `Sealed ${relativeTime(envelope.updated)}`;
  });
  unmount = () => {
    stopBlocks();
    tick();
  };
}

function renderMessage(text) {
  mountThemeSwitch(themeDock);
  app.replaceChildren(h('main', { class: 'lock' }, h('section', { class: 'glass lock-card' }, [
    h('p', { class: 'eyebrow' }, 'Assistant desk'),
    h('h1', {}, 'Unavailable'),
    h('p', { class: 'lede' }, text),
  ])));
}

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`missing ${url}`);
  return response.json();
}

function createStore() {
  let state = { query: '', bot: '', category: '', status: '' };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));
  return {
    getState: () => state,
    setFilters(partial) {
      const next = { ...state, ...partial };
      if (
        next.query === state.query
        && next.bot === state.bot
        && next.category === state.category
        && next.status === state.status
      ) return;
      state = next;
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
