import Foundation

enum JSONValue: Codable, Equatable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    var numberValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }
}

struct BridgeRecord: Identifiable, Equatable {
    let fields: [String: JSONValue]

    var id: String { string("id") }

    func string(_ key: String, default fallback: String = "") -> String {
        fields[key]?.stringValue ?? fallback
    }

    func bool(_ key: String, default fallback: Bool = false) -> Bool {
        fields[key]?.boolValue ?? fallback
    }

    func number(_ key: String, default fallback: Double = 0) -> Double {
        fields[key]?.numberValue ?? fallback
    }

    func array(_ key: String) -> [JSONValue] {
        fields[key]?.arrayValue ?? []
    }
}

struct NativeOperation: Codable, Identifiable {
    enum Action: String, Codable { case upsert, patch, delete, set }

    let id: String
    let deviceId: String
    let collection: String
    let action: Action
    let recordId: String
    let value: JSONValue?
    var baseRevision: Int
    let clientUpdatedAt: Double

    init(
        id: String,
        deviceId: String,
        collection: String,
        action: Action,
        recordId: String,
        value: JSONValue?,
        baseRevision: Int,
        clientUpdatedAt: Double = Date().timeIntervalSince1970 * 1000
    ) {
        self.id = id
        self.deviceId = deviceId
        self.collection = collection
        self.action = action
        self.recordId = recordId
        self.value = value
        self.baseRevision = baseRevision
        self.clientUpdatedAt = clientUpdatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case id, deviceId, collection, action, recordId, value, baseRevision, clientUpdatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        deviceId = try values.decodeIfPresent(String.self, forKey: .deviceId) ?? "legacy-native"
        collection = try values.decode(String.self, forKey: .collection)
        action = try values.decode(Action.self, forKey: .action)
        recordId = try values.decode(String.self, forKey: .recordId)
        if let object = try? values.decode([String: JSONValue].self, forKey: .value) {
            value = .object(object)
        } else {
            value = try values.decodeIfPresent(JSONValue.self, forKey: .value)
        }
        baseRevision = try values.decodeIfPresent(Int.self, forKey: .baseRevision) ?? 0
        clientUpdatedAt = try values.decodeIfPresent(Double.self, forKey: .clientUpdatedAt) ?? Date().timeIntervalSince1970 * 1000
    }
}

struct LocalSnapshot: Codable {
    var document: [String: JSONValue]
    var pending: [NativeOperation]
    var lastSync: Date?
}

struct SyncEnvelope: Decodable {
    let data: JSONValue?
    let configured: Bool?
    let full: Bool?
    let revision: Int?
    let recordRevisions: [String: Int]?
    let applied: [String]?
    let conflicts: [NativeConflict]?
    let changes: [NativeChange]?
    let updatedAt: Double?
    let error: String?
}

struct NativeChange: Codable {
    let revision: Int
    let operation: NativeOperation
    let merged: Bool?
}

struct NativeConflict: Codable, Identifiable {
    let id: String
    let operation: NativeOperation
    let serverRevision: Int
    let serverValue: JSONValue?
    let createdAt: Double
}

enum BridgeDate {
    static let timestamp: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let day: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func now() -> String { timestamp.string(from: Date()) }
    static func today() -> String { day.string(from: Date()) }
}
