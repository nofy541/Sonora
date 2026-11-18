'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { musicVersion } = require('./target.json');

const install = process.env.SONORA_MUSIC_DIR || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'YandexMusic');
const stage = path.join(__dirname, 'studio-build');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const baseline = path.join(__dirname, 'studio-official');
const fromBackup = fs.existsSync(path.join(baseline, 'app.asar'));
const exe = fs.readFileSync(path.join(fromBackup ? baseline : install, 'Яндекс Музыка.exe'));
const archive = fs.readFileSync(path.join(fromBackup ? baseline : path.join(install, 'resources'), 'app.asar'));
const header = archive.subarray(16, 16 + archive.readUInt32LE(12));
const tree = JSON.parse(header);
const payload = archive.subarray(8 + archive.readUInt32LE(4));
const pkg = tree.files['package.json'];
const metadata = JSON.parse(payload.subarray(Number(pkg.offset), Number(pkg.offset) + pkg.size));
if (metadata.version !== musicVersion) throw new Error(`This build requires Yandex Music ${musicVersion}, found ${metadata.version}.`);
const entry = path.posix.normalize(metadata.main);
const file = entry.split('/').reduce((node, part) => node.files[part], tree);
const offset = Number(file.offset);
const original = payload.subarray(offset, offset + file.size);
const css = fs.readFileSync(path.join(__dirname, 'live-wallpaper.css'), 'utf8');
const wallpaper = fs.readFileSync(path.join(__dirname, 'live-wallpaper.js'), 'utf8');
const studio = fs.readFileSync(path.join(__dirname, 'studio.js'), 'utf8');
const taskbar = fs.readFileSync(path.join(__dirname, 'taskbar.cjs'), 'utf8');
const youtube = fs.readFileSync(path.join(__dirname, 'youtube.cjs'), 'utf8');
const discord = fs.readFileSync(path.join(__dirname, 'discord.cjs'), 'utf8');
const iconPacks = fs.readFileSync(path.join(__dirname, 'icon-packs.js'), 'utf8');
const icons = fs.readFileSync(path.join(__dirname, 'icon-renderer.js'), 'utf8');
const ncs = fs.readFileSync(path.join(__dirname, 'ncs-wave.js'), 'utf8');
const ncsSignal = fs.readFileSync(path.join(__dirname, 'ncs-signal.js'), 'utf8');
const renderer = `(() => {
  if (location.protocol !== 'music-application:' || location.host !== 'desktop') return;
  if (document.getElementById('ym-wallpaper-style')) return;
  const style = document.createElement('style');
  style.id = 'ym-wallpaper-style';
  style.textContent = ${JSON.stringify(css)};
  document.head.append(style);
  ${wallpaper}
  ${iconPacks}
  ${icons}
  ${ncs}
  ${studio}
})();`;
new vm.Script(renderer);
const bootstrap = `'use strict';
(() => {
${iconPacks}
${taskbar}
${youtube}
${discord}
const electron = require('electron');
const publishDiscord = createSonoraDiscord();
const discordApplicationId = '1572710068309336184';
let discordContents;
electron.ipcMain.on('sonora:discord-presence', (event, payload) => {
  if (!event.senderFrame || event.senderFrame.parent ||
      !/^music-application:\\/\\/desktop(?:\\/|$)/.test(event.senderFrame.url) ||
      typeof payload !== 'string' || payload.length > 4096) return;
  if (!payload) {
    if (discordContents === event.sender) publishDiscord('', null);
    return;
  }
  let track;
  try { track = JSON.parse(payload); } catch { return; }
  if (discordContents !== event.sender) {
    discordContents = event.sender;
    event.sender.once('destroyed', () => {
      if (discordContents !== event.sender) return;
      publishDiscord('', null);
      discordContents = undefined;
    });
  }
  publishDiscord(discordApplicationId, track);
});
electron.app.on('before-quit', () => publishDiscord('', null));
electron.ipcMain.on('sonora:icon-pack', (event, pack) => {
  if (event.senderFrame && !event.senderFrame.parent && /^music-application:\\/\\/desktop(?:\\/|$)/.test(event.senderFrame.url) &&
      typeof pack === 'string' && (pack === 'native' || Object.hasOwn(sonoraPacks, pack)))
    configureTaskbar(event.sender, electron, pack);
});
electron.app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'window') return;
  contents.on('dom-ready', () => {
    if (!/^music-application:\\/\\/desktop(?:\\/|$)/.test(contents.getURL())) return;
    configureTaskbar(contents, electron);
    configureYouTube(contents);
    void contents.executeJavaScriptInIsolatedWorld(1427, [{code: ${JSON.stringify(renderer)}}])
      .catch(error => console.error('[Студия]', error.message));
  });
});
})();
`;
const replacement = Buffer.concat([Buffer.from(bootstrap + '\n'), original]);
new vm.Script(replacement.toString('utf8'));
const appended = [];
let nextOffset = payload.length;
function addReplacement(entry, bytes) {
  const blockSize = entry.integrity?.blockSize || 4194304;
  const blocks = [];
  for (let i = 0; i < bytes.length; i += blockSize) blocks.push(digest(bytes.subarray(i, i + blockSize)));
  Object.assign(entry, {
    offset: String(nextOffset), size: bytes.length,
    integrity: { algorithm: 'SHA256', hash: digest(bytes), blockSize, blocks },
  });
  appended.push(bytes);
  nextOffset += bytes.length;
}
addReplacement(file, replacement);

const preloadEntry = tree.files['preload.js'];
const preloadSource = payload.toString('utf8', Number(preloadEntry.offset), Number(preloadEntry.offset) + preloadEntry.size);
const patchedPreload = preloadSource + `
;(() => {
  if (location.protocol !== 'music-application:' || location.host !== 'desktop' || window.top !== window) return;
  const {ipcRenderer} = require('electron');
  document.addEventListener('sonora-icon-pack', event => {
    if (typeof event.detail === 'string' && /^[a-z]{1,20}$/.test(event.detail)) ipcRenderer.send('sonora:icon-pack', event.detail);
  });
  document.addEventListener('sonora-discord-config', event => {
    if (typeof event.detail === 'string' && event.detail.length <= 4096)
      ipcRenderer.send('sonora:discord-presence', event.detail);
  });
})();
`;
new vm.Script(patchedPreload);
addReplacement(preloadEntry, Buffer.from(patchedPreload));

const lyricsChunk = tree.files.app.files._next.files.static.files.chunks.files['1824.32ff8115b098fdcd.js'];
const lyrics = payload.toString('utf8', Number(lyricsChunk.offset), Number(lyricsChunk.offset) + lyricsChunk.size);
const lineView = 'let sA=e=>{let{className:t,text:a}=e;return(0,h.jsx)("span",{className:(0,ew.$)(sb().root,t),children:a})}';
const lineCall = 'children:(0,h.jsx)(sA,{text:e.text})},e.key)';
const statusSource = '{fullscreenPlayer:{syncLyrics:c}}=(0,N.g)(),d=(0,b.useCallback)';
for (const token of [lineView, lineCall, statusSource]) {
  if (lyrics.split(token).length !== 2) throw new Error('Expected one matching synchronized lyrics component.');
}
const lineRenderer = `const sonoraGraphemes = new Intl.Segmenter(undefined, {granularity:"grapheme"});
let sA = ({className, text, reveal, spanSeconds, playing, rate}) => {
  const graphemes = (0,b.useMemo)(() => typeof text === "string" ? Array.from(sonoraGraphemes.segment(text), x => x.segment) : [], [text]);
  const revealing = Number.isFinite(reveal) && graphemes.length > 0;
  const node = (0,b.useRef)(null);
  const animation = (0,b.useRef)(null);
  const max = graphemes.length + 1;
  const head = reveal * max;
  (0,b.useLayoutEffect)(() => {
    const element = node.current;
    const root = document.documentElement;
    const enabled = revealing && playing && root.dataset.sonoraLyrics === "continuous" &&
      root.hasAttribute("data-sonora-lyrics-motion") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const existing = animation.current;
    if (enabled && existing && existing.playState === "running") {
      const visual = Number(getComputedStyle(element).getPropertyValue("--sonora-live-head"));
      if (Math.abs(visual - head) * spanSeconds / max < .22) return;
    }
    existing?.cancel();
    animation.current = null;
    if (!enabled || head >= max) return;
    animation.current = element.animate(
      [{"--sonora-live-head":String(head)}, {"--sonora-live-head":String(max)}],
      {duration:Math.max(1,(1-reveal)*spanSeconds*1000/rate), fill:"forwards"}
    );
  }, [revealing, playing, reveal, spanSeconds, rate, max, head]);
  (0,b.useLayoutEffect)(() => () => animation.current?.cancel(), []);
  return (0,h.jsx)("span", {
    ref:node,
    className:(0,ew.$)(sb().root,className),
    style:revealing ? {"--sonora-lyric-head":head,"--sonora-live-head":head} : undefined,
    children:revealing ? graphemes.map((letter,index) => (0,h.jsx)("span", {
      className:"sonora-lyric-letter", style:{"--sonora-letter-index":index}, children:letter
    },index)) : text
  });
}`;
const timedLine = 'children:(0,h.jsx)(sA,(()=>{const spanSeconds=Math.max(.1,(c.lines?.[t+1]?.fromSec??c.endSec??e.fromSec+3.5)-e.fromSec);return{text:e.text,spanSeconds,reveal:t===u&&!n?Math.min(1,Math.max(0,(l-e.fromSec)/spanSeconds)):undefined,playing:sonoraState.status===sx.MT.PLAYING,rate:Number(r?.state.playerState.playbackRate?.value)||1}})())},e.key)';
const patchedLyrics = lyrics.replace(lineView, lineRenderer).replace(lineCall, timedLine)
  .replace(statusSource, '{fullscreenPlayer:{syncLyrics:c},sonataState:sonoraState}=(0,N.g)(),d=(0,b.useCallback)');
new vm.Script(patchedLyrics);
addReplacement(lyricsChunk, Buffer.from(patchedLyrics));

const layoutChunk = tree.files.app.files._next.files.static.files.chunks.files.app.files['(product)'].files['layout-0e6c540f981e0383.js'];
const layout = payload.toString('utf8', Number(layoutChunk.offset), Number(layoutChunk.offset) + layoutChunk.size);
const shortcutHook = '(0,s.useEffect)(()=>(null==i||i.listen(),()=>{null==i||i.stopListening()}),[i])';
if (layout.split(shortcutHook).length !== 2) throw new Error('Expected one native shortcuts provider.');
const taskbarHook = `(0,s.useEffect)(() => {
  const parameters = {previous:u.l.MOVE_BACKWARD,toggle:u.l.TOGGLE_PLAY,next:u.l.MOVE_FORWARD,like:u.l.LIKE,dislike:u.l.DISLIKE};
  const onCommand = (event) => {
    if (!Object.hasOwn(parameters,event.detail)) return;
    const target = i.listenersGroups[h.M.MAIN]?.[parameters[event.detail]];
    if (!target?.disabled) target?.handler?.();
  };
  window.addEventListener("sonora-taskbar-command", onCommand);
  document.documentElement.setAttribute("data-sonora-taskbar-controls","");
  return () => {
    window.removeEventListener("sonora-taskbar-command", onCommand);
    document.documentElement.removeAttribute("data-sonora-taskbar-controls");
  };
}, [i])`;
const graphStart = layout.indexOf('class tP{connectNodes()');
const graphEnd = layout.indexOf('}class tA{createGraphs(', graphStart);
if (graphStart < 0 || graphEnd < 0) throw new Error('Expected the native audio graph.');
const audioGraph = layout.slice(graphStart, graphEnd);
const installTap = 'this.config=t,this.connectNodes()';
const eqOn = 't||e||a.connect(this.context.destination))';
const eqOff = 't||e||this.sourceNode.connect(this.context.destination))';
for (const token of [installTap, eqOn, eqOff]) {
  if (audioGraph.split(token).length !== 2) throw new Error('Expected one audio graph tap point: ' + token);
}
const patchedGraph = audioGraph
  .replace(installTap, installTap + ',sonoraAttachAnalyser(this)')
  .replace(eqOn, eqOn.slice(0, -1) + ',sonoraAttachAnalyser(this))')
  .replace(eqOff, eqOff.slice(0, -1) + ',sonoraAttachAnalyser(this))');
const playbackHook = 'e.state.playerState.status.onChange(e=>{this.updateMediaSessionPlaybackState(e)})';
const positionHook = 'l>0&&navigator.mediaSession.setPositionState({duration:l,position:Math.min(d,l)})';
const positionReset = 'return void navigator.mediaSession.setPositionState()';
for (const token of [playbackHook, positionHook, positionReset]) {
  if (layout.split(token).length !== 2) throw new Error('Expected one Media Session hook: ' + token);
}
const discordTrack = `(function () {
  const media = navigator.mediaSession.metadata;
  const track = e.state.playerState.status.value === V.MT.PLAYING && l > 0 && media?.title ? {
    title: media.title, artist: media.artist, album: media.album,
    cover: media.artwork.find(image => image.sizes === '400x400')?.src || media.artwork.at(-1)?.src,
    position: Math.max(0, Math.min(d, l)), duration: l
  } : null;
  document.dispatchEvent(new CustomEvent('sonora-discord-track', { detail: JSON.stringify(track) }));
})()`;
const patchedLayout = layout.replace(shortcutHook, shortcutHook + ',' + taskbarHook)
  .replace(audioGraph, ncsSignal + '\n' + patchedGraph)
  .replace(playbackHook, 'e.state.playerState.status.onChange(t=>{this.updateMediaSessionPlaybackState(t),this.updatePositionState(e)})')
  .replace(positionHook, positionHook + ',' + discordTrack)
  .replace(positionReset, "return void (navigator.mediaSession.setPositionState(),document.dispatchEvent(new CustomEvent('sonora-discord-track',{detail:'null'})))");
new vm.Script(patchedLayout);
addReplacement(layoutChunk, Buffer.from(patchedLayout));

const waveChunk = tree.files.app.files._next.files.static.files.chunks.files['4362-7ace0494e2a6f30a.js'];
const waveSource = payload.toString('utf8', Number(waveChunk.offset), Number(waveChunk.offset) + waveChunk.size);
const waveMenu = '"data-test-id":f.e8.player.VIBE_CONTEXT_MENU_BUTTON}),(0,u.jsx)(tT.e,{})';
if (waveSource.split(waveMenu).length !== 2) throw new Error('Expected one My Wave player menu.');
const nativeFullscreenHandler = 'X=(0,j.c)(()=>{if(o.entityMeta){if(c.modal.isOpened)return void c.modal.close();c.modal.open()}})';
const nativeFullscreenShortcut = 'addShortcutsListener(tb.M.MAIN,tp.l.TOGGLE_FULLSCREEN_PLAYER,X)';
if (waveSource.split(nativeFullscreenHandler).length !== 2 || waveSource.split(nativeFullscreenShortcut).length !== 2)
  throw new Error('Expected the native My Wave fullscreen handler.');
const waveFullscreen = `"data-test-id":f.e8.player.VIBE_CONTEXT_MENU_BUTTON}),
  (0,u.jsx)("button",{
    type:"button", className:(0,_.$)(tQ().button,tQ().important,"sonora-wave-fullscreen"),
    "aria-label":"Открыть полноэкранный плеер",
    title:"Полноэкранный плеер", disabled:!W||l.isAdvertShown,
    "data-sonora-vibe-fullscreen":"",
    onClick:event=>{event.stopPropagation();X()},
    children:(0,u.jsx)("svg",{viewBox:"0 0 24 24",fill:"currentColor","aria-hidden":true,
      children:(0,u.jsx)("use",{href:"/icons/sprite.svg#fullscreen_xs"})})
  }),
  (0,u.jsx)(tT.e,{})`;
const patchedWave = waveSource.replace(waveMenu, waveFullscreen);
new vm.Script(patchedWave);
addReplacement(waveChunk, Buffer.from(patchedWave));

const titlebarChunk = tree.files.app.files._next.files.static.files.chunks.files['7956-fd3a458349d8bd97.js'];
const titlebar = payload.toString('utf8', Number(titlebarChunk.offset), Number(titlebarChunk.offset) + titlebarChunk.size);
const minimize = 'children:[(0,o.jsx)(d,{onClick:u,ariaLabel:i({id:"windows-menu.roll-up"})';
if (titlebar.split(minimize).length !== 2) throw new Error('Expected one Windows title bar minimize button.');
const titlebarButton = `(0,o.jsx)("button",{
    type:"button",className:(0,l.$)(c().button,{[c().button_withSecondaryColor]:L},"ymstudio-titlebar"),
    "aria-label":"Настройки Sonora",title:"Настройки Sonora",
    onClick:event=>{event.stopPropagation();document.dispatchEvent(new Event("sonora-open-settings"))},
    onDoubleClick:event=>event.stopPropagation(),children:"Sonora"
  })`;
const patchedTitlebar = titlebar.replace(minimize, minimize.replace('children:[', 'children:[' + titlebarButton + ','));
new vm.Script(patchedTitlebar);
addReplacement(titlebarChunk, Buffer.from(patchedTitlebar));

const json = Buffer.from(JSON.stringify(tree));
const padded = Math.ceil(json.length / 4) * 4;
const info = Buffer.alloc(16 + padded);
info.writeUInt32LE(4, 0);
info.writeUInt32LE(8 + padded, 4);
info.writeUInt32LE(4 + padded, 8);
info.writeUInt32LE(json.length, 12);
json.copy(info, 16);
const originalHash = digest(header);
const position = exe.indexOf(originalHash, 0, 'ascii');
if (position < 0 || exe.indexOf(originalHash, position + 1, 'ascii') !== -1)
  throw new Error('Expected exactly one embedded integrity hash for app.asar.');
fs.mkdirSync(stage, { recursive: true });
const confirmed = JSON.parse(info.subarray(16, 16 + info.readUInt32LE(12)));
if (confirmed.files['package.json'].offset !== pkg.offset) throw new Error('Archive metadata mismatch.');
fs.writeFileSync(path.join(stage, 'app.asar'), Buffer.concat([info, payload, ...appended]));
exe.write(digest(json), position, 64, 'ascii');
fs.writeFileSync(path.join(stage, 'Яндекс Музыка.exe'), exe);
console.log('Production build, renderer syntax and archive integrity verified.', metadata.version);

