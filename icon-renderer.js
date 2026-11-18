(() => {
  const paths = {
    play: 'M8 5v14l11-7Z', pause: 'M8 5v14M16 5v14',
    next: 'M5 6v12l11-6ZM19 6v12', previous: 'M19 6v12L8 12ZM5 6v12',
    like: 'M12 19.5 5.3 13A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 6.7 5Z',
    dislike: 'M7 7l10 10M17 7 7 17',
    search: 'M15.5 15.5 20 20M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
    vibe: 'M3 12h4l2 5 4-10 2 5h6',
    collection: 'M5 5h3v14H5ZM11 5h3v14h-3Zm5 1 2.5-1 3.5 13-2.5 1Z',
    trends: 'm4 17 6-6 4 3 6-7m-5 0h5v5',
    concerts: 'M4 8h16v3a1 1 0 1 0 0 2v3H4v-3a1 1 0 1 0 0-2Z M14 9v1m0 2v1m0 2v1',
    podcast: 'M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4Zm-4 7a7 7 0 1 1 8 0m-6 3 1-5h2l1 5',
    kids: 'M12 3l2.5 5.8 6.3.6-4.8 4.2 1.5 6.2-5.5-3.3-5.5 3.3 1.5-6.2-4.8-4.2 6.3-.6Z',
    home: 'm3 11 9-7 9 7m-3-1v10h-4v-6h-4v6H6V10',
    settings: 'M5 7h14M5 12h14M5 17h14M9 5v4m6 1v4m-5 1v4',
    lyrics: 'M5 5h14v11H9l-4 4Zm4 4h6m-6 3h4',
    queue: 'M4 6h16M4 11h16M4 16h8m3 0v5l5-2.5Z',
    shuffle: 'M4 6h2l12 12h2m-4 0h4v-4M4 18h2l4-4m4-4 4-4h2m-4 0h4v4',
    repeat: 'M7 8h11v5m-3-6 3 3 3-3M17 16H6v-5m3 6-3-3-3 3',
    volume: 'M4 9h4l5-4v14l-5-4H4Zm12 0a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10',
    volumeOff: 'M4 9h4l5-4v14l-5-4H4Zm12 1 4 4m0-4-4 4',
    fullscreen: 'M4 10V4h6m4 0h6v6m0 4v6h-6m-4 0H4v-6',
    more: 'M5 12h.1m6.9 0h.1m6.9 0h.1', download: 'M12 4v11m-4-4 4 4 4-4M5 17v3h14v-3',
    check: 'm5 12 4 4 10-10',
  };
  const shells = {
    ring: 'M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0Z',
    square: 'M3 3h18v18H3Z', soft: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z',
    diamond: 'm12 1.5 10.5 10.5L12 22.5 1.5 12Z', hex: 'm12 2 9 5v10l-9 5-9-5V7Z',
    brackets: 'M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5',
  };
  const aliases = {
    playVibe: 'play', pauseVibe: 'pause', next: 'next', previous: 'previous',
    likeVariant: 'like', likedVariant: 'liked', thumbUp: 'like', thumbDown: 'dislike', disliked: 'dislike',
    syncLyrics: 'lyrics', playQueue: 'queue', repeat_one: 'repeat', downloaded: 'check',
    navigationSearch: 'search', navigationMyVibe: 'vibe', navigationMyVibeNDA: 'vibe',
    navigationCollection: 'collection', collections: 'collection', navigationForYouAndTrends: 'trends',
    navigationConcerts: 'concerts', navigationNonMusic: 'podcast', podcasts: 'podcast',
    non_music: 'podcast', navigationKids: 'kids', moreOutlined: 'more',
  };
  const scope = ':is([class*="NavbarDesktop_root__"], [class*="VibePage_root__"], [class*="VibeBlock_root__"], [class*="CommonLayout_playerBar__"], [class*="PlayerBarDesktop_root__"], [data-test-id="FULLSCREEN_PLAYER_MODAL"])';
  const namespace = 'http://www.w3.org/2000/svg';
  const create = name => document.createElementNS(namespace, name);
  let active = 'native';

  function addShape(svg, drawing, attributes) {
    const path = create('path');
    path.setAttribute('d', drawing);
    for (const [key, value] of Object.entries(attributes)) path.setAttribute(key, value);
    svg.append(path);
  }
  function paint(svg, icon, pack) {
    const selected = icon === 'liked';
    icon = selected ? 'like' : icon;
    const ink = pack.ink && !selected ? pack.ink : 'currentColor';
    const shell = shells[pack.shell];
    if (shell) addShape(svg, shell, {
      fill: pack.inverse ? ink : 'none', stroke: ink, 'stroke-width': '1.2',
    });
    addShape(svg, paths[icon], {
      stroke: pack.inverse ? '#161914' : ink,
      fill: (pack.filled && icon === 'play') || selected ? (pack.inverse ? '#161914' : ink) : 'none',
      'stroke-width': pack.width,
      'stroke-linecap': pack.sharp ? 'square' : 'round',
      'stroke-linejoin': pack.sharp ? 'miter' : 'round',
      transform: shell ? 'translate(4.8 4.8) scale(.6)' : 'translate(0 0)',
    });
  }
  function refresh(svg) {
    const original = [...svg.children].find(child => child.localName === 'use');
    const href = original?.getAttribute('href') || original?.getAttribute('xlink:href') || '';
    const symbol = href.match(/\/icons\/sprite\.svg#([^?#]+)$/i)?.[1]
      ?.replace(/_(?:xxxs|xxs|xs|s|m|l|xl|xxl|xxxl)$/, '').replace(/_(?:selected|filled)$/, '');
    const icon = aliases[symbol] || symbol;
    const previous = svg.querySelector(':scope > .sonora-icon-glyph');
    if (active === 'native' || (!paths[icon] && icon !== 'liked')) {
      previous?.remove();
      original?.removeAttribute('data-sonora-hidden-icon');
      return;
    }
    original.setAttribute('data-sonora-hidden-icon', '');
    if (previous?.dataset.signature === active + ':' + icon) return;
    previous?.remove();
    const glyph = create('svg');
    glyph.classList.add('sonora-icon-glyph');
    glyph.dataset.signature = active + ':' + icon;
    glyph.setAttribute('viewBox', '0 0 24 24');
    glyph.setAttribute('width', '100%');
    glyph.setAttribute('height', '100%');
    glyph.setAttribute('aria-hidden', 'true');
    paint(glyph, icon, sonoraPacks[active]);
    svg.append(glyph);
  }
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      document.querySelectorAll(scope + ' svg:has(> use)').forEach(refresh);
    });
  }
  new MutationObserver(records => {
    if (active !== 'native' && records.some(record => !record.target.closest?.('.sonora-icon-glyph') &&
      (record.type === 'attributes' || [...record.addedNodes].some(node => node.nodeType === 1 && !node.classList.contains('sonora-icon-glyph'))))) schedule();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'xlink:href'] });
  document.addEventListener('sonora-icon-pack', () => {
    active = Object.hasOwn(sonoraPacks, document.documentElement.dataset.sonoraIcons) ? document.documentElement.dataset.sonoraIcons : 'native';
    schedule();
  });
  window.sonoraIconPreview = (pack, icon) => {
    const svg = create('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    paint(svg, icon, sonoraPacks[pack] || sonoraPacks.clean);
    return svg;
  };
})();
