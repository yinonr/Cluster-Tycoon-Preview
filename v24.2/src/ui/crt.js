// V10.18 Scene 4: the desk Mac becomes the screen. As on hscompute.com's desk, the beige Mac plays HSC's film on its
// CRT. The camera pushes in from the desk Mac, static rolls and tunes in, the film plays at its own 4:3 picture.
// Sound follows the opening's SOUND switch; when the browser blocks sound the film starts muted with a SOUND ON
// prompt; when it blocks playback entirely a play button appears. A missing or failed file shows NO SIGNAL. The film
// downloads only when this scene starts (preload none), and stops downloading when it ends or is skipped.
import { esc } from '../util.js';
import { AD } from '../media.js';

const icon = {
  on: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  off: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/><path d="M11 6l4 4M15 6l-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  replay: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2.6 2.2v3.6h3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l8 5-8 5z" fill="currentColor"/></svg>',
};

export function playCrt(host, { from, audio, sound, calm, done, changed = () => {} }) {
  let alive = true, finished = false, timer = 0, stall = 0;
  const narrow = window.matchMedia?.('(max-width: 599.98px)').matches || navigator.connection?.saveData;
  const stage = document.createElement('div');
  stage.className = 'crt-stage';
  stage.setAttribute('role', 'region');
  stage.setAttribute('aria-label', 'Haight Street Compute film');
  stage.innerHTML = `
    <div class="crt-mac beige">
      ${AD.notice ? `<p class="crt-notice">${esc(AD.notice)}</p>` : ''}
      <div class="crt-bezel">
        <div class="crt-screen">
          <video class="crt-video" playsinline preload="none" poster="${esc(AD.poster)}" aria-describedby="crt-desc"></video>
          <div class="crt-static" aria-hidden="true"></div>
          <div class="crt-scan" aria-hidden="true"></div>
          <div class="crt-nosignal" hidden><b>NO SIGNAL</b><span>The film could not load.</span></div>
          <button type="button" class="crt-play" hidden aria-label="Play the film">${icon.play}</button>
        </div>
      </div>
      <div class="crt-chin">
        <button type="button" class="crt-btn crt-sound" aria-pressed="false"><span class="crt-ico"></span><span class="crt-sound-label">Sound off</span></button>
        <button type="button" class="crt-btn crt-replay">${icon.replay}<span>Replay</span></button>
        <button type="button" class="crt-btn crt-continue is-primary">Continue <span aria-hidden="true">→</span></button>
      </div>
      <p class="sr-only" id="crt-desc">${esc(AD.description)}</p>
    </div>`;
  host.appendChild(stage);
  const $ = sel => stage.querySelector(sel);
  const video = $('.crt-video'), mac = $('.crt-mac');

  const paintSound = () => {
    const on = !video.muted;
    $('.crt-sound').setAttribute('aria-pressed', String(on));
    $('.crt-sound .crt-ico').innerHTML = on ? icon.on : icon.off;
    $('.crt-sound-label').textContent = on ? 'Sound on' : 'Sound off';
    stage.classList.toggle('is-muted', !on);
  };
  const finish = () => { if (finished) return; finished = true; cleanup(); done(); };
  function cleanup() {
    alive = false; clearTimeout(timer); clearTimeout(stall);
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* already gone */ }
  }
  const noSignal = () => {
    if (!alive) return;
    clearTimeout(stall);
    stage.classList.add('is-nosignal');
    $('.crt-nosignal').hidden = false; $('.crt-play').hidden = true;
    $('.crt-continue').focus({ preventScroll: true });
  };
  async function start() {
    video.muted = !sound.on;
    try { await video.play(); }
    catch (e) {
      if (!alive || e?.name === 'NotSupportedError') return noSignal();
      video.muted = true;                          // autoplay with sound refused: start muted, offer sound
      try { await video.play(); } catch { if (alive) { $('.crt-play').hidden = false; $('.crt-play').focus({ preventScroll: true }); } }
    }
    paintSound();
  }

  video.addEventListener('playing', () => { clearTimeout(stall); stage.classList.add('is-playing'); $('.crt-play').hidden = true; });
  video.addEventListener('error', noSignal);
  video.addEventListener('ended', () => { stage.classList.add('is-ended'); timer = setTimeout(finish, 900); });
  video.addEventListener('timeupdate', () => { if (AD.end != null && video.currentTime >= AD.end) { video.pause(); video.dispatchEvent(new Event('ended')); } });
  video.addEventListener('volumechange', paintSound);
  $('.crt-play').addEventListener('click', () => { $('.crt-play').hidden = true; video.play().catch(noSignal); });
  $('.crt-sound').addEventListener('click', () => {
    video.muted = !video.muted;
    sound.set(!video.muted);                       // the film's switch is the opening's SOUND switch
    changed();
    if (video.paused && video.src && !stage.classList.contains('is-nosignal')) video.play().catch(() => {});
  });
  $('.crt-replay').addEventListener('click', () => {
    if (stage.classList.contains('is-nosignal')) return;
    clearTimeout(timer); stage.classList.remove('is-ended');
    video.currentTime = AD.start || 0; video.play().catch(() => {});
  });
  $('.crt-continue').addEventListener('click', finish);
  paintSound();

  // The push-in: the desk Mac's rectangle grows into the stage Mac (a cut with reduced motion or MOTION off).
  const target = mac.getBoundingClientRect(), source = from?.getBoundingClientRect?.();
  if (!calm && source && source.width) {
    const sx = source.width / target.width, dx = source.left + source.width / 2 - (target.left + target.width / 2), dy = source.top + source.height / 2 - (target.top + target.height / 2);
    mac.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx})` }, { transform: 'none' }], { duration: 760, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: calm ? 250 : 420, fill: 'backwards' });
  audio.crtOn();
  // Static tunes in, then the picture. The file is requested only now.
  const tune = calm ? 200 : 1100;
  timer = setTimeout(() => {
    if (!alive) return;
    audio.hiss(.6);
    video.src = narrow ? AD.src.narrow : AD.src.wide;
    if (AD.start) video.currentTime = AD.start;
    if (AD.captions) { const t = document.createElement('track'); t.kind = 'captions'; t.srclang = 'en'; t.label = 'English'; t.src = AD.captions; t.default = true; video.appendChild(t); }
    stall = setTimeout(() => { if (alive && video.readyState < 2) noSignal(); }, 20000);
    start();
  }, tune);
  $('.crt-continue').focus({ preventScroll: true });
  // The opening's SOUND pill drives the film too (a press is a user gesture, so unmuting is allowed).
  const follow = (on) => { if (alive) video.muted = !on; };
  return { stop: cleanup, finish, sound: follow };
}
