// Read-only alternatives use the same FIFO quotes as actual transactions.
import { cents, cash, owned, remaining, cashCapacity, deliveryQuote } from './arcade.js';
import { buyerLive, saleQuote } from './arcade-buyers.js';
export function choices(g,gpu,qty,lot=null,buyerId=null,orderId=null) {
  let view=g;
  const purchase=lot ? cents(lot.qty,lot.negotiation?.price??lot.ask) : 0;
  if(lot) view={...g,cash:(cash(g)-purchase)/100,arcade:{...g.arcade,inventory:[...g.arcade.inventory,{id:'preview',gpu:lot.gpu,left:lot.qty,qty:lot.qty,unitCost:cents(1,lot.negotiation?.price??lot.ask)}]}};
  qty=Math.max(0,Math.min(Math.floor(qty),owned(view,gpu)));
  const o=view.arcade.orders.find(o=>o.gpu===gpu&&remaining(o)&&(orderId?o.id===orderId:o.client===view.arcade.anchor)) || (!orderId&&view.arcade.orders.find(o=>o.gpu===gpu&&remaining(o)));
  const s=o&&view.startups.find(s=>s.id===o.client);
  const equity=o&&deliveryQuote(view,o.id,Math.min(qty,remaining(o)),'equity');
  const anchor=o&&deliveryQuote(view,o.id,Math.min(qty,cashCapacity(view,o)),'cash');
  const outside=view.arcade.buyers.filter(b=>b.gpu===gpu&&buyerLive(view,b)&&(!buyerId||b.id===buyerId)).map(b=>saleQuote(view,b.id,Math.min(qty,b.qty-b.filled,Math.floor(b.budget/cents(1,b.rate))))).filter(Boolean).sort((a,b)=>(b.revenue-b.cost)-(a.revenue-a.cost))[0]||null;
  const premium=outside&&anchor&&outside.qty===anchor.qty?outside.revenue-anchor.revenue:null;
  return {qty,purchase,affordable:purchase<=cash(g),cash:cash(view),inventory:owned(view,gpu),outside,anchor,equity,order:o,startup:s,premium};
}
