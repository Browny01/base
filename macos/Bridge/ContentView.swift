import SwiftUI

struct ContentView: View {
    @ObservedObject var store: BridgeStore

    var body: some View {
        BridgeRootView(store: store)
    }
}
