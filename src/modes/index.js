// Persona registry. Each playable side of the market is a mode module with the
// same surface as buyerMode (createRun, shouts, checks, recordDeal, summarize…).
// Seller, Investor, Founder and Broker plug in here. 'venture' is the Buyer
// floor under Venture Mode's money rules (src/venture/mode.js). 'lab' is the
// V3 Deal Lab: the Buyer floor as it is, graded and scored differently (src/modes/lab.js).
import { buyerMode } from './buyer.js';
import { ventureMode } from '../venture/mode.js';
import { labMode } from './lab.js';
import { tycoonMode } from '../tycoon/mode.js';

export const MODES = {
  buyer: buyerMode,
  venture: ventureMode,
  lab: labMode,
  tycoon: tycoonMode, // V6: the Deal Lab as one quarter of an ongoing game (src/tycoon/)
};
