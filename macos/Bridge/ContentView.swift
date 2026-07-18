import SwiftUI

struct ContentView: View {
    @ObservedObject var model: WebModel
    @ObservedObject var store: BridgeStore

    var body: some View {
        ZStack {
            Color(red: 0.039, green: 0.039, blue: 0.043)
                .ignoresSafeArea()

            if model.loadFailed {
                BridgeRootView(store: store)
                    .transition(.opacity)
            } else {
                WebView(model: model)
                    .ignoresSafeArea()
                    .transition(.opacity)

                if model.isLoading {
                    VStack {
                        ProgressView(value: model.progress)
                            .progressViewStyle(.linear)
                            .tint(.accentColor)
                        Spacer()
                    }
                    .ignoresSafeArea()
                }
            }
        }
        .frame(minWidth: 720, minHeight: 480)
        .animation(.easeInOut(duration: 0.2), value: model.loadFailed)
    }
}
