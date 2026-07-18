import Carbon.HIToolbox
import Combine
import Sparkle
import SwiftUI

@main
struct BridgeApp: App {
    @StateObject private var model = WebModel()
    @StateObject private var store = BridgeStore()

    private let updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: nil,
        userDriverDelegate: nil
    )

    var body: some Scene {
        WindowGroup {
            ContentView(model: model, store: store)
                .background(WindowConfigurator())
                .onAppear { BridgeGlobalShortcut.shared.start() }
        }
        .windowResizability(.contentMinSize)
        .defaultSize(width: 1180, height: 800)
        .commands {
            CommandGroup(after: .appInfo) {
                CheckForUpdatesView(updater: updaterController.updater)
            }
            BridgeCommands(model: model)
            CommandMenu("Sync") {
                Button("Sync Offline Changes") { Task { await store.sync() } }
                    .keyboardShortcut("R", modifiers: [.command, .shift])
            }
        }
    }
}

struct BridgeCommands: Commands {
    @ObservedObject var model: WebModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("Show Bridge") { BridgeGlobalShortcut.shared.activate() }
                .keyboardShortcut(" ", modifiers: [.control, .option])
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

struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.backgroundColor = NSColor(red: 0.039, green: 0.039, blue: 0.043, alpha: 1)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

/// Carbon handles the real global shortcut without Accessibility permission.
/// Fn/Globe remains as a convenience fallback for existing Bridge installs.
@MainActor
final class BridgeGlobalShortcut {
    static let shared = BridgeGlobalShortcut()

    private var hotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private var localMonitor: Any?
    private var globalMonitor: Any?
    private var isFunctionDown = false

    func start() {
        guard hotKey == nil else { return }

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, _ in
                guard let event else { return OSStatus(eventNotHandledErr) }
                var identifier = EventHotKeyID()
                let status = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &identifier
                )
                guard status == noErr, identifier.id == 1 else { return OSStatus(eventNotHandledErr) }
                Task { @MainActor in BridgeGlobalShortcut.shared.activate() }
                return noErr
            },
            1,
            &eventType,
            nil,
            &handler
        )

        let identifier = EventHotKeyID(signature: OSType(0x42524447), id: 1) // BRDG
        RegisterEventHotKey(
            UInt32(kVK_Space),
            UInt32(controlKey | optionKey),
            identifier,
            GetApplicationEventTarget(),
            0,
            &hotKey
        )

        localMonitor = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            self?.handleFunctionKey(event)
            return event
        }
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            Task { @MainActor in self?.handleFunctionKey(event) }
        }
    }

    func activate() {
        NSApp.activate(ignoringOtherApps: true)
        let window = NSApp.windows.first { $0.canBecomeKey && $0.isVisible } ?? NSApp.windows.first
        window?.makeKeyAndOrderFront(nil)
    }

    private func handleFunctionKey(_ event: NSEvent) {
        let isDown = event.modifierFlags.contains(.function)
        if isDown && !isFunctionDown {
            isFunctionDown = true
        } else if !isDown && isFunctionDown {
            isFunctionDown = false
            activate()
        }
    }
}
