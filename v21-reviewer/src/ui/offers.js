// Parse user-entered dollars as exact cents. Never round an invalid proposal.
export function parseRate(value) {
  const text=String(value).trim();
  if(!/^(?:\d{1,6}(?:\.\d{0,2})?|\.\d{1,2})$/.test(text))return null;
  const [whole,fraction='']=text.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(cents)?cents:null;
}
export function stepRate(value,delta,min,max){
  const cents=parseRate(value);
  if(cents===null||![-5,-1,1,5].includes(delta)||min>max)return null;
  return Math.max(min,Math.min(max,cents+delta));
}
export const formatRate=cents=>`${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;
