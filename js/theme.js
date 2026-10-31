import { h } from './ui.js';

const STORAGE = 'assistant-desk.theme';

export function themeMode() {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function applyTheme(mode = themeMode()) {
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = mode === 'dark' || (mode === 'auto' && osDark) ? 'dark' : 'light';
  const root = document.documentElement;
  if (mode === 'auto') delete root.dataset.theme;
  else root.dataset.theme = mode;
  root.dataset.resolved = resolved;
  root.style.colorScheme = resolved;
  try {
    localStorage.setItem(STORAGE, mode);
  } catch {
    /* ignore */
  }
  return mode;
}

export function mountThemeSwitch(container) {
  if (!container) return;
  const current = themeMode();
  const modes = [
    ['auto', 'Auto'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  container.replaceChildren(h('div', {
    class: 'theme-switch',
    role: 'group',
    'aria-label': 'Appearance',
  }, modes.map(([mode, label]) => h('button', {
    type: 'button',
    'aria-pressed': current === mode ? 'true' : 'false',
    onClick: () => {
      applyTheme(mode);
      mountThemeSwitch(container);
    },
  }, label))));
}

export function watchTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (themeMode() === 'auto') applyTheme('auto');
  };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
}
