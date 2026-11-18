'use strict';

const youtubeOrigin = 'https://www.youtube-nocookie.com';
const sonoraReferrer = 'https://com.sonora.wallpaper/';
const youtubeSessions = new WeakSet();
const youtubeContents = new Map();

function configureYouTube(contents) {
  if (!youtubeContents.has(contents.id)) {
    const id = contents.id;
    youtubeContents.set(id, contents);
    contents.once('destroyed', () => youtubeContents.delete(id));
  }
  const session = contents.session;
  if (youtubeSessions.has(session)) return;
  youtubeSessions.add(session);
  session.webRequest.onBeforeSendHeaders({ urls: [youtubeOrigin + '/embed/*'] }, (details, callback) => {
    const url = new URL(details.url);
    const headers = { ...details.requestHeaders };
    if (details.resourceType === 'subFrame' && /^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname) &&
        url.searchParams.get('widget_referrer') === sonoraReferrer &&
        /^music-application:\/\/desktop(?:\/|$)/.test(youtubeContents.get(details.webContentsId ?? details.webContents?.id)?.getURL() || '')) {
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'referer') delete headers[name];
      }
      headers.Referer = sonoraReferrer;
    }
    callback({ requestHeaders: headers });
  });
}
