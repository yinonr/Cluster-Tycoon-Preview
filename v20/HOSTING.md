# Cluster Tycoon V20 — HSC hosting guide

Cluster Tycoon is a ten-round, single-player browser game about buying GPU capacity and building an AI company. The score is founder wealth. It runs entirely in the browser; there is no backend, database, login, API key, package installation or server build step.

## Deploy

1. Obtain `cluster-tycoon-v20.zip`, `RELEASE_MANIFEST.md` and `DEPLOYMENT_CHECKLIST.md` from the same V20 handoff folder. Check the ZIP's SHA-256 against the release manifest before editing or uploading.
2. Unzip the archive. Its root contains `index.html`, `src/`, `styles/`, `assets/`, `brand/`, `fonts/`, `media/`, and the hosting instructions. Keep all names, case and subdirectories intact.
3. Upload the **contents** into the directory served at your selected URL. For `https://hscompute.com/tycoon/`, index.html must be served at `/tycoon/index.html`, not `/tycoon/v20/index.html`. A subdomain such as `https://tycoon.hscompute.com/` also works. No provider is assumed.
4. Configure the canonical URL below, enable HTTPS, and serve index.html as the directory index. Redirect a slashless `/tycoon` request to `/tycoon/`, preserving query parameters. No SPA fallback or server-side routes are required: challenges use query strings on the same static page.
5. Complete the accompanying deployment checklist. The GitHub preview is a release reference, not a required runtime dependency.

## Configure the final URL

All runtime asset paths are relative. Deploying under a subdirectory or subdomain does not require rewriting JavaScript imports, CSS, fonts or image paths. Challenge/share links derive from the page's current location automatically.

Before publishing at the final HSC address, change **four absolute URLs in index.html**:

- `link[rel=canonical]`: the full game directory URL, ending in `/`.
- `meta[property="og:url"]`: the same URL.
- `meta[property="og:image"]`: that URL plus `social-preview.png`.
- `meta[name="twitter:image"]`: the same image URL.

The shipped values use `https://yinonr.github.io/Cluster-Tycoon-Preview/v20/`. For example, replacing that exact prefix with `https://hscompute.com/tycoon/` updates all four entries. Keep the existing title/descriptions, relative asset URLs and V20 save names. Social crawlers must be able to fetch the public HTML and image without a login or JavaScript. They may cache old previews; their refresh/debug tools may be needed.

These four metadata substitutions are the only expected hosting-specific difference from the verified ZIP. Record the configured URL and new index.html checksum in your deployment log; the original build-manifest hash for index.html will intentionally differ. Do not alter the original ZIP or claim the edited index still matches its original hash.

## Hosting requirements, MIME and caching

Any HTTPS static host that serves directory indexes and query strings is sufficient. Current browsers must support JavaScript ES modules, Canvas, localStorage and modern CSS. Fonts, illustrations and videos are included locally.

Serve `.js` as `text/javascript` or `application/javascript`, `.css` as `text/css`, `.html` as `text/html`, `.svg` as `image/svg+xml`, `.woff2` as `font/woff2`, `.webp` as `image/webp`, `.png` as `image/png`, and `.mp4` as `video/mp4`. Do not return an HTML fallback for missing modules or assets. Do not force downloads for runtime JS. If a CSP is installed, permit same-origin modules/fonts/images/media, the inline styles the UI uses, and `data:` images used by generated scorecards. No third-party scripts are required.

Use `Cache-Control: no-cache` for index.html and release metadata. Filenames are not content-hashed: use revalidation or short cache lifetimes for JS/CSS at a stable URL; reserve long `immutable` caching for genuinely versioned URLs. Upload atomically or use a release-directory switch so users do not receive mixed versions. Avoid aggressive HTML/media injection or script rewriting by the host.

## Saves and privacy

Saves, personal best and guidance use the isolated `hsc-tycoon-v20`, `hsc-tycoon-v20-best`, and `hsc-tycoon-v20-guidance` browser-local keys. Internal save schema 1190 is deliberately retained; it is not a player-facing version label. Older version keys remain untouched.

There is no cloud synchronization. Saves do not generally transfer from GitHub Pages to an HSC domain, across devices, browsers or profiles. Clearing site data deletes them; private browsing or blocked storage can prevent persistence. Different paths on the same origin share storage, so two V20 installations on that origin share these keys. Do not rename keys during this deployment or promise save migration. Rollback of a future incompatible schema must be assessed before release; this package adds no schema changes.

## Rollback

Keep the previous complete deployment directory and its manifest. On a critical fault, atomically restore the previous directory/pointer, restore its canonical metadata if required, and invalidate the stable HTML/JS/CSS cache. Do not mix modules from releases, clear customer storage, or overwrite old GitHub preview directories. Retest page load, one trade and reload after switching back. The `/v119xq/` preview remains an unchanged reference, with a separate save namespace.

## What has and has not been verified

See RELEASE_MANIFEST.md and the linked QA record for the exact source, preview commit, checksum and coverage. The release gate includes a complete automated browser campaign, focused browser/engine regressions, responsive onboarding, saves and static-path checks. Browser campaign actions are automated and use test-controlled clocks/planning; simulations and fixtures are identified separately. This is not first-time human usability research. Safari/Firefox, host-specific headers/CDNs, long-term retention and real social-crawler cache refresh must be checked by the receiving team as applicable. No production HSC migration has been performed.
