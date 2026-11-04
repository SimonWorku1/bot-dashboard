export function pageIdFromHash(hash, layout) {
  let raw = '';
  try {
    raw = decodeURIComponent(String(hash || '').replace(/^#/, ''));
  } catch {
    raw = String(hash || '').replace(/^#/, '');
  }
  raw = raw.replace(/^\/+/, '').split(/[/?#]/)[0].toLowerCase();
  if (!raw || raw === 'desk') return 'desk';
  if (!/^[a-z0-9-]+$/.test(raw)) return 'desk';
  const page = layout?.pages?.[raw];
  if (page && Array.isArray(page.blocks)) return raw;
  return 'desk';
}

export function resolvePage(layout, id) {
  if (id && id !== 'desk') {
    const page = layout?.pages?.[id];
    if (page && Array.isArray(page.blocks)) {
      return {
        id,
        title: page.title || id,
        subtitle: typeof page.subtitle === 'string' ? page.subtitle : '',
        blocks: page.blocks,
      };
    }
  }
  return {
    id: 'desk',
    title: layout?.title || 'Assistant desk',
    subtitle: typeof layout?.subtitle === 'string' ? layout.subtitle : '',
    blocks: Array.isArray(layout?.blocks) ? layout.blocks : [],
  };
}

export function navItems(layout) {
  const source = Array.isArray(layout?.nav) ? layout.nav : [];
  const items = [];
  for (const item of source) {
    const id = typeof item?.id === 'string' ? item.id.trim().toLowerCase() : '';
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    if (!/^[a-z0-9-]+$/.test(id) || !label) continue;
    if (id !== 'desk' && !Array.isArray(layout?.pages?.[id]?.blocks)) continue;
    items.push({ id, label });
  }
  if (items.some((item) => item.id === 'desk') && items.length > 1) return items;
  if (items.length === 1 && items[0].id !== 'desk') return [{ id: 'desk', label: 'Desk' }, ...items];
  const pages = layout?.pages && typeof layout.pages === 'object' ? layout.pages : {};
  const fallback = [{ id: 'desk', label: 'Desk' }];
  for (const [id, page] of Object.entries(pages)) {
    if (!/^[a-z0-9-]+$/.test(id) || !Array.isArray(page?.blocks)) continue;
    const label = typeof page.title === 'string' && page.title.trim() ? page.title.trim() : id;
    fallback.push({ id, label });
  }
  return fallback;
}
