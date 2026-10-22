// Qui gagne les combats de chaque manche ? node tests/roundwins.js [parties] [A] [B]
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
const AI = require(path.join('..', 'js', 'ai.js'));
const N = parseInt(process.argv[2] || '800'), A = process.argv[3] || 'hard', B = process.argv[4] || 'easy';
(async () => {
  const w = [0, 0, 0, 0], l = [0, 0, 0, 0], t = [0, 0, 0, 0]; let gameWin = 0, finalWinGivenEarly = [0, 0], earlyCounts = [0, 0];
  for (let i = 0; i < N; i++) {
    const swap = i % 2 === 1, mine = swap ? 1 : 0;
    const g = new Game({ seed: 52000 + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    const lv = swap ? [B, A] : [A, B];
    g.ctrl = [0, 1].map(seat => { const ai = AI.create(lv[seat], g.rand.bind(g)); return { decide: async (p, game) => ai.decide(game.viewFor(seat), p) }; });
    const oc = g.combat.bind(g); let early = 0;
    g.combat = async () => { const r = await oc(); const k = Math.min(g.s.round, 4) - 1; if (g.s.extra === 0) { if (r.winner === mine) { w[k]++; if (k < 3) early++; } else if (r.winner === null) t[k]++; else { l[k]++; if (k < 3) early--; } } return r; };
    await g.run();
    const win = g.s.winner === mine; if (win) gameWin++;
    const b = early > 0 ? 1 : 0; earlyCounts[b]++; if (win) finalWinGivenEarly[b]++;
  }
  console.log(`${A} vs ${B} : victoire ${(100 * gameWin / N).toFixed(1)}%`);
  for (let k = 0; k < 4; k++) console.log(`manche ${k + 1} : ${A} gagne ${(100 * w[k] / N).toFixed(0)}% | perd ${(100 * l[k] / N).toFixed(0)}% | égalité ${(100 * t[k] / N).toFixed(0)}%`);
  console.log(`quand ${A} a gagné plus de combats que ${B} avant la manche 4 : victoire finale ${(100 * finalWinGivenEarly[1] / Math.max(1, earlyCounts[1])).toFixed(0)}% (${earlyCounts[1]} parties) ; sinon ${(100 * finalWinGivenEarly[0] / Math.max(1, earlyCounts[0])).toFixed(0)}% (${earlyCounts[0]} parties)`);
})();
