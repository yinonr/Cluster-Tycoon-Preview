// Task navigation is a saved view preference, never a campaign transaction.
import { openCards } from './founder.js';
import { V7 } from './arcade.js';

export const TASK_VIEW_KEY = `${V7.key}-view`;
const categories = {product:'Product',research:'Research',infra:'Infrastructure',opportunity:'Opportunity'};
export function taskDeck(g,ui={}) {
  const open=new Set(openCards(g).map(c=>c.id));
  const selectedThisRound=ui.taskRound===undefined ? null : ui.taskRound===g.q;
  const cards=g.arcade.objectives.filter(c=>open.has(c.id) || c.id===ui.taskId && (selectedThisRound ?? c.q===g.q) && ['built','expired'].includes(c.status));
  // V22.2: only the player selects. A launched or expired selection simply ends; no other card is chosen for them.
  const card=cards.find(c=>c.id===ui.taskId) || null;
  return {cards,card,index:card?cards.indexOf(card):0,total:cards.length,category:categories[card?.lane] || 'Task'};
}
// Call only after a deliberate player choice. The GPU focus (Find H100) is the player's own goal and
// survives selecting or inspecting another project; only a new Find or an explicit clear changes it.
export function selectTaskContext(g,view,ui,id) {
  const card=view.choose(g,id);
  if (!card) return false;
  ui.taskId=card.id;ui.taskLane=card.lane;ui.taskRound=g.q;
  return true;
}
export function taskViewStore(storage) {
  let record=null;
  try {
    const parsed=JSON.parse(storage.getItem(TASK_VIEW_KEY) || 'null');
    if (parsed?.version===1 && Number.isSafeInteger(parsed.seed) && typeof parsed.taskId==='string' && typeof parsed.taskLane==='string') record=parsed;
  } catch { /* A damaged optional view preference cannot pause a valid company. */ }
  const preference=g=>record?.seed===g.seed ? {taskId:record.taskId,taskLane:record.taskLane,...(Number.isSafeInteger(record.round)?{taskRound:record.round}:{})} : {};
  return {
    read(g) {return taskDeck(g,preference(g));},
    choose(g,id) {
      const deck=taskDeck(g,preference(g)), card=deck.cards.find(c=>c.id===id);
      if (!card) return null;
      if (record?.seed===g.seed && record.taskId===card.id && record.taskLane===card.lane && record.round===g.q) return card;
      record={version:1,seed:g.seed,round:g.q,taskId:card.id,taskLane:card.lane};
      try {storage.setItem(TASK_VIEW_KEY,JSON.stringify(record));} catch { /* Selection still works in memory. */ }
      return card;
    },
    move(g,delta) {
      const deck=taskDeck(g,preference(g));
      if (!deck.total || !Number.isSafeInteger(delta) || !delta) return null;
      return this.choose(g,deck.cards[(deck.index+(delta%deck.total)+deck.total)%deck.total].id);
    },
    reset() {record=null;try {storage.removeItem(TASK_VIEW_KEY);} catch { /* Optional preference. */ }},
  };
}

// V22: one pinned project and the panel's open/closed state are view preferences only.
export const PIN_KEY = `${V7.key}-pin`;
export function pinStore(storage) {
  let rec={version:1,seed:null,card:null,collapsed:null};
  try { const p=JSON.parse(storage.getItem(PIN_KEY) || 'null'); if (p?.version===1) rec={...rec,seed:Number.isSafeInteger(p.seed)?p.seed:null,card:typeof p.card==='string'?p.card:null,collapsed:typeof p.collapsed==='boolean'?p.collapsed:null}; } catch { /* Optional preference. */ }
  const save=()=>{try {storage.setItem(PIN_KEY,JSON.stringify(rec));} catch { /* Works in memory. */ }};
  return {
    read(g) {return rec.seed===g.seed && openCards(g).some(c=>c.id===rec.card) ? rec.card : null;},
    set(g,id) {rec={...rec,seed:g.seed,card:id};save();},
    clear() {rec={...rec,card:null};save();},
    // V22.6.2: until the player chooses, phones start with the compact Projects strip so the floor stays visible.
    get collapsed() {return rec.collapsed ?? (typeof matchMedia==='function' && matchMedia('(max-width: 768px)').matches);},
    toggle() {const now=!this.collapsed;rec={...rec,collapsed:now};save();return now;},
  };
}
