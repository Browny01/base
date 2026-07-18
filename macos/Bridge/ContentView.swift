import SwiftUI

struct ContentView: View {
    @ObservedObject var model: WebModel

    var body: some View {
        ZStack {
            // Matches the web app's background so first paint / resizes stay dark.
            Color(red: 0.039, green: 0.039, blue: 0.043)
                .ignoresSafeArea()

            WebView(model: model)
                .ignoresSafeArea()

            // Thin progress bar along the top while a page loads.
            if model.isLoading {
                VStack {
                    ProgressView(value: model.progress)
                        .progressViewStyle(.linear)
                        .tint(.accentColor)
                    Spacer()
                }
                .ignoresSafeArea()
                .transition(.opacity)
            }
        }
        .frame(minWidth: 720, minHeight: 480)
        .animation(.easeInOut(duration: 0.2), value: model.isLoading)
    }
}
