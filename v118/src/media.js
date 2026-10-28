// V10.18 cinematic media. One place to swap in approved files: the CRT film, its captions, the opening still.
// TEMPORARY PREVIEW CUT (owner decision, 28 Oct): the first 0:00–0:22.4 of the supplied "Oct 20 Buyer Assembly v1"
// upload, unedited apart from the 4:3 picture crop and a quarter-second fade at the end. It stops on "and you may
// be entitled to a seat on the floor", before the film's outdated early-access dates (from 0:23) and its
// unverified phone line (0:42). The full commercial is not shipped. Replace with the approved film when HSC
// supplies it (docs/V10_18_AUDIT.md §2).
export const AD = Object.freeze({
  title: 'Haight Street Compute: Attention GPU buyers',
  src: Object.freeze({ wide: 'media/hsc-film-preview-540.mp4', narrow: 'media/hsc-film-preview-360.mp4' }),
  poster: 'media/hsc-film-preview-poster.jpg',
  captions: null,            // an approved WebVTT of the spoken words, when HSC supplies the script
  start: 0, end: null,       // an approved excerpt within a longer file, in seconds (null: the whole file)
  notice: null,              // a short note on the bezel, if a cut ever needs one
  // What the excerpt shows, for assistive technology (its words are on screen; the speech is not transcribed).
  description: 'The opening of a deliberately retro HSC commercial in the style of a 1980s lawyer ad, presented ' +
    'by Babur Khwaja, “not an attorney”. On screen: Attention GPU buyers! Have you or someone you know paid too ' +
    'much for compute? If you’ve experienced any of the following: six weeks of sales calls for a single quote. ' +
    'Three quotes that don’t match. Capacity that disappeared halfway through the negotiation. A broker who left ' +
    'you on read? You may be suffering from compute overpayment, and you may be entitled to a seat on the floor. ' +
    'A news crawl adds: November 17th, 400 Sansome Street, San Francisco. HSCOMPUTE.COM.',
});

// Scene 1 begins where hscompute.com begins: its own baked still of the first view (dusk San Francisco from the
// office glass), and the brand's light street-signs mark as the site publishes it. Both are HSC website assets.
export const WINDOW = Object.freeze({
  still: 'media/hsc-window.jpg',
  mark: 'media/hsc-mark-light.svg',
  alt: 'Dusk over San Francisco from a high office window: the Transamerica Pyramid, the Bay, the hills beyond.',
});
