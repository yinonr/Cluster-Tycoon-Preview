// Short action-oriented Help, shared by practice and the campaign.
export function helpView(training = false) {
  const items = [
    ['Find a deal', 'Select Find on a project (Find H100, Find H200…) to bring matching brokers to the front.'],
    ['Buy GPUs', 'Select a broker’s offer. Use Charm for a better price, then Buy now and sign the contract.'],
    ['Launch', 'Open Projects. When every GPU row shows ✓, select LAUNCH. Projects share one pool of GPUs.'],
    ['Sell your stock', 'Select a GPU count in the top bar to see buyers for GPUs you are not using.'],
    ['Switch projects', 'Star a project to pin it to the top. On mobile, swipe between projects.'],
  ];
  return `<div class="founding-scrim"><section class="founding-dialog pass5-help action-help" role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1"><h1 id="help-title">Help</h1><div class="help-notes">${items.map(([title, body]) => `<section><h2>${title}</h2><p>${body}</p></section>`).join('')}</div><footer><button type="button" class="founding-primary" data-action="guide-close" data-autofocus>Back to ${training ? 'training' : 'company'} →</button>${training ? '<div class="founding-links"><button type="button" data-action="rename-startup">Edit startup name</button></div>' : '<div class="founding-links"><button type="button" data-action="replay-training">Replay training</button><button type="button" data-action="rename-startup">Edit startup name</button><button type="button" data-action="new-game">New game</button></div>'}</footer></section></div>`;
}
