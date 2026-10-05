import SwiftUI

@main
struct BaseIOSApp: App {
    @StateObject private var store = BaseStore()

    var body: some Scene {
        WindowGroup {
            BaseRootView(store: store)
        }
    }
}
