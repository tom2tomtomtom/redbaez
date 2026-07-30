import { readFile } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const PAGES = ['index.html', 'aiden.html', 'audit.html', 'tools.html', 'programme.html',
  'case-studies/mother-london.html', 'case-studies/uncommon.html',
  'case-studies/alt-shift.html', 'case-studies/monigle.html',
  'case-studies/collinson.html'];

// Numbers and phrases that must never appear anywhere.
const BANNED = [
  ['400+', 'use "more than 400"; the library grows so no exact or near-exact figure in evergreen copy'],
  ['396', 'stale phantom count'],
  ['10 tokens', 'free tier is 50'],
  ['60 tokens', 'free tier is 50'],
  ['nine tools', 'there are ten'],
  ['Nine AI tools', 'there are ten'],
  ['Creative Pipeline', 'the product is called Ads'],
  ['AIDEN Studio', 'removed'],
  ['AIDEN Test', 'does not exist'],
  ['AIDEN Create', 'does not exist'],
  ['—', 'em-dash'],
  ['–', 'en-dash'],
  ['=”', 'curly quote as attribute delimiter'],
  ['=“', 'curly quote as attribute delimiter'],
];

// Sentences that must survive verbatim on index.html.
const LOCKED = [
  'The work has never looked more the same',
  'The advantage evaporated the moment it arrived',
  'They need AI with a point of view',
  'We gave the model a prefrontal cortex',
  'Raw language models are limbic',
  'Not autocomplete. Creative conviction',
  'It believes it has lived a decades-long career',
  'A career it never actually had',
  'it voices the disagreement instead of resolving it',
  'a brain is nurtured, not installed',
  'The model is rented. The brain is grown',
  'Not a toolbox. An operating system',
  'never hands in its notice',
];

let failed = 0;
const fail = (msg) => { console.log('FAIL ' + msg); failed++; };

for (const page of PAGES) {
  let src;
  try { src = await readFile(ROOT + page, 'utf8'); }
  catch { fail(`${page} missing`); continue; }
  for (const [needle, why] of BANNED) {
    if (src.includes(needle)) fail(`${page} contains ${JSON.stringify(needle)} (${why})`);
  }
}

const index = await readFile(ROOT + 'index.html', 'utf8');
for (const line of LOCKED) {
  if (!index.includes(line)) fail(`index.html missing locked line: ${JSON.stringify(line)}`);
}
if (!index.includes('AUD 15,000')) fail('index.html missing the diagnostic figure');
for (const banned of ['98,000', '180,000', '50,000 to 100,000']) {
  if (index.includes(banned)) fail(`index.html publishes a band it should not: ${banned}`);
}

console.log(failed ? `\n${failed} content assertion(s) failed` : '\nall content assertions pass');
process.exit(failed ? 1 : 0);
