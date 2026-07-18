import Combine
import Foundation
import Network

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

    private var pending: [NativeOperation] = []
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "app.bridge.connectivity")
    private var isOnline = false

    init() {
        loadLocalSnapshot()
        startConnectivityMonitor()
    }

    deinit { monitor.cancel() }

    var pendingCount: Int { pending.count }

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

    func upsert(collection: String, fields: [String: JSONValue]) {
        guard let recordId = fields["id"]?.stringValue, !recordId.isEmpty else { return }
        let operation = NativeOperation(
            id: UUID().uuidString,
            collection: collection,
            action: .upsert,
            recordId: recordId,
            value: fields
        )
        apply(operation, to: &document)
        pending.append(operation)
        persist()
        syncWhenPossible()
    }

    func update(collection: String, id: String, changes: [String: JSONValue]) {
        guard var fields = record(in: collection, id: id)?.fields else { return }
        changes.forEach { fields[$0.key] = $0.value }
        fields["id"] = .string(id)
        upsert(collection: collection, fields: fields)
    }

    func delete(collection: String, id: String) {
        let operation = NativeOperation(
            id: UUID().uuidString,
            collection: collection,
            action: .delete,
            recordId: id,
            value: nil
        )
        apply(operation, to: &document)
        pending.append(operation)
        persist()
        syncWhenPossible()
    }

    func sync() async {
        guard isOnline, syncState != .syncing else {
            if !isOnline { syncState = .offline }
            return
        }

        syncState = .syncing
        let sent = pending

        do {
            let url = Self.serviceURL.appendingPathComponent("api/native/sync")
            var request = URLRequest(url: url)
            request.timeoutInterval = 30

            if sent.isEmpty {
                request.httpMethod = "GET"
            } else {
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONEncoder().encode(OperationBatch(operations: sent))
            }

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw SyncError.badResponse
            }

            let envelope = try JSONDecoder().decode(SyncEnvelope.self, from: data)
            guard envelope.configured != false, let remote = envelope.data?.objectValue else {
                throw SyncError.notConfigured
            }

            let sentIDs = Set(sent.map(\.id))
            pending.removeAll { sentIDs.contains($0.id) }

            var merged = remote
            pending.forEach { apply($0, to: &merged) }
            document = merged
            lastSync = Date()
            syncState = .synced
            persist()
        } catch {
            syncState = isOnline ? .failed(error.localizedDescription) : .offline
        }
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

    private func syncWhenPossible() {
        guard isOnline else {
            syncState = .offline
            return
        }
        Task { await sync() }
    }

    private func apply(_ operation: NativeOperation, to target: inout [String: JSONValue]) {
        var records = target[operation.collection]?.arrayValue ?? []
        let index = records.firstIndex { $0.objectValue?["id"]?.stringValue == operation.recordId }

        switch operation.action {
        case .delete:
            if let index { records.remove(at: index) }
        case .upsert:
            guard let value = operation.value else { return }
            if let index { records[index] = .object(value) }
            else { records.append(.object(value)) }
        }
        target[operation.collection] = .array(records)
    }

    private func loadLocalSnapshot() {
        guard let data = try? Data(contentsOf: snapshotURL),
              let snapshot = try? JSONDecoder().decode(LocalSnapshot.self, from: data) else {
            document = Self.emptyDocument
            return
        }
        document = snapshot.document
        pending = snapshot.pending
        lastSync = snapshot.lastSync
    }

    private func persist() {
        let snapshot = LocalSnapshot(document: document, pending: pending, lastSync: lastSync)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? FileManager.default.createDirectory(at: snapshotURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: snapshotURL, options: .atomic)
    }

    private var snapshotURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("Bridge", isDirectory: true).appendingPathComponent("offline-data.json")
    }

    private static let emptyDocument: [String: JSONValue] = {
        let collections = [
            "tasks", "focusSessions", "incomeEntries", "subscriptions", "habits", "habitLogs",
            "projects", "projectNotes", "projectLinks", "milestones", "projectDocuments",
            "exams", "schoolNotes", "goals", "workouts", "socialStats", "businessKPIs",
            "boards", "boardItems", "boardDrawings", "wikiPages", "wikiFolders", "chatThreads",
            "chatFolders", "courses",
        ]
        return Dictionary(uniqueKeysWithValues: collections.map { ($0, JSONValue.array([])) })
    }()
}

private struct OperationBatch: Encodable {
    let operations: [NativeOperation]
}

private enum SyncError: LocalizedError {
    case badResponse
    case notConfigured

    var errorDescription: String? {
        switch self {
        case .badResponse: return "Bridge could not reach the sync service."
        case .notConfigured: return "Bridge sync is not configured on the server."
        }
    }
}
