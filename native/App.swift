import Cocoa
import WebKit
import Foundation
import Darwin
import CoreGraphics

// MARK: - Loopback static file server (no Python / no system runtime)

final class LoopbackHTTP {
  let root: URL
  private var listenFD: Int32 = -1
  private var running = false
  private let acceptQueue = DispatchQueue(label: "astralis.http.accept")
  private let workQueue = DispatchQueue(label: "astralis.http.work", attributes: .concurrent)
  private(set) var port: UInt16 = 0

  init(root: URL) { self.root = root.standardizedFileURL }

  func start(preferred: ClosedRange<UInt16> = 9010...9030) -> UInt16? {
    for candidate in preferred {
      if let fd = bindListen(port: candidate) {
        listenFD = fd
        port = candidate
        running = true
        acceptQueue.async { [weak self] in self?.acceptLoop() }
        return candidate
      }
    }
    return nil
  }

  func stop() {
    running = false
    if listenFD >= 0 {
      Darwin.close(listenFD)
      listenFD = -1
    }
  }

  private func bindListen(port: UInt16) -> Int32? {
    let fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
    guard fd >= 0 else { return nil }
    var yes: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
    var nosig: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &nosig, socklen_t(MemoryLayout<Int32>.size))
    var addr = sockaddr_in()
    addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = port.bigEndian
    addr.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let ok = withUnsafePointer(to: &addr) { ptr -> Bool in
      ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
        bind(fd, sockPtr, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0
          && listen(fd, 128) == 0
      }
    }
    if !ok {
      Darwin.close(fd)
      return nil
    }
    return fd
  }

  private func acceptLoop() {
    while running {
      var addr = sockaddr_in()
      var len = socklen_t(MemoryLayout<sockaddr_in>.size)
      let client = withUnsafeMutablePointer(to: &addr) { ptr -> Int32 in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
          accept(self.listenFD, sockPtr, &len)
        }
      }
      if client < 0 {
        if !running { return }
        continue
      }
      var nosig: Int32 = 1
      setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &nosig, socklen_t(MemoryLayout<Int32>.size))
      workQueue.async { self.handle(client) }
    }
  }

  private func handle(_ fd: Int32) {
    defer { Darwin.close(fd) }
    guard let req = readRequest(fd) else {
      writeRaw(fd, http(status: 400, type: "text/plain", body: Data("Bad Request".utf8)))
      return
    }
    if req.path.hasPrefix("/__save/") {
      handleCareerSave(fd, req)
      return
    }
    if req.method == "POST" && req.path.hasPrefix("/__storecap/") {
      handleStorecap(fd, req)
      return
    }
    if req.method != "GET" && req.method != "HEAD" {
      writeRaw(fd, http(status: 405, type: "text/plain", body: Data("Method Not Allowed".utf8)))
      return
    }
    guard let file = resolve(req.path) else {
      writeRaw(fd, http(status: 404, type: "text/plain", body: Data("Not Found".utf8)))
      return
    }
    let mime = mimeType(file.path)
    guard let handle = try? FileHandle(forReadingFrom: file) else {
      writeRaw(fd, http(status: 404, type: "text/plain", body: Data("Not Found".utf8)))
      return
    }
    defer { try? handle.close() }
    let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    let cache = (mime.contains("javascript") || mime.contains("css") || mime.contains("html"))
      ? "no-store, no-cache, must-revalidate" : "public, max-age=86400"
    let head = Data("""
    HTTP/1.1 200 OK\r
    Content-Type: \(mime)\r
    Content-Length: \(size)\r
    Connection: close\r
    Cache-Control: \(cache)\r
    Access-Control-Allow-Origin: *\r
    \r

    """.utf8)
    writeRaw(fd, head)
    if req.method == "HEAD" { return }
    while true {
      let chunk = handle.readData(ofLength: 256 * 1024)
      if chunk.isEmpty { break }
      if !writeRaw(fd, chunk) { break }
    }
  }

  private struct HTTPReq { let method: String; let path: String; let body: Data }

  private func readRequest(_ fd: Int32) -> HTTPReq? {
    var data = Data()
    var buf = [UInt8](repeating: 0, count: 16 * 1024)
    var headerEnd: Range<Data.Index>?
    while data.count < 32 * 1024 {
      let n = Darwin.read(fd, &buf, buf.count)
      if n <= 0 { break }
      data.append(contentsOf: buf[0..<n])
      headerEnd = data.range(of: Data([13, 10, 13, 10]))
      if headerEnd != nil { break }
    }
    guard let end = headerEnd, let head = String(data: data[data.startIndex..<end.lowerBound], encoding: .utf8) else { return nil }
    let lines = head.split(separator: "\r\n", omittingEmptySubsequences: false)
    guard let first = lines.first else { return nil }
    let parts = first.split(separator: " ")
    guard parts.count >= 2 else { return nil }
    var path = String(parts[1])
    if let q = path.firstIndex(of: "?") { path = String(path[..<q]) }
    path = path.removingPercentEncoding ?? path
    var headers: [String: String] = [:]
    for line in lines.dropFirst() {
      guard let colon = line.firstIndex(of: ":") else { continue }
      let k = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
      let v = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      headers[k] = v
    }
    let want = Int(headers["content-length"] ?? "0") ?? 0
    var body = Data()
    if end.upperBound < data.endIndex { body.append(data[end.upperBound...]) }
    while body.count < want {
      let n = Darwin.read(fd, &buf, buf.count)
      if n <= 0 { break }
      body.append(contentsOf: buf[0..<n])
    }
    if want > 0 && body.count > want { body = Data(body.prefix(want)) }
    return HTTPReq(method: String(parts[0]).uppercased(), path: path, body: body)
  }

  static func savesDir() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
    let dir = base.appendingPathComponent("ASTRALIS/saves", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func handleCareerSave(_ fd: Int32, _ req: HTTPReq) {
    let rest = String(req.path.dropFirst("/__save/".count))
    guard let slot = Int(rest), (0...2).contains(slot) else {
      writeRaw(fd, http(status: 400, type: "text/plain", body: Data("bad slot".utf8)))
      return
    }
    let file = Self.savesDir().appendingPathComponent("slot\(slot).json")
    if req.method == "GET" || req.method == "HEAD" {
      guard let data = try? Data(contentsOf: file), !data.isEmpty else {
        writeRaw(fd, http(status: 404, type: "text/plain", body: Data("empty".utf8)))
        return
      }
      writeRaw(fd, http(status: 200, type: "application/json", body: data))
      return
    }
    if req.method == "PUT" {
      guard req.body.count > 8, req.body.count < 2_000_000 else {
        writeRaw(fd, http(status: 400, type: "text/plain", body: Data("bad body".utf8)))
        return
      }
      do {
        try req.body.write(to: file, options: .atomic)
        writeRaw(fd, http(status: 200, type: "text/plain", body: Data("ok".utf8)))
      } catch {
        writeRaw(fd, http(status: 500, type: "text/plain", body: Data("write failed".utf8)))
      }
      return
    }
    if req.method == "DELETE" {
      try? FileManager.default.removeItem(at: file)
      writeRaw(fd, http(status: 200, type: "text/plain", body: Data("ok".utf8)))
      return
    }
    writeRaw(fd, http(status: 405, type: "text/plain", body: Data("Method Not Allowed".utf8)))
  }

  private func handleStorecap(_ fd: Int32, _ req: HTTPReq) {
    let raw = String(req.path.dropFirst("/__storecap/".count))
    let name = raw.replacingOccurrences(of: "/", with: "")
    let okName = name.range(of: #"^[A-Za-z0-9._-]{1,80}$"#, options: .regularExpression) != nil
    guard okName, !req.body.isEmpty else {
      writeRaw(fd, http(status: 400, type: "text/plain", body: Data("bad name".utf8)))
      return
    }
    var dir = root.appendingPathComponent("steam/store/screenshots", isDirectory: true)
    if !FileManager.default.fileExists(atPath: dir.path) {
      dir = root.deletingLastPathComponent().appendingPathComponent("steam/store/screenshots", isDirectory: true)
    }
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let dest = dir.appendingPathComponent(name)
    do {
      try req.body.write(to: dest, options: .atomic)
      writeRaw(fd, http(status: 200, type: "text/plain", body: Data("ok".utf8)))
      NSLog("[ASTRALIS] storecap wrote %@", dest.path)
    } catch {
      writeRaw(fd, http(status: 500, type: "text/plain", body: Data("write failed".utf8)))
    }
  }

  private func resolve(_ rawPath: String) -> URL? {
    var path = rawPath
    if path.isEmpty || path == "/" { path = "/index.html" }
    if path.hasPrefix("/") { path.removeFirst() }
    if path.contains("\0") || path.contains("\\") { return nil }
    let parts = path.split(separator: "/").map(String.init)
    if parts.contains("..") || parts.contains("") { return nil }
    var url = root
    for p in parts { url.appendPathComponent(p, isDirectory: false) }
    url = url.standardizedFileURL
    let rootPath = root.path
    let filePath = url.path
    guard filePath == rootPath || filePath.hasPrefix(rootPath + "/") else { return nil }
    var isDir: ObjCBool = false
    if FileManager.default.fileExists(atPath: filePath, isDirectory: &isDir) {
      if isDir.boolValue {
        let index = url.appendingPathComponent("index.html")
        return FileManager.default.fileExists(atPath: index.path) ? index : nil
      }
      return url
    }
    return nil
  }

  private func mimeType(_ path: String) -> String {
    switch (path as NSString).pathExtension.lowercased() {
    case "html", "htm": return "text/html; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json"
    case "bin": return "application/octet-stream"
    case "woff2": return "font/woff2"
    case "woff": return "font/woff"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    case "svg": return "image/svg+xml"
    case "wasm": return "application/wasm"
    case "glb": return "model/gltf-binary"
    case "gltf": return "model/gltf+json"
    case "map": return "application/json"
    default: return "application/octet-stream"
    }
  }

  private func http(status: Int, type: String, body: Data) -> Data {
    let reason = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed" : "Error"
    var d = Data("HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".utf8)
    d.append(body)
    return d
  }

  @discardableResult
  private func writeRaw(_ fd: Int32, _ data: Data) -> Bool {
    data.withUnsafeBytes { raw in
      var sent = 0
      let total = data.count
      let base = raw.bindMemory(to: UInt8.self).baseAddress
      while sent < total {
        let n = Darwin.write(fd, base! + sent, total - sent)
        if n <= 0 { return false }
        sent += n
      }
      return true
    }
  }
}

// MARK: - Steam achievement queue (link steam_api later)

enum SteamBridge {
  private struct Pending: Codable {
    var achievements: [String]
    var stats: [String: Int]
  }

  private static let file: URL = {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    let dir = base.appendingPathComponent("ASTRALIS", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent("steam_pending.json")
  }()

  static func handleString(_ raw: String) {
    if raw.hasPrefix("achieve:") {
      unlock(String(raw.dropFirst("achieve:".count)))
    } else if raw.hasPrefix("stat:") {
      let rest = String(raw.dropFirst("stat:".count))
      let parts = rest.split(separator: ":", maxSplits: 1).map(String.init)
      if parts.count == 2, let v = Int(parts[1]) { setStat(parts[0], value: v) }
    }
  }

  static func unlock(_ api: String) {
    let name = api.trimmingCharacters(in: .whitespacesAndNewlines)
    guard name.count >= 3, name.count < 128 else { return }
    var p = load()
    if !p.achievements.contains(name) { p.achievements.append(name) }
    save(p)
    NSLog("[ASTRALIS] achievement %@", name)
  }

  static func setStat(_ api: String, value: Int) {
    let name = api.trimmingCharacters(in: .whitespacesAndNewlines)
    guard name.count >= 3, name.count < 128 else { return }
    var p = load()
    p.stats[name] = value
    save(p)
  }

  private static func load() -> Pending {
    guard let data = try? Data(contentsOf: file),
          let p = try? JSONDecoder().decode(Pending.self, from: data) else {
      return Pending(achievements: [], stats: [:])
    }
    return p
  }

  private static func save(_ p: Pending) {
    guard let data = try? JSONEncoder().encode(p) else { return }
    try? data.write(to: file, options: .atomic)
  }
}

// MARK: - Quiet WebView (WKWebView otherwise NSBeeps for WASD / Space / arrows)

final class GameWebView: WKWebView {
  override var acceptsFirstResponder: Bool { true }

  override func doCommand(by selector: Selector) {
    // Default NSResponder walks to noResponderFor: which NSBeeps.
  }

  override func noResponder(for eventSelector: Selector) {
    // Never beep when a game key has no text field.
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    // Cmd+Q / Cmd+H / Cmd+M / Cmd+F must reach the menu.
    // Do NOT swallow Escape here — that races NSWindow fullscreen-exit
    // and can also steal the key from JS pause handling.
    if event.modifierFlags.contains(.command) {
      return super.performKeyEquivalent(with: event)
    }
    return false
  }

  override func flagsChanged(with event: NSEvent) {
    // WebKit synthesizes Shift keyup while the key is still down. Push the
    // real AppKit modifier bit so JS nitro stays latched.
    let down = event.modifierFlags.contains(.shift)
    evaluateJavaScript(
      "window.__astralisNativeShift=\(down);if(window.__astralisShift)window.__astralisShift(\(down));",
      completionHandler: nil)
    super.flagsChanged(with: event)
  }
}

final class GameWindow: NSWindow {
  override func cancelOperation(_ sender: Any?) {
    // macOS fullscreen treats Esc as “leave full screen”. In ASTRALIS
    // Esc is pause / close panel — never collapse the window.
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    if event.keyCode == 53 { return false }
    return super.performKeyEquivalent(with: event)
  }

  override func keyDown(with event: NSEvent) {
    // Swallow AppKit fallthrough. First responder already got the event.
  }

  override func flagsChanged(with event: NSEvent) {
    let down = event.modifierFlags.contains(.shift)
    for view in contentView?.subviews ?? [] {
      if let wv = view as? WKWebView {
        wv.evaluateJavaScript(
          "window.__astralisNativeShift=\(down);if(window.__astralisShift)window.__astralisShift(\(down));",
          completionHandler: nil)
      }
    }
    super.flagsChanged(with: event)
  }

  override func noResponder(for eventSelector: Selector) {}
}

// MARK: - Application

enum CareerStore {
  static func handle(_ raw: String) {
    if raw.hasPrefix("career:del:") {
      let rest = String(raw.dropFirst("career:del:".count))
      guard let slot = Int(rest), (0...2).contains(slot) else { return }
      let file = LoopbackHTTP.savesDir().appendingPathComponent("slot\(slot).json")
      try? FileManager.default.removeItem(at: file)
      return
    }
    guard raw.hasPrefix("career:put:") else { return }
    let rest = String(raw.dropFirst("career:put:".count))
    guard let colon = rest.firstIndex(of: ":") else { return }
    guard let slot = Int(rest[..<colon]), (0...2).contains(slot) else { return }
    let json = String(rest[rest.index(after: colon)...])
    guard json.count > 8, json.count < 2_000_000, json.first == "{" else { return }
    let file = LoopbackHTTP.savesDir().appendingPathComponent("slot\(slot).json")
    try? json.data(using: .utf8)?.write(to: file, options: .atomic)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var webView: WKWebView!
  var server: LoopbackHTTP?
  var port: UInt16 = 0
  var shiftMonitor: Any?
  var mouseMonitor: Any?
  var lastNativeShift: Bool?
  var screenObserver: NSObjectProtocol?
  var mouseCaptured = false

  func gameRoot() -> URL {
    let bundled = Bundle.main.resourceURL?.appendingPathComponent("www", isDirectory: true)
    if let bundled, FileManager.default.fileExists(atPath: bundled.appendingPathComponent("index.html").path) {
      return bundled
    }
    let sidecar = Bundle.main.bundleURL.deletingLastPathComponent()
    let www = sidecar.appendingPathComponent("www", isDirectory: true)
    if FileManager.default.fileExists(atPath: www.appendingPathComponent("index.html").path) {
      return www
    }
    return sidecar
  }

  func boot() {
    let root = gameRoot()
    let index = root.appendingPathComponent("index.html")
    guard FileManager.default.fileExists(atPath: index.path) else {
      alert("ASTRALIS is missing its game files.\nExpected index.html in:\n\(root.path)")
      NSApp.terminate(nil)
      return
    }

    let http = LoopbackHTTP(root: root)
    guard let p = http.start() else {
      alert("Could not bind the local game server on 127.0.0.1.")
      NSApp.terminate(nil)
      return
    }
    server = http
    port = p

    installMenu()

    let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1680, height: 945)
    let w = min(1680, screen.width)
    let h = min(945, screen.height)
    window = GameWindow(
      contentRect: NSRect(x: 0, y: 0, width: w, height: h),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    window.title = "ASTRALIS: The Aetheria Signal"
    window.titlebarAppearsTransparent = true
    if #available(macOS 11.0, *) { window.titleVisibility = .hidden }
    window.minSize = NSSize(width: 1280, height: 720)
    window.backgroundColor = NSColor(calibratedRed: 0.02, green: 0.03, blue: 0.05, alpha: 1)
    window.center()
    window.isReleasedWhenClosed = false
    window.collectionBehavior = [.fullScreenPrimary]

    let cfg = WKWebViewConfiguration()
    cfg.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
    if #available(macOS 11.0, *) {
      cfg.defaultWebpagePreferences.allowsContentJavaScript = true
    }
    // First click in-page still resumes AudioContext; this stops WKWebView
    // from treating Web Audio as media that needs a second permission.
    cfg.mediaTypesRequiringUserActionForPlayback = []
    cfg.websiteDataStore = WKWebsiteDataStore.default()
    cfg.userContentController.add(self, name: "astralis")
    let hzJs = "window.__astralisDisplayHz=\(displayHz());"
    cfg.userContentController.addUserScript(WKUserScript(source: hzJs, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    webView = GameWebView(frame: window.contentView!.bounds, configuration: cfg)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = false
    webView.allowsMagnification = false
    webView.autoresizingMask = [.width, .height]
    webView.wantsLayer = true
    webView.layer?.isOpaque = true
    webView.layer?.backgroundColor = NSColor.black.cgColor
    if #available(macOS 12.0, *) {
      webView.underPageBackgroundColor = NSColor(calibratedRed: 0.02, green: 0.03, blue: 0.05, alpha: 1)
    }
    if #available(macOS 13.3, *) {
      webView.isInspectable = ProcessInfo.processInfo.environment["ASTRALIS_DEBUG"] == "1"
    }
    window.contentView!.addSubview(webView)
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(webView)
    NSApp.activate(ignoringOtherApps: true)
    installShiftMonitor()
    installScreenWatch()

    let url = URL(string: "http://127.0.0.1:\(port)/?v=\(Int(Date().timeIntervalSince1970))")!
    DispatchQueue.global(qos: .userInitiated).async {
      for _ in 0..<80 {
        if let c = try? Data(contentsOf: url), !c.isEmpty { break }
        Thread.sleep(forTimeInterval: 0.05)
      }
      DispatchQueue.main.async {
        self.webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
      }
    }
  }

  func installMenu() {
    let main = NSMenu()
    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About ASTRALIS: The Aetheria Signal", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Hide ASTRALIS", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
    hideOthers.keyEquivalentModifierMask = [.command, .option]
    appMenu.addItem(hideOthers)
    appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Quit ASTRALIS", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    main.addItem(appItem)

    let viewItem = NSMenuItem()
    let viewMenu = NSMenu(title: "View")
    viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
    viewItem.submenu = viewMenu
    main.addItem(viewItem)

    let winItem = NSMenuItem()
    let winMenu = NSMenu(title: "Window")
    winMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    winMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    winItem.submenu = winMenu
    main.addItem(winItem)

    NSApp.mainMenu = main
  }

  func displayHz() -> Int {
    let hz = NSScreen.main?.maximumFramesPerSecond ?? 60
    return hz > 0 ? hz : 60
  }

  func pushDisplayHz() {
    let js = "window.__astralisDisplayHz=\(displayHz());"
    webView?.evaluateJavaScript(js, completionHandler: nil)
  }

  func installScreenWatch() {
    if screenObserver != nil { return }
    screenObserver = NotificationCenter.default.addObserver(
      forName: NSApplication.didChangeScreenParametersNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.pushDisplayHz()
    }
  }

  func installShiftMonitor() {
    if shiftMonitor != nil { return }
    shiftMonitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown, .keyUp]) { [weak self] event in
      self?.pushNativeShift(event.modifierFlags.contains(.shift))
      return event
    }
  }

  func installMouseMonitor() {
    if mouseMonitor != nil { return }
    mouseMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged]) { [weak self] event in
      guard let self, self.mouseCaptured else { return event }
      let dx = event.deltaX
      let dy = event.deltaY
      if abs(dx) < 0.0001 && abs(dy) < 0.0001 { return event }
      let js = "if(window.__astralisMouseDelta)window.__astralisMouseDelta(\(dx),\(dy));"
      self.webView?.evaluateJavaScript(js, completionHandler: nil)
      return event
    }
  }

  func setMouseCapture(_ on: Bool) {
    if mouseCaptured == on { return }
    mouseCaptured = on
    installMouseMonitor()
    // Decouple hardware mouse from the cursor so movement never hits the display edge.
    CGAssociateMouseAndMouseCursorPosition(boolean_t(on ? 0 : 1))
    if on {
      NSCursor.hide()
      if let win = webView?.window {
        let frame = win.frame
        let screen = win.screen ?? NSScreen.main
        let top = screen?.frame.maxY ?? frame.maxY
        CGWarpMouseCursorPosition(CGPoint(x: frame.midX, y: top - frame.midY))
      }
    } else {
      NSCursor.unhide()
    }
    let js = "if(window.__astralisMouseCapture)window.__astralisMouseCapture(\(on ? "true" : "false"));"
    webView?.evaluateJavaScript(js, completionHandler: nil)
  }

  func pushNativeShift(_ down: Bool, force: Bool = false) {
    if !force, lastNativeShift == down { return }
    lastNativeShift = down
    let js = "window.__astralisNativeShift=\(down);if(window.__astralisShift)window.__astralisShift(\(down));"
    webView?.evaluateJavaScript(js, completionHandler: nil)
  }

  func applicationDidBecomeActive(_ notification: Notification) {
    pushNativeShift(NSEvent.modifierFlags.contains(.shift), force: true)
  }

  func applicationDidResignActive(_ notification: Notification) {
    pushNativeShift(false, force: true)
    if mouseCaptured { setMouseCapture(false) }
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    if window == nil { boot() }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func applicationWillTerminate(_ notification: Notification) {
    if mouseCaptured { setMouseCapture(false) }
    if let monitor = shiftMonitor {
      NSEvent.removeMonitor(monitor)
      shiftMonitor = nil
    }
    if let monitor = mouseMonitor {
      NSEvent.removeMonitor(monitor)
      mouseMonitor = nil
    }
    if let obs = screenObserver {
      NotificationCenter.default.removeObserver(obs)
      screenObserver = nil
    }
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "astralis")
    server?.stop()
    server = nil
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "astralis" else { return }
    if let raw = message.body as? String {
      let cmd = raw.lowercased()
      if cmd == "quit" || cmd == "exit" {
        DispatchQueue.main.async { NSApp.terminate(nil) }
        return
      }
      if cmd == "mouse:lock" {
        DispatchQueue.main.async { self.setMouseCapture(true) }
        return
      }
      if cmd == "mouse:unlock" {
        DispatchQueue.main.async { self.setMouseCapture(false) }
        return
      }
      if raw.hasPrefix("career:put:") || raw.hasPrefix("career:del:") {
        CareerStore.handle(raw)
        return
      }
      SteamBridge.handleString(raw)
    }
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    if url.scheme == "astralis" {
      if url.host == "quit" || url.host == "exit" {
        DispatchQueue.main.async { NSApp.terminate(nil) }
      }
      decisionHandler(.cancel)
      return
    }
    if url.host == "127.0.0.1" || url.host == "localhost" {
      decisionHandler(.allow)
      return
    }
    decisionHandler(.cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    window?.makeFirstResponder(webView)
    pushNativeShift(NSEvent.modifierFlags.contains(.shift), force: true)
    pushDisplayHz()
  }

  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    return nil
  }

  func alert(_ msg: String) {
    let a = NSAlert()
    a.messageText = "ASTRALIS: The Aetheria Signal"
    a.informativeText = msg
    a.runModal()
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
delegate.boot()
app.run()
