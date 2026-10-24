# Windows archive dependency security backport

Upstream tauri-plugin-updater 2.14.0, original licenses retained. Its Windows
archive extraction still required zip 4, affected by RUSTSEC-2026-0367/0368/0369.
This copy uses zip 9, which confines extraction and fixes permission handling.
The existing ZipArchive::new/extract API and signed-update verification remain.
The Rust implementation is otherwise unchanged. Linux/macOS do not compile
this Windows-only dependency; Windows compilation/runtime needs its own runner.

Remove the patch once a stable upstream Tauri 2 plugin requires fixed zip.
