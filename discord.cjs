function createSonoraDiscord() {
  const net = require('node:net');
  const { randomUUID } = require('node:crypto');
  let clientId = '', activity = null, pipe, ready, retry, index = 0, sent;

  function write(socket, opcode, payload) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode);
    header.writeUInt32LE(body.length, 4);
    socket.write(Buffer.concat([header, body]));
  }

  function send(socket, value) {
    write(socket, 1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: value }, nonce: randomUUID() });
  }

  function publish() {
    if (!ready || sent === activity) return;
    if (sent && activity && sent.details === activity.details && sent.state === activity.state &&
        sent.assets?.large_image === activity.assets?.large_image &&
        Math.abs(sent.timestamps.start - activity.timestamps.start) <= 2 &&
        Math.abs(sent.timestamps.end - activity.timestamps.end) <= 2) return;
    send(pipe, activity);
    sent = activity;
  }

  function connect() {
    if (!clientId || !activity || pipe || retry) return;
    let incoming = Buffer.alloc(0);
    const socket = net.createConnection('\\\\.\\pipe\\discord-ipc-' + index);
    pipe = socket;
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.once('connect', () => write(socket, 0, { v: 1, client_id: clientId }));
    socket.on('data', data => {
      if (pipe !== socket) return;
      incoming = Buffer.concat([incoming, data]);
      while (incoming.length >= 8) {
        const opcode = incoming.readUInt32LE();
        const size = incoming.readUInt32LE(4);
        if (size > 64 * 1024) { socket.destroy(); return; }
        if (incoming.length < 8 + size) return;
        const body = incoming.subarray(8, 8 + size);
        incoming = incoming.subarray(8 + size);
        if (opcode === 2) { socket.destroy(); return; }
        if (opcode === 3) write(socket, 4, body);
        if (opcode !== 1 || ready) continue;
        let frame;
        try { frame = JSON.parse(body.toString('utf8')); } catch { socket.destroy(); return; }
        if (frame?.cmd !== 'DISPATCH' || frame.evt !== 'READY') continue;
        socket.setTimeout(0);
        ready = true;
        sent = undefined;
        publish();
      }
    });
    socket.once('close', () => {
      if (pipe !== socket) return;
      pipe = undefined;
      ready = false;
      index = (index + 1) % 10;
      if (!clientId || !activity) return;
      retry = setTimeout(() => { retry = undefined; connect(); }, index === 0 ? 15000 : 80);
      retry.unref();
    });
  }

  return (nextId, track) => {
    if (clientId !== nextId) {
      clearTimeout(retry);
      retry = undefined;
      if (pipe) {
        if (ready) { send(pipe, null); pipe.end(); pipe.setTimeout(1000); }
        else pipe.destroy();
      }
      pipe = undefined;
      ready = false;
      index = 0;
      clientId = nextId;
    }
    activity = clientId ? sonoraDiscordActivity(track, Date.now()) : null;
    publish();
    connect();
  };
}

function sonoraDiscordActivity(track, now) {
  if (!track || typeof track.title !== 'string' || !Number.isFinite(track.position) ||
      !Number.isFinite(track.duration) || track.position < 0 || track.duration <= track.position ||
      track.duration > 86400) return null;
  const label = value => typeof value === 'string' ? [...value.trim()].slice(0, 128).join('') : '';
  const details = label(track.title);
  if (!details) return null;
  const start = Math.floor((now - track.position * 1000) / 1000);
  const activity = {
    type: 2,
    details,
    state: label(track.artist) || 'Яндекс Музыка',
    timestamps: { start, end: start + Math.ceil(track.duration) },
  };
  if (typeof track.cover === 'string' && track.cover.length <= 512) {
    try {
      const url = new URL(track.cover);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
          /^avatars(?:\.mds)?\.yandex\.(?:net|ru)$/.test(url.hostname)) {
        activity.assets = { large_image: url.href, large_text: label(track.album) || details };
      }
    } catch {}
  }
  return activity;
}
