// Test du tirage du premier laniste : l'un cache le sesterce dans un poing (choix en secret), l'autre devine.
// S'il tombe sur le même poing que celui qui cache, il gagne le sesterce ; sinon le sesterce reste à celui qui cache. Usage : node tests/toss.test.js
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
let fail = 0;
const ok = (name, cond, extra) => { if (!cond) { fail++; console.log('✗', name, extra || ''); } else console.log('✓', name); };
const bot = (hide, pick) => ({ decide: async p => (p.mode === 'tosshide' ? hide() : p.mode === 'toss' ? pick() : (p.kind === 'ack' ? true : p.options[0].id)) });
const side = s => () => s;
const rnd = () => (Math.random() < 0.5 ? 'left' : 'right');
const mk = seed => new Game({ seed, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });

(async () => {
  // 1. règle exacte, pour les quatre combinaisons
  for (const hide of ['left', 'right']) for (const pick of ['left', 'right']) {
    const g = mk(7); g.ctrl = [bot(side(hide), side(pick)), bot(side(hide), side(pick))];
    await g.coinToss(true);
    const t = g.s.toss, chooserWins = t.holder === t.chooser;
    ok(`cache à ${hide}, devine ${pick} → ${hide === pick ? 'celui qui devine gagne' : 'celui qui cache garde le sesterce'}`, chooserWins === (hide === pick));
  }
  // 2. entre deux humains, celui qui cache est désigné au hasard (les deux cas arrivent)
  const hiders = new Set();
  for (let seed = 1; seed <= 60; seed++) { const g = mk(seed); g.ctrl = [bot(rnd, rnd), bot(rnd, rnd)]; await g.coinToss(true); hiders.add(g.s.toss.hider); }
  ok('entre deux humains : chacun peut être désigné pour cacher', hiders.size === 2, [...hiders]);
  // 3. contre l'ordinateur, c'est lui qui cache (le joueur devine) ; ici l'« ordinateur » est simulé par un contrôleur marqué .ai
  { const ai = Object.assign(bot(rnd, rnd), { ai: {} }); const g = mk(3); g.ctrl = [bot(rnd, rnd), ai]; await g.coinToss(true); ok('contre l\'ordinateur : l\'ordinateur cache (siège 1)', g.s.toss.hider === 1 && g.s.toss.chooser === 0); }
  // 4. aléatoire : si celui qui cache choisit au hasard, deviner « gauche » (ou « droite ») gagne environ une fois sur deux
  const N = 4000;
  for (const pick of ['left', 'right']) {
    let found = 0;
    for (let seed = 1; seed <= N; seed++) { const g = mk(seed); g.ctrl = [bot(rnd, side(pick)), bot(rnd, side(pick))]; await g.coinToss(true); if (g.s.toss.holder === g.s.toss.chooser) found++; }
    const rate = found / N, sd = Math.sqrt(0.25 / N);
    ok(`si la cachette est aléatoire, deviner « ${pick} » gagne ${(rate * 100).toFixed(1)} % du temps`, Math.abs(rate - 0.5) < 4.5 * sd, rate);
  }
  // 5. tutoriel : le joueur gagne toujours le tirage initial
  { let always = true; for (let seed = 1; seed <= 40; seed++) { const ai = Object.assign(bot(rnd, rnd), { ai: {} }); const g = new Game({ seed, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0, tutorial: true }); g.ctrl = [bot(rnd, rnd), ai]; await g.coinToss(true); if (g.s.firstSeat !== 0) always = false; } ok('tutoriel : le joueur est toujours premier laniste', always); }
  console.log(fail ? `\n${fail} échec(s)` : '\nTirage : règles OK.');
  process.exit(fail ? 1 : 0);
})();
