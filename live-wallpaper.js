(() => {
  'use strict';
  const settingsSelector = '[class*="SettingsPage_content"]';
  const fullscreenSelector = '[data-test-id="FULLSCREEN_PLAYER_MODAL"]';
  const namespace = 'ym-live-wallpaper-v1';
  const maxBytes = 250 * 1024 * 1024;
  const defaults = { enabled: true, dim: 52, blur: 0, fit: 'cover', scope: 'all', x: 50, y: 50, zoom: 100 };
  if (document.getElementById('ym-wallpaper-style')?.dataset.running) return;
  const style = document.getElementById('ym-wallpaper-style');
  if (style) style.dataset.running = 'true';

  let preferences;
  try {
    const saved = JSON.parse(localStorage.getItem(namespace) || '{}');
    preferences = { ...defaults, ...saved };
  } catch {
    preferences = { ...defaults };
  }
  let source;
  let mediaUrl;
  let layer;
  let preview;
  let panel;
  let busy = false;
  let status = '';
  let error = false;
  let frame;
  let unavailable = false;

  const node = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.textContent = content;
    return element;
  };

  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open(namespace, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('wallpaper');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Хранилище занято. Перезапустите Музыку.'));
  });

  async function storage(operation, value) {
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('wallpaper', operation === 'get' ? 'readonly' : 'readwrite');
      const entries = transaction.objectStore('wallpaper');
      const request = operation === 'put' ? entries.put(value, 'active') : entries[operation]('active');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error || new Error('Не удалось сохранить обои.'));
    });
  }

  function updateStatus(message, isError = false) {
    status = message;
    error = isError;
    if (!panel) return;
    const line = panel.querySelector('[role="status"]');
    line.textContent = status;
    line.dataset.error = String(error);
  }

  function release(element) {
    if (!element) return;
    if (element.tagName === 'VIDEO') element.pause();
    element.removeAttribute('src');
    if (element.tagName === 'VIDEO') element.load();
    element.remove();
  }

  function makeMedia(kind) {
    const element = node(kind === 'video' ? 'video' : 'img', 'ymwp-media');
    element.setAttribute('aria-hidden', 'true');
    element.draggable = false;
    if (kind === 'video') {
      element.muted = element.defaultMuted = true;
      element.loop = element.playsInline = true;
      element.preload = 'auto';
    } else {
      element.alt = '';
      element.referrerPolicy = 'no-referrer';
    }
    return element;
  }

  function guessKind(path, type = '') {
    if (type.startsWith('video/') || /\.(mp4|webm|m4v|mov|ogv)$/i.test(path)) return 'video';
    if (type.startsWith('image/') || /\.(gif|png|jpe?g|webp|avif|bmp)$/i.test(path)) return 'image';
  }

  function validate(url, kind, signal) {
    return new Promise((resolve, reject) => {
      const media = makeMedia(kind);
      const timer = setTimeout(() => finish(false), 11000);
      const ready = () => finish(Boolean(kind === 'video' ? media.videoWidth : media.naturalWidth));
      const fail = () => finish(false);
      function finish(ok) {
        clearTimeout(timer);
        signal.removeEventListener('abort', fail);
        media.removeEventListener('error', fail);
        release(media);
        if (ok) resolve(kind);
        else reject(new Error('Не удалось открыть медиа. Проверьте прямую ссылку или попробуйте MP4 (H.264), WebM либо GIF.'));
      }
      signal.addEventListener('abort', fail, { once: true });
      media.addEventListener('error', fail, { once: true });
      media.addEventListener(kind === 'video' ? 'loadeddata' : 'load', ready, { once: true });
      media.src = url;
    });
  }

  async function mediaKind(url, hint) {
    const lifetime = new AbortController();
    try {
      if (hint) return await validate(url, hint, lifetime.signal);
      return await Promise.any(['image', 'video'].map(kind => validate(url, kind, lifetime.signal)))
        .catch(({ errors }) => { throw errors[0]; });
    } finally {
      lifetime.abort();
    }
  }

  function savePreferences() {
    try { localStorage.setItem(namespace, JSON.stringify(preferences)); }
    catch { updateStatus('Не удалось сохранить настройки.', true); }
  }

  function refreshControls() {
    if (!panel) return;
    panel.querySelector('[data-enable]').checked = preferences.enabled;
    panel.querySelector('[data-clear]').disabled = busy || !source;
    panel.querySelectorAll('[data-source]').forEach(button => { button.disabled = busy; });
    panel.querySelector('[data-media-name]').textContent = source?.name || 'Обои не выбраны';
    const urlInput = panel.querySelector('[data-url]');
    if (document.activeElement !== urlInput) urlInput.value = source?.originalUrl || source?.url || '';
    updateStatus(status, error);
  }

  function deleteLayers() {
    release(preview);
    preview = undefined;
    release(layer?.firstElementChild);
    layer?.remove();
    layer = undefined;
  }

  function replaceSource(record) {
    deleteLayers();
    unavailable = false;
    if (source?.blob && mediaUrl) URL.revokeObjectURL(mediaUrl);
    const oldYouTubeId = record?.kind === 'image' && record.originalUrl ? youtubeId(new URL(record.originalUrl)) : null;
    source = oldYouTubeId ? youtubeSource(oldYouTubeId, record.originalUrl) : record;
    mediaUrl = source?.blob ? URL.createObjectURL(source.blob) : source?.url;
    refreshControls();
    sync();
  }

  async function changeSource(create) {
    if (busy) return;
    busy = true;
    refreshControls();
    updateStatus('Проверяем медиа…');
    try {
      const record = await create();
      if (record) {
        await storage('put', record);
        preferences.enabled = true;
        savePreferences();
      } else {
        await storage('delete');
      }
      replaceSource(record);
      updateStatus(record?.kind === 'youtube' ? 'YouTube-фон выбран' :
        record ? 'Обои применены' : 'Стандартный фон восстановлен');
    } catch (failure) {
      updateStatus(failure.name === 'QuotaExceededError' ? 'Недостаточно места для этого файла.' : failure.message, true);
    } finally {
      busy = false;
      if (panel) {
        panel.querySelector('[data-clear]').disabled = !source;
        panel.querySelectorAll('[data-source]').forEach(button => { button.disabled = false; });
      }
    }
  }

  function useFile(file) {
    if (!file) return;
    return changeSource(async () => {
      if (file.size === 0 || file.size > maxBytes) throw new Error('Выберите файл размером от 1 байта до 250 МБ.');
      const url = URL.createObjectURL(file);
      try {
        const kind = await mediaKind(url, guessKind(file.name, file.type));
        return { kind, name: file.name, blob: file };
      } finally { URL.revokeObjectURL(url); }
    });
  }

  function youtubeId(url) {
    const host = url.hostname;
    const id = host === 'youtu.be' ? url.pathname.split('/')[1] :
      ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
        ? url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  function youtubeSource(id, originalUrl) {
    const url = new URL('https://www.youtube-nocookie.com/embed/' + id);
    url.search = new URLSearchParams({
      autoplay: '1', mute: '1', controls: '0', loop: '1', playlist: id, playsinline: '1',
      widget_referrer: 'https://com.sonora.wallpaper/',
    });
    return { kind: 'youtube', name: 'Видео YouTube', url: url.href, id, originalUrl };
  }

  function useLink(text) {
    return changeSource(async () => {
      let url;
      try { url = new URL(text.trim()); } catch {}
      if (!url || url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Вставьте прямой HTTPS-адрес медиафайла.');
      }
      const id = youtubeId(url);
      if (id) return youtubeSource(id, url.href);
      const kind = await mediaKind(url.href, guessKind(url.pathname));
      return { kind, name: url.hostname, url: url.href };
    });
  }

  function appendMedia(target) {
    if (source.kind === 'youtube') {
      if (target !== layer) {
        const image = makeMedia('image');
        image.src = 'https://i.ytimg.com/vi/' + source.id + '/hqdefault.jpg';
        target.prepend(image);
        return image;
      }
      const iframe = node('iframe', 'ymwp-media ymwp-youtube');
      iframe.title = 'Видеообои YouTube';
      iframe.allow = 'autoplay';
      iframe.tabIndex = -1;
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.src = mediaUrl;
      target.prepend(iframe);
      return iframe;
    }
    const media = makeMedia(source.kind);
    media.addEventListener('error', () => {
      updateStatus('Фон недоступен. Выберите другой файл или проверьте ссылку.', true);
      if (target === layer) {
        unavailable = true;
        release(media);
        layer.remove();
        layer = undefined;
        document.documentElement.removeAttribute('data-ymwp-active');
      }
    }, { once: true });
    target.prepend(media);
    media.src = mediaUrl;
    if (source.kind === 'video') void media.play().catch(() => {});
    return media;
  }

  function mountPanel(target) {
    panel = node('section', 'ymwp-panel');
    panel.setAttribute('aria-labelledby', 'ymwp-title');
    panel.innerHTML = `
      <div class="ymwp-heading">
        <h2 id="ymwp-title">Живые обои</h2>
        <label class="ymwp-toggle">Включить <input type="checkbox" role="switch" data-enable></label>
      </div>
      <div class="ymwp-preview">
        <div class="ymwp-empty" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m3 16 5-4 4 3 4-5 5 4"/></svg>
        </div>
        <span class="ymwp-preview-label" data-media-name></span>
      </div>
      <div class="ymwp-sources">
        <input type="file" data-file hidden accept="image/*,video/*,.gif,.mp4,.webm">
        <button type="button" class="ymwp-primary" data-source data-pick>Выбрать файл</button>
        <form class="ymwp-link">
          <input type="url" data-url aria-label="HTTPS-ссылка или YouTube" placeholder="HTTPS-ссылка или YouTube" spellcheck="false" required>
          <button type="submit" data-source>Применить</button>
        </form>
      </div>
      <div class="ymwp-controls">
        <label>Затемнение <output data-dim-value></output><input data-dim type="range" min="0" max="90"></label>
        <label>Размытие <output data-blur-value></output><input data-blur type="range" min="0" max="20"></label>
        <label>Где показывать<select data-scope><option value="all">Везде</option><option value="app">В приложении</option><option value="fullscreen">В полноэкранном плеере</option></select></label>
        <label>Размер<select data-fit><option value="cover">Заполнить</option><option value="contain">Вместить целиком</option></select></label>
        <label>Масштаб<input data-zoom type="range" min="100" max="200"></label>
        <button type="button" data-center>По центру</button>
      </div>
      <div class="ymwp-footer"><span role="status" aria-live="polite"></span><button type="button" data-clear>Сбросить</button></div>
    `;
    const get = (attribute) => panel.querySelector(`[data-${attribute}]`);
    const file = get('file');
    const previewBox = panel.querySelector('.ymwp-preview');
    previewBox.title = 'Перетащите обои, чтобы изменить кадрирование';
    let drag;
    previewBox.onpointerdown = (event) => {
      if (!source || event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, startX: preferences.x, startY: preferences.y };
      previewBox.setPointerCapture(event.pointerId);
    };
    previewBox.onpointermove = (event) => {
      if (!drag) return;
      const clamp = (n) => Math.min(100, Math.max(0, n));
      preferences.x = clamp(drag.startX + (event.clientX - drag.x) / previewBox.clientWidth * 125);
      preferences.y = clamp(drag.startY + (event.clientY - drag.y) / previewBox.clientHeight * 125);
      preferences.zoom = Math.max(preferences.zoom, 115);
      sync();
    };
    previewBox.onlostpointercapture = () => { if (drag) savePreferences(); drag = undefined; };
    get('center').onclick = () => {
      preferences.x = preferences.y = 50;
      preferences.zoom = 100;
      savePreferences();
      sync();
    };
    get('pick').onclick = () => file.click();
    file.onchange = () => {
      void useFile(file.files[0]);
      file.value = '';
    };
    previewBox.ondragover = (event) => {
      if (event.dataTransfer.types.includes('Files')) {
        event.preventDefault();
        previewBox.dataset.drag = 'true';
      }
    };
    previewBox.ondragleave = () => { delete previewBox.dataset.drag; };
    previewBox.ondrop = (event) => {
      event.preventDefault();
      delete previewBox.dataset.drag;
      void useFile(event.dataTransfer.files[0]);
    };
    panel.querySelector('form').onsubmit = (event) => {
      event.preventDefault();
      void useLink(get('url').value);
    };
    get('enable').onchange = (event) => {
      preferences.enabled = event.target.checked;
      savePreferences();
      sync();
    };
    get('clear').onclick = () => { void changeSource(async () => null); };
    for (const key of ['dim', 'blur', 'scope', 'fit', 'zoom']) {
      const control = get(key);
      control.value = preferences[key];
      control.oninput = () => {
        preferences[key] = control.type === 'range' ? control.valueAsNumber : control.value;
        savePreferences();
        sync();
      };
    }
    target.prepend(panel);
    refreshControls();
  }

  function sync() {
    const target = document.querySelector('.ymstudio[open] #ymstudio-wallpaper') || document.querySelector(settingsSelector);
    if (panel && !panel.isConnected) {
      release(preview);
      preview = undefined;
      panel = undefined;
    }
    if (target && !panel) mountPanel(target);
    if (target && panel?.parentElement !== target) target.prepend(panel);
    const fullscreen = document.querySelector(fullscreenSelector);
    const active = !unavailable && source && preferences.enabled && !document.hidden &&
      (fullscreen ? preferences.scope !== 'app' : preferences.scope !== 'fullscreen');
    if (layer && !active) {
      release(layer.firstElementChild);
      layer.remove();
      layer = undefined;
    }
    if (active && !layer) {
      layer = node('div', 'ymwp-wallpaper');
      layer.setAttribute('aria-hidden', 'true');
      document.body.prepend(layer);
      appendMedia(layer);
    }
    const root = document.documentElement;
    root.dataset.ymwpScope = preferences.scope;
    root.toggleAttribute('data-ymwp-active', Boolean(active));
    if (panel) {
      panel.querySelector('[data-dim-value]').textContent = `${preferences.dim}%`;
      panel.querySelector('[data-blur-value]').textContent = `${preferences.blur} px`;
      const box = panel.querySelector('.ymwp-preview');
      panel.querySelector('[data-zoom]').value = preferences.zoom;
      const visible = !document.hidden && !panel.closest('dialog:not([open]), section[hidden]');
      if (source && visible && !preview) preview = appendMedia(box);
      if (preview && !visible) {
        release(preview);
        preview = undefined;
      }
      box.toggleAttribute('data-has-media', Boolean(preview));
    }
    for (const element of [layer, preview?.parentElement]) {
      element?.style.setProperty('--ymwp-dim', String(preferences.dim / 100));
      element?.style.setProperty('--ymwp-blur', `${preferences.blur}px`);
      element?.style.setProperty('--ymwp-fit', preferences.fit);
      element?.style.setProperty('--ymwp-scale', preferences.zoom / 100);
      element?.style.setProperty('--ymwp-x', `${preferences.x}%`);
      element?.style.setProperty('--ymwp-y', `${preferences.y}%`);
    }
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      sync();
    });
  }

  new MutationObserver((records) => {
    if (records.some(({ target }) => !(panel?.contains(target) || layer?.contains(target)))) schedule();
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('ymstudio-dialog-changed', sync);
  sync();
  storage('get').then(record => { if (!busy) replaceSource(record); })
    .catch(() => updateStatus('Не удалось открыть сохранённые обои.', true));
})();
