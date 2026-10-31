import * as supply from './rizz.js';
import { currentBuyer, startBuyerCharm, resolveBuyerCharm, recoverBuyerCharm } from './buyer-charm.js';
import { activeLot } from './arcade.js';
export { markerAt } from './rizz.js';
export const charmActor = g => activeLot(g) || currentBuyer(g);
export const startRizz = (g, qty) => currentBuyer(g) ? startBuyerCharm(g, qty) : supply.startRizz(g);
export const resolveRizz = (g, p) => currentBuyer(g) ? resolveBuyerCharm(g, p) : supply.resolveRizz(g, p);
export const recoverRizz = g => supply.recoverRizz(g) || recoverBuyerCharm(g);
