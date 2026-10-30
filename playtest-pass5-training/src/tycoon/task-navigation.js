// Task navigation is a saved view preference, never a campaign transaction.
import { openCards } from './founder.js';
import { V7 } from './arcade.js';

export const TASK_VIEW_KEY = `${V7.key}-view`;
const categories = {product:'Product',research:'Research',infra:'Infrastructure',opportunity:'Opportunity'};
export function taskDeck(g,ui={}) {
  const open=new Set(openCards(g).map(c=>c.id));
  const selectedThisRound=ui.taskRound===undefined ? null : ui.taskRound===g.q;
  const cards=g.arcade.objectives.filter(c=>open.has(c.id) || c.id===ui.taskId && (selectedThisRound ?? c.q===g.q) && ['built','expired'].includes(c.status));
  const card=cards.find(c=>c.id===ui.taskId) || cards.find(c=>c.lane===ui.taskLane) || cards[0] || null;
  return {cards,card,index:card?cards.indexOf(card):0,total:cards.length,category:categories[card?.lane] || 'Task'};
}
// Call only after a successful explicit transaction/choice. Selecting a
// different target also retires a filter that belonged to the previous task.
export function selectTaskContext(g,view,ui,id) {
  const card=view.choose(g,id);
  if (!card) return false;
  if (ui.taskId!==card.id) {ui.floorGpu=null;ui.floorNeed=0;ui.floorPage=0;}
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
