import SwiftUI
import Combine
import Sparkle
import ApplicationServices

@main
struct BridgeApp: App {
    @StateObject private var model = WebModel()

    // Sparkle updater. `startingUpdater: true` means it checks in the background
    // on launch (and every SUScheduledCheckInterval) and prompts when a new
    // version is available; the menu item below triggers a manual check.
    private let updaterController = SPUStandardUpdaterController(
        startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
                .background(WindowConfigurator())
                .onAppear { BridgeGlobalKey.shared.start(model: model) }
        }
        .windowResizability(.contentMinSize)
        .defaultSize(width: 1180, height: 800)
        .commands {
            CommandGroup(after: .appInfo) {
                CheckForUpdatesView(updater: updaterController.updater)
            }
            BridgeCommands(model: model)
        }
    }
}

/// "Check for Updates…" menu item under the Bridge app menu. It disables itself
/// while a check is already in flight (Sparkle publishes `canCheckForUpdates`).
struct CheckForUpdatesView: View {
    @ObservedObject private var checker: CheckForUpdatesViewModel
    private let updater: SPUUpdater

    init(updater: SPUUpdater) {
        self.updater = updater
        self.checker = CheckForUpdatesViewModel(updater: updater)
    }

    var body: some View {
        Button("Check for Updates…") { updater.checkForUpdates() }
            .disabled(!checker.canCheckForUpdates)
    }
}

@MainActor
private final class CheckForUpdatesViewModel: ObservableObject {
    @Published var canCheckForUpdates = false
    init(updater: SPUUpdater) {
        updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)
    }
}

/// Native menu-bar commands wired to the web view. These give the app real Mac
/// muscle memory — ⌘R to reload, ⌘[ / ⌘] to navigate, ⌘+/- to zoom.
struct BridgeCommands: Commands {
    @ObservedObject var model: WebModel

    var body: some Commands {
        // Replace the default "New Window" noise with Bridge navigation.
        CommandGroup(replacing: .newItem) {
            Button("Home") { model.goHome() }
                .keyboardShortcut("H", modifiers: [.command, .shift])
        }

        CommandMenu("View") {
            Button("Reload") { model.reload() }
                .keyboardShortcut("R", modifiers: .command)
            Divider()
            Button("Actual Size") { model.zoomReset() }
                .keyboardShortcut("0", modifiers: .command)
            Button("Zoom In") { model.zoomIn() }
                .keyboardShortcut("+", modifiers: .command)
            Button("Zoom Out") { model.zoomOut() }
                .keyboardShortcut("-", modifiers: .command)
        }

        CommandMenu("History") {
            Button("Back") { model.goBack() }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(!model.canGoBack)
            Button("Forward") { model.goForward() }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(!model.canGoForward)
            Divider()
            Button("Open in Browser") { model.openCurrentInBrowser() }
        }
    }
}

/// Tunes the host `NSWindow`: unified dark titlebar that blends into the app.
struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.backgroundColor = NSColor(red: 0.039, green: 0.039, blue: 0.043, alpha: 1)
            window.isMovableByWindowBackground = false
        }
        return view
    }
    func updateNSView(_ nsView: NSView, context: Context) {}
}

/// Watches the Mac Globe/Fn key globally. A tap brings Bridge forward; holding it
/// opens a compact native action menu.
@MainActor
final class BridgeGlobalKey: NSObject {
    static let shared = BridgeGlobalKey()

    private weak var model: WebModel?
    private var localMonitor: Any?
    private var globalMonitor: Any?
    private var holdTimer: Timer?
    private var isFunctionDown = false
    private var didShowMenu = false

    private let holdDelay: TimeInterval = 0.38

    func start(model: WebModel) {
        self.model = model
        guard localMonitor == nil, globalMonitor == nil else { return }
        requestAccessibilityTrustIfNeeded()

        localMonitor = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            self?.handle(event)
            return event
        }

        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            Task { @MainActor in self?.handle(event) }
        }
    }

    private func handle(_ event: NSEvent) {
        let functionIsDown = event.modifierFlags.contains(.function)

        if functionIsDown && !isFunctionDown {
            isFunctionDown = true
            didShowMenu = false
            holdTimer?.invalidate()
            holdTimer = Timer.scheduledTimer(withTimeInterval: holdDelay, repeats: false) { [weak self] _ in
                Task { @MainActor in self?.showHoldMenu() }
            }
            return
        }

        if !functionIsDown && isFunctionDown {
            isFunctionDown = false
            holdTimer?.invalidate()
            holdTimer = nil

            if !didShowMenu {
                model?.focusApp()
            }
        }
    }

    private func showHoldMenu() {
        guard isFunctionDown else { return }
        didShowMenu = true
        model?.focusApp()

        let menu = NSMenu(title: "Bridge")
        addItem("Search Bridge", action: #selector(openCommandPalette), to: menu)
        menu.addItem(.separator())
        addItem("New Chat", action: #selector(openNewChat), to: menu)
        addItem("New Task", action: #selector(openNewTask), to: menu)
        addItem("New Project", action: #selector(openNewProject), to: menu)
        menu.addItem(.separator())
        addItem("Dashboard", action: #selector(openDashboard), to: menu)
        addItem("Tasks", action: #selector(openTasks), to: menu)
        addItem("Projects", action: #selector(openProjects), to: menu)
        addItem("Notes", action: #selector(openNotes), to: menu)
        menu.addItem(.separator())
        addItem("Reload", action: #selector(reload), to: menu)
        addItem("Open Current Page in Browser", action: #selector(openInBrowser), to: menu)

        menu.popUp(positioning: nil, at: NSEvent.mouseLocation, in: nil)
    }

    private func requestAccessibilityTrustIfNeeded() {
        guard !AXIsProcessTrusted() else { return }
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)
    }

    private func addItem(_ title: String, action: Selector, to menu: NSMenu) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        menu.addItem(item)
    }

    @objc private func openCommandPalette() { model?.openCommandPalette() }
    @objc private func openNewChat() { model?.focusApp(); model?.openNewChat() }
    @objc private func openNewTask() { model?.focusApp(); model?.openNewTask() }
    @objc private func openNewProject() { model?.focusApp(); model?.openNewProject() }
    @objc private func openDashboard() { model?.focusApp(); model?.goHome() }
    @objc private func openTasks() { model?.focusApp(); model?.openPath("/tasks") }
    @objc private func openProjects() { model?.focusApp(); model?.openPath("/projects") }
    @objc private func openNotes() { model?.focusApp(); model?.openPath("/notes") }
    @objc private func reload() { model?.reload() }
    @objc private func openInBrowser() { model?.openCurrentInBrowser() }
}
