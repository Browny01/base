#!/usr/bin/env ruby
# Adds the BridgeWidgetExtension (WidgetKit) target to the native iOS project
# and embeds it in the App target. Idempotent — safe to re-run.
begin
  require "xcodeproj"
rescue LoadError
  abort "Missing Ruby gem 'xcodeproj'. Run `bundle install`, then `bundle exec ruby scripts/add_widget_target.rb`."
end

proj_path = File.expand_path(File.join(__dir__, "..", "ios", "App", "App.xcodeproj"))
project = Xcodeproj::Project.open(proj_path)

app = project.targets.find { |t| t.name == "App" }
raise "App target not found" unless app

app_bundle_id = app.build_configurations.first.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] || "app.bridge.personal"
dev_team = app.build_configurations.map { |c| c.build_settings["DEVELOPMENT_TEAM"] }.compact.first
widget_bundle_id = "#{app_bundle_id}.BridgeWidget"
NAME = "BridgeWidgetExtension"

# ── Idempotency: tear down an existing widget target/embed/dependency ──────────
if (old = project.targets.find { |t| t.name == NAME })
  app.dependencies.select { |d| d.target == old }.each(&:remove_from_project)
  app.copy_files_build_phases.each do |ph|
    ph.files.dup.each { |bf| bf.remove_from_project if bf.file_ref == old.product_reference }
  end
  old.remove_from_project
  puts "removed existing #{NAME}"
end

# ── Create the app-extension target ───────────────────────────────────────────
widget = project.new_target(:app_extension, NAME, :ios, "17.0")

group = project.main_group.find_subpath("BridgeWidget", true)
group.set_source_tree("SOURCE_ROOT")
group.set_path("BridgeWidget")
# clear any stale children from a previous run
group.clear
swift_ref = group.new_reference("BridgeWidget.swift")
group.new_reference("Info.plist")
widget.source_build_phase.add_file_reference(swift_ref)

widget.build_configurations.each do |c|
  bs = c.build_settings
  bs["INFOPLIST_FILE"] = "BridgeWidget/Info.plist"
  bs["PRODUCT_BUNDLE_IDENTIFIER"] = widget_bundle_id
  bs["PRODUCT_NAME"] = "$(TARGET_NAME)"
  bs["SWIFT_VERSION"] = "5.0"
  bs["IPHONEOS_DEPLOYMENT_TARGET"] = "17.0"
  bs["TARGETED_DEVICE_FAMILY"] = "1,2"
  bs["GENERATE_INFOPLIST_FILE"] = "NO"
  bs["SKIP_INSTALL"] = "YES"
  bs["CURRENT_PROJECT_VERSION"] = "1"
  bs["MARKETING_VERSION"] = "1.0"
  bs["CODE_SIGN_STYLE"] = "Automatic"
  bs["DEVELOPMENT_TEAM"] = dev_team if dev_team
  bs["LD_RUNPATH_SEARCH_PATHS"] = ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"]
end

# ── Depend on + embed into the App target ─────────────────────────────────────
app.add_dependency(widget)
embed = app.new_copy_files_build_phase("Embed Foundation Extensions")
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(widget.product_reference)
bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

project.save
puts "added #{NAME}  bundle=#{widget_bundle_id}  team=#{dev_team || '(none)'}"
