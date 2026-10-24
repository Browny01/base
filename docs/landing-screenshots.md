# Replace the landing-page screenshots

The landing page is `apps/web/index.html`. Its images are ordinary files in
`apps/web/public/screenshots/`; no dashboard or upload service is needed.

| File to replace | Shown on the page | Recommended dimensions |
| --- | --- | --- |
| `dashboard.png` | Main hero screenshot | 1280 × 850, landscape |
| `news.png` | News and markets preview | 1280 × 850, landscape |
| `notes.png` | Notes gallery | 1280 × 850, landscape |
| `habits.png` | Habits gallery | 1280 × 850, landscape |
| `mobile.png` | Portrait mobile-browser preview | 390 × 844, portrait |

1. Open Base with a sample workspace or hide private names, account details,
   notes, URLs and notifications before capturing. Use the app window rather
   than your whole desktop. The bundled new captures use synthetic fixture data.
2. On Mac, press **Shift–Command–5**, choose the window or a selected area, then
   save the screenshot. For mobile, capture the actual mobile browser or use a
   portrait responsive browser viewport. The current mobile image illustrates
   the responsive web app, not the unfinished native iPhone application.
3. Rename the PNG to the appropriate filename above and replace that file in
   `apps/web/public/screenshots/`. Matching the aspect ratio avoids stretching.
   Keep each image below roughly 500 KB where possible. Other sizes work, but
   update the matching HTML `width`/`height` if the aspect ratio changes.
4. Run `npm run web:dev` from the repository root and open the local URL it prints.
   Refresh the landing page and inspect the desktop and mobile layouts.
5. Run `npm run web:build`. The build copies these five files into
   `apps/web/dist/screenshots/`. Commit the replacement PNGs and publish the web
   assets through the existing Cloudflare release process when ready. A GitHub
   push alone does not deploy the site; automatic Vercel deployments stay disabled.

Use these exact `.png` names. There is no WebP alternative taking precedence
over a replacement PNG. If adding another slot, add its filename to the asset
list in `apps/web/vite.config.ts` and its figure to `apps/web/index.html`.

For reproducible UI checks and fresh sample captures:

```sh
npm exec vite -- --config tests/support/preview.config.ts --port 4981
```

Open `http://localhost:4981/tests/support/ui-preview.html#/habits` or `#/notes`.
This development fixture uses only synthetic in-memory data; it is not included
in production build entry points. Other fixture routes include `#/shopping-list`,
`#/reading-list` and `#/watch-list`. Refreshing resets the fixture.
