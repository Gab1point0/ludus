// Test du tirage du premier laniste : le résultat doit être purement aléatoire, quel que soit le poing choisi.
// (L'animation de l'écran n'est que décorative : le moteur tire la position du sesterce au hasard APRÈS le choix.) Usage : node tests/toss.test.js
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
let fail = 0;
const ok = (name, cond, extra) => { if (!cond) { fail++; console.log('✗', name, extra || ''); } else console.log('✓', name); };
const picker = side => ({ decide: async p => (p.mode === 'toss' ? side : (p.kind === 'ack' ? true : p.options[0].id)) });
const N = 4000;

(async () => {
  for (const side of ['left', 'right']) {
    let found = 0;
    for (let seed = 1; seed <= N; seed++) {
      const g = new Game({ seed, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
      g.ctrl = [picker(side), picker(side)];
      await g.coinToss(true);
      if (g.s.toss.holder === g.s.toss.chooser) found++;
    }
    const rate = found / N, sd = Math.sqrt(0.25 / N);
    ok(`choisir « ${side} » trouve le sesterce environ 1 fois sur 2 (${(rate * 100).toFixed(1)} %)`, Math.abs(rate - 0.5) < 4.5 * sd, rate);
  }
  // aucune corrélation entre le côté choisi et le résultat : sur les mêmes graines, gauche et droite se complètent
  let same = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const run = async side => { const g = new Game({ seed, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 }); g.ctrl = [picker(side), picker(side)]; await g.coinToss(true); return g.s.toss.holder === g.s.toss.chooser; };
    if ((await run('left')) === (await run('right'))) same++;
  }
  ok('gauche et droite donnent toujours des résultats opposés (la pièce est bien cachée dans un seul des deux)', same === 0, same);
  console.log(fail ? `\n${fail} échec(s)` : '\nTirage : aléatoire OK.');
  process.exit(fail ? 1 : 0);
})();
