// Short action-oriented Help, shared by practice and the campaign.
export function helpView(training = false) {
  const items = [
    ['Find a deal', 'Select Find GPU or a GPU tile on your current task to see matching supply. Matching buyers are available beside the filter.'],
    ['Buy GPUs', 'Select a broker’s offer. Use Charm when available, review the quote, then select “Sign contract.”'],
    ['Build', 'Select the GPU slots or Allocate from stock on your current task, then BUILD when its requirements are met.'],
    ['Sell your stock', 'Open Inventory to see what’s available to sell. Select “View matching buyers,” choose an offer, and review the sale before confirming.'],
    ['Switch tasks', 'Use the arrows beside the task card. On mobile, swipe between tasks.'],
  ];
  return `<div class="founding-scrim"><section class="founding-dialog pass5-help action-help" role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1"><h1 id="help-title">Help</h1><div class="help-notes">${items.map(([title, body]) => `<section><h2>${title}</h2><p>${body}</p></section>`).join('')}</div><footer><button type="button" class="founding-primary" data-action="guide-close" data-autofocus>Back to ${training ? 'training' : 'company'} →</button>${training ? '' : '<div class="founding-links"><button type="button" data-action="replay-training">Replay training</button><button type="button" data-action="rename-startup">Edit startup name</button></div>'}</footer></section></div>`;
}
