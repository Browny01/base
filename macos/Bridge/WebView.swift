import Combine
import Network
import SwiftUI
import WebKit

@MainActor
final class WebModel: NSObject, ObservableObject {
    static let homeURL = URL(string: "https://base.lucasbrown.xyz")!

    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var isLoading = true
    @Published private(set) var loadFailed = false
    @Published private(set) var progress: Double = 0

    let webView: WKWebView

    private var observers: [NSKeyValueObservation] = []
    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "app.bridge.web-connectivity")

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        self.webView = webView

        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self

        observers = [
            webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] webView, _ in
                MainActor.assumeIsolated { self?.canGoBack = webView.canGoBack }
            },
            webView.observe(\.canGoForward, options: [.initial, .new]) { [weak self] webView, _ in
                MainActor.assumeIsolated { self?.canGoForward = webView.canGoForward }
            },
            webView.observe(\.isLoading, options: [.initial, .new]) { [weak self] webView, _ in
                MainActor.assumeIsolated { self?.isLoading = webView.isLoading }
            },
            webView.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] webView, _ in
                MainActor.assumeIsolated { self?.progress = webView.estimatedProgress }
            },
        ]

        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                guard let self, self.loadFailed else { return }
                self.goHome()
            }
        }
        pathMonitor.start(queue: monitorQueue)
        goHome()
    }

    deinit { pathMonitor.cancel() }

    func goBack() { webView.goBack() }
    func goForward() { webView.goForward() }
    func reload() {
        loadFailed = false
        if webView.url == nil { goHome() }
        else { webView.reload() }
    }

    func goHome() {
        loadFailed = false
        webView.load(URLRequest(url: Self.homeURL, cachePolicy: .useProtocolCachePolicy))
    }

    func openPath(_ path: String) {
        guard let url = URL(string: path, relativeTo: Self.homeURL)?.absoluteURL else { return }
        loadFailed = false
        webView.load(URLRequest(url: url))
    }

    func openCommandPalette() {
        focusApp()
        webView.evaluateJavaScript("""
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'k', code: 'KeyK', metaKey: true, bubbles: true
        }));
        """)
    }

    func openNewTask() { runHandoff("bridge_open_new_task", path: "/tasks") }
    func openNewProject() { runHandoff("bridge_open_new_project", path: "/projects") }
    func openNewChat() { openPath("/chat") }
    func zoomIn() { webView.pageZoom += 0.1 }
    func zoomOut() { webView.pageZoom = max(0.3, webView.pageZoom - 0.1) }
    func zoomReset() { webView.pageZoom = 1.0 }

    func openCurrentInBrowser() {
        if let url = webView.url { NSWorkspace.shared.open(url) }
    }

    func focusApp() {
        NSApp.activate(ignoringOtherApps: true)
        let window = webView.window ?? NSApp.windows.first
        window?.makeKeyAndOrderFront(nil)
    }

    private func runHandoff(_ key: String, path: String) {
        let script = """
        try { localStorage.setItem('\(key)', '1'); } catch {}
        window.location.href = '\(path)';
        """
        webView.evaluateJavaScript(script) { [weak self] _, error in
            if error != nil { Task { @MainActor in self?.openPath(path) } }
        }
    }

    private func isBridgeHost(_ url: URL?) -> Bool {
        url?.host == Self.homeURL.host
    }

    private func recordFailure(_ error: Error) {
        guard (error as? URLError)?.code != .cancelled else { return }
        loadFailed = true
    }
}

extension WebModel: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let url = navigationAction.request.url
        if navigationAction.navigationType == .linkActivated,
           let url, !isBridgeHost(url), url.scheme?.hasPrefix("http") == true {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadFailed = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        recordFailure(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        recordFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        reload()
    }
}

extension WebModel: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canCreateDirectories = false
        panel.resolvesAliases = true

        let finish: (NSApplication.ModalResponse) -> Void = { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
        if let window = webView.window { panel.beginSheetModal(for: window, completionHandler: finish) }
        else { finish(panel.runModal()) }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if isBridgeHost(url) { webView.load(navigationAction.request) }
        else { NSWorkspace.shared.open(url) }
        return nil
    }
}

struct WebView: NSViewRepresentable {
    let model: WebModel

    func makeNSView(context: Context) -> WKWebView { model.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
