// Réglage de l'IA par auto-jeu : node tests/tune.js [nbParties]  (compare des variantes de paramètres à la référence)
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
const AI = require(path.join('..', 'js', 'ai.js'));
const N = parseInt(process.argv[2] || '400');

async function match(levelA, paramsA, levelB, paramsB, n) {
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const g = new Game({ seed: 5000 + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    const mk = (lvl, p) => AI.create(lvl, g.rand.bind(g), p);
    const ais = swap ? [mk(levelB, paramsB), mk(levelA, paramsA)] : [mk(levelA, paramsA), mk(levelB, paramsB)];
    g.ctrl = ais.map(ai => ({ decide: async (prompt, game) => ai.decide(game.viewFor(prompt.seat), prompt) }));
    await g.run();
    const w = g.s.winner;
    if ((w === 0) !== swap) a++; else b++;
  }
  return a / (a + b);
}

(async () => {
  const variants = process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : {
    'référence (hard)': {},
    'moins de corps': { bodies: 0.3 },
    'plus de corps': { bodies: 1.8 },
    'argent précieux': { moneyR: [1.1, 1.1, 0.9, 0.2] },
    'argent facile': { moneyR: [0.6, 0.6, 0.4, 0.05] },
    'seuil achat bas': { thr: 0.0 },
    'seuil achat haut': { thr: 0.8 },
    'tactiques posées facilement': { placeThr: 0.3 },
    'tactiques posées prudemment': { placeThr: 1.0 },
    'glad 0.65': { gv: 0.65 },
    'tactiques x2.6': { tvScale: 2.6 },
  };
  for (const [name, p] of Object.entries(variants)) {
    const r = await match('hard', p, 'hard', {}, N);
    console.log((r * 100).toFixed(1).padStart(5) + ' %  ', name);
  }
})();
