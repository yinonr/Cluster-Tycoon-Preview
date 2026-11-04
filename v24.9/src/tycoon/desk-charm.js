import * as supply from './rizz.js';
import { currentBuyer, startBuyerCharm, resolveBuyerCharm, recoverBuyerCharm } from './buyer-charm.js';
import { currentDeal, startDealCharm, resolveDealCharm, recoverDealCharm } from './deal-charm.js';
import { activeLot } from './arcade.js';
import { currentResale, resaleActor, startResaleCharm, resolveResaleCharm, recoverResaleCharm } from './resale-charm.js';
export { markerAt } from './rizz.js';
// One Charm controller for every table: a supplier, a resale buyer (V24.4 resale Charm), or (V22.1) a buyout or a term sheet.
export const charmActor = g => activeLot(g) || resaleActor(g) || currentBuyer(g) || currentDeal(g);
export const startRizz = (g, qty) => activeLot(g) ? supply.startRizz(g) : currentResale(g) ? startResaleCharm(g) : currentBuyer(g) ? startBuyerCharm(g, qty) : startDealCharm(g);
export const resolveRizz = (g, p) => activeLot(g) ? supply.resolveRizz(g, p) : currentResale(g) ? resolveResaleCharm(g, p) : currentBuyer(g) ? resolveBuyerCharm(g, p) : resolveDealCharm(g, p);
export const recoverRizz = g => supply.recoverRizz(g) || recoverResaleCharm(g) || recoverBuyerCharm(g) || recoverDealCharm(g);
