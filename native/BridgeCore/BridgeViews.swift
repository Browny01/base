import SwiftUI

enum BridgeSection: String, CaseIterable, Identifiable {
    case today, tasks, projects, notes, habits, focus, finance, news, settings

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    var icon: String {
        switch self {
        case .today: return "square.grid.2x2"
        case .tasks: return "checkmark.circle"
        case .projects: return "folder"
        case .notes: return "note.text"
        case .habits: return "repeat.circle"
        case .focus: return "timer"
        case .finance: return "dollarsign.circle"
        case .news: return "newspaper"
        case .settings: return "gearshape"
        }
    }
}

struct BridgeRootView: View {
    @ObservedObject var store: BridgeStore

    var body: some View {
        #if os(macOS)
        MacRootView(store: store)
            .frame(minWidth: 840, minHeight: 560)
        #else
        MobileRootView(store: store)
        #endif
    }
}

#if os(macOS)
private struct MacRootView: View {
    @ObservedObject var store: BridgeStore
    @State private var selection: BridgeSection? = .today

    var body: some View {
        NavigationView {
            List(selection: $selection) {
                Section("Bridge") {
                    ForEach(BridgeSection.allCases) { section in
                        Label(section.title, systemImage: section.icon)
                            .tag(section as BridgeSection?)
                    }
                }
                Section {
                    SyncStatusView(store: store)
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("Bridge")

            sectionView(selection ?? .today)
                .environmentObject(store)
        }
        .toolbar { SyncToolbar(store: store) }
    }
}
#endif

#if os(iOS)
private struct MobileRootView: View {
    @ObservedObject var store: BridgeStore

    var body: some View {
        TabView {
            nav(DashboardView(), title: "Today")
                .tabItem { Label("Today", systemImage: BridgeSection.today.icon) }
            nav(TasksView(), title: "Tasks")
                .tabItem { Label("Tasks", systemImage: BridgeSection.tasks.icon) }
            nav(ProjectsView(), title: "Projects")
                .tabItem { Label("Projects", systemImage: BridgeSection.projects.icon) }
            nav(NotesView(), title: "Notes")
                .tabItem { Label("Notes", systemImage: BridgeSection.notes.icon) }
            NavigationView { MoreView() }
                .environmentObject(store)
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
        .tint(.teal)
    }

    private func nav<Content: View>(_ content: Content, title: String) -> some View {
        NavigationView {
            content
                .navigationTitle(title)
                .toolbar { SyncToolbar(store: store) }
        }
        .environmentObject(store)
    }
}
#endif

@ViewBuilder
private func sectionView(_ section: BridgeSection) -> some View {
    switch section {
    case .today: DashboardView()
    case .tasks: TasksView()
    case .projects: ProjectsView()
    case .notes: NotesView()
    case .habits: HabitsView()
    case .focus: FocusView()
    case .finance: FinanceView()
    case .news: NewsBriefingView()
    case .settings: SyncSettingsView()
    }
}

private struct SyncToolbar: ToolbarContent {
    @ObservedObject var store: BridgeStore

    var body: some ToolbarContent {
        ToolbarItem(placement: .automatic) {
            Button {
                Task { await store.sync() }
            } label: {
                if store.syncState == .syncing { ProgressView().controlSize(.small) }
                else { Image(systemName: store.pendingCount > 0 ? "arrow.triangle.2.circlepath.circle.fill" : "arrow.triangle.2.circlepath") }
            }
            .disabled(store.syncState == .syncing)
            .help("Sync now")
        }
    }
}

private struct SyncStatusView: View {
    @ObservedObject var store: BridgeStore

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.caption)
                if store.pendingCount > 0 {
                    Text("\(store.pendingCount) queued")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                } else if store.conflictCount > 0 {
                    Text("\(store.conflictCount) conflicts")
                        .font(.caption2)
                        .foregroundColor(.orange)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var label: String {
        switch store.syncState {
        case .offline: return "Offline"
        case .syncing: return "Syncing"
        case .synced: return "Up to date"
        case .failed: return "Sync paused"
        }
    }

    private var icon: String {
        switch store.syncState {
        case .offline: return "wifi.slash"
        case .syncing: return "arrow.triangle.2.circlepath"
        case .synced: return "checkmark.icloud"
        case .failed: return "exclamationmark.icloud"
        }
    }

    private var color: Color {
        switch store.syncState {
        case .offline: return .secondary
        case .syncing: return .blue
        case .synced: return .green
        case .failed: return .orange
        }
    }
}

private struct MoreView: View {
    @EnvironmentObject private var store: BridgeStore

    var body: some View {
        List {
            Section {
                ForEach([BridgeSection.habits, .focus, .finance, .news]) { section in
                    NavigationLink(destination: sectionView(section).environmentObject(store)) {
                        Label(section.title, systemImage: section.icon)
                    }
                }
            }
            Section {
                NavigationLink(destination: SyncSettingsView().environmentObject(store)) {
                    Label("Offline & Sync", systemImage: BridgeSection.settings.icon)
                }
                SyncStatusView(store: store)
            }
        }
        .navigationTitle("More")
        .toolbar { SyncToolbar(store: store) }
    }
}

private struct SyncSettingsView: View {
    @EnvironmentObject private var store: BridgeStore
    @State private var token = ""

    var body: some View {
        Form {
            Section {
                HStack {
                    SyncStatusView(store: store)
                    Spacer()
                    Button("Sync now") { Task { await store.sync() } }
                        .disabled(!store.hasSyncCredential || store.syncState == .syncing)
                }
                if let lastSync = store.lastSync {
                    SyncMetricRow(label: "Last synced", value: lastSync.formatted(date: .abbreviated, time: .shortened))
                }
                SyncMetricRow(label: "Queued changes", value: "\(store.pendingCount)")
                SyncMetricRow(label: "Conflicts", value: "\(store.conflictCount)")
            } header: {
                Text("Local-first workspace")
            } footer: {
                Text("Bridge writes to this device first, then pushes queued edits on launch, foreground, reconnect, and periodic refresh.")
            }

            Section {
                SecureField("Paste pairing token", text: $token)
                    .textContentType(.password)
                Button(store.hasSyncCredential ? "Replace pairing token" : "Pair this device") {
                    store.setSyncToken(token)
                    token = ""
                }
                .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if store.hasSyncCredential {
                    Button("Remove pairing", role: .destructive) { store.setSyncToken("") }
                }
            } header: {
                Text("Secure cloud connection")
            } footer: {
                Text("Generate a token in Bridge → Settings → Offline & sync. It stays in this device’s Keychain.")
            }

            if !store.conflicts.isEmpty {
                Section("Concurrent edits") {
                    ForEach(store.conflicts) { conflict in
                        VStack(alignment: .leading, spacing: 10) {
                            Text("\(conflict.operation.collection) · \(conflict.operation.recordId)")
                                .font(.headline)
                            Text("Another device changed this after the local copy was downloaded.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            HStack {
                                Button("Use cloud") { store.resolveConflict(id: conflict.id, keepLocal: false) }
                                Button("Keep mine") { store.resolveConflict(id: conflict.id, keepLocal: true) }
                                    .buttonStyle(.borderedProminent)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Offline & Sync")
    }
}

private struct SyncMetricRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundColor(.secondary)
        }
    }
}

private struct DashboardView: View {
    @EnvironmentObject private var store: BridgeStore

    private var tasks: [BridgeRecord] { store.records(in: "tasks") }
    private var projects: [BridgeRecord] { store.records(in: "projects") }
    private var habits: [BridgeRecord] { store.records(in: "habits") }
    private var logs: [BridgeRecord] { store.records(in: "habitLogs") }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Date.now.formatted(date: .complete, time: .omitted))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Text("Your day at a glance")
                        .font(.largeTitle.bold())
                }

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                    MetricTile(label: "Open tasks", value: "\(tasks.filter { !$0.bool("done") }.count)", icon: "checkmark.circle", color: .blue)
                    MetricTile(label: "Active projects", value: "\(projects.filter { $0.string("status") == "active" && !$0.bool("archived") }.count)", icon: "folder", color: .teal)
                    MetricTile(label: "Habits today", value: "\(todayHabitCount)/\(habits.count)", icon: "repeat.circle", color: .green)
                    MetricTile(label: "Queued edits", value: "\(store.pendingCount)", icon: "icloud.and.arrow.up", color: .orange)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Next tasks").font(.title2.bold())
                    let openTasks = tasks.filter { !$0.bool("done") }.prefix(5)
                    if openTasks.isEmpty {
                        EmptyState(icon: "checkmark.circle", title: "Nothing pending")
                    } else {
                        ForEach(Array(openTasks)) { task in
                            HStack {
                                Circle().fill(priorityColor(task.string("priority"))).frame(width: 8, height: 8)
                                Text(task.string("title"))
                                Spacer()
                                Text(task.string("tag")).font(.caption).foregroundColor(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 1000, alignment: .leading)
        }
        .navigationTitle("Today")
    }

    private var todayHabitCount: Int {
        let today = BridgeDate.today()
        return logs.filter { $0.string("date") == today && $0.bool("completed") }.count
    }
}

private struct MetricTile: View {
    let label: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: icon).foregroundColor(color).font(.title2)
            Text(value).font(.title.bold()).monospacedDigit()
            Text(label).font(.caption).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 100, alignment: .leading)
        .padding(16)
        .background(Color.primary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct TasksView: View {
    @EnvironmentObject private var store: BridgeStore
    @State private var showingAdd = false

    private var tasks: [BridgeRecord] {
        store.records(in: "tasks").sorted {
            if $0.bool("done") != $1.bool("done") { return !$0.bool("done") }
            return $0.string("createdAt") > $1.string("createdAt")
        }
    }

    var body: some View {
        List {
            if tasks.isEmpty {
                EmptyState(icon: "checkmark.circle", title: "No tasks yet")
            }
            ForEach(tasks) { task in
                HStack(spacing: 12) {
                    Button {
                        let done = !task.bool("done")
                        store.update(collection: "tasks", id: task.id, changes: [
                            "done": .bool(done),
                            "completedAt": done ? .string(BridgeDate.now()) : .null,
                        ])
                    } label: {
                        Image(systemName: task.bool("done") ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(task.bool("done") ? .green : .secondary)
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(task.string("title"))
                            .strikethrough(task.bool("done"))
                        HStack(spacing: 8) {
                            Text(task.string("priority", default: "P2"))
                                .foregroundColor(priorityColor(task.string("priority")))
                            Text(task.string("tag", default: "@personal"))
                            if !task.string("dueDate").isEmpty { Text(task.string("dueDate")) }
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }
                    Spacer()
                }
                .swipeActions {
                    Button(role: .destructive) { store.delete(collection: "tasks", id: task.id) } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                .contextMenu {
                    Button(role: .destructive) { store.delete(collection: "tasks", id: task.id) } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Tasks")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
                    .help("New task")
            }
        }
        .sheet(isPresented: $showingAdd) { AddTaskView().environmentObject(store) }
    }
}

private struct AddTaskView: View {
    @EnvironmentObject private var store: BridgeStore
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var priority = "P2"
    @State private var tag = "@personal"

    var body: some View {
        NavigationView {
            Form {
                TextField("Task", text: $title)
                Picker("Priority", selection: $priority) {
                    ForEach(["P1", "P2", "P3"], id: \.self) { Text($0) }
                }
                .pickerStyle(.segmented)
                Picker("Area", selection: $tag) {
                    ForEach(["@work", "@personal", "@money", "@admin"], id: \.self) { Text($0) }
                }
            }
            .navigationTitle("New Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.upsert(collection: "tasks", fields: [
                            "id": .string(UUID().uuidString), "title": .string(title.trimmingCharacters(in: .whitespacesAndNewlines)),
                            "priority": .string(priority), "tag": .string(tag), "dueDate": .null,
                            "recurring": .null, "done": .bool(false), "createdAt": .string(BridgeDate.now()),
                        ])
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .frame(minWidth: 360, minHeight: 260)
    }
}

private struct ProjectsView: View {
    @EnvironmentObject private var store: BridgeStore
    @State private var showingAdd = false

    private var projects: [BridgeRecord] {
        store.records(in: "projects").filter { !$0.bool("archived") }
    }

    var body: some View {
        List {
            if projects.isEmpty { EmptyState(icon: "folder", title: "No projects yet") }
            ForEach(projects) { project in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "folder.fill").foregroundColor(.teal)
                        Text(project.string("name")).font(.headline)
                        Spacer()
                        Button(project.string("status", default: "active").replacingOccurrences(of: "-", with: " ").capitalized) {
                            store.update(collection: "projects", id: project.id, changes: ["status": .string(nextProjectStatus(project.string("status")))])
                        }
                        .buttonStyle(.borderless)
                    }
                    if !project.string("description").isEmpty {
                        Text(project.string("description")).font(.subheadline).foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 4)
                .contextMenu {
                    Button(role: .destructive) { store.delete(collection: "projects", id: project.id) } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }.help("New project")
            }
        }
        .sheet(isPresented: $showingAdd) { AddProjectView().environmentObject(store) }
    }
}

private struct AddProjectView: View {
    @EnvironmentObject private var store: BridgeStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""

    var body: some View {
        NavigationView {
            Form {
                TextField("Project name", text: $name)
                TextField("Description", text: $description)
            }
            .navigationTitle("New Project")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.upsert(collection: "projects", fields: [
                            "id": .string(UUID().uuidString), "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                            "description": .string(description), "color": .string("cyan"), "status": .string("active"),
                            "category": .string("major"), "archived": .bool(false), "createdAt": .string(BridgeDate.now()),
                        ])
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .frame(minWidth: 380, minHeight: 240)
    }
}

private struct NotesView: View {
    @EnvironmentObject private var store: BridgeStore
    @State private var showingAdd = false

    private var notes: [BridgeRecord] {
        store.records(in: "wikiPages")
            .filter { $0.fields["deletedAt"] == nil || $0.fields["deletedAt"] == .null }
            .sorted { $0.string("updatedAt") > $1.string("updatedAt") }
    }

    var body: some View {
        List {
            if notes.isEmpty { EmptyState(icon: "note.text", title: "No notes yet") }
            ForEach(notes) { note in
                NavigationLink(destination: NoteDetailView(noteID: note.id).environmentObject(store)) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(note.string("icon", default: "📝"))  \(note.string("title", default: "Untitled"))")
                            .font(.headline)
                        let preview = noteText(note)
                        if !preview.isEmpty {
                            Text(preview).font(.caption).foregroundColor(.secondary).lineLimit(2)
                        }
                    }
                    .padding(.vertical, 3)
                }
            }
        }
        .navigationTitle("Notes")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }.help("New note")
            }
        }
        .sheet(isPresented: $showingAdd) { AddNoteView().environmentObject(store) }
    }
}

private struct NoteDetailView: View {
    @EnvironmentObject private var store: BridgeStore
    @Environment(\.dismiss) private var dismiss
    let noteID: String
    @State private var showingAppend = false

    var body: some View {
        Group {
            if let note = store.record(in: "wikiPages", id: noteID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(note.string("icon", default: "📝")).font(.largeTitle)
                        Text(note.string("title", default: "Untitled")).font(.largeTitle.bold())
                        Text(noteText(note).isEmpty ? "No content yet." : noteText(note))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                    .padding(24)
                    .frame(maxWidth: 760, alignment: .leading)
                }
                .toolbar {
                    ToolbarItem(placement: .automatic) {
                        Button { showingAppend = true } label: { Label("Add paragraph", systemImage: "plus") }
                    }
                    ToolbarItem(placement: .automatic) {
                        Button(role: .destructive) {
                            store.delete(collection: "wikiPages", id: noteID)
                            dismiss()
                        } label: { Image(systemName: "trash") }
                    }
                }
                .sheet(isPresented: $showingAppend) {
                    AppendNoteView(noteID: noteID).environmentObject(store)
                }
            } else {
                EmptyState(icon: "note.text", title: "Note not found")
            }
        }
    }
}

private struct AddNoteView: View {
    @EnvironmentObject private var store: BridgeStore
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var bodyText = ""

    var body: some View {
        NavigationView {
            Form {
                TextField("Title", text: $title)
                TextEditor(text: $bodyText).frame(minHeight: 140)
            }
            .navigationTitle("New Note")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let now = BridgeDate.now()
                        store.upsert(collection: "wikiPages", fields: [
                            "id": .string(UUID().uuidString), "parentId": .null,
                            "title": .string(title.trimmingCharacters(in: .whitespacesAndNewlines)), "icon": .string("📝"),
                            "blocks": .array(bodyText.isEmpty ? [] : [.object(textBlock(bodyText))]),
                            "fullWidth": .bool(false), "nativePlainText": .bool(true),
                            "createdAt": .string(now), "updatedAt": .string(now),
                        ])
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .frame(minWidth: 420, minHeight: 320)
    }
}

private struct AppendNoteView: View {
    @EnvironmentObject private var store: BridgeStore
    @Environment(\.dismiss) private var dismiss
    let noteID: String
    @State private var text = ""

    var body: some View {
        NavigationView {
            Form { TextEditor(text: $text).frame(minHeight: 140) }
                .navigationTitle("Add Paragraph")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") {
                            guard let note = store.record(in: "wikiPages", id: noteID) else { return }
                            var blocks = note.array("blocks")
                            blocks.append(.object(textBlock(text)))
                            store.update(collection: "wikiPages", id: noteID, changes: [
                                "blocks": .array(blocks), "updatedAt": .string(BridgeDate.now()),
                            ])
                            dismiss()
                        }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
        }
        .frame(minWidth: 400, minHeight: 260)
    }
}

private struct HabitsView: View {
    @EnvironmentObject private var store: BridgeStore
    @State private var showingAdd = false

    private var habits: [BridgeRecord] { store.records(in: "habits") }

    var body: some View {
        List {
            if habits.isEmpty { EmptyState(icon: "repeat.circle", title: "No habits yet") }
            ForEach(habits) { habit in
                HStack {
                    Text(habit.string("emoji", default: "⭐")).font(.title2)
                    Text(habit.string("name"))
                    Spacer()
                    Button {
                        toggle(habit)
                    } label: {
                        Image(systemName: completed(habit) ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(completed(habit) ? .green : .secondary)
                    }
                    .buttonStyle(.plain)
                }
                .contextMenu {
                    Button(role: .destructive) { store.delete(collection: "habits", id: habit.id) } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Habits")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }.help("New habit")
            }
        }
        .sheet(isPresented: $showingAdd) { AddHabitView().environmentObject(store) }
    }

    private func logID(_ habit: BridgeRecord) -> String { "\(habit.id)-\(BridgeDate.today())" }

    private func completed(_ habit: BridgeRecord) -> Bool {
        store.record(in: "habitLogs", id: logID(habit))?.bool("completed") == true
    }

    private func toggle(_ habit: BridgeRecord) {
        let id = logID(habit)
        store.upsert(collection: "habitLogs", fields: [
            "id": .string(id), "habitId": .string(habit.id), "date": .string(BridgeDate.today()),
            "completed": .bool(!completed(habit)),
        ])
    }
}

private struct AddHabitView: View {
    @EnvironmentObject private var store: BridgeStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var emoji = "⭐"

    var body: some View {
        NavigationView {
            Form {
                TextField("Emoji", text: $emoji)
                TextField("Habit", text: $name)
            }
            .navigationTitle("New Habit")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.upsert(collection: "habits", fields: [
                            "id": .string(UUID().uuidString), "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                            "emoji": .string(emoji.isEmpty ? "⭐" : emoji), "type": .string("button"), "reminderTime": .null,
                        ])
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .frame(minWidth: 360, minHeight: 220)
    }
}

private struct FocusView: View {
    @EnvironmentObject private var store: BridgeStore
    @State private var minutes = 25
    @State private var remaining = 25 * 60
    @State private var endDate: Date?
    @State private var hasSaved = false
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "timer").font(.system(size: 42)).foregroundColor(.teal)
            Text(timeLabel).font(.system(size: 64, weight: .semibold, design: .rounded)).monospacedDigit()
            Picker("Duration", selection: $minutes) {
                ForEach([15, 25, 45, 60], id: \.self) { Text("\($0)m").tag($0) }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 420)
            .disabled(endDate != nil)

            HStack(spacing: 12) {
                Button(endDate == nil ? "Start" : "Pause") {
                    if endDate == nil { endDate = Date().addingTimeInterval(TimeInterval(remaining)) }
                    else { endDate = nil }
                }
                .buttonStyle(.borderedProminent)
                Button("Reset") { reset() }.buttonStyle(.bordered)
                if remaining < minutes * 60 {
                    Button("Save session") { saveSession() }.buttonStyle(.bordered)
                }
            }
            Spacer()
        }
        .padding(24)
        .navigationTitle("Focus")
        .onChange(of: minutes) { value in remaining = value * 60 }
        .onReceive(timer) { now in
            guard let endDate else { return }
            remaining = max(0, Int(endDate.timeIntervalSince(now).rounded(.up)))
            if remaining == 0 && !hasSaved { saveSession() }
        }
    }

    private var timeLabel: String { String(format: "%02d:%02d", remaining / 60, remaining % 60) }

    private func reset() {
        endDate = nil
        remaining = minutes * 60
        hasSaved = false
    }

    private func saveSession() {
        let elapsed = max(1, Int(ceil(Double(minutes * 60 - remaining) / 60.0)))
        store.upsert(collection: "focusSessions", fields: [
            "id": .string(UUID().uuidString), "durationMins": .number(Double(elapsed)),
            "tag": .string("@personal"), "notes": .string("Native focus session"), "date": .string(BridgeDate.now()),
        ])
        hasSaved = true
        endDate = nil
    }
}

private struct FinanceView: View {
    @EnvironmentObject private var store: BridgeStore
    @State private var showingAdd = false

    private var entries: [BridgeRecord] {
        store.records(in: "incomeEntries").sorted { $0.string("date") > $1.string("date") }
    }

    var body: some View {
        List {
            Section {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Net").font(.caption).foregroundColor(.secondary)
                        Text(net, format: .currency(code: "AUD")).font(.title2.bold())
                    }
                    Spacer()
                    Text("Offline-ready ledger").font(.caption).foregroundColor(.secondary)
                }
                .padding(.vertical, 6)
            }
            Section("Entries") {
                if entries.isEmpty { EmptyState(icon: "dollarsign.circle", title: "No entries yet") }
                ForEach(entries) { entry in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(entry.string("source", default: "Entry"))
                            Text(entry.string("date")).font(.caption).foregroundColor(.secondary)
                        }
                        Spacer()
                        Text(entry.number("amount"), format: .currency(code: "AUD"))
                            .foregroundColor(entry.string("type") == "spent" ? .red : .green)
                    }
                    .contextMenu {
                        Button(role: .destructive) { store.delete(collection: "incomeEntries", id: entry.id) } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .navigationTitle("Finance")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }.help("New entry")
            }
        }
        .sheet(isPresented: $showingAdd) { AddFinanceEntryView().environmentObject(store) }
    }

    private var net: Double {
        entries.reduce(0) { $0 + ($1.string("type") == "spent" ? -$1.number("amount") : $1.number("amount")) }
    }
}

private struct AddFinanceEntryView: View {
    @EnvironmentObject private var store: BridgeStore
    @Environment(\.dismiss) private var dismiss
    @State private var source = ""
    @State private var amount = ""
    @State private var type = "income"

    var body: some View {
        NavigationView {
            Form {
                Picker("Type", selection: $type) {
                    Text("Income").tag("income")
                    Text("Spent").tag("spent")
                }
                .pickerStyle(.segmented)
                TextField("Source", text: $source)
                TextField("Amount", text: $amount)
            }
            .navigationTitle("New Entry")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.upsert(collection: "incomeEntries", fields: [
                            "id": .string(UUID().uuidString), "source": .string(source.trimmingCharacters(in: .whitespacesAndNewlines)),
                            "amount": .number(Double(amount) ?? 0), "date": .string(BridgeDate.today()), "type": .string(type),
                        ])
                        dismiss()
                    }
                    .disabled(source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (Double(amount) ?? 0) <= 0)
                }
            }
        }
        .frame(minWidth: 380, minHeight: 260)
    }
}

private struct NewsBriefingView: View {
    @AppStorage("bridge.news.summary") private var cachedSummary = ""
    @AppStorage("bridge.news.generatedAt") private var cachedDate = ""
    @State private var isLoading = false
    @State private var error = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("News briefing").font(.largeTitle.bold())
                        if !cachedDate.isEmpty { Text("Cached \(cachedDate)").font(.caption).foregroundColor(.secondary) }
                    }
                    Spacer()
                    Button { Task { await refresh() } } label: {
                        if isLoading { ProgressView() } else { Label("Refresh", systemImage: "arrow.clockwise") }
                    }
                    .disabled(isLoading)
                }

                if cachedSummary.isEmpty {
                    EmptyState(icon: "newspaper", title: isLoading ? "Loading briefing" : "No cached briefing")
                } else {
                    Text(LocalizedStringKey(cachedSummary))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }

                if !error.isEmpty { Text(error).font(.caption).foregroundColor(.orange) }
            }
            .padding(24)
            .frame(maxWidth: 820, alignment: .leading)
        }
        .navigationTitle("News")
        .task { if cachedSummary.isEmpty { await refresh() } }
    }

    private func refresh() async {
        isLoading = true
        error = ""
        defer { isLoading = false }
        do {
            let url = BridgeStore.serviceURL.appendingPathComponent("api/news/summary")
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw NewsError.failed }
            let result = try JSONDecoder().decode(BriefingResponse.self, from: data)
            guard result.ok, let summary = result.summary else { throw NewsError.failed }
            cachedSummary = summary
            cachedDate = result.generatedAt ?? BridgeDate.now()
        } catch {
            self.error = cachedSummary.isEmpty ? "A connection is required for the first briefing." : "Offline: showing the last downloaded briefing."
        }
    }
}

private struct BriefingResponse: Decodable {
    let ok: Bool
    let summary: String?
    let generatedAt: String?
}

private enum NewsError: Error { case failed }

private struct EmptyState: View {
    let icon: String
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundColor(.secondary)
            Text(title).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 72)
    }
}

private func priorityColor(_ priority: String) -> Color {
    switch priority {
    case "P1": return .red
    case "P3": return .secondary
    default: return .orange
    }
}

private func nextProjectStatus(_ current: String) -> String {
    switch current {
    case "active": return "on-hold"
    case "on-hold": return "done"
    default: return "active"
    }
}

private func textBlock(_ text: String) -> [String: JSONValue] {
    ["id": .string(UUID().uuidString), "type": .string("text"), "text": .string(text)]
}

private func noteText(_ note: BridgeRecord) -> String {
    note.array("blocks").compactMap { block in
        guard let fields = block.objectValue else { return nil }
        let type = fields["type"]?.stringValue ?? "text"
        if ["divider", "image"].contains(type) { return nil }
        return fields["text"]?.stringValue
    }
    .filter { !$0.isEmpty }
    .joined(separator: "\n\n")
}
