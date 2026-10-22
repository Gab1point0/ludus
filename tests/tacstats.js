// Quelles tactiques le niveau « hard » achète-t-il, et lesquelles utilise-t-il (préparation ⚙ + pose au Colisée) ? node tests/tacstats.js [parties] [niveau] [adversaire]
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
const AI = require(path.join('..', 'js', 'ai.js'));
const { CARDS } = require(path.join('..', 'js', 'data.js'));
const N = parseInt(process.argv[2] || '300'), L = process.argv[3] || 'hard', OPP = process.argv[4] || 'easy';
const EXTRA = process.env.CAND ? JSON.parse(process.env.CAND) : undefined;
(async () => {
  const bought = {}, used = {}, placed = {};
  for (let i = 0; i < N; i++) {
    const g = new Game({ seed: 8000 + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    const ob = g.doBuy.bind(g), op = g.playPrep.bind(g);
    g.doBuy = async (seat, o) => { if (seat === 0 && o.q === 'tactic') { const c = g.s.forum.tactic.slots[o.i]; const b = c ? (CARDS[c.def].base || c.def) : '?'; bought[b] = (bought[b] || 0) + 1; } return ob(seat, o); };
    g.playPrep = async (seat, uid) => { if (seat === 0) { const c = g.s.players[0].hand.find(x => x.uid === uid); const b = CARDS[c.def].base || c.def; used[b] = (used[b] || 0) + 1; } return op(seat, uid); };
    const ai = [AI.create(L, g.rand.bind(g), EXTRA), AI.create(OPP, g.rand.bind(g))];
    g.ctrl = ai.map((a, seat) => ({ decide: async (p, game) => { const r = a.decide(game.viewFor(seat), p); if (seat === 0 && p.kind === 'choice' && p.mode === 'place' && r !== 'pass') { const o = p.options.find(x => x.id === r); const b = CARDS[o.def].base || o.def; placed[b] = (placed[b] || 0) + 1; } return r; } }));
    await g.run();
  }
  const keys = Array.from(new Set([...Object.keys(bought), ...Object.keys(used), ...Object.keys(placed)])).sort();
  console.log('tactique'.padEnd(18), 'achetées/partie'.padEnd(17), 'jouées ⚙/partie'.padEnd(17), 'posées/partie');
  keys.forEach(k => console.log(k.padEnd(18), ((bought[k] || 0) / N).toFixed(2).padEnd(17), ((used[k] || 0) / N).toFixed(2).padEnd(17), ((placed[k] || 0) / N).toFixed(2)));
})();
