// THE TAPE: results, the old way vs the floor, post-credits, and the coupon.
// SOURCE (post-credits): "Your phone rings. It's the broker from last quarter.
// He found a guy who knows a guy..." (the "Can't talk now, Jim." reply was cut).

import { BRAND, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR } from '../config.js';
import { PERSONAS } from '../data/personas.js';
import { $, esc, int, usd, dur, wallClock, wait } from '../util.js';
import { ptDay } from '../daily.js';
import { ctaUrl, canChallenge, challengeUrl } from '../share/links.js';
import { tapeFacts, versus, postText, xText, linkedInCaption, cardData } from '../share/text.js';
import { openShareSheet } from '../ui/sharesheet.js';

export default function results(root, ctx) {
  // A venture floor never ends here: it has its own quarter report, and must
  // never be recorded in this device's daily stats.
  if (ctx.run && ctx.run.kind === 'venture') { setTimeout(() => ctx.go(ctx.ventureScreen())); return null; }
  const run = ctx.run;
  const md = run.mandate;
  const m = run.market;
  const r = ctx.mode.summarize(run);
  const draft = BRAND.showDraftMarkers;
  let alive = true;

  const score = ctx.mode.score ? ctx.mode.score(run, r) : { total: 0, parts: [] };
  const rec = record(ctx, run, r, score);
  // The Deal Lab (V3 experiment): its own score, par and hindsight; never shared.
  const lab = run.kind === 'lab';
  const book = lab && ctx.mode.book ? ctx.mode.book(run) : null;
  const vs = lab ? null : versus(run, score);

  const closeLabel = r.closeT != null ? `${dur(r.closeT)} on the floor (12:00 → ${wallClock(r.closeT, m.duration, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR).label})` : '—';
  const trades = r.deals.length;
  const others = PERSONAS.filter((p) => !p.playable);

  root.innerHTML = `
    <div class="tape-screen">
      <header class="rs-head">
        <div class="rs-kicker ui">${esc(floorTag(run))} · ${run.filledAt != null ? `${esc(wallClock(run.filledAt, m.duration, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR).label)} · ${lab && ctx.mode.filledTag ? esc(ctx.mode.filledTag) : 'NEED SHEET FILLED'}` : '5:00 PM · THE BELL'} · ${esc(md.company.toUpperCase())}</div>
        <h1 class="rs-hl hl-cond">${esc(r.headline)}</h1>
        ${lab ? '' : `<div class="rs-rating stamp ${r.filled ? 'spot' : ''} stamp-in" style="--rot:-5deg">${esc(r.rating)}</div>
        <p class="rs-line hl">${esc(r.line)}</p>`}
        ${trades || vs ? `
        <div class="rs-score">
          <div class="sc-total"><span class="sc-h ui">${lab ? esc(ctx.mode.scoreLabel || 'LAB SCORE') : 'FLOOR SCORE'}</span><b class="sc-n hl">${int(score.total)}</b>${rec.newBest ? '<span class="stamp spot sc-best stamp-in" style="--rot:-8deg">NEW BEST</span>' : ''}</div>
          ${score.parts.length ? `<ul class="sc-parts">${score.parts.map((p) => `<li><span>${esc(p.label)}</span> <b>${int(p.pts)}</b>${p.max != null ? `<i>/${int(p.max)}</i>` : ''}</li>`).join('')}</ul>` : ''}
          ${vs ? `<p class="sc-vs ${vs.won ? 'won' : vs.tie ? 'tie' : 'lost'}">${esc(vs.result)}</p>` : ''}
          <p class="sc-meta">${esc(rec.meta)}</p>
        </div>` : `<p class="sc-meta solo">${esc(rec.meta)}</p>`}
        ${lab ? '' : '<button class="btn big spot share-open pending" type="button">SHARE THE TAPE</button>'}
      </header>
      ${lab ? `<div class="again-row lab-again">
        <button class="btn big spot again" type="button">SAME MARKET</button>
        <button class="btn big replay" type="button">NEW MARKET</button>
      </div>` : ''}
      ${lab && ctx.mode.ledgerHTML ? ctx.mode.ledgerHTML(run) : ''}
      ${book ? labBook(book, run) : ''}

      <section class="rs-summary paper">
        ${trades ? `
        <div class="rs-big">
          <div class="rs-qty hl">${int(r.secured)} <span>${esc(r.gpuLabel)}</span></div>
          <div class="rs-where">${esc(r.sites.join(' + '))}</div>
          <div class="rs-rate hl">${usd(r.avg)}<small>/GPU-hour${r.financed ? ' effective' : ''}</small></div>
          <div class="rs-term">${r.terms.map((t) => `${t}-month`).join(' + ')} term</div>
        </div>
        <dl class="rs-stats">
          <dt>Market benchmark</dt><dd>${usd(r.bench)}</dd>
          <dt>Time to close</dt><dd>${esc(closeLabel)}</dd>
          <dt>Versus the board</dt><dd>${r.savings >= 0 ? `$${int(r.savings)} saved` : `$${int(-r.savings)} paid above`} over the term</dd>
          <dt>Trades signed</dt><dd>${trades}</dd>
        </dl>` : `
        <div class="rs-big empty">
          <div class="rs-qty hl">0 <span>/ ${int(md.qty)} ${md.gpu}</span></div>
          <div class="rs-where">Nothing signed. The bell doesn’t wait.</div>
        </div>`}
        <ul class="rs-checks">
          ${r.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}"><span>${c.ok ? '✓' : '✕'}</span>${esc(c.label)}${c.detail ? ` <em>${esc(c.detail)}</em>` : ''}</li>`).join('')}
        </ul>
        ${trades ? `<ol class="rs-contracts">${r.deals.map((d) => `
          <li>${d.lab ? `<b class="lab-chip g-${esc(d.lab.grade)}">${esc(d.lab.label)}</b> <span class="lab-chip-pts">${d.lab.pts < 0 ? '−' : '+'}${int(Math.abs(d.lab.pts))}</span> · ` : ''}<b>${int(d.qty)} × ${d.gpu}</b> · ${esc(d.siteLabel)} · ${d.term} mo · ${usd(d.rate)}${d.financed ? ` + ${usd(d.fee)} financing` : ''} · <span class="muted">${esc(d.firm)}</span></li>`).join('')}</ol>` : ''}
      </section>

      <section class="rs-versus" ${lab ? 'hidden' : ''}>
        <div class="vs old">
          <div class="vs-h ui">THE OLD WAY</div>
          <div class="vs-big hl">7 weeks</div>
          <div>23 calls · 1 NDA · 14 initials</div>
          <div class="vs-gpus">0 GPUs</div>
        </div>
        <div class="vs-mid hl-cond">vs</div>
        <div class="vs new">
          <div class="vs-h ui">THE FLOOR</div>
          <div class="vs-big hl">${r.closeT != null ? dur(r.closeT) : '4m 00s'}</div>
          <div>${trades} trade${trades === 1 ? '' : 's'} · 0 NDAs · 1 signature${trades === 1 ? '' : ' each'}</div>
          <div class="vs-gpus">${int(r.secured)} GPUs</div>
        </div>
      </section>

      <section class="rs-credits" hidden>
        <div class="pc-kicker ui">YOUR CORNER OFFICE · A FEW WEEKS LATER</div>
        <div class="slip pc-slip" style="--rot:-3deg">
          <div class="slip-h">WHILE YOU WERE OUT</div>
          <div class="slip-row"><b>FROM</b> Jim · your broker</div>
          <div class="slip-msg">“Found a guy who knows a guy. Can get you capacity in Q2 next year.”</div>
          <div class="slip-f">☒ PLEASE CALL</div>
        </div>
        ${r.filled ? '' : '<p class="pc-line hl">Jim’s on line one. Next time, close.</p>'}
      </section>

      <section class="rs-cta paper">
        <div class="cta-cut" aria-hidden="true">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
        <p class="cta-kicker">${esc(BRAND.cta.kicker)}</p>
        ${BRAND.logoSrc ? `<img class="cta-logo" src="${esc(BRAND.logoSrc)}" alt="${esc(BRAND.name)}">` : `<div class="wordmark hl-cond">${esc(BRAND.wordmark)}</div>`}
        <p class="cta-hl hl">${esc(BRAND.cta.headline)}</p>
        <p class="cta-where caps">${esc(BRAND.cta.where)} · ${esc(BRAND.city)}</p>
        ${BRAND.cta.url && BRAND.cta.url !== '#'
          ? `<a class="btn big ink cta-btn" href="${esc(ctaUrl())}" target="_blank" rel="noopener">${esc(BRAND.cta.button)}</a>`
          : `<span class="btn big ink cta-btn" aria-disabled="true">${esc(BRAND.cta.button)}${draft ? ' <i class="draft">link tbc</i>' : ''}</span>`}
        <p class="cta-foot">${esc(BRAND.cta.foot)}</p>
        <p class="cta-fine">${esc(BRAND.cta.fine)}</p>
      </section>

      <section class="rs-again">
        <div class="again-row">
          ${lab ? '' : `<button class="btn big spot replay" type="button">NEW NEED SHEET</button>
          <button class="btn big again" type="button">SAME FLOOR AGAIN</button>`}
          <button class="btn big sides" type="button">${lab ? 'THE MAIN PAGE' : 'CHANGE SIDES'}</button>
        </div>
        <ul class="badges">
          ${others.map((p) => `
            <li class="badge-mini side-${p.side}">
              <span class="bm-band">${esc((p.coupon || 'Broker').toUpperCase())}</span>
              <span class="bm-title">${esc(p.title)}</span>
              <span class="bm-teaser">${esc(p.teaser)}</span>
              <span class="bm-lock ui">${lab ? 'COMING SOON' : 'NEXT SESSION'}</span>
            </li>`).join('')}
        </ul>
        <p class="fictional-note">${esc(BRAND.fictionNote)} Seed ${run.seed}. Scores and streaks are kept on this device only.</p>
      </section>
    </div>`;

  ctx.audio.stamp();

  // The lab goes straight back onto a floor: no letter, no lobby.
  $(root, '.replay').addEventListener('click', () => { if (lab) { ctx.newLab(); ctx.go('floor'); } else { ctx.firstRun(); ctx.go('sheet'); } });
  $(root, '.again').addEventListener('click', () => { if (lab) { ctx.newLab({ seed: run.seed }); ctx.go('floor'); } else { ctx.newRun({ seed: run.seed, challenge: run.challenge, dailyOf: run.dailyOf }); ctx.go('sheet'); } });
  $(root, '.sides').addEventListener('click', () => ctx.go(lab ? 'home' : 'ad'));
  if (lab) {
    // No share, no challenge link: a lab score isn't comparable with the Daily's.
    (async () => { await wait(1600); if (!alive) return; const pc = $(root, '.rs-credits'); pc.hidden = false; ctx.audio.ring(1); await wait(1300); if (alive) pc.classList.add('answered'); })();
    return () => { alive = false; };
  }

  // The ticket is printed in the background now, so the share sheet can hand
  // it straight to the phone's share sheet on the tap.
  const facts = { ...tapeFacts(run, r, score), newBest: rec.newBest };
  const challenge = canChallenge() && trades > 0;
  const link = challenge
    ? challengeUrl({ seed: run.seed, iso: run.dailyOf ? run.dailyOf.iso : null, score: score.total, name: ctx.player.name, tries: rec.tries, rules: ctx.mode.rulesVersion ?? 1 })
    : BRAND.share.gameUrl || BRAND.cta.url;
  const card = import('../share/card.js')
    .then((mod) => mod.renderCard(cardData(facts, vs, link)))
    .catch(() => null);
  let sheet = null;
  const shareBtn = $(root, '.share-open');
  shareBtn.addEventListener('click', () => {
    ctx.audio.tap();
    sheet = openShareSheet(document.body, {
      card,
      text: postText(facts, vs, link, challenge),
      xText: xText(facts, vs, challenge),
      xUrl: link,
      caption: linkedInCaption(facts, vs, link, challenge),
      url: link,
      fileName: `the-floor-${run.kind === 'daily' ? run.daily.label.toLowerCase() : `practice-${run.seed}`}.png`,
      audio: ctx.audio,
      onClose: () => { sheet = null; },
    });
  });

  // Post-credits: the phone rings a beat after you land here.
  (async () => {
    await wait(1600);
    if (!alive) return;
    const pc = $(root, '.rs-credits');
    pc.hidden = false;
    ctx.audio.ring(1);
    await wait(1300);
    if (!alive) return;
    pc.classList.add('answered');
    await wait(500);
    if (!alive) return;
    shareBtn.classList.remove('pending');
    shareBtn.classList.add('arrive');
  })();

  return () => { alive = false; sheet?.close(); };
}

// "T-38" / "PRACTICE" / "TEST FLOOR" for the kicker.
function floorTag(run) {
  if (run.kind === 'daily') return `TODAY’S FLOOR ${run.daily.label}`;
  if (run.kind === 'lab') return 'DEAL LAB';
  return run.kind === 'dev' ? 'TEST FLOOR' : 'PRACTICE FLOOR';
}

// Records the run on this device once: the official daily, bests, play counts.
function record(ctx, run, r, score) {
  if (!run.record) {
    const stats = ctx.stats;
    const result = { score: score.total, rating: r.rating, seed: run.seed };
    run.deskNote = ctx.mode.deskNote ? ctx.mode.deskNote(run, r) : null;
    if (run.kind === 'dev' || run.kind === 'venture' || run.kind === 'lab') {
      run.record = { tries: 1, newBest: false, meta: run.kind === 'lab' ? `Deal Lab, seed ${run.seed}: not recorded. Lab scores don't compare with the Daily's.` : `Test floor (seed ${run.seed}): not recorded.` };
    } else {
      const tries = stats.countPlay(run.seed);
      const official = run.kind === 'daily' && stats.finishDaily(run.daily, result);
      const kind = official ? 'daily' : 'practice';
      const prev = r.deals.length ? stats.recordBest(kind, result) : stats.best(kind);
      const newBest = Boolean(prev) && r.deals.length > 0 && score.total > prev.score;
      const best = Math.max(prev ? prev.score : 0, r.deals.length ? score.total : 0);
      const streak = stats.streak(ptDay());
      const meta = official
        ? [`Your official run for today’s floor, ${run.daily.label}.`, streak > 1 ? `${streak} days running.` : '', prev ? `Best daily: ${int(best)}.` : '', 'Back tomorrow for a new floor.']
        : [run.daily ? 'Today’s floor was already played on this device, so this run is practice.' : `Practice floor${tries > 1 ? `, try ${tries}` : ''}.`, best ? `Best practice: ${int(best)}.` : ''];
      run.record = { tries, newBest, meta: meta.filter(Boolean).join(' ') };
    }
  }
  return run.record;
}

// Deal Lab: par, where your gap to par went, your best and worst calls, and what the floor offered (labMode.book).
const WANT_NAME = { certainty: 'wanted a long tenant', volume: 'wanted the racks empty', quick: 'were on the clock', respect: 'were proud', hungry: 'were hungry', none: 'just haggled', desperate: 'were desperate' };
const STORY = { squeeze: 'A lab went shopping and the board jumped: noon was the time to buy.', slide: 'Racks landed early and the board dropped: waiting paid.', calm: 'A calm day: no big move.' };
const WANT_MET = { certainty: 'and you gave them the term', volume: 'and you took the whole block', quick: 'and you closed in time', respect: 'and you played it straight', hungry: 'and you opened bold', desperate: 'and you opened bold' };
// BANK OR PUSH on the tape: what you did, and what the push was worth played perfectly.
const signed = (n) => `${n < 0 ? '−' : '+'}${int(Math.abs(n))}`;
const PUSH_LOST = { gone: 'Another broker got there first', open: 'No deal before the floor closed' };
function pushLine(p) {
  const best = `${esc(p.seller)} at ${esc(p.firm)} ${p.want === 'none' ? 'just haggled' : WANT_NAME[p.want]}: the best you could have done was about ${usd(p.bestRate)}, ${signed(p.best)}.`;
  const text = p.state === 'banked' ? `You banked ${int(p.bank)}. The push: ${esc(p.client)}’s ${int(p.qty)} ${esc(p.gpu)} under ${usd(p.price)}. ${best}`
    : p.state === 'signed' ? `${int(p.qty)} ${esc(p.gpu)} for ${esc(p.client)} at ${usd(p.rate)} against their ${usd(p.price)}: <b>${signed(p.pts)}</b>. ${best}`
      : `${PUSH_LOST[p.reason] || PUSH_LOST.open}: <b>${signed(p.pts)}</b>. ${best}`;
  return `<p class="lb-push ${p.pts > 0 ? 'win' : p.pts < 0 ? 'loss' : ''}"><span class="ui">${p.state === 'banked' ? 'BANKED' : 'THE PUSH'}</span> ${text}</p>`;
}
function labBook(b, run) {
  const c = (x) => `${Math.round(Math.abs(x) * 100)}¢`;
  const under = (p) => (p <= b.target ? `${c(b.target - p)} under target` : `${c(p - b.target)} over target`);
  const legs = b.par ? b.par.legs.map((l) => `${esc(l.firm)}, ${l.term} mo`).join(' + ') : '';
  const y = b.yours;
  const verdict = !y || y.vsPar == null ? '' : y.vsPar < 0 ? `${c(y.vsPar)} UNDER PAR` : y.vsPar === 0 ? 'ON PAR' : `${c(y.vsPar)} OVER PAR`;
  const lever = y && y.vsPar > 0 && y.haggle != null
    ? (y.choice >= y.haggle ? `Most of the gap was the desk and term you chose (${c(Math.max(0, y.choice))}); the haggle cost ${c(y.haggle)}.` : `Most of the gap was the haggle (${c(y.haggle)}); the desk and term cost ${c(Math.max(0, y.choice))}.`)
    : '';
  const call = (d) => `${esc(d.firm)}, ${int(d.qty)} × ${d.term} mo at ${usd(d.real)} real (${d.lab.label}${d.lab.want && d.lab.want !== 'none' ? `; they ${WANT_NAME[d.lab.want]}${d.lab.met && WANT_MET[d.lab.want] ? `, ${WANT_MET[d.lab.want]}` : ''}` : ''})`;
  const after = b.after && b.noon ? (b.after.real < b.noon.real ? `${c(b.noon.real - b.after.real)} better than noon` : b.after.real > b.noon.real ? `${c(b.after.real - b.noon.real)} worse than noon` : 'the same as noon') : '';
  return `
      <section class="lab-book paper">
        <div class="lb-h caps">The book · Deal Lab</div>
        ${b.par ? `<p class="lb-par"><b>Par</b> ${usd(b.par.real)} real, ${under(b.par.real)}: the best a perfect negotiator who reads every seller could do at noon (${legs}).</p>` : ''}
        ${y ? `<p class="lb-you"><b>You</b> ${usd(y.avg)} real${verdict ? ` · <b class="lb-vs ${y.vsPar <= 0 ? 'win' : ''}">${verdict}</b>` : ''}</p>` : '<p class="lb-you">Nothing signed.</p>'}
        ${lever ? `<p class="lb-lever">${lever}</p>` : ''}
        <ul class="lb-hind">
          ${b.best ? `<li><span class="ui">BEST CALL</span> ${call(b.best)}.</li>` : ''}
          ${b.worst ? `<li><span class="ui">WEAKEST</span> ${call(b.worst)}.</li>` : ''}
          ${b.noon ? `<li><span class="ui">NOON</span> The best real price on the floor: ${usd(b.noon.real)} at ${esc(b.noon.firm)}, ${b.noon.term} mo.</li>` : ''}
          ${b.after ? `<li><span class="ui">AFTER 1 PM</span> The best: ${usd(b.after.real)} at ${esc(b.after.firm)}, ${b.after.term} mo, ${esc(b.after.at)}: ${after}.</li>` : ''}
        </ul>
        ${b.push ? pushLine(b.push) : ''}
        ${b.next ? `<p class="lb-next"><span class="ui">NEXT TIME</span> ${esc(b.next)}</p>` : ''}
        ${b.story ? `<p class="lb-story"><span class="ui">THE MARKET</span> ${STORY[b.story.id]} The early word ${b.story.honest ? 'was right' : 'was wrong'}.</p>` : ''}
        <p class="muted small">Real price = rate + financing + what you lose on months past ${b.use} and GPUs past your need. Par is noon play only: the afternoon can beat it. Hindsight is the floor replayed without you. Seed ${run.seed}${run.labTry > 1 ? `, try ${run.labTry} on this floor` : ''}.</p>
      </section>`;
}
