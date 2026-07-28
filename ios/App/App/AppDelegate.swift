import BackgroundTasks
import SwiftUI

@main
struct BridgeIOSApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store: BridgeStore

    init() {
        let bridgeStore = BridgeStore()
        _store = StateObject(wrappedValue: bridgeStore)
        BridgeBackgroundRefresh.register(store: bridgeStore)
    }

    var body: some Scene {
        WindowGroup {
            BridgeRootView(store: store)
        }
        .onChange(of: scenePhase) { phase in
            switch phase {
            case .active:
                store.applicationDidBecomeActive()
            case .background:
                BridgeBackgroundRefresh.schedule()
            default:
                break
            }
        }
    }
}

private enum BridgeBackgroundRefresh {
    static let identifier = "app.bridge.personal.refresh"
    private static weak var store: BridgeStore?

    static func register(store: BridgeStore) {
        self.store = store
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(refreshTask)
        }
        schedule()
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGAppRefreshTask) {
        schedule()
        let work = Task { @MainActor in
            guard let store else {
                task.setTaskCompleted(success: false)
                return
            }
            await store.sync()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { work.cancel() }
    }
}
