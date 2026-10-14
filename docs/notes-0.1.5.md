# Base 0.1.5 — Notes editing and icons

## Implemented

- Cmd/Ctrl+A selects the note body in one press. Delete/Backspace, typing, cut
  and paste replace the selection through the stored block model and undo history.
  Title, description and icon remain separate fields. Partial selections preserve
  unselected boundary text/formatting and unrelated blocks.
- Mouse selection can span existing blocks. WebKit clips native Selection to an
  editing host, so the editor retains the complete DOM Range independently and
  highlights its text ranges. Copy, cut, paste, delete, formatting and links use
  that range without removing React-managed rows. Drag listeners run only during
  a mouse gesture; there is no idle polling.
- Enter in ordinary text creates editable paragraphs within that block. Blank
  lines remain clickable, including empty older blocks. Lists/headings keep their
  structured Enter behavior; Cmd/Ctrl+Enter and gutter controls still add blocks.
  Text copying, plain-text export and word counts retain paragraph boundaries.
- Choose **Change note icon → Upload an image**. PNG/JPEG/WebP/GIF/AVIF inputs
  under 10 MB and 32 megapixels become a static, transparent-capable PNG, at most
  128 px on the longest edge. Its bounded data URL stays in the existing synced
  `icon` field, works offline and needs no separate attachment request. Existing
  emoji icons remain supported. Note lists, breadcrumb, page links, dashboard,
  command palette and printable export render the uploaded icon.
- The Trash section's bottom padding is removed. Template popup entrance/exit
  uses short transform/opacity animations and honors reduced motion.

## Verification

- 167 JavaScript tests passed. Root, desktop and web TypeScript checks passed.
  Changed-file ESLint has zero errors and two pre-existing warnings.
- Eight persistent DOM Range checks passed through the collaborative browser:
  partial selection, formatted copy/replacement, unchanged snapshots, collapsed
  selection handling and paragraph boundaries.
- Chrome component checks: select-all deletion, Undo, editable blank paragraphs,
  cross-block copy/highlighting, image upload, IndexedDB icon persistence and
  icon rendering in the sidebar/breadcrumb. Trash/sidebar bottom coordinates
  matched. Template popup had the expected animation and six keyboard menu items.
  These use isolated component/workspace fixtures, not a Clerk sign-in test.
- Actual Linux WebKitGTK checks on an isolated X11/Xvfb display: select-all
  deletion, Undo, same-block paragraphs, filling a blank line, mouse-drag partial
  deletion, cross-block copy and bold formatting. SQLite records were inspected
  after debounce/persistence. Native file selection saved a 28,158-character PNG
  data URL. The final signed AppImage repeated deletion/Undo/paragraph/drag checks.
- Linux signed AppImage, Deb and RPM builds, desktop Vite and web Vite builds
  passed. No Rust behavior/dependencies changed. Mac build/runtime checks remain
  pending; Linux WebKitGTK does not establish Safari/macOS behavior.

Screenshots: [note icon](screenshots/notes-015/native-icon.png),
[template popup](screenshots/notes-015/native-templates.png).

To repeat the browser checks from the repository root:

```sh
cp tests/support/notes-editor.html apps/desktop/notes-fixture.html
npm run dev -w @base/desktop
```

Open `http://127.0.0.1:1420/notes-fixture.html`.
The tab title reports the eight DOM checks; the isolated editor supports manual
keyboard, mouse and icon tests. It uses synthetic data, does not log in or modify
the real workspace, and is excluded from the production frontend build. Remove
the temporary `apps/desktop/notes-fixture.html` when finished.

The staging website is deployed. Existing production Vercel data and credentials
are unchanged. Original Phase 3 has not begun; Phase 2.5 retains its pending gates.
