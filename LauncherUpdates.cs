using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32;

internal static class LauncherUpdates {
    const string Repository = "nofy541/Sonora";
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string PreferencesKey = @"Software\Sonora\Launcher";
    const string RunName = "SonoraLauncher";
    internal const string StartupArgument = "--check-updates";

    internal static bool StartsWithWindows {
        get {
            using (var prefs = Registry.CurrentUser.OpenSubKey(PreferencesKey))
                return prefs == null || (int)prefs.GetValue("CheckAtLogon", 1) != 0;
        }
    }

    internal static void ConfigureStartup(bool enabled, string executable) {
        using (var run = Registry.CurrentUser.CreateSubKey(RunKey)) {
            if (enabled) run.SetValue(RunName, "\"" + executable + "\" " + StartupArgument);
            else run.DeleteValue(RunName, false);
        }
        using (var prefs = Registry.CurrentUser.CreateSubKey(PreferencesKey))
            prefs.SetValue("CheckAtLogon", enabled ? 1 : 0, RegistryValueKind.DWord);
    }

    internal static async Task<Version> CheckAsync() {
        using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(12), MaxResponseContentBufferSize = 1024 * 1024 }) {
            client.DefaultRequestHeaders.UserAgent.ParseAdd("SonoraLauncher/" + Package.LauncherVersion);
            client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            using (var response = await client.GetAsync("https://api.github.com/repos/" + Repository + "/releases/latest").ConfigureAwait(false)) {
                if (response.StatusCode == HttpStatusCode.NotFound) return null;
                response.EnsureSuccessStatusCode();
                string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return ParseUpdate(json, new Version(Package.LauncherVersion));
            }
        }
    }

    internal static string ReleaseUrl(Version version) {
        return "https://github.com/" + Repository + "/releases/tag/v" + version.ToString(3);
    }

    internal static Version ParseUpdate(string json, Version installed) {
        var release = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
        object tag, draft, prerelease;
        Version latest;
        if (release == null || !release.TryGetValue("tag_name", out tag) || !(tag is string) ||
            !release.TryGetValue("draft", out draft) || !Equals(draft, false) ||
            !release.TryGetValue("prerelease", out prerelease) || !Equals(prerelease, false) ||
            !Regex.IsMatch((string)tag, @"\Av(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\z") ||
            !Version.TryParse(((string)tag).Substring(1), out latest)) {
            throw new InvalidDataException("GitHub вернул неподдерживаемый формат релиза.");
        }
        return latest > installed ? latest : null;
    }

    internal static void SelfTest() {
        const string payload = "{{\"tag_name\":\"v{0}\",\"draft\":false,\"prerelease\":false}}";
        var current = new Version(1, 1, 0);
        if (ParseUpdate(String.Format(payload, "1.2.0"), current) != new Version(1, 2, 0) ||
            ParseUpdate(String.Format(payload, "1.1.0"), current) != null ||
            ParseUpdate(String.Format(payload, "1.0.9"), current) != null)
            throw new Exception("Release version comparison failed.");
        try {
            ParseUpdate(String.Format(payload, "1.2.0-preview"), current);
        } catch (InvalidDataException) { return; }
        throw new Exception("Invalid release tag was accepted.");
    }
}
