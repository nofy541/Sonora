(() => {
  const key = 'ym-wallpaper-studio-v1';
  const sidebarTabs = {
    SEARCH: 'Поиск',
    HOME: 'Моя волна',
    FOR_YOU_AND_TRENDS: 'Для вас и Тренды',
    CONCERTS: 'Концерты',
    NON_MUSIC: 'Книги и подкасты',
    COLLECTION: 'Коллекция',
  };
  const prefs = { wave: 'accent', waveShape: 'original', color: '#ffe733', waveVividness: 100, accent: '#ffe733', density: 'native', pins: true, side: 'left', player: 'bottom' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(key) || '{}')); } catch {}
  if (['ribbon', 'ncs', 'bars'].includes(prefs.wave)) prefs.wave = 'accent';
  if (!['native', 'continuous'].includes(prefs.lyrics)) prefs.lyrics = 'reveal';
  prefs.lyricsMotion ??= true;
  prefs.discordEnabled = prefs.discordEnabled === true;
  if (typeof prefs.discordClientId !== 'string' || !/^\d{17,20}$/.test(prefs.discordClientId)) prefs.discordClientId = '';
  const materials = ['native', 'glass', 'matte', 'solid'];
  for (const key of ['sidebarMaterial', 'playerMaterial', 'cardMaterial']) {
    if (!materials.includes(prefs[key])) prefs[key] = 'native';
  }
  let layoutSnapshot;
  if (!Object.hasOwn(sonoraPacks, prefs.iconPack)) prefs.iconPack = 'native';
  let appliedIconPack;
  const validColor = (color) => /^#[0-9a-f]{6}$/i.test(color);
  const save = () => {
    if (layoutSnapshot) return;
    try { localStorage.setItem(key, JSON.stringify(prefs)); } catch {}
  };
  const button = document.createElement('button');
  button.className = 'ymstudio-launch';
  button.type = 'button';
  button.textContent = 'Sonora';
  button.setAttribute('aria-haspopup', 'dialog');
  const filters = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  filters.classList.add('ymstudio-filters');
  filters.setAttribute('aria-hidden', 'true');
  filters.innerHTML = '<defs><filter id="sonora-logo-color" color-interpolation-filters="sRGB"><feFlood result="accent"/><feComposite in="accent" in2="SourceAlpha" operator="in"/></filter></defs>';
  const dialog = document.createElement('dialog');
  dialog.className = 'ymstudio';
  dialog.setAttribute('aria-labelledby', 'ymstudio-title');
  dialog.innerHTML = `
    <header><h2 id="ymstudio-title">Sonora</h2><form method="dialog"><button aria-label="Закрыть">×</button></form></header>
    <nav aria-label="Разделы мода">
      <button type="button" data-view="wallpaper">Обои</button>
      <button type="button" data-view="wave">Моя волна</button>
      <button type="button" data-view="color">Акцент</button>
      <button type="button" data-view="icons">Иконки</button>
      <button type="button" data-view="lyrics">Тексты</button>
      <button type="button" data-view="layout">Раскладка</button>
      <button type="button" data-view="discord">Discord</button>
    </nav>
    <section data-page="wallpaper" class="ymstudio-wallpaper"></section>
    <section data-page="discord" class="ymstudio-discord" hidden>
      <label>Показывать трек в Discord <input name="discordEnabled" type="checkbox"></label>
      <label>Application ID <input type="text" inputmode="numeric" maxlength="20" data-discord-id autocomplete="off" spellcheck="false"></label>
      <p data-discord-status role="status"></p>
      <p>Укажи Application ID из Discord Developer Portal и включи показ активности в настольном Discord.</p>
    </section>
    <section data-page="icons" hidden>
      <h3>Набор иконок</h3>
      <div class="ymstudio-icon-packs" aria-label="Встроенные наборы"></div>
    </section>
    <section data-page="lyrics" hidden>
      <label>Оформление<select name="lyrics"><option value="reveal">Проявление букв</option><option value="continuous">Непрерывное проявление</option><option value="native">Оригинальное</option></select></label>
      <label>Плавное проявление <input name="lyricsMotion" type="checkbox"></label>
    </section>
    <section data-page="wave" hidden>
      <label>Вид волны<select name="waveShape"><option value="original">Классическая</option><option value="ncs">Кольцо NCS</option><option value="compact">Компактная</option><option value="wide">Горизонтальная</option><option value="soft">Мягкая дымка</option></select></label>
      <label>Палитра «Моей волны»<select name="wave"><option value="accent">Цвет интерфейса</option><option value="custom">Свой цвет</option><option value="native">Оригинальная</option></select></label>
      <label>Цвет волны <input name="color" type="color"></label>
      <label>Насыщенность <input name="waveVividness" type="range" min="20" max="160"></label>
    </section>
    <section data-page="layout" hidden>
      <button type="button" class="ymstudio-edit-button" data-open-layout>Открыть редактор раскладки</button>
      <div class="ymstudio-layout-fields" hidden>
      <label>Плотность меню<select name="density"><option value="native">Стандартная</option><option value="compact">Компактная</option><option value="focus">Фокус на контенте</option></select></label>
      <label>Закреплённые плейлисты <input name="pins" type="checkbox"></label>
      <fieldset class="ymstudio-materials ymstudio-sidebar-tabs">
        <legend>Вкладки сайдбара</legend>
        ${Object.entries(sidebarTabs).map(([id, label]) =>
          `<label>${label}<input name="showNav_${id}" type="checkbox"></label>`).join('')}
      </fieldset>
      <div class="ymstudio-layout" aria-label="Схема раскладки">
        <div data-slot="top"><button type="button" draggable="true" data-block="player">Плеер</button></div>
        <div data-slot="left"><button type="button" draggable="true" data-block="sidebar">Сайдбар</button></div>
        <div class="ymstudio-main">Контент</div>
        <div data-slot="right"></div><div data-slot="bottom"></div>
      </div>
      <p>Перетащите блок или нажмите на него, чтобы переместить.</p>
      <fieldset class="ymstudio-materials">
        <legend>Материалы</legend>
        <label>Сайдбар <select name="sidebarMaterial"></select></label>
        <label>Плеер <select name="playerMaterial"></select></label>
        <label>Карточки <select name="cardMaterial"></select></label>
      </fieldset>
      </div>
    </section>
    <section data-page="color" hidden>
      <label>Акцент интерфейса <input name="accent" type="color"></label>
      <label>HEX <input type="text" data-hex maxlength="7" spellcheck="false" aria-label="HEX-код акцента"></label>
      <div class="ymstudio-swatches">
        <button type="button" data-accent="#ffe733" aria-label="Цвет Яндекса"></button>
        <button type="button" data-accent="#ff566d" aria-label="Коралловый"></button>
        <button type="button" data-accent="#bf92ff" aria-label="Сиреневый"></button>
        <button type="button" data-accent="#49c9ff" aria-label="Голубой"></button>
        <button type="button" data-accent="#48d597" aria-label="Мятный"></button>
        <button type="button" data-accent="#eeeeee" aria-label="Светло-серый"></button>
      </div>
    </section>`;
  document.body.append(filters, button, dialog);
  const editor = document.createElement('dialog');
  editor.className = 'ymstudio ymstudio-editor';
  editor.setAttribute('aria-labelledby', 'ymstudio-editor-title');
  editor.innerHTML = `<header><h2 id="ymstudio-editor-title">Редактор раскладки</h2></header>
    <footer><button type="button" data-cancel-layout>Отмена</button><button type="button" data-save-layout>Готово</button></footer>`;
  document.body.append(editor);
  const fields = dialog.querySelector('.ymstudio-layout-fields');
  const sidebarControls = [...fields.querySelectorAll('.ymstudio-sidebar-tabs input')];
  for (const control of sidebarControls) prefs[control.name] = prefs[control.name] !== false;
  const layoutTab = fields.parentElement;
  const discordId = dialog.querySelector('[data-discord-id]');
  const discordStatus = dialog.querySelector('[data-discord-status]');
  discordId.value = prefs.discordClientId;
  discordId.addEventListener('input', () => {
    discordId.value = discordId.value.replace(/\D/g, '');
    prefs.discordClientId = discordId.value;
    save();
    syncDiscord();
  });
  let discordTrack = null;
  let sentDiscordPayload;
  function syncDiscord() {
    const validId = /^\d{17,20}$/.test(prefs.discordClientId);
    const clientId = prefs.discordEnabled && validId ? prefs.discordClientId : '';
    const status = !prefs.discordEnabled ? 'Показ активности выключен.' : !validId
      ? 'Введи Application ID из 17–20 цифр.' : 'Показ активности включён.';
    if (discordStatus.textContent !== status) discordStatus.textContent = status;
    const payload = clientId ? JSON.stringify({ clientId, track: discordTrack }) : '';
    if (sentDiscordPayload === payload) return;
    sentDiscordPayload = payload;
    document.dispatchEvent(new CustomEvent('sonora-discord-config', { detail: payload }));
  }
  document.addEventListener('sonora-discord-track', event => {
    if (typeof event.detail !== 'string' || event.detail.length > 4096) return;
    try { discordTrack = JSON.parse(event.detail); } catch { return; }
    if (prefs.discordEnabled) syncDiscord();
  });
  const fieldControls = [...fields.querySelectorAll('[name]')];
  const captions = ['Стандартный', 'Матовое стекло', 'Полупрозрачный', 'Непрозрачный'];
  for (const select of fields.querySelectorAll('[name$=Material]')) {
    materials.forEach((value, index) => select.add(new Option(captions[index], value)));
  }
  const wallpaper = dialog.querySelector('.ymstudio-wallpaper');
  const iconCards = dialog.querySelector('.ymstudio-icon-packs');
  for (const [id, pack] of Object.entries({ native: { name: 'Яндекс Музыка' }, ...sonoraPacks })) {
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.iconPack = id;
    if (id !== 'native') {
      const row = document.createElement('span');
      row.className = 'ymstudio-icon-sample';
      for (const icon of ['play', 'like', 'search']) row.append(window.sonoraIconPreview(id, icon));
      card.append(row);
    }
    card.append(document.createTextNode(pack.name));
    card.onclick = () => { prefs.iconPack = id; save(); sync(); };
    iconCards.append(card);
  }
  let page = 'wallpaper';
  function sync() {
    if (appliedIconPack !== prefs.iconPack) {
      appliedIconPack = prefs.iconPack;
      document.documentElement.dataset.sonoraIcons = prefs.iconPack;
      for (const card of iconCards.children) card.setAttribute('aria-pressed', String(card.dataset.iconPack === prefs.iconPack));
      document.dispatchEvent(new CustomEvent('sonora-icon-pack', { detail: prefs.iconPack }));
    }
    document.documentElement.dataset.sonoraLyrics = prefs.lyrics;
    document.documentElement.toggleAttribute('data-sonora-lyrics-motion', prefs.lyricsMotion);
    document.documentElement.dataset.ymstudioDensity = prefs.density;
    document.documentElement.dataset.ymstudioSide = prefs.side;
    document.documentElement.dataset.ymstudioPlayer = prefs.player;
    document.documentElement.dataset.sonoraSidebar = prefs.sidebarMaterial;
    document.documentElement.dataset.sonoraPlayer = prefs.playerMaterial;
    document.documentElement.dataset.sonoraCards = prefs.cardMaterial;
    const accent = /^#[0-9a-f]{6}$/i.test(prefs.accent) ? prefs.accent : '#ffe733';
    const [r, g, b] = accent.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    document.documentElement.toggleAttribute('data-ymstudio-accent', accent !== '#ffe733');
    document.documentElement.style.setProperty('--sonora-accent', accent);
    document.documentElement.style.setProperty('--sonora-accent-text', r * .2126 + g * .7152 + b * .0722 > .18 ? '#111' : '#fff');
    document.documentElement.toggleAttribute('data-ymstudio-hide-pins', !prefs.pins);
    const hiddenTabs = sidebarControls.filter(control => !prefs[control.name]).map(control => control.name.slice('showNav_'.length));
    document.documentElement.dataset.sonoraHiddenNav = hiddenTabs.join(' ');
    syncDiscord();
    const waveColor = prefs.wave === 'custom' && validColor(prefs.color) ? prefs.color : accent;
    document.documentElement.toggleAttribute('data-sonora-tint-wave', prefs.wave !== 'native' &&
      (waveColor.toLowerCase() !== '#ffe733' || Number(prefs.waveVividness) !== 100));
    document.documentElement.style.setProperty('--sonora-wave-hue', hueFromHex(waveColor) - 54 + 'deg');
    document.documentElement.style.setProperty('--sonora-wave-saturation', String(Math.min(160, Math.max(20, Number(prefs.waveVividness) || 100)) / 100));
    document.documentElement.dataset.sonoraWaveShape = prefs.waveShape;
    const ringColor = prefs.wave === 'native' || (prefs.wave === 'accent' && accent.toLowerCase() === '#ffe733') ? '#f51a90' : waveColor;
    document.documentElement.style.setProperty('--sonora-ncs-ink', ringColor);
    document.dispatchEvent(new Event('sonora-ncs-color'));
    const hex = dialog.querySelector('[data-hex]');
    if (document.activeElement !== hex) hex.value = accent.toUpperCase();
    dialog.querySelector('[name=color]').disabled = prefs.wave !== 'custom';
    dialog.querySelector('[name=waveVividness]').disabled = prefs.wave === 'native';
    dialog.querySelector('[name=lyricsMotion]').disabled = prefs.lyrics === 'native';
    for (const swatch of dialog.querySelectorAll('[data-accent]')) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.accent === accent.toLowerCase()));
    }
  }

  function hueFromHex(color) {
    const [r, g, b] = color.slice(1).match(/../g).map(x => parseInt(x, 16) / 255);
    const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
    if (delta === 0) return 54;
    if (max === r) return (60 * (g - b) / delta + 360) % 360;
    if (max === g) return 60 * ((b - r) / delta + 2);
    return 60 * ((r - g) / delta + 4);
  }

  const scheme = dialog.querySelector('.ymstudio-layout');
  function placeBlocks() {
    for (const [block, slot] of [['sidebar', prefs.side], ['player', prefs.player]]) {
      const target = scheme.querySelector(`[data-slot="${slot}"]`);
      const element = scheme.querySelector(`[data-block="${block}"]`);
      if (target && element.parentElement !== target) target.append(element);
    }
  }
  let dragging;
  const slots = { sidebar: ['left', 'right'], player: ['top', 'bottom'] };
  function moveBlock(block, slot) {
    if (!slots[block]?.includes(slot)) return;
    prefs[block === 'sidebar' ? 'side' : 'player'] = slot;
    placeBlocks();
    save();
    sync();
  }
  for (const block of scheme.querySelectorAll('[data-block]')) {
    block.onclick = () => moveBlock(block.dataset.block, slots[block.dataset.block].find(slot => slot !== block.parentElement.dataset.slot));
    block.ondragstart = (event) => {
      dragging = block.dataset.block;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragging);
      scheme.dataset.dragging = dragging;
    };
    block.ondragend = () => { dragging = undefined; delete scheme.dataset.dragging; };
  }
  for (const slot of scheme.querySelectorAll('[data-slot]')) {
    slot.ondragover = (event) => { if (slots[dragging]?.includes(slot.dataset.slot)) event.preventDefault(); };
    slot.ondrop = (event) => {
      event.preventDefault();
      moveBlock(dragging, slot.dataset.slot);
      dragging = undefined;
      delete scheme.dataset.dragging;
    };
  }
  placeBlocks();
  const accentPicker = dialog.querySelector('[name=accent]');
  const hex = dialog.querySelector('[data-hex]');
  function changeAccent(value) {
    if (!validColor(value)) return;
    prefs.accent = value.toLowerCase();
    accentPicker.value = prefs.accent;
    save();
    sync();
  }
  hex.oninput = () => changeAccent('#' + hex.value.trim().replace(/^#/, ''));
  hex.onblur = () => { hex.value = prefs.accent.toUpperCase(); };
  for (const swatch of dialog.querySelectorAll('[data-accent]')) {
    swatch.style.setProperty('--swatch', swatch.dataset.accent);
    swatch.onclick = () => changeAccent(swatch.dataset.accent);
  }
  function view(next) {
    page = next;
    for (const item of dialog.querySelectorAll('[data-page]')) item.hidden = item.dataset.page !== next;
    for (const tab of dialog.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab.dataset.view === next));
    sync();
  }
  for (const control of dialog.querySelectorAll('[name]')) {
    if (control.type === 'checkbox') control.checked = prefs[control.name];
    else control.value = prefs[control.name];
    control.addEventListener('input', () => {
      prefs[control.name] = control.type === 'checkbox' ? control.checked : control.value;
      save();
      sync();
    });
  }
  const dialogChanged = () => document.dispatchEvent(new Event('ymstudio-dialog-changed'));
  function finishLayout(commit) {
    if (!layoutSnapshot) return;
    if (!commit) {
      Object.assign(prefs, layoutSnapshot);
      for (const control of fieldControls) {
        if (control.type === 'checkbox') control.checked = prefs[control.name];
        else control.value = prefs[control.name];
      }
      placeBlocks();
    }
    layoutSnapshot = undefined;
    if (commit) save();
    editor.close();
    fields.hidden = true;
    layoutTab.append(fields);
    dialog.showModal();
    view('layout');
    dialog.querySelector('[data-open-layout]').focus();
    dialogChanged();
  }
  dialog.querySelector('[data-open-layout]').onclick = () => {
    layoutSnapshot = Object.fromEntries([...fieldControls.map(control => control.name), 'side', 'player'].map(name => [name, prefs[name]]));
    dialog.close();
    editor.insertBefore(fields, editor.querySelector('footer'));
    fields.hidden = false;
    editor.show();
    dialogChanged();
  };
  editor.querySelector('[data-cancel-layout]').onclick = () => finishLayout(false);
  editor.querySelector('[data-save-layout]').onclick = () => finishLayout(true);
  document.addEventListener('keydown', event => {
    if (!editor.open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finishLayout(false);
  }, true);
  for (const tab of dialog.querySelectorAll('[data-view]')) tab.onclick = () => { view(tab.dataset.view); dialogChanged(); };
  function openStudio() {
    if (editor.open) { editor.querySelector('[data-save-layout]').focus(); return; }
    if (!dialog.open) dialog.showModal();
    view(page);
    dialogChanged();
  }
  button.onclick = openStudio;
  document.addEventListener('sonora-open-settings', openStudio);
  dialog.onclose = () => { sync(); dialogChanged(); };
  dialog.onkeydown = event => { if (event.key === 'Escape') event.stopPropagation(); };
  wallpaper.id = 'ymstudio-wallpaper';
  view(page);
})();

