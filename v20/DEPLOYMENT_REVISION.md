# V20 welcome cleanup deployment revision

Revision: **v20-welcome-cleanup-2026-10-29** · October 29, 2026

Runtime source: [`b527c2e9aeba9640ed3ff7f2e673e00da0687320`](https://github.com/yinonr/HSC-Game/commit/b527c2e9aeba9640ed3ff7f2e673e00da0687320) on `codex/v20-release`.

This revision removes exactly the requested early goal sentence, founder introduction, “Buy / sell → Build → Integrate” line, and mobile swipe instruction. The three illustrated gameplay panels, complete scoring explanation, prominent Enter the Floor CTA, and existing subtitle remain. Only `src/ui/founding.js` and unused rules in `styles/founding.css` change at runtime. Game engines, economics, images, save namespace, and schema remain identical to the original V20.

## Archive and current preview are different revisions

The original `releases/v20/cluster-tycoon-v20.zip`, original release documents, and immutable tags `v20.0.0-rc1` and `v20.0.0-handoff` remain unchanged. The archived ZIP has 114 files and SHA-256 `9527f4eb5c02cd183001597ea1ceee3964adb5a5986002c980b8a5fcf6782db9`. It reflects source `7a997f9cf9c2187cdd2b4b66f59d95a122967875` and preview commit `9c9b71b005a507b087890b74f57809157724d29f`. It still contains the four removed welcome text elements. **No replacement hosting ZIP was issued by this cleanup.**

The current preview's build-manifest.json records the new source and hashes. Publication commit: the commit introducing this revision in `yinonr/Cluster-Tycoon-Preview` (recorded by full SHA in `docs/v20/WELCOME_CLEANUP.md` in the source repository after publication). The original ZIP's build-manifest must not be used to verify this revised preview.

## Reproduce for HSC hosting

1. Download and verify the original immutable hosting ZIP, then extract all 114 files.
2. Replace `src/ui/founding.js` and `styles/founding.css` with the files from the pinned runtime source commit above, under its `v20/` directory. Check these hashes:

| File | SHA-256 |
| --- | --- |
| src/ui/founding.js | `b70ddf1b1d5e015c2efddc903967cb45c610a57baf021e7bac875e71934cae02` |
| styles/founding.css | `02eb6c0e0f8243314de278a284c4f75e5866bcc94d54c9d446ba858360571e22` |

3. From the pinned preview publication commit, also copy the revised `HOSTING.md`, `DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_REVISION.md`, and `build-manifest.json` under `v20/`. These are deployment metadata, separate from the two runtime edits. The revised directory contains 115 files.
4. Verify every file against the revised build-manifest.json before configuring the four production URL metadata entries. Record those intentional index.html changes in the deployment log.
5. Upload the complete directory atomically and run DEPLOYMENT_CHECKLIST.md. Retain the original archive for rollback; do not overwrite it or reuse its checksum for a revised package.

## Focused verification

Local Chrome/Chromium automation passed at 1280×800, 768×1024, 390×844 and 320×640: three loaded illustrations, desktop three-column layout, no horizontal page overflow, keyboard order and visible focus, dialog focus containment, visible CTA, readable full scoring text, real touch swiping, paused gameplay, entry/help/rename/replay, remembered dismissal and protected older saves. Desktop and phone screenshots were visually inspected. The full ten-round campaign was not rerun for this copy-only revision. Safari/Firefox and screen-reader audio were not tested in this pass.
