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
    enum Action: String, Codable { case upsert, delete }

    let id: String
    let collection: String
    let action: Action
    let recordId: String
    let value: [String: JSONValue]?
}

struct LocalSnapshot: Codable {
    var document: [String: JSONValue]
    var pending: [NativeOperation]
    var lastSync: Date?
}

struct SyncEnvelope: Decodable {
    let data: JSONValue?
    let configured: Bool?
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
