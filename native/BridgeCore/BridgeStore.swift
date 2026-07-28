import Combine
import Foundation
import Network
import Security
import SQLite3

@MainActor
final class BridgeStore: ObservableObject {
    enum SyncState: Equatable {
        case offline
        case syncing
        case synced
        case failed(String)
    }

    static let serviceURL = URL(string: "https://bridge-ten-lovat.vercel.app")!

    @Published private(set) var document: [String: JSONValue] = [:]
    @Published private(set) var syncState: SyncState = .offline
    @Published private(set) var lastSync: Date?
    @Published private(set) var conflicts: [NativeConflict] = []
    @Published private(set) var hasSyncCredential = false

    private var pending: [NativeOperation] = []
    private var recordRevisions: [String: Int] = [:]
    private var cursor = -1
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "app.bridge.connectivity")
    private var isOnline = false
    private var periodicTask: Task<Void, Never>?
    private let database = BridgeDatabase()
    private let deviceId: String
    private var syncToken: String

    init() {
        let storedDeviceId = database.string(for: "deviceId")
        deviceId = storedDeviceId ?? UUID().uuidString
        if storedDeviceId == nil { database.set(deviceId, for: "deviceId") }
        syncToken = NativeKeychain.read() ?? ""
        hasSyncCredential = !syncToken.isEmpty
        loadLocalSnapshot()
        startConnectivityMonitor()
        startPeriodicSync()
    }

    deinit {
        monitor.cancel()
        periodicTask?.cancel()
    }

    var pendingCount: Int { pending.count }
    var conflictCount: Int { conflicts.count }

    func records(in collection: String) -> [BridgeRecord] {
        guard let values = document[collection]?.arrayValue else { return [] }
        return values.compactMap { value in
            guard let fields = value.objectValue, fields["id"]?.stringValue != nil else { return nil }
            return BridgeRecord(fields: fields)
        }
    }

    func record(in collection: String, id: String) -> BridgeRecord? {
        records(in: collection).first { $0.id == id }
    }

    func setSyncToken(_ token: String) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        syncToken = trimmed
        hasSyncCredential = !trimmed.isEmpty
        if trimmed.isEmpty { NativeKeychain.delete() } else { NativeKeychain.write(trimmed) }
        if isOnline && !trimmed.isEmpty { Task { await sync() } }
    }

    func applicationDidBecomeActive() {
        if isOnline { Task { await sync() } }
    }

    func upsert(collection: String, fields: [String: JSONValue]) {
        guard let recordId = fields["id"]?.stringValue, !recordId.isEmpty else { return }
        let operation = makeOperation(
            collection: collection,
            action: .upsert,
            recordId: recordId,
            value: .object(fields)
        )
        queue(operation)
    }

    func update(collection: String, id: String, changes: [String: JSONValue]) {
        guard record(in: collection, id: id) != nil else { return }
        let operation = makeOperation(
            collection: collection,
            action: collection == "wikiPages" || collection == "chatThreads" ? .upsert : .patch,
            recordId: id,
            value: collection == "wikiPages" || collection == "chatThreads"
                ? .object(mergedFields(collection: collection, id: id, changes: changes))
                : .object(changes)
        )
        queue(operation)
    }

    func delete(collection: String, id: String) {
        queue(makeOperation(collection: collection, action: .delete, recordId: id, value: nil))
    }

    func resolveConflict(id: String, keepLocal: Bool) {
        guard let conflict = conflicts.first(where: { $0.id == id }) else { return }
        conflicts.removeAll { $0.id == id }
        if keepLocal {
            var operation = conflict.operation
            operation = NativeOperation(
                id: UUID().uuidString,
                deviceId: deviceId,
                collection: operation.collection,
                action: operation.action,
                recordId: operation.recordId,
                value: operation.value,
                baseRevision: conflict.serverRevision
            )
            apply(operation, to: &document)
            pending.append(operation)
        } else if let serverValue = conflict.serverValue {
            let cloud = NativeOperation(
                id: "cloud-\(UUID().uuidString)",
                deviceId: deviceId,
                collection: conflict.operation.collection,
                action: .upsert,
                recordId: conflict.operation.recordId,
                value: serverValue,
                baseRevision: conflict.serverRevision
            )
            apply(cloud, to: &document)
        }
        persist()
        syncWhenPossible()
    }

    func sync() async {
        guard isOnline, syncState != .syncing else {
            if !isOnline { syncState = .offline }
            return
        }
        guard !syncToken.isEmpty else {
            syncState = .failed("Pair this device in Bridge Settings to enable cloud sync.")
            return
        }

        syncState = .syncing
        let sent = Array(pending.prefix(200))

        do {
            var components = URLComponents(
                url: Self.serviceURL.appendingPathComponent("api/native/sync"),
                resolvingAgainstBaseURL: false
            )!
            if sent.isEmpty { components.queryItems = [URLQueryItem(name: "cursor", value: String(cursor))] }
            var request = URLRequest(url: components.url!)
            request.timeoutInterval = 30
            request.setValue("Bearer \(syncToken)", forHTTPHeaderField: "Authorization")

            if sent.isEmpty {
                request.httpMethod = "GET"
            } else {
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONEncoder().encode(OperationBatch(protocol: 2, cursor: cursor, operations: sent))
            }

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw SyncError.badResponse }
            if http.statusCode == 401 { throw SyncError.unauthorized }
            guard (200..<300).contains(http.statusCode) else { throw SyncError.badResponse }

            let envelope = try JSONDecoder().decode(SyncEnvelope.self, from: data)
            guard envelope.configured != false else { throw SyncError.notConfigured }
            if let error = envelope.error { throw SyncError.server(error) }

            let appliedIDs = Set(envelope.applied ?? [])
            let conflictedIDs = Set((envelope.conflicts ?? []).map(\.operation.id))
            pending.removeAll { appliedIDs.contains($0.id) || conflictedIDs.contains($0.id) }
            for conflict in envelope.conflicts ?? [] where !conflicts.contains(where: { $0.id == conflict.id }) {
                conflicts.append(conflict)
            }

            if envelope.full == true, let revisions = envelope.recordRevisions { recordRevisions = revisions }
            else { recordRevisions.merge(envelope.recordRevisions ?? [:]) { _, new in new } }
            for change in envelope.changes ?? [] {
                recordRevisions[revisionKey(change.operation.collection, change.operation.recordId)] = change.revision
            }
            pending = pending.map { operation in
                var rebased = operation
                rebased.baseRevision = recordRevisions[revisionKey(operation.collection, operation.recordId)] ?? operation.baseRevision
                return rebased
            }

            var merged: [String: JSONValue]
            if envelope.full == true, let remote = envelope.data?.objectValue {
                merged = remote
            } else {
                merged = document
                for change in envelope.changes ?? [] { apply(change.operation, to: &merged) }
            }
            pending.forEach { apply($0, to: &merged) }
            conflicts.forEach { apply($0.operation, to: &merged) }
            document = merged
            cursor = max(cursor, envelope.revision ?? cursor)
            lastSync = Date()
            syncState = conflicts.isEmpty ? .synced : .failed("\(conflicts.count) sync conflict\(conflicts.count == 1 ? "" : "s") need review.")
            persist()
        } catch {
            syncState = isOnline ? .failed(error.localizedDescription) : .offline
        }
    }

    private func makeOperation(
        collection: String,
        action: NativeOperation.Action,
        recordId: String,
        value: JSONValue?
    ) -> NativeOperation {
        NativeOperation(
            id: UUID().uuidString,
            deviceId: deviceId,
            collection: collection,
            action: action,
            recordId: recordId,
            value: value,
            baseRevision: recordRevisions[revisionKey(collection, recordId)] ?? 0
        )
    }

    private func mergedFields(collection: String, id: String, changes: [String: JSONValue]) -> [String: JSONValue] {
        var fields = record(in: collection, id: id)?.fields ?? ["id": .string(id)]
        changes.forEach { fields[$0.key] = $0.value }
        fields["id"] = .string(id)
        return fields
    }

    private func queue(_ operation: NativeOperation) {
        apply(operation, to: &document)
        pending.removeAll {
            $0.collection == operation.collection &&
            $0.recordId == operation.recordId
        }
        pending.append(operation)
        persist()
        syncWhenPossible()
    }

    private func startConnectivityMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                self.isOnline = path.status == .satisfied
                if self.isOnline { await self.sync() }
                else { self.syncState = .offline }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    private func startPeriodicSync() {
        periodicTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60 * 60 * 1_000_000_000)
                guard !Task.isCancelled, let self else { return }
                await self.sync()
            }
        }
    }

    private func syncWhenPossible() {
        guard isOnline else {
            syncState = .offline
            return
        }
        Task { await sync() }
    }

    private func apply(_ operation: NativeOperation, to target: inout [String: JSONValue]) {
        if operation.collection == "$root", operation.action == .set {
            target[operation.recordId] = operation.value ?? .null
            return
        }
        var records = target[operation.collection]?.arrayValue ?? []
        let index = records.firstIndex { $0.objectValue?["id"]?.stringValue == operation.recordId }

        switch operation.action {
        case .delete:
            if let index { records.remove(at: index) }
        case .patch:
            var fields = index.flatMap { records[$0].objectValue } ?? ["id": .string(operation.recordId)]
            operation.value?.objectValue?.forEach { fields[$0.key] = $0.value }
            if let index { records[index] = .object(fields) } else { records.append(.object(fields)) }
        case .upsert:
            guard let fields = operation.value?.objectValue else { return }
            if let index { records[index] = .object(fields) } else { records.append(.object(fields)) }
        case .set:
            return
        }
        target[operation.collection] = .array(records)
    }

    private func loadLocalSnapshot() {
        if let stored: [String: JSONValue] = database.decode([String: JSONValue].self, key: "document") {
            document = stored
        } else if
            let data = try? Data(contentsOf: legacySnapshotURL),
            let snapshot = try? JSONDecoder().decode(LocalSnapshot.self, from: data)
        {
            document = snapshot.document
            pending = snapshot.pending
            lastSync = snapshot.lastSync
        } else {
            document = Self.emptyDocument
        }
        pending = database.decode([NativeOperation].self, key: "outbox") ?? pending
        conflicts = database.decode([NativeConflict].self, key: "conflicts") ?? []
        recordRevisions = database.decode([String: Int].self, key: "recordRevisions") ?? [:]
        cursor = Int(database.string(for: "cursor") ?? "") ?? -1
        if let timestamp = Double(database.string(for: "lastSync") ?? "") {
            lastSync = Date(timeIntervalSince1970: timestamp)
        }
        persist()
    }

    private func persist() {
        database.encode(document, key: "document")
        database.encode(pending, key: "outbox")
        database.encode(conflicts, key: "conflicts")
        database.encode(recordRevisions, key: "recordRevisions")
        database.set(String(cursor), for: "cursor")
        if let lastSync { database.set(String(lastSync.timeIntervalSince1970), for: "lastSync") }
    }

    private func revisionKey(_ collection: String, _ recordId: String) -> String {
        "\(collection):\(recordId)"
    }

    private var legacySnapshotURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("Bridge", isDirectory: true).appendingPathComponent("offline-data.json")
    }

    private static let emptyDocument: [String: JSONValue] = {
        let collections = [
            "tasks", "focusSessions", "incomeEntries", "subscriptions", "habits", "habitLogs",
            "projects", "projectNotes", "projectLinks", "wallets", "portfolioSnapshots", "milestones",
            "projectDocuments", "projectFiles", "exams", "schoolNotes", "playerSkills", "goals",
            "workouts", "socialStats", "businessKPIs", "boards", "boardItems", "boardDrawings",
            "wikiPages", "wikiFolders", "chatThreads", "chatFolders", "chatSkills", "courses",
        ]
        var document = Dictionary(uniqueKeysWithValues: collections.map { ($0, JSONValue.array([])) })
        document["dailyRevenueTarget"] = .number(100)
        document["timetable"] = .object([:])
        document["bodyMetrics"] = .object(["weightLog": .array([]), "sleepLog": .array([])])
        document["hiddenPages"] = .array([])
        return document
    }()
}

private struct OperationBatch: Encodable {
    let `protocol`: Int
    let cursor: Int
    let operations: [NativeOperation]
}

private enum SyncError: LocalizedError {
    case badResponse
    case notConfigured
    case unauthorized
    case server(String)

    var errorDescription: String? {
        switch self {
        case .badResponse: return "Bridge could not reach the sync service."
        case .notConfigured: return "Bridge sync is not configured on the server."
        case .unauthorized: return "This device is not paired. Add a native sync token in Settings."
        case .server(let message): return message
        }
    }
}

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private final class BridgeDatabase {
    private var database: OpaquePointer?

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Bridge", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let path = base.appendingPathComponent("offline.sqlite3").path
        guard sqlite3_open_v2(path, &database, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
            database = nil
            return
        }
        execute("PRAGMA journal_mode=WAL")
        execute("PRAGMA synchronous=NORMAL")
        execute("CREATE TABLE IF NOT EXISTS bridge_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
    }

    deinit {
        if let database { sqlite3_close(database) }
    }

    func string(for key: String) -> String? {
        guard let database else { return nil }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, "SELECT value FROM bridge_kv WHERE key = ? LIMIT 1", -1, &statement, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(statement) }
        bind(key, to: statement, index: 1)
        guard sqlite3_step(statement) == SQLITE_ROW, let value = sqlite3_column_text(statement, 0) else { return nil }
        return String(cString: value)
    }

    func set(_ value: String, for key: String) {
        guard let database else { return }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, "INSERT INTO bridge_kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", -1, &statement, nil) == SQLITE_OK else { return }
        defer { sqlite3_finalize(statement) }
        bind(key, to: statement, index: 1)
        bind(value, to: statement, index: 2)
        sqlite3_step(statement)
    }

    func encode<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value), let json = String(data: data, encoding: .utf8) else { return }
        set(json, for: key)
    }

    func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let json = string(for: key), let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func execute(_ sql: String) {
        guard let database else { return }
        sqlite3_exec(database, sql, nil, nil, nil)
    }

    private func bind(_ value: String, to statement: OpaquePointer?, index: Int32) {
        _ = value.withCString { pointer in
            sqlite3_bind_text(statement, index, pointer, -1, sqliteTransient)
        }
    }
}

private enum NativeKeychain {
    private static let service = "app.bridge.personal.sync"
    private static let account = "native-device-token"

    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ token: String) {
        delete()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
