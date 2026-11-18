using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;

internal enum MusicState { Missing, Original, Modded, Older, Unsupported }

internal sealed class MusicInstall {
    internal readonly string Root;
    internal string Exe { get { return Path.Combine(Root, "Яндекс Музыка.exe"); } }
    internal string Archive { get { return Path.Combine(Root, "resources", "app.asar"); } }
    internal MusicInstall(string root) { Root = root; }

    static Stream Resource(string name) {
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
        if (stream == null) throw new IOException("В пакете отсутствует " + name);
        return stream;
    }
    static string Hash(Stream stream) {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    static string FileHash(string path) {
        using (var stream = File.OpenRead(path)) return Hash(stream);
    }
    internal MusicState Inspect() {
        if (!File.Exists(Exe) && !File.Exists(Archive)) return MusicState.Missing;
        if (!File.Exists(Exe) || !File.Exists(Archive)) return MusicState.Unsupported;
        string executable = FileHash(Exe);
        if (executable == Package.OriginalExe && FileHash(Archive) == Package.OriginalArchive) return MusicState.Original;
        if (executable == Package.ModExe && FileHash(Archive) == Package.ModArchive) return MusicState.Modded;
        if (executable == Package.PreviousExe && FileHash(Archive) == Package.PreviousArchive) return MusicState.Older;
        return MusicState.Unsupported;
    }
    internal bool Running() {
        foreach (Process process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(Exe))) {
            using (process) {
                try {
                    if (String.Equals(process.MainModule.FileName, Exe, StringComparison.OrdinalIgnoreCase)) return true;
                } catch (System.ComponentModel.Win32Exception) { return true; }
                catch (InvalidOperationException) {}
            }
        }
        return false;
    }

    internal void InstallMusic() {
        if (Inspect() != MusicState.Missing) throw new InvalidOperationException("Сначала проверьте текущую установку Музыки.");
        string folder = Path.Combine(Path.GetTempPath(), "sonora-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        string installer = Path.Combine(folder, "YandexMusicSetup.exe");
        try {
            using (var input = Resource("music.setup"))
            using (var output = File.Create(installer)) input.CopyTo(output);
            if (FileHash(installer) != Package.Setup) throw new IOException("Установщик Яндекса повреждён.");
            using (var process = Process.Start(new ProcessStartInfo(installer, "/S") {
                WorkingDirectory = folder, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
            })) {
                process.WaitForExit();
                if (process.ExitCode != 0) throw new IOException("Установщик Музыки завершился с кодом " + process.ExitCode);
            }
            if (Inspect() != MusicState.Original) throw new IOException("Файлы установленной Музыки отличаются от ожидаемой версии 5.127.0.");
        } finally {
            try { if (File.Exists(installer)) File.Delete(installer); Directory.Delete(folder); } catch (IOException) {}
        }
    }

    internal void Apply(bool modded) {
        if (Running()) throw new InvalidOperationException("Выйдите из Музыки через значок рядом с часами и повторите.");
        var state = Inspect();
        if (state == (modded ? MusicState.Modded : MusicState.Original)) return;
        if (state != MusicState.Older && state != (modded ? MusicState.Original : MusicState.Modded))
            throw new InvalidOperationException("Эта сборка совместима только с Яндекс Музыкой 5.127.0.");
        string suffix = "." + Guid.NewGuid().ToString("N");
        string exeStage = Exe + suffix + ".tmp", archiveStage = Archive + suffix + ".tmp";
        string exeBackup = Exe + suffix + ".bak", archiveBackup = Archive + suffix + ".bak";
        bool replacedExe = false, replacedArchive = false, finished = false;
        try {
            File.Copy(Exe, exeStage);
            using (var stream = new FileStream(exeStage, FileMode.Open, FileAccess.Write, FileShare.None)) {
                stream.Position = Package.Offset;
                byte[] bytes = System.Text.Encoding.ASCII.GetBytes(modded ? Package.ModValue : Package.OriginalValue);
                stream.Write(bytes, 0, bytes.Length);
            }
            using (var compressed = Resource(modded ? "mod.archive" : "music.archive"))
            using (var input = new GZipStream(compressed, CompressionMode.Decompress))
            using (var output = File.Create(archiveStage)) input.CopyTo(output);
            if (FileHash(exeStage) != (modded ? Package.ModExe : Package.OriginalExe) ||
                FileHash(archiveStage) != (modded ? Package.ModArchive : Package.OriginalArchive)) throw new IOException("Подготовленные файлы не прошли проверку.");
            if (Running() || Inspect() != state) throw new InvalidOperationException("Музыка открылась или обновилась во время подготовки. Повторите после выхода.");
            File.Replace(archiveStage, Archive, archiveBackup); replacedArchive = true;
            File.Replace(exeStage, Exe, exeBackup); replacedExe = true;
            finished = true;
        } catch {
            try { if (replacedExe) File.Replace(exeBackup, Exe, null); }
            finally { if (replacedArchive) File.Replace(archiveBackup, Archive, null); }
            throw;
        } finally {
            foreach (var item in new[] {exeStage, archiveStage}) TryDelete(item);
            if (finished) { TryDelete(exeBackup); TryDelete(archiveBackup); }
        }
    }
    static void TryDelete(string path) {
        try { File.Delete(path); } catch (IOException) {} catch (UnauthorizedAccessException) {}
    }
    internal void Launch() {
        if (!File.Exists(Exe)) throw new FileNotFoundException("Яндекс Музыка ещё не установлена.");
        Process.Start(new ProcessStartInfo(Exe) { WorkingDirectory = Root, UseShellExecute = true });
    }
    internal static void SelfTest(string original, string target, string previous) {
        using (var resource = Resource("music.setup"))
            if (Hash(resource) != Package.Setup) throw new Exception("Setup integrity failed");
        var install = new MusicInstall(target);
        if (install.Inspect() != MusicState.Missing) throw new Exception("Expected empty test folder");
        Directory.CreateDirectory(Path.Combine(target, "resources"));
        File.Copy(Path.Combine(original, "Яндекс Музыка.exe"), install.Exe);
        File.Copy(Path.Combine(original, "app.asar"), install.Archive);
        if (install.Inspect() != MusicState.Original) throw new Exception("Original fingerprint failed");
        install.Apply(true);
        if (install.Inspect() != MusicState.Modded) throw new Exception("Install failed");
        install.Apply(true);
        install.Apply(false);
        if (install.Inspect() != MusicState.Original) throw new Exception("Rollback failed");
        File.AppendAllText(install.Archive, "incompatible");
        if (install.Inspect() != MusicState.Unsupported) throw new Exception("Unknown client was accepted");
        File.WriteAllText(Path.Combine(target, "result.txt"), "PASS: installer hash, empty detection, install, repeat install, exact rollback, incompatible detection.");
        if (previous != null) {
            File.Copy(Path.Combine(previous, "Яндекс Музыка.exe"), install.Exe, true);
            File.Copy(Path.Combine(previous, "app.asar"), install.Archive, true);
            if (install.Inspect() != MusicState.Older) throw new Exception("Previous release fingerprint failed");
            install.Apply(true);
            if (install.Inspect() != MusicState.Modded) throw new Exception("Upgrade failed");
            File.AppendAllText(Path.Combine(target, "result.txt"), Environment.NewLine + "PASS: upgrade from the previous Sonora release.");
        }
    }
}
