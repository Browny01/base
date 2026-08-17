import WidgetKit
import SwiftUI

// ── Data ─────────────────────────────────────────────────────────────────────
struct BridgeSummary: Codable {
    var tasksLeft: Int = 0
    var doneToday: Int = 0
    var habitsDone: Int = 0
    var habitsTotal: Int = 0
    var streak: Int = 0
    var revenueToday: Double = 0
    var revenueTarget: Double = 0
    var portfolio: Double? = nil
    var portfolioPct: Double? = nil

    static let sample = BridgeSummary(
        tasksLeft: 5, doneToday: 3, habitsDone: 4, habitsTotal: 5, streak: 7,
        revenueToday: 240, revenueTarget: 1000, portfolio: 12480, portfolioPct: 3.2
    )
}

enum BridgeAPI {
    // Personal single-user app. The token matches the server default
    // (BRIDGE_AGENT_TOKEN / BRIDGE_PASSWORD, default 151715).
    static let base = "https://base.lucasbrown.xyz"
    static let token = "151715"

    static func fetchSummary() async -> BridgeSummary {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = .current
        let date = df.string(from: Date())

        guard var comps = URLComponents(string: "\(base)/api/widget/summary") else { return .init() }
        comps.queryItems = [
            URLQueryItem(name: "token", value: token),
            URLQueryItem(name: "date", value: date),
        ]
        guard let url = comps.url else { return .init() }
        do {
            var req = URLRequest(url: url)
            req.timeoutInterval = 12
            req.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, _) = try await URLSession.shared.data(for: req)
            return try JSONDecoder().decode(BridgeSummary.self, from: data)
        } catch {
            return .init()
        }
    }
}

// ── Timeline ─────────────────────────────────────────────────────────────────
struct BridgeEntry: TimelineEntry {
    let date: Date
    let summary: BridgeSummary
}

struct BridgeProvider: TimelineProvider {
    func placeholder(in context: Context) -> BridgeEntry {
        BridgeEntry(date: Date(), summary: .sample)
    }
    func getSnapshot(in context: Context, completion: @escaping (BridgeEntry) -> Void) {
        Task { completion(BridgeEntry(date: Date(), summary: context.isPreview ? .sample : await BridgeAPI.fetchSummary())) }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BridgeEntry>) -> Void) {
        Task {
            let summary = await BridgeAPI.fetchSummary()
            let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
            completion(Timeline(entries: [BridgeEntry(date: Date(), summary: summary)], policy: .after(next)))
        }
    }
}

// ── Style ────────────────────────────────────────────────────────────────────
extension Color {
    static let bMuted = Color(white: 0.64)
    static let bFaint = Color(white: 0.44)
    static let bEmerald = Color(red: 0.20, green: 0.83, blue: 0.60)
    static let bViolet = Color(red: 0.66, green: 0.55, blue: 0.98)
    static let bRose = Color(red: 0.98, green: 0.44, blue: 0.52)
}

func compactMoney(_ v: Double) -> String {
    let n = abs(v)
    if n >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if n >= 1_000 { return String(format: "$%.1fk", v / 1_000) }
    return "$" + String(Int(v.rounded()))
}

// A single labelled stat.
struct StatTile: View {
    let icon: String
    let tint: Color
    let label: String
    let value: String
    var sub: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 11, weight: .semibold)).foregroundStyle(tint)
                Text(label).font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(Color.bFaint)
            }
            Text(value).font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(.white).minimumScaleFactor(0.6).lineLimit(1)
            if let sub {
                Text(sub).font(.system(size: 10, weight: .medium)).foregroundStyle(Color.bFaint).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct ProgressBar: View {
    let pct: Double
    let tint: Color
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.12))
                Capsule().fill(tint).frame(width: max(0, min(1, pct)) * geo.size.width)
            }
        }
        .frame(height: 3)
    }
}

// ── Views ────────────────────────────────────────────────────────────────────
struct SmallView: View {
    let s: BridgeSummary
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Image(systemName: "checklist").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.bMuted)
                Text("TASKS LEFT").font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(Color.bFaint)
                Spacer()
            }
            Spacer(minLength: 2)
            Text("\(s.tasksLeft)").font(.system(size: 46, weight: .bold, design: .rounded)).foregroundStyle(.white)
            Text("\(s.doneToday) done today").font(.system(size: 11, weight: .medium)).foregroundStyle(Color.bFaint)
            Spacer(minLength: 6)
            HStack(spacing: 12) {
                Label("\(s.streak)d", systemImage: "flame.fill").foregroundStyle(Color.bViolet)
                Label(compactMoney(s.revenueToday), systemImage: "dollarsign.circle.fill").foregroundStyle(Color.bEmerald)
                Spacer()
            }
            .font(.system(size: 11, weight: .semibold))
            .labelStyle(.titleAndIcon)
        }
    }
}

struct MediumView: View {
    let s: BridgeSummary
    private var revPct: Double { s.revenueTarget > 0 ? s.revenueToday / s.revenueTarget : 0 }

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text("Today").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                Spacer()
                Text("\(s.doneToday) done").font(.system(size: 11, weight: .medium)).foregroundStyle(Color.bFaint)
            }
            HStack(spacing: 12) {
                StatTile(icon: "checklist", tint: .bMuted, label: "TASKS", value: "\(s.tasksLeft)", sub: "left")
                StatTile(icon: "flame.fill", tint: .bViolet, label: "STREAK", value: "\(s.streak)d", sub: "best")
                StatTile(icon: "repeat", tint: .bEmerald, label: "HABITS", value: "\(s.habitsDone)/\(s.habitsTotal)", sub: "today")
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Image(systemName: "dollarsign.circle.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.bEmerald)
                        Text("REVENUE").font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(Color.bFaint)
                    }
                    Text(compactMoney(s.revenueToday)).font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(.white).minimumScaleFactor(0.6).lineLimit(1)
                    ProgressBar(pct: revPct, tint: revPct >= 1 ? .bEmerald : .white)
                    Text("of \(compactMoney(s.revenueTarget))").font(.system(size: 10, weight: .medium)).foregroundStyle(Color.bFaint)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
    }
}

struct BridgeWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: BridgeProvider.Entry

    var body: some View {
        Group {
            switch family {
            case .systemSmall: SmallView(s: entry.summary)
            default: MediumView(s: entry.summary)
            }
        }
        .containerBackground(for: .widget) {
            Color(red: 0.039, green: 0.039, blue: 0.043)
        }
    }
}

// ── Widget ───────────────────────────────────────────────────────────────────
struct BridgeWidget: Widget {
    let kind = "BridgeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BridgeProvider()) { entry in
            BridgeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Base")
        .description("Today's tasks, streak, habits, and revenue vs target.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct BridgeWidgetBundle: WidgetBundle {
    var body: some Widget { BridgeWidget() }
}
