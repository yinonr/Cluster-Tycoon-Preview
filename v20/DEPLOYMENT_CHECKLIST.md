# V20 deployment checklist

Release source/tag: see RELEASE_MANIFEST.md. Deploy all ZIP contents together; no build or backend is required.

- [ ] Verify `cluster-tycoon-v20.zip` SHA-256 matches RELEASE_MANIFEST.md; retain a rollback copy of the previous site.
- [ ] Upload the extracted contents to the intended HTTPS directory and configure its directory index/trailing slash.
- [ ] Replace the four canonical/social image URL prefixes in index.html with the final directory URL; record the change.
- [ ] Open the page in a fresh browser profile. Confirm V20, fonts, logo, welcome images and optional intro media load without 404s or console errors.
- [ ] Check 1280×800 desktop and 390×844/320×640 phones: no horizontal page overflow, readable numbers, visible focus, and accessible ENTER THE FLOOR.
- [ ] Name a company, read/swipe the three welcome panels, confirm the goal appears early, and enter the floor.
- [ ] Open a supplier, complete the first purchase/signature, allocate chips and build a project. Confirm cash and inventory change once.
- [ ] Finish a round, try integration or the crew fallback, and reach the board report without an error. Check a pilot/infra description distinguishes payments, base income and costs.
- [ ] Reload and confirm the current campaign resumes; verify browser storage is allowed. Do not clear real users' saves.
- [ ] Open a `?seed=102` challenge link and confirm query parameters survive redirects.
- [ ] Fetch canonical/og:url and the absolute social-preview.png publicly; verify correct MIME types and social preview in the target channel. Share only with authorized recipients.
- [ ] Confirm short/revalidated caches at the stable URL, retain source/preview/checksum metadata, and record engineer/date/host/configured URL.
- [ ] If a critical check fails, restore the previous whole release and invalidate caches; preserve saves and record the failure.
