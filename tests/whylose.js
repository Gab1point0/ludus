// Pourquoi le Difficile perd-il contre le Facile ? Compare, à la manche 4, la force des équipes dans les parties gagnées et perdues.
//   node tests/whylose.js [parties] [niveau fort] [niveau faible]
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
const AI = require(path.join('..', 'js', 'ai.js'));
const { CARDS } = require(path.join('..', 'js', 'data.js'));
const N = parseInt(process.argv[2] || '600'), A = process.argv[3] || 'hard', B = process.argv[4] || 'easy';
(async () => {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const swap = i % 2 === 1;
    const g = new Game({ seed: 31000 + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    const lv = swap ? [B, A] : [A, B]; const mine = swap ? 1 : 0;
    g.ctrl = [0, 1].map(seat => { const ai = AI.create(lv[seat], g.rand.bind(g)); return { decide: async (p, game) => ai.decide(game.viewFor(seat), p) }; });
    const origRev = g.revelation.bind(g); let snap = null;
    g.revelation = async () => {
      if (g.s.round === 4 && !snap) {
        snap = [0, 1].map(seat => { const l = g.s.players[seat].ludus; const pw = l.map(c => CARDS[c.def].power); return { n: l.length, leg: l.filter(c => CARDS[c.def].rank === 'legendaire').length, agu: l.filter(c => CARDS[c.def].rank === 'aguerri').length, dep: l.filter(c => CARDS[c.def].rank === 'depart').length, sumP: pw.reduce((a, b) => a + b, 0), hand: g.s.players[seat].hand.length, money: g.s.players[seat].deniers }; });
      }
      return origRev();
    };
    await g.run();
    rows.push({ win: g.s.winner === mine, me: snap[mine], opp: snap[1 - mine], extra: g.s.extra });
  }
  const avg = (arr, f) => arr.length ? (arr.reduce((a, r) => a + f(r), 0) / arr.length).toFixed(2) : '-';
  for (const [label, set] of [['GAGNÉES', rows.filter(r => r.win)], ['PERDUES', rows.filter(r => !r.win)]]) {
    console.log(`${label} (${set.length}) | moi : ludus ${avg(set, r => r.me.n)} lég ${avg(set, r => r.me.leg)} agu ${avg(set, r => r.me.agu)} départ ${avg(set, r => r.me.dep)} puiss.totale ${avg(set, r => r.me.sumP)} main ${avg(set, r => r.me.hand)} | adv : ludus ${avg(set, r => r.opp.n)} lég ${avg(set, r => r.opp.leg)} agu ${avg(set, r => r.opp.agu)} puiss.totale ${avg(set, r => r.opp.sumP)} main ${avg(set, r => r.opp.hand)}`);
  }
  console.log('taux de victoire', (100 * rows.filter(r => r.win).length / N).toFixed(1) + '%');
})();
