import * as supply from './rizz.js';
import { currentBuyer, startBuyerCharm, resolveBuyerCharm, recoverBuyerCharm } from './buyer-charm.js';
import { currentDeal, startDealCharm, resolveDealCharm, recoverDealCharm } from './deal-charm.js';
import { activeLot } from './arcade.js';
export { markerAt } from './rizz.js';
// One Charm controller for every table: a supplier, a resale buyer, or (V22.1) a buyout or a term sheet.
export const charmActor = g => activeLot(g) || currentBuyer(g) || currentDeal(g);
export const startRizz = (g, qty) => activeLot(g) ? supply.startRizz(g) : currentBuyer(g) ? startBuyerCharm(g, qty) : startDealCharm(g);
export const resolveRizz = (g, p) => activeLot(g) ? supply.resolveRizz(g, p) : currentBuyer(g) ? resolveBuyerCharm(g, p) : resolveDealCharm(g, p);
export const recoverRizz = g => supply.recoverRizz(g) || recoverBuyerCharm(g) || recoverDealCharm(g);
