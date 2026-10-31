const SIZES = new Set(['full', 'wide', 'half', 'third']);

export async function mountLayout(grid, layout, ctx) {
  const unsubs = [];
  const blocks = Array.isArray(layout?.blocks) ? layout.blocks : [];
  let index = 0;
  for (const block of blocks) {
    index += 1;
    const type = typeof block?.type === 'string' ? block.type : '';
    const section = document.createElement('section');
    const size = SIZES.has(block?.size) ? block.size : 'full';
    section.className = `block glass span-${size}`;
    section.id = `block-${/^[a-z0-9-]+$/.test(type) ? type : 'unknown'}-${index}`;
    section.dataset.type = type || 'unknown';
    if (typeof block?.title === 'string' && block.title) section.setAttribute('aria-label', block.title);
    section.style.animationDelay = `${Math.min(index * 40, 420)}ms`;
    grid.append(section);
    if (!/^[a-z0-9-]+$/.test(type)) {
      section.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Unknown block.' }));
      continue;
    }
    try {
      const mod = await import(`../blocks/${type}.js`);
      if (typeof mod.render !== 'function') throw new Error('missing render');
      const unsub = await mod.render(section, { ...ctx, block });
      if (typeof unsub === 'function') unsubs.push(unsub);
    } catch (error) {
      console.error(error);
      const message = document.createElement('p');
      message.className = 'empty';
      message.textContent = `Could not load the “${type}” block.`;
      section.replaceChildren(message);
    }
  }
  return () => {
    unsubs.forEach((fn) => fn());
  };
}
