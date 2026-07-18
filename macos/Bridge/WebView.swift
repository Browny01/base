import SwiftUI
import WebKit

/// Owns the single `WKWebView` that renders the live Bridge web app and mirrors
/// its navigation state into `@Published` properties so SwiftUI menus and the
/// loading overlay can react. The window is a thin native shell — every Vercel
/// deploy of the web app updates what shows here, no rebuild required.
@MainActor
final class WebModel: NSObject, ObservableObject {
    /// The production Bridge web app. Keep this in sync with `capacitor.config.ts`.
    static let homeURL = URL(string: "https://bridge-ten-lovat.vercel.app")!

    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var isLoading = true
    @Published private(set) var progress: Double = 0

    let webView: WKWebView

    private var observers: [NSKeyValueObservation] = []

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // persist login/session across launches
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.allowsBackForwardNavigationGestures = true
        wv.allowsMagnification = true
        wv.setValue(false, forKey: "drawsBackground") // let the dark window show through
        if #available(macOS 13.3, *) { wv.isInspectable = true }
        self.webView = wv

        super.init()
        wv.navigationDelegate = self
        wv.uiDelegate = self

        observers = [
            wv.observe(\.canGoBack, options: [.initial, .new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.canGoBack = wv.canGoBack }
            },
            wv.observe(\.canGoForward, options: [.initial, .new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.canGoForward = wv.canGoForward }
            },
            wv.observe(\.isLoading, options: [.initial, .new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.isLoading = wv.isLoading }
            },
            wv.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.progress = wv.estimatedProgress }
            },
        ]

        wv.load(URLRequest(url: Self.homeURL))
    }

    // MARK: Actions (wired to the menu bar)

    func goBack() { webView.goBack() }
    func goForward() { webView.goForward() }
    func reload() { webView.reload() }
    func goHome() { webView.load(URLRequest(url: Self.homeURL)) }
    func openPath(_ path: String) {
        guard let url = URL(string: path, relativeTo: Self.homeURL)?.absoluteURL else { return }
        webView.load(URLRequest(url: url))
    }

    func openCommandPalette() {
        focusApp()
        let script = """
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'k',
          code: 'KeyK',
          metaKey: true,
          bubbles: true
        }));
        """
        webView.evaluateJavaScript(script)
    }

    func openNewTask() {
        runHandoff("bridge_open_new_task", path: "/tasks")
    }

    func openNewProject() {
        runHandoff("bridge_open_new_project", path: "/projects")
    }

    func openNewChat() {
        openPath("/chat")
    }

    func zoomIn() { webView.pageZoom += 0.1 }
    func zoomOut() { webView.pageZoom = max(0.3, webView.pageZoom - 0.1) }
    func zoomReset() { webView.pageZoom = 1.0 }

    func openCurrentInBrowser() {
        if let url = webView.url { NSWorkspace.shared.open(url) }
    }

    func focusApp() {
        NSApp.activate(ignoringOtherApps: true)
        webView.window?.makeKeyAndOrderFront(nil)
        if webView.window == nil, let window = NSApp.windows.first {
            window.makeKeyAndOrderFront(nil)
        }
    }

    private func runHandoff(_ key: String, path: String) {
        let script = """
        try { localStorage.setItem('\(key)', '1'); } catch {}
        window.location.href = '\(path)';
        """
        webView.evaluateJavaScript(script) { [weak self] _, error in
            if error != nil {
                Task { @MainActor in self?.openPath(path) }
            }
        }
    }

    private func isBridgeHost(_ url: URL?) -> Bool {
        guard let host = url?.host else { return false }
        return host == Self.homeURL.host
    }
}

// MARK: - Navigation

extension WebModel: WKNavigationDelegate {
    /// Keep in-app navigation to the Bridge domain; hand off links to other
    /// sites (docs, external references) to the user's default browser.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if navigationAction.navigationType == .linkActivated,
           let url, !isBridgeHost(url), url.scheme?.hasPrefix("http") == true {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

// MARK: - target="_blank" and window.open

extension WebModel: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canCreateDirectories = false
        panel.resolvesAliases = true

        let finish: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK else {
                completionHandler(nil)
                return
            }
            completionHandler(panel.urls)
        }

        if let window = webView.window {
            panel.beginSheetModal(for: window, completionHandler: finish)
        } else {
            finish(panel.runModal())
        }
    }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if isBridgeHost(url) {
            webView.load(navigationAction.request) // keep Bridge links in-app
        } else {
            NSWorkspace.shared.open(url) // pop external links to the browser
        }
        return nil
    }
}

/// SwiftUI bridge for the model's `WKWebView`.
struct WebView: NSViewRepresentable {
    let model: WebModel
    func makeNSView(context: Context) -> WKWebView { model.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
