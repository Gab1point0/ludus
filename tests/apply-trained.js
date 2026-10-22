// Injecte les paramètres entraînés (tests/trained/best.json) dans js/ai.js : node tests/apply-trained.js
const fs = require('fs');
const path = require('path');
const AI = require(path.join('..', 'js', 'ai.js'));
const best = JSON.parse(fs.readFileSync(path.join(__dirname, 'trained', process.argv[2] || 'best.json'), 'utf8'));
const P = AI.vectorToParams(best.vec);
const round = x => Math.round(x * 1000) / 1000;
const out = {};
for (const [path_, , ] of AI.SPEC) {
  const v = AI.getPath(P, path_);
  AI.setPath(out, path_, round(v));
}
// moneyW : tableau
out.moneyW = [0, 1, 2, 3].map(i => round(P.moneyW[i]));
const src = path.join(__dirname, '..', 'js', 'ai.js');
let t = fs.readFileSync(src, 'utf8');
const a = t.indexOf('/*TRAINED_BEGIN*/'), b = t.indexOf('/*TRAINED_END*/');
if (a < 0 || b < 0) throw new Error('marqueurs introuvables');
const block = `/*TRAINED_BEGIN*/\n  // entraînement : génération ${best.gen}\n  setPresets({ hard: ${JSON.stringify(out)} });\n  `;
t = t.slice(0, a) + block + t.slice(b);
fs.writeFileSync(src, t);
console.log('Paramètres entraînés injectés dans js/ai.js (génération ' + best.gen + ')');
