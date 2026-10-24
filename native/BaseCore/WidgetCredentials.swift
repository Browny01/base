#if os(iOS)
import Foundation
import Security
import SwiftUI
import WidgetKit

struct WidgetConnection: Codable {
    let origin: String
    let token: String

    init(origin: String, token: String) throws {
        guard let url = URLComponents(string: origin.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/",
              token.count >= 32, token.utf8.allSatisfy({ $0 > 32 && $0 < 127 }) else {
            throw WidgetCredentialError.invalidConnection
        }
        var canonical = url
        canonical.path = ""
        self.origin = canonical.string!
        self.token = token
    }
}

enum WidgetCredentialError: LocalizedError {
    case invalidConnection, unavailable
    var errorDescription: String? {
        switch self {
        case .invalidConnection: return "Enter an HTTPS service address and an API token of at least 32 characters."
        case .unavailable: return "The shared Keychain is unavailable. Check the app and widget signing entitlements."
        }
    }
}

enum WidgetCredentials {
    private static func query() throws -> [String: Any] {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "BaseSharedKeychainGroup") as? String,
              !group.isEmpty, !group.contains("$(") else { throw WidgetCredentialError.unavailable }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "app.base.widget.connection",
                kSecAttrAccount as String: "current",
                kSecAttrAccessGroup as String: group]
    }

    static func load() throws -> WidgetConnection? {
        var query = try query()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw WidgetCredentialError.unavailable }
        let stored = try JSONDecoder().decode(WidgetConnection.self, from: data)
        return try WidgetConnection(origin: stored.origin, token: stored.token)
    }

    static func save(_ connection: WidgetConnection) throws {
        let query = try query(), data = try JSONEncoder().encode(connection)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess else {
                throw WidgetCredentialError.unavailable
            }
        } else if status != errSecSuccess { throw WidgetCredentialError.unavailable }
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func remove() throws {
        let status = SecItemDelete(try query() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw WidgetCredentialError.unavailable }
        WidgetCenter.shared.reloadAllTimelines()
    }
}

struct WidgetSettingsButton: View {
    @State private var showing = false
    var body: some View {
        Button { showing = true } label: { Image(systemName: "gearshape") }
            .accessibilityLabel("Widget connection")
            .sheet(isPresented: $showing) { WidgetConnectionView() }
    }
}

private struct WidgetConnectionView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var origin = "https://base.lucasbrown.xyz"
    @State private var token = ""
    @State private var message: String?
    @State private var connected = false

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Widget connection")) {
                    TextField("Service address", text: $origin).keyboardType(.URL)
                        .textInputAutocapitalization(.never).disableAutocorrection(true)
                    SecureField("API token", text: $token)
                        .textInputAutocapitalization(.never).disableAutocorrection(true)
                    Text("Use a dedicated service API token. It stays in this device’s Keychain and is shared only with Base’s widget.")
                        .font(.footnote).foregroundColor(.secondary)
                    if connected { Text("A widget connection is stored securely.") }
                    if let message { Text(message).foregroundColor(.red) }
                    Button("Save connection") {
                        do {
                            try WidgetCredentials.save(WidgetConnection(origin: origin, token: token))
                            token = ""
                            dismiss()
                        } catch { message = error.localizedDescription }
                    }.disabled(token.isEmpty)
                    if connected {
                        Button("Disconnect widget", role: .destructive) {
                            do { try WidgetCredentials.remove(); connected = false; token = "" }
                            catch { message = error.localizedDescription }
                        }
                    }
                }
            }
            .navigationTitle("Widget")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
        .onAppear {
            do {
                if let connection = try WidgetCredentials.load() { origin = connection.origin; connected = true }
            } catch { message = error.localizedDescription }
        }
    }
}
#endif
