// Recherche aléatoire de réglages du Difficile (fonction Monte-Carlo comprise) : node tests/randsearch.js [candidats] [parties]
// Score = moyenne de la victoire contre Facile (poids 2), Normal, et le Difficile actuel sans Monte-Carlo.
const { execFileSync } = require('child_process');
const path = require('path');
const NC = parseInt(process.argv[2] || '24'), G = process.argv[3] || '700';
const rnd = (a, b) => a + Math.random() * (b - a);
const base = { mcW: 30, mcEarly: 0, oldW: 1, legBonus: 0, tvScale: 2, mcK: 24 };
const space = { mcW: [5, 80], mcEarly: [0, 0.6], oldW: [0, 2], legBonus: [-0.5, 3], tvScale: [1, 3.5], thr: [-3, 0.8], wInc: [0, 1], bodiesLow: [0, 1.5], denial: [0, 1.5] };
const results = [];
function evalCand(c) {
  const out = execFileSync('node', [path.join(__dirname, 'evalvs.js'), G], { env: Object.assign({}, process.env, { CAND: JSON.stringify(c), OPPS: 'easy,normal,hard0' }), encoding: 'utf8' });
  const m = [...out.matchAll(/: ([\d.]+)%/g)].map(x => parseFloat(x[1]));
  return { c, easy: m[0], normal: m[1], hard0: m[2], score: (2 * m[0] + m[1] + m[2]) / 4 };
}
const b = evalCand(base); results.push(b); console.log('base', JSON.stringify(b));
for (let i = 0; i < NC; i++) {
  const c = Object.assign({}, base);
  for (const [k, [lo, hi]] of Object.entries(space)) if (Math.random() < 0.6) c[k] = Math.round(rnd(lo, hi) * 100) / 100;
  const r = evalCand(c); results.push(r);
  console.log(String(i + 1).padStart(2), `easy ${r.easy} normal ${r.normal} hard0 ${r.hard0} score ${r.score.toFixed(1)}`, JSON.stringify(c));
}
results.sort((a, b) => b.score - a.score);
console.log('\nMEILLEURS :'); results.slice(0, 5).forEach(r => console.log(`score ${r.score.toFixed(1)} easy ${r.easy} normal ${r.normal} hard0 ${r.hard0}`, JSON.stringify(r.c)));
