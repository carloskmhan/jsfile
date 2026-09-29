/** 6.0.11-chat-ux: presentation examples, NOT executable rules or new capabilities.
 * {group} becomes an exact selected/system group ID, or nothing (the engine asks).
 * {month} uses the analysis context, never the machine's calendar date.
 * A click fills the composer only; Enter/Send still starts the normal preview.
 */
export const CHAT_EXAMPLES = Object.freeze([
  {category:'Portfolio', label:'Top 10 RWA increases', text:'Show top 10 groups by RWA increase in {month}'},
  {category:'Portfolio', label:'Top 10 RWA decreases', text:'Show top 10 groups by RWA decrease in {month}'},
  {category:'Portfolio', label:'Highest RWA balances', text:'Show top 10 groups by higher RWA balance in {month}'},
  {category:'Portfolio', label:'Groups above $25m RWA', text:'Show top 10 groups with RWA above 25 million in {month}'},
  {category:'Portfolio', label:'Historical highest monthly %', text:'Show top 10 groups by highest monthly percentage change over all history'},
  {category:'Portfolio', label:'Historical lowest monthly %', text:'Show top 10 groups by lowest monthly percentage change over all history'},
  {category:'Drivers', label:'Explain the RWA increase', text:'Why did RWA increase{group} in {month}?'},
  {category:'Drivers', label:'Explain the RWA decrease', text:'Why did RWA decrease{group} in {month}?'},
  {category:'Drivers', label:'Main contributing drivers', text:'Main driver{group} in {month}'},
  {category:'Drivers', label:'Offsetting drivers', text:'Show offsets{group} in {month}'},
  {category:'Drivers', label:'Amount of RWA movement', text:'How much did RWA change{group} in {month}?'},
  {category:'Entities', label:'Top 10 entities', text:'Top 10 entities{group} in {month}'},
  {category:'Entities', label:'Largest entity increases', text:'Top 5 entities by RWA increase{group} in {month}'},
  {category:'Entities', label:'Largest entity decreases', text:'Top 5 entities by RWA decrease{group} in {month}'},
  {category:'Entities', label:'Highest entity RWA balances', text:'Top 10 entities by higher RWA balance{group} in {month}'},
  {category:'Checks & history', label:'Closing RWA balance', text:'What is the RWA balance{group} in {month}?'},
  {category:'Checks & history', label:'Three-month trend', text:'Show trend{group} over the last 3 months'},
  {category:'Checks & history', label:'Month with the largest increase', text:'Which month had the biggest RWA increase{group}?'},
  {category:'Checks & history', label:'Did RWA increase?', text:'Did RWA increase{group} in {month}?'},
  {category:'Checks & history', label:'Check driver reconciliation', text:'Do the drivers reconcile{group} in {month}?'}
].map(Object.freeze));
export function exampleQuestion(example, context={}) {
  const id=typeof context.groupId==='string'?context.groupId.trim():'';
  const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(context.month||'')?context.month:'this month';
  return example.text.replaceAll('{group}',id?' for '+id:'').replaceAll('{month}',month);
}
