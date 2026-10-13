// SHARE THE TAPE: the ticket image and every way out of the building with it.
// The image is always shown, so long-press / right-click saving still works
// where downloads, the clipboard or the share sheet are blocked (embedded
// previews, in-app browsers).

import { el, $, esc } from '../util.js';
import { xIntent, linkedInShare } from '../share/links.js';

export function openShareSheet(host, { card, text, xText, xUrl, caption, url, fileName, audio, onClose }) {
  const opener = document.activeElement;
  const node = el(`
    <div class="sheet-scrim share-scrim">
      <div class="share-sheet paper" role="dialog" aria-modal="true" aria-labelledby="ss-title">
        <header class="ss-head">
          <span class="ss-title ui" id="ss-title">SHARE THE TAPE</span>
          <button class="btn ss-x" type="button" aria-label="Close">✕</button>
        </header>
        <div class="ss-body">
          <figure class="ss-card">
            <div class="ss-printing ui">PRINTING YOUR TICKET…</div>
            <figcaption class="ss-hint">Long-press or right-click the ticket to save it.</figcaption>
          </figure>
          <div class="ss-actions">
            <button class="btn big spot ss-native" type="button" hidden>SHARE…</button>
            <a class="btn big ink ss-save" download="${esc(fileName)}" hidden>SAVE IMAGE</a>
            <a class="btn ss-x-post" href="${esc(xIntent(xText, xUrl))}" target="_blank" rel="noopener">POST ON X</a>
            <div class="ss-li">
              <span class="ss-li-h ui">LINKEDIN</span>
              <button class="btn ss-li-copy" type="button">1 · COPY CAPTION</button>
              <a class="btn ss-li-open" href="${esc(linkedInShare(url))}" target="_blank" rel="noopener">2 · OPEN LINKEDIN</a>
            </div>
            <button class="btn ss-copy" type="button">COPY TEXT</button>
            <p class="ss-status" role="status"></p>
            <textarea class="ss-text" readonly rows="7" aria-label="Text to share" hidden></textarea>
          </div>
        </div>
      </div>
    </div>`);
  host.appendChild(node);
  // A modal: the page behind it can't take focus or clicks until it closes.
  const behind = [document.getElementById('app'), document.querySelector('.chrome')].filter(Boolean);
  behind.forEach((n) => { n.inert = true; });

  const status = $(node, '.ss-status');
  const box = $(node, '.ss-text');
  const say = (msg) => { status.textContent = msg; };
  let blobUrl = null;
  let file = null;
  let closed = false;

  // Clipboard first; where it's refused, show the text selected for a manual copy.
  async function copy(str, done) {
    try {
      await navigator.clipboard.writeText(str);
      say(done);
      return;
    } catch { /* fall through */ }
    box.hidden = false;
    box.value = str;
    box.focus();
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    say(ok ? done : touch ? 'Selected below: tap and hold the text to copy it.' : 'Selected below: press Ctrl+C (⌘C on a Mac) to copy.');
  }

  card.then((blob) => {
    if (closed) return;
    const fig = $(node, '.ss-card');
    const native = $(node, '.ss-native');
    if (!blob) {
      $(node, '.ss-printing').textContent = 'The ticket didn’t print. The text still works.';
      $(node, '.ss-hint').hidden = true;
      if (navigator.share) { native.hidden = false; native.textContent = 'SHARE TEXT…'; }
      return;
    }
    blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.className = 'ss-img';
    img.alt = text;
    img.src = blobUrl;
    $(node, '.ss-printing').replaceWith(img);
    fig.classList.add('printed');
    file = new File([blob], fileName, { type: blob.type || 'image/png' });
    const save = $(node, '.ss-save');
    save.href = blobUrl;
    let filesOk = false;
    try { filesOk = Boolean(navigator.canShare?.({ files: [file] })); } catch { filesOk = false; }
    if (filesOk || navigator.share) {
      native.hidden = false;
      native.dataset.files = filesOk ? '1' : '';
      if (!filesOk) native.textContent = 'SHARE TEXT…';
    }
    // Phones save through the share sheet; elsewhere offer the file.
    save.hidden = filesOk;
  });

  // Called straight from the tap: Safari refuses share() after an await.
  $(node, '.ss-native').addEventListener('click', (e) => {
    const b = e.currentTarget;
    const data = b.dataset.files ? { files: [file], text } : { text };
    b.disabled = true;
    navigator.share(data)
      .then(() => say('Shared.'))
      .catch((err) => { if (err && err.name !== 'AbortError') say('This browser wouldn’t share it. Save the image or copy the text instead.'); })
      .finally(() => { b.disabled = false; });
  });

  $(node, '.ss-copy').addEventListener('click', () => copy(text, 'Copied. Paste it anywhere.'));
  $(node, '.ss-li-copy').addEventListener('click', () => copy(caption, 'Caption copied. Now open LinkedIn and paste it into your post.'));
  $(node, '.ss-x-post').addEventListener('click', () => audio?.tap());

  function close() {
    if (closed) return;
    closed = true;
    behind.forEach((n) => { n.inert = false; });
    window.removeEventListener('keydown', onKey);
    node.classList.add('leaving');
    setTimeout(() => {
      node.remove();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }, 180);
    if (opener && opener.focus) opener.focus();
    onClose?.();
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  window.addEventListener('keydown', onKey);
  $(node, '.ss-x').addEventListener('click', close);
  node.addEventListener('click', (e) => { if (e.target === node) close(); });
  $(node, '.ss-x').focus();

  return { close };
}
