// Statistiques d'achats par niveau d'IA : node tests/buystats.js [parties] [niveauA] [niveauB]
// Affiche, pour chaque niveau, la part d'achats par Quartier (tactiques / débutants / aguerris / légendaires), réserve incluse,
// la manche de chaque achat, et le nombre moyen de Légendaires possédés à la manche 4.
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
const AI = require(path.join('..', 'js', 'ai.js'));
const N = parseInt(process.argv[2] || '300');
const LV = [process.argv[3] || 'normal', process.argv[4] || 'normal'];
const EXTRA = process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {};      // ex. EXTRA='{"normal":{"legBonus":1}}'
(async () => {
  const st = LV.map(() => ({ q: { tactic: 0, debutant: 0, aguerri: 0, legendaire: 0 }, res: 0, buys: 0, byRound: [0, 0, 0, 0], leg4: 0, games: 0, wins: 0, spent: 0 }));
  for (let i = 0; i < N; i++) {
    const g = new Game({ seed: 4000 + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    const swap = i % 2 === 1;
    const lv = swap ? [LV[1], LV[0]] : LV;          // le niveau LV[k] occupe le siège k ou 1-k selon la parité
    const seatOf = k => (swap ? 1 - k : k);
    const orig = g.doBuy.bind(g);
    const gl = [0, 0];
    g.doBuy = async (seat, o) => { const k = swap ? 1 - seat : seat; const s = st[k]; if (o.q === 'legendaire') gl[k]++; s.q[o.q]++; s.buys++; if (o.from === 'reserve') s.res++; s.byRound[Math.min(g.s.round, 4) - 1]++; s.spent += o.price; return orig(seat, o); };
    g.ctrl = [0, 1].map(seat => { const ai = AI.create(lv[seat], g.rand.bind(g), EXTRA[lv[seat]]); return { decide: async (p, game) => ai.decide(game.viewFor(seat), p) }; });
    const origRound = g.revelation.bind(g);
    let seen4 = false;
    g.revelation = async () => { if (g.s.round === 4 && !seen4) { seen4 = true; for (const k of [0, 1]) { const seat = seatOf(k); const cards = g.s.players[seat].ludus; st[k].leg4 += cards.filter(c => c.def && require(path.join('..', 'js', 'data.js')).CARDS[c.def].rank === 'legendaire').length; st[k].games++; } } return origRound(); };
    await g.run();
    for (const k of [0, 1]) { if (g.s.winner === seatOf(k)) st[k].wins++; if (!gl[k]) st[k].noLeg = (st[k].noLeg || 0) + 1; }
  }
  LV.forEach((l, k) => {
    const s = st[k], t = s.buys || 1;
    console.log(`${l.padEnd(7)} (siège ${k ? 'B' : 'A'}) : victoires ${(100 * s.wins / N).toFixed(0)}% | achats/partie ${(s.buys / N).toFixed(1)} | tactiques ${(100 * s.q.tactic / t).toFixed(0)}% débutants ${(100 * s.q.debutant / t).toFixed(0)}% aguerris ${(100 * s.q.aguerri / t).toFixed(0)}% légendaires ${(100 * s.q.legendaire / t).toFixed(0)}% | parties sans AUCUN achat de Légendaire : ${(100 * (s.noLeg || 0) / N).toFixed(0)}% | réserve ${(100 * s.res / t).toFixed(0)}% | légendaires dans l'équipe en manche 4 : ${(s.leg4 / Math.max(1, s.games)).toFixed(2)} | achats par manche ${s.byRound.map(x => (x / N).toFixed(1)).join('/')}`);
  });
})();
