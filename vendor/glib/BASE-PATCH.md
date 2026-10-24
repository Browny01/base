# Local security backport

Upstream glib 0.18.5, original licenses retained. The GTK3/Tauri dependency tree
still requires this minor branch. RUSTSEC-2024-0429 is fixed by passing a mutable
out pointer in `src/variant_iter.rs::VariantStrIter::impl_get`, matching the
upstream gtk-rs-core PR 1343 correction. No public API/version was changed.

`apps/desktop/src-tauri/tests/glib_backport.rs` exercises the affected iterator
methods. RustSec can still report the original version; this notice is evidence
of a backport, not an advisory suppression. Remove the patch once the parent
GTK dependency uses a fixed upstream branch.
