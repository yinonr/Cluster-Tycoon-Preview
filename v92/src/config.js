// Copy and brand slots. Lines quoted from Notion are marked SOURCE:
//   Treatment (Notion "Treatment", art direction and story, updated Oct 7)
//   Landing page (Notion "Landing Page Copy Scratchpad", the copy live on hscompute.com, updated Oct 6)
// Anything marked UNCONFIRMED is a placeholder; swap it here and the whole game updates.

export const BRAND = {
  name: 'Haight Street Compute',
  wordmark: 'HAIGHT STREET COMPUTE',
  // Approved logo file (SVG/PNG). null = wordmark set in the headline face.
  logoSrc: null, // UNCONFIRMED: no logo file in Notion (HSC_logo_2240px.jpg was shared in Slack #event-nov)

  // SOURCE: Treatment cold open. (The live site reads "No more GPU Clusterfucks.")
  adHeadline: 'No more GPU clusterf---s.',
  // SOURCE: Treatment, Act I, "The invite".
  adBody: [
    'For one day in November, the buyers, the sellers and the money for compute will be in one room.',
    'Anything agreed there gets signed before you leave the building.',
  ],
  adFootnote: 'Bring someone who can sign.', // SOURCE: Treatment, referral slip

  // The magazine page opposite the ad (copy revised Oct 10). The middle part of
  // `continued` links to the landing page (cta.url).
  magazine: {
    folio: 'Business · 47',
    headline: 'San Francisco officially designated as haunted',
    body: [
      'The Ghostological Association of America has released a new annual report that shows San Francisco to be the #1 city for ghost sightings in the entire country.',
      'Researchers attribute their findings to updated methodology. “In years past, San Francisco was about average in its ghost-per-unit data. But we never looked into the compute market,” shares Dr. Fabry with HSC.',
      'Once the GAA started including anyone that’s ever attempted to buy a GPU cluster in their surveys, San Francisco’s ghost-per-units started going up and to the right. Ghosting is so prevalent amongst GPU brokers that start-ups and investors are growing desperate…',
    ],
    continued: ['Continued on ', 'page 400S', '.'],
  },

  // Intro lines: the Treatment's "The world", revised in review (Oct 9).
  // The loop line then repeats, faster and faster, until "There has to be a
  // better way" breaks it.
  worldLine: ['Oil has a floor.', 'Stocks have a floor.', 'Compute has a guy who knows a guy'],
  worldLoop: 'Who knows a guy',

  // Revised in review (Oct 10). The Treatment's Act II calls it "the old bank".
  venue: 'The old Fed Reserve, Sansome Street',
  city: 'San Francisco',
  eventMonth: 'November',
  eventDate: 'Tuesday 17 November', // SOURCE: Landing page, "as shipped"

  mcName: 'Babur', // SOURCE: Treatment, "The MC, Babur, he keeps the floor on the clock"

  cta: {
    kicker: 'Imagine doing this with real compute.',
    // SOURCE: Landing page subheading, as shipped.
    headline: 'We’re trading compute, on one floor, for one day: Tuesday 17 November.',
    // SOURCE: Landing page FAQ, "Where is it?"
    where: 'The old San Francisco Federal Reserve Bank building · 400 Sansome Street',
    button: 'Request an invite', // SOURCE: Landing page
    url: 'https://hscompute.com/', // SOURCE: Notion "Outreach", "Sign up here"
    // SOURCE: Landing page body and FAQ.
    foot: 'It’s invitation-only: request an invite, or get a verified referral from someone already invited.',
    fine: 'The building is privately owned, and the event is not affiliated with the Federal Reserve.',
  },

  // Sharing, the daily floor and friend challenges.
  share: {
    // The game's public address. null = not decided yet: shares link to the
    // landing page (cta.url) and friend challenge links stay off.
    gameUrl: null, // UNCONFIRMED: e.g. https://hscompute.com/floor
    // The real floor, for the daily countdown ("T-38" = 38 days to the bell).
    // Days roll over at midnight in San Francisco.
    eventDay: '2026-11-17', // SOURCE: Landing page, "Tuesday 17 November"
    // Changing the salt reshuffles every daily floor.
    dailySalt: 'hsc-daily',
    // Added to links from the game to the landing page, so invite requests
    // from the game can be counted.
    ctaParams: 'utm_source=the-floor&utm_medium=game&utm_campaign=nov17',
  },

  // Shows a small "draft" tag next to UNCONFIRMED strings. Set false once approved.
  showDraftMarkers: true,

  fictionNote: 'All firms, people, prices and market events on this floor are fictional.',
};

// Floor timing: the board clock runs noon → 5 PM over FLOOR_SECONDS real seconds.
export const FLOOR_SECONDS = 240;
export const FLOOR_OPEN_HOUR = 12;
export const FLOOR_CLOSE_HOUR = 17;
