import SwiftUI

@main
struct BridgeIOSApp: App {
    @StateObject private var store = BridgeStore()

    var body: some Scene {
        WindowGroup {
            BridgeRootView(store: store)
        }
    }
}
