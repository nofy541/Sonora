const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { musicVersion, launcherVersion } = require('./target.json');
const here = __dirname;
const program = 'Яндекс Музыка.exe';
const build = fs.readFileSync(path.join(here, 'studio-build', program));
const official = fs.readFileSync(path.join(here, 'studio-official', program));
const originalArchive = fs.readFileSync(path.join(here, 'studio-official', 'app.asar'));
const modArchive = fs.readFileSync(path.join(here, 'studio-build', 'app.asar'));
const setup = fs.readFileSync(path.join(here, 'pulsesync-rollback', `Yandex_Music_x64_${musicVersion}.exe`));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const archiveHeaderHash = archive => hash(archive.subarray(16, 16 + archive.readUInt32LE(12)));
const originalValue = archiveHeaderHash(originalArchive);
const modValue = archiveHeaderHash(modArchive);
const offset = official.indexOf(originalValue, 0, 'ascii');
const end = offset + 64;
if (offset < 0 || originalValue === modValue || !build.subarray(offset, end).equals(Buffer.from(modValue, 'ascii')) ||
    !official.subarray(0, offset).equals(build.subarray(0, offset)) || !official.subarray(end).equals(build.subarray(end))) {
  throw new Error('Unexpected executable differences outside the app.asar hash.');
}
const metadataPath = path.join(here, 'SonoraPackage.cs');
const previous = fs.existsSync(metadataPath) ? fs.readFileSync(metadataPath, 'utf8') : '';
const prior = name => previous.match(new RegExp('string ' + name + ' = "([a-f0-9]{64})"'))?.[1] || '';
// In-place upgrades only work when both builds patch the same stock client.
const sameClient = prior('OriginalExe') === hash(official) && prior('OriginalArchive') === hash(originalArchive);
const alreadyCurrent = prior('ModExe') === hash(build) && prior('ModArchive') === hash(modArchive);
fs.writeFileSync(path.join(here, 'music.archive.gz'), zlib.gzipSync(originalArchive, { level: 9 }));
fs.writeFileSync(path.join(here, 'sonora.archive.gz'), zlib.gzipSync(modArchive, { level: 9 }));
fs.writeFileSync(metadataPath, `internal static class Package {
    internal const string MusicVersion = "${musicVersion}";
    internal const string LauncherVersion = "${launcherVersion}";
    internal const long Offset = ${offset};
    internal const string OriginalValue = "${originalValue}";
    internal const string ModValue = "${modValue}";
    internal const string OriginalExe = "${hash(official)}";
    internal const string ModExe = "${hash(build)}";
    internal const string OriginalArchive = "${hash(originalArchive)}";
    internal const string ModArchive = "${hash(modArchive)}";
    internal const string PreviousExe = "${sameClient ? prior(alreadyCurrent ? 'PreviousExe' : 'ModExe') : ''}";
    internal const string PreviousArchive = "${sameClient ? prior(alreadyCurrent ? 'PreviousArchive' : 'ModArchive') : ''}";
    internal const string Setup = "${hash(setup)}";
}\n`);
