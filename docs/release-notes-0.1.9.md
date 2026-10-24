Base brings tasks, notes, projects, habits, finance and everyday lists into a locally bundled desktop workspace, with a companion browser client.

Changes since the previous source checkpoint:

- Restore the complete glass Base icon at a balanced sidebar size, preserving transparent edges.
- Habits with daily check-ins, numeric goals, activity history and streaks.
- Reusable custom-colour tags in Watch, Reading and Shopping; combined shopping filters.
- Copy Notes across blocks with HTML/plain-text formatting and the latest editor contents.
- Type or paste your own composed emoji as a note icon.
- Expanded landing gallery with real desktop and mobile-browser screenshots.
- Updated repository documentation and platform packaging, including Windows Credential Manager and a per-user background workspace task.
- Explicitly allowlisted domain aliases preserve existing service access during a controlled domain transition.

Downloads are intended to include a source ZIP, Apple Silicon and Intel DMGs, a Windows x64 EXE installer, and Linux x86-64 AppImage and DEB packages. SHA256SUMS.txt provides artifact checksums. Checksums do not replace platform code signing.

**Preview limitations:** macOS packages are ad-hoc signed, not Developer ID signed/notarized. Windows installers are not Authenticode signed. OS security prompts are expected. Windows scheduled-task, notifications and installer acceptance on a physical machine remain required. Production Clerk/Stripe, full legacy-data migration, offline attachment uploads and the remaining workspace/recovery acceptance gates are not complete. This draft must not be advertised as a production-ready release. Native iPhone modernization remains Phase 3.

Existing workspace databases must be retained. Do not uninstall with data removal, reset credentials or import unrelated workspaces over existing data. See docs/release-readiness.md and docs/cloud-setup.md before upgrading.
