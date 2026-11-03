// One readable offer, shared by floor booths, the directory and the broker's quote.
import { esc } from '../util.js';
import { mini, BROKER_SHAPES } from './tetris.js';
import { money } from './pit-ledger.js';
export function brokerOffer(lot, total, state = '') {
  return `<span class="broker-offer">${mini({ gpu: lot.gpu, cells: BROKER_SHAPES[lot.gpu] }, 'offer-piece')}<span class="broker-quantity">${lot.qty} × ${esc(lot.gpu)}</span><strong class="broker-price">${money(total)}</strong>${state ? `<small class="broker-state">${esc(state)}</small>` : ''}</span>`;
}
