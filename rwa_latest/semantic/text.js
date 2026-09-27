/** Layer 1. Text only; the original question is retained separately. */
export const uniq = values => [...new Set(values)];
export const clone = value => JSON.parse(JSON.stringify(value));
export function norm(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[–—−]/g, '-')
    .replace(/\b(was|is|did|were|does|do|has|have|had|could|would|should)n['’]t\b/g, '$1 not')
    .replace(/\b(can)['’]t\b/g, 'can not')
    .replace(/([\p{L}\p{N}])'s\b/gu, '$1')
    .replace(/\s+/g, ' ').trim();
}
export function tokenize(text) {
  return [...text.matchAll(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu)]
    .map(m => ({text:m[0], start:m.index, end:m.index + m[0].length}));
}
export const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const aliasRe = text => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(norm(text)).replace(/ /g,'\\s+')}(?![\\p{L}\\p{N}_])`, 'giu');
export const overlaps = (a,b) => a.start < b.end && b.start < a.end;
export function removeSpans(text, spans) {
  let result=text;
  for (const s of [...spans].sort((a,b)=>b.start-a.start)) result=result.slice(0,s.start)+' '.repeat(s.end-s.start)+result.slice(s.end);
  return result;
}
export function normalizedInput(question, max=1000) {
  const original=String(question ?? ''), text=norm(original);
  if (!text || original.length>max || text.length>max) return {error:'Enter a question of 1–'+max+' characters.',code:'INVALID_INPUT',original,text};
  if (/[<>`{}\u0000-\u0008\u000b\u000c\p{Cf}]/u.test(text)) return {error:'Code, markup and control characters are not accepted.',code:'INVALID_INPUT',original,text};
  return {original,text,tokens:tokenize(text)};
}
export const NUMBER_WORDS = Object.freeze({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,twenty:20,fifty:50,hundred:100});
export const asNumber = value => NUMBER_WORDS[value] ?? Number(value);
