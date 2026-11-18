'use strict';

const icons = {
  previous: ['##    #', '##   ##', '##  ###', '## ####', '##  ###', '##   ##', '##    #'],
  toggle:   ['#     # #', '##    # #', '###   # #', '####  # #', '###   # #', '##    # #', '#     # #'],
  next:     ['#    ##', '##   ##', '###  ##', '#### ##', '###  ##', '##   ##', '#    ##'],
  like:     [' ##   ## ', '#### ####', '#########', '#########', ' ####### ', '  #####  ', '   ###   ', '    #    '],
  dislike:  ['##     ##', ' ##   ## ', '  ## ##  ', '   ###   ', '  ## ##  ', ' ##   ## ', '##     ##'],
};
const names = { dislike: 'Дизлайк', previous: 'Предыдущий трек', toggle: 'Воспроизвести или поставить на паузу', next: 'Следующий трек', like: 'Лайк' };
const colors = { dislike: [255, 119, 132], like: [88, 235, 161] };

function makeIcon(nativeImage, rows, [red, green, blue], pack) {
  const size = 24;
  const scale = pack?.shell ? 1 : 2;
  const pixels = Buffer.alloc(size * size * 4);
  const xOffset = Math.floor((size - rows[0].length * scale) / 2);
  const yOffset = Math.floor((size - rows.length * scale) / 2);
  const shape = [];
  for (const [y, row] of rows.entries()) {
    for (const [x, point] of Array.from(row).entries()) {
      if (point !== '#') continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) shape.push([xOffset + x * scale + dx, yOffset + y * scale + dy]);
      }
    }
  }
  const paint = (x, y, b, g, r, alpha) => {
    const index = (y * size + x) * 4;
    pixels[index] = b;
    pixels[index + 1] = g;
    pixels[index + 2] = r;
    pixels[index + 3] = alpha;
  };
  if (pack?.shell) {
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const u = Math.abs(x - 11.5), v = Math.abs(y - 11.5);
      let radius = Math.max(u, v);
      if (pack.shell === 'ring') radius = Math.hypot(u, v);
      if (pack.shell === 'diamond') radius = (u + v) * .79;
      if (pack.shell === 'hex') radius = Math.max(u, (v + u * .55) * .93);
      if (pack.shell === 'soft') radius = Math.pow(u ** 4 + v ** 4, .25);
      if (pack.shell === 'brackets' && Math.min(u, v) < 6) continue;
      if (radius < 10 && (radius >= 8.4 || pack.inverse)) paint(x, y, blue, green, red, 255);
    }
  }
  for (const [x, y] of shape) {
    if (!pack?.shell || pack.width > 2) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(x + dx, y + dy, 20, 20, 20, 235);
    }
  }
  for (const [x, y] of shape) {
    if (pack?.inverse) paint(x, y, 20, 20, 20, 255);
    else paint(x, y, blue, green, red, 255);
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size });
}

function configureTaskbar(contents, electron, packId = 'native') {
  if (process.platform !== 'win32') return;
  const window = electron.BrowserWindow.fromWebContents(contents);
  if (!window || window.isDestroyed()) return;
  const pack = sonoraPacks[packId];
  const ink = pack?.ink ? pack.ink.slice(1).match(/../g).map(part => parseInt(part, 16)) : [250, 250, 250];
  const buttons = Object.entries(names).map(([action, tooltip]) => ({
    tooltip,
    icon: makeIcon(electron.nativeImage, icons[action], colors[action] || ink, pack),
    click() {
      if (contents.isDestroyed() || !/^music-application:\/\/desktop(?:\/|$)/.test(contents.getURL())) return;
      const command = JSON.stringify(action);
      void contents.executeJavaScriptInIsolatedWorld(1427, [{
        code: 'window.dispatchEvent(new CustomEvent("sonora-taskbar-command", {detail:' + command + '}))',
      }]).catch(() => {});
    },
  }));
  const register = () => {
    if (window.isDestroyed() || !window.setThumbarButtons(buttons)) return false;
    void contents.executeJavaScriptInIsolatedWorld(1427, [{
      code: 'document.documentElement?.setAttribute("data-sonora-taskbar-installed", "5");' +
        'document.documentElement?.setAttribute("data-sonora-taskbar-order", ' + JSON.stringify(Object.keys(names).join(',')) + ');' +
        'document.documentElement?.setAttribute("data-sonora-taskbar-pack", ' + JSON.stringify(packId) + ')',
    }]).catch(() => {});
    return true;
  };
  if (!register()) window.once('ready-to-show', register);
}
