using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Runtime.Versioning;
using Microsoft.Win32;
using Photino.NET;

namespace Astralis;

static class Program
{
    [STAThread]
    static void Main()
    {
        if (!WebView2Runtime.IsInstalled())
        {
            Fatal(
                "ASTRALIS needs Microsoft Edge WebView2 Runtime.\n\n" +
                "Windows 11 already has it. On Windows 10 install:\n" +
                "https://aka.ms/webview2bootstrapper\n\n" +
                "Then launch ASTRALIS.exe again.");
            return;
        }

        var root = GameRoot();
        var index = Path.Combine(root, "index.html");
        if (!File.Exists(index))
        {
            Fatal("ASTRALIS is missing its game files.\nExpected index.html in:\n" + root);
            return;
        }

        var http = new LoopbackHttp(root);
        if (!http.Start())
        {
            Fatal("Could not bind the local game server on 127.0.0.1.");
            return;
        }

        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ASTRALIS");
        Directory.CreateDirectory(appData);
        var tmp = Path.Combine(appData, "webview");
        Directory.CreateDirectory(tmp);

        // WebView2 compositor vsync stays on. The in-game VSYNC toggle caps
        // the JS loop to the panel (~60). Do not pass --disable-gpu-vsync.
        var extra = Environment.GetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") ?? "";
        if (extra.IndexOf("disable-gpu-vsync", StringComparison.OrdinalIgnoreCase) < 0
            && extra.IndexOf("disable-frame-rate-limit", StringComparison.OrdinalIgnoreCase) < 0)
        {
            extra = (extra + " --disable-backgrounding-occluded-windows --disable-renderer-backgrounding").Trim();
            Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", extra);
        }

        PhotinoWindow? window = null;
        window = new PhotinoWindow()
            .SetTitle("ASTRALIS: The Aetheria Signal")
            .SetUseOsDefaultSize(false)
            .SetSize(1680, 945)
            .SetMinSize(1280, 720)
            .SetResizable(true)
            .SetContextMenuEnabled(false)
            .SetDevToolsEnabled(Environment.GetEnvironmentVariable("ASTRALIS_DEBUG") == "1")
            .SetTemporaryFilesPath(tmp)
            .RegisterWebMessageReceivedHandler((_, message) => HandleNative(window, message))
            .RegisterCustomSchemeHandler("astralis", (object _, string _, string url, out string contentType) =>
            {
                contentType = "text/plain";
                if (url.Contains("quit", StringComparison.OrdinalIgnoreCase) || url.Contains("exit", StringComparison.OrdinalIgnoreCase))
                    TryClose(window);
                return new MemoryStream(Encoding.UTF8.GetBytes("ok"));
            });

        var url = $"http://127.0.0.1:{http.Port}/?v={DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
        window.Load(url);
        window.WaitForClose();
        http.Stop();
    }

    static bool mouseCaptured;

    static void HandleNative(PhotinoWindow? window, string raw)
    {
        var cmd = (raw ?? "").Trim();
        if (cmd.Equals("quit", StringComparison.OrdinalIgnoreCase) || cmd.Equals("exit", StringComparison.OrdinalIgnoreCase))
        {
            TryClose(window);
            return;
        }
        if (cmd.Equals("mouse:lock", StringComparison.OrdinalIgnoreCase))
        {
            SetMouseCapture(window, true);
            return;
        }
        if (cmd.Equals("mouse:unlock", StringComparison.OrdinalIgnoreCase))
        {
            SetMouseCapture(window, false);
            return;
        }
        if (cmd.StartsWith("career:", StringComparison.Ordinal))
        {
            CareerStore.Handle(cmd);
            return;
        }
        SteamBridge.HandleString(cmd);
    }

    static void SetMouseCapture(PhotinoWindow? window, bool on)
    {
        mouseCaptured = on;
        try
        {
            if (on)
            {
                // Soft lock: clip cursor to the game window so look never hits the display edge.
                var hwnd = window?.WindowHandle ?? IntPtr.Zero;
                if (hwnd != IntPtr.Zero && GetClientRect(hwnd, out var rc))
                {
                    var tl = new POINT { X = rc.Left, Y = rc.Top };
                    var br = new POINT { X = rc.Right, Y = rc.Bottom };
                    ClientToScreen(hwnd, ref tl);
                    ClientToScreen(hwnd, ref br);
                    var clip = new RECT { Left = tl.X, Top = tl.Y, Right = br.X, Bottom = br.Y };
                    ClipCursor(ref clip);
                }
                while (ShowCursor(false) >= 0) { }
            }
            else
            {
                ClipCursor(IntPtr.Zero);
                while (ShowCursor(true) < 0) { }
            }
            window?.SendWebMessage($"__mouseCapture:{on.ToString().ToLowerInvariant()}");
        }
        catch { /* ignore */ }
        try
        {
            // Photino may not eval JS from host; JS also polls via pointer + clip.
            window?.SendWebMessage(on ? "mouse-capture-on" : "mouse-capture-off");
        }
        catch { /* ignore */ }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int X, Y; }

    [DllImport("user32.dll")] static extern bool ClipCursor(ref RECT lpRect);
    [DllImport("user32.dll")] static extern bool ClipCursor(IntPtr lpRect);
    [DllImport("user32.dll")] static extern int ShowCursor(bool bShow);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    static void TryClose(PhotinoWindow? window)
    {
        try { SetMouseCapture(window, false); } catch { /* ignore */ }
        try { window?.Close(); } catch { /* ignore */ }
        Environment.Exit(0);
    }

    static string GameRoot()
    {
        var baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var bundled = Path.Combine(baseDir, "www");
        if (File.Exists(Path.Combine(bundled, "index.html"))) return bundled;
        var sidecar = Directory.GetParent(baseDir)?.FullName ?? baseDir;
        if (File.Exists(Path.Combine(sidecar, "index.html"))) return sidecar;
        return bundled;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    static void Fatal(string msg)
    {
        try { MessageBox(IntPtr.Zero, msg, "ASTRALIS", 0x00000010); }
        catch { Console.Error.WriteLine(msg); }
    }
}

[SupportedOSPlatform("windows")]
static class WebView2Runtime
{
    const string Client = @"{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    public static bool IsInstalled()
    {
        foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
        {
            foreach (var path in new[]
            {
                $@"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{Client}",
                $@"SOFTWARE\Microsoft\EdgeUpdate\Clients\{Client}",
            })
            {
                try
                {
                    using var key = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64).OpenSubKey(path)
                        ?? RegistryKey.OpenBaseKey(hive, RegistryView.Registry32).OpenSubKey(path);
                    var pv = key?.GetValue("pv") as string;
                    if (!string.IsNullOrWhiteSpace(pv) && pv != "0.0.0.0") return true;
                }
                catch { /* continue */ }
            }
        }
        return false;
    }
}

static class CareerStore
{
    static string Dir
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ASTRALIS", "saves");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static void Handle(string raw)
    {
        if (raw.StartsWith("career:del:", StringComparison.Ordinal))
        {
            if (int.TryParse(raw["career:del:".Length..].Trim(), out var slot) && slot is >= 0 and <= 2)
            {
                var file = Path.Combine(Dir, $"slot{slot}.json");
                if (File.Exists(file)) File.Delete(file);
            }
            return;
        }
        if (!raw.StartsWith("career:put:", StringComparison.Ordinal)) return;
        var rest = raw["career:put:".Length..];
        var cut = rest.IndexOf(':');
        if (cut < 0) return;
        if (!int.TryParse(rest[..cut], out var n) || n is < 0 or > 2) return;
        var json = rest[(cut + 1)..];
        if (json.Length < 8 || json.Length > 2_000_000 || json[0] != '{') return;
        File.WriteAllText(Path.Combine(Dir, $"slot{n}.json"), json);
    }
}

static class SteamBridge
{
    record Pending(List<string> achievements, Dictionary<string, int> stats);

    static string FilePath
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ASTRALIS");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "steam_pending.json");
        }
    }

    public static void HandleString(string raw)
    {
        if (raw.StartsWith("achieve:", StringComparison.Ordinal)) Unlock(raw["achieve:".Length..]);
        else if (raw.StartsWith("stat:", StringComparison.Ordinal))
        {
            var rest = raw["stat:".Length..];
            var cut = rest.IndexOf(':');
            if (cut > 0 && int.TryParse(rest[(cut + 1)..], out var v)) SetStat(rest[..cut], v);
        }
    }

    static void Unlock(string api)
    {
        var name = api.Trim();
        if (name.Length < 3 || name.Length >= 128) return;
        var p = Load();
        if (!p.achievements.Contains(name)) p.achievements.Add(name);
        Save(p);
    }

    static void SetStat(string api, int value)
    {
        var name = api.Trim();
        if (name.Length < 3 || name.Length >= 128) return;
        var p = Load();
        p.stats[name] = value;
        Save(p);
    }

    static Pending Load()
    {
        try
        {
            var json = File.ReadAllText(FilePath);
            return JsonSerializer.Deserialize<Pending>(json) ?? new Pending([], []);
        }
        catch { return new Pending([], []); }
    }

    static void Save(Pending p)
    {
        try { File.WriteAllText(FilePath, JsonSerializer.Serialize(p)); } catch { /* ignore */ }
    }
}

sealed class LoopbackHttp : IDisposable
{
    readonly string _root;
    HttpListener? _listener;
    CancellationTokenSource? _cts;
    public int Port { get; private set; }

    public LoopbackHttp(string root) { _root = Path.GetFullPath(root); }

    public bool Start(int from = 9010, int to = 9030)
    {
        for (var port = from; port <= to; port++)
        {
            var l = new HttpListener();
            l.Prefixes.Add($"http://127.0.0.1:{port}/");
            try
            {
                l.Start();
                _listener = l;
                Port = port;
                _cts = new CancellationTokenSource();
                _ = Task.Run(() => AcceptLoop(_cts.Token));
                return true;
            }
            catch
            {
                try { l.Close(); } catch { /* ignore */ }
            }
        }
        return false;
    }

    public void Stop()
    {
        try { _cts?.Cancel(); } catch { /* ignore */ }
        try { _listener?.Stop(); } catch { /* ignore */ }
        try { _listener?.Close(); } catch { /* ignore */ }
    }

    public void Dispose() => Stop();

    async Task AcceptLoop(CancellationToken ct)
    {
        var l = _listener;
        if (l == null) return;
        while (!ct.IsCancellationRequested && l.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = await l.GetContextAsync().ConfigureAwait(false); }
            catch { if (ct.IsCancellationRequested) return; continue; }
            _ = Task.Run(() => Handle(ctx), ct);
        }
    }

    void Handle(HttpListenerContext ctx)
    {
        try
        {
            var req = ctx.Request;
            var res = ctx.Response;
            res.Headers["Access-Control-Allow-Origin"] = "*";
            var path = req.Url?.AbsolutePath ?? "/";
            if (path.StartsWith("/__save/", StringComparison.Ordinal))
            {
                HandleSave(req, res, path);
                return;
            }
            if (string.Equals(req.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase) && path.StartsWith("/__storecap/", StringComparison.Ordinal))
            {
                HandleStorecap(req, res, path);
                return;
            }
            if (!string.Equals(req.HttpMethod, "GET", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(req.HttpMethod, "HEAD", StringComparison.OrdinalIgnoreCase))
            {
                Write(res, 405, "text/plain", "Method Not Allowed"u8.ToArray());
                return;
            }
            var file = Resolve(path);
            if (file == null)
            {
                Write(res, 404, "text/plain", "Not Found"u8.ToArray());
                return;
            }
            var mime = Mime(file);
            var cache = mime.Contains("javascript") || mime.Contains("css") || mime.Contains("html")
                ? "no-store, no-cache, must-revalidate" : "public, max-age=86400";
            res.StatusCode = 200;
            res.ContentType = mime;
            res.Headers["Cache-Control"] = cache;
            var info = new FileInfo(file);
            res.ContentLength64 = info.Length;
            if (string.Equals(req.HttpMethod, "HEAD", StringComparison.OrdinalIgnoreCase)) { res.Close(); return; }
            using var fs = File.OpenRead(file);
            fs.CopyTo(res.OutputStream);
            res.Close();
        }
        catch
        {
            try { ctx.Response.Abort(); } catch { /* ignore */ }
        }
    }

    static string SavesDir()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ASTRALIS", "saves");
        Directory.CreateDirectory(dir);
        return dir;
    }

    void HandleSave(HttpListenerRequest req, HttpListenerResponse res, string path)
    {
        var rest = path["/__save/".Length..].Trim('/');
        if (!int.TryParse(rest, out var slot) || slot < 0 || slot > 2)
        {
            Write(res, 400, "text/plain", "bad slot"u8.ToArray());
            return;
        }
        var file = Path.Combine(SavesDir(), $"slot{slot}.json");
        var method = req.HttpMethod.ToUpperInvariant();
        if (method is "GET" or "HEAD")
        {
            if (!File.Exists(file)) { Write(res, 404, "text/plain", "empty"u8.ToArray()); return; }
            var data = File.ReadAllBytes(file);
            Write(res, 200, "application/json", data);
            return;
        }
        if (method == "PUT")
        {
            using var ms = new MemoryStream();
            req.InputStream.CopyTo(ms);
            if (ms.Length < 8 || ms.Length > 2_000_000)
            {
                Write(res, 400, "text/plain", "bad body"u8.ToArray());
                return;
            }
            File.WriteAllBytes(file, ms.ToArray());
            Write(res, 200, "text/plain", "ok"u8.ToArray());
            return;
        }
        if (method == "DELETE")
        {
            if (File.Exists(file)) File.Delete(file);
            Write(res, 200, "text/plain", "ok"u8.ToArray());
            return;
        }
        Write(res, 405, "text/plain", "Method Not Allowed"u8.ToArray());
    }

    void HandleStorecap(HttpListenerRequest req, HttpListenerResponse res, string path)
    {
        var name = path["/__storecap/".Length..].Replace("/", "");
        if (!Regex.IsMatch(name, @"^[A-Za-z0-9._-]{1,80}$") || req.ContentLength64 <= 0)
        {
            Write(res, 400, "text/plain", "bad name"u8.ToArray());
            return;
        }
        using var ms = new MemoryStream();
        req.InputStream.CopyTo(ms);
        var dir = Path.Combine(_root, "steam", "store", "screenshots");
        if (!Directory.Exists(dir))
            dir = Path.GetFullPath(Path.Combine(_root, "..", "steam", "store", "screenshots"));
        Directory.CreateDirectory(dir);
        File.WriteAllBytes(Path.Combine(dir, name), ms.ToArray());
        Write(res, 200, "text/plain", "ok"u8.ToArray());
    }

    string? Resolve(string rawPath)
    {
        var path = string.IsNullOrEmpty(rawPath) || rawPath == "/" ? "/index.html" : rawPath;
        if (path.StartsWith('/')) path = path[1..];
        if (path.Contains('\0') || path.Contains('\\')) return null;
        var parts = path.Split('/', StringSplitOptions.None);
        if (parts.Any(p => p is ".." or "")) return null;
        var full = Path.GetFullPath(Path.Combine(new[] { _root }.Concat(parts).ToArray()));
        if (!(full == _root || full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal))) return null;
        if (File.Exists(full)) return full;
        if (Directory.Exists(full))
        {
            var index = Path.Combine(full, "index.html");
            return File.Exists(index) ? index : null;
        }
        return null;
    }

    static string Mime(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" or ".htm" => "text/html; charset=utf-8",
        ".js" or ".mjs" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" => "application/json",
        ".bin" => "application/octet-stream",
        ".woff2" => "font/woff2",
        ".woff" => "font/woff",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        ".wasm" => "application/wasm",
        ".glb" => "model/gltf-binary",
        ".gltf" => "model/gltf+json",
        ".map" => "application/json",
        _ => "application/octet-stream",
    };

    static void Write(HttpListenerResponse res, int status, string type, byte[] body)
    {
        res.StatusCode = status;
        res.ContentType = type;
        res.ContentLength64 = body.Length;
        res.OutputStream.Write(body, 0, body.Length);
        res.Close();
    }
}
