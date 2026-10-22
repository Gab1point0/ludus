// Test du rejeu déterministe (base de « annuler le coup précédent ») : rejouer l'historique des réponses redonne exactement la même partie.
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
let fail = 0;
const ok = (n, c, x) => { if (!c) { fail++; console.log('✗', n, x || ''); } else console.log('✓', n); };

function chaos() {
  return {
    decide: async (p) => {
      const r = Math.random;
      switch (p.kind) {
        case 'ack': return true;
        case 'choice': { let o = p.options; if (p.mode === 'prep' || p.mode === 'place') { const a = o.filter(x => x.type !== 'pass' && x.type !== 'end'); if (a.length && r() < 0.85) o = a; } return o[Math.floor(r() * o.length)].id; }
        case 'cards': { const k = p.min + Math.floor(r() * (p.max - p.min + 1)); return p.cards.slice().sort(() => r() - 0.5).slice(0, k).map(c => c.uid); }
        case 'number': return p.min + Math.floor(r() * (p.max - p.min + 1));
      }
      return true;
    },
  };
}
const fingerprint = g => JSON.stringify({ w: g.s.winner, round: g.s.round, extra: g.s.extra, den: g.s.players.map(p => p.deniers), lud: g.s.players.map(p => p.ludus.map(c => c.def).sort()), log: g.logs.map(l => l.text) });

(async () => {
  let same = 0, N = 60, partialOk = 0;
  for (let i = 0; i < N; i++) {
    const cfg = { seed: 777 + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 };
    const g1 = new Game(cfg); g1.ctrl = [chaos(), chaos()];
    await g1.run();
    // rejeu complet
    const q = [[], []]; g1.history.forEach(h => q[h.seat].push(h.value));
    const g2 = new Game(cfg);
    g2.ctrl = [0, 1].map(s => ({ decide: async () => q[s].shift() }));
    await g2.run();
    if (fingerprint(g1) === fingerprint(g2)) same++;
    // rejeu d'un préfixe puis reprise avec de nouveaux choix : la partie doit aller au bout sans erreur
    const cut = Math.floor(g1.history.length * 0.5);
    const q2 = [[], []]; g1.history.slice(0, cut).forEach(h => q2[h.seat].push(h.value));
    const g3 = new Game(cfg);
    const live = [chaos(), chaos()];
    g3.ctrl = [0, 1].map(s => ({ decide: async (p, g) => (q2[s].length ? q2[s].shift() : live[s].decide(p, g)) }));
    await g3.run();
    if (g3.s.over) partialOk++;
  }
  ok(`rejeu complet identique (${same}/${N})`, same === N);
  ok(`reprise après rejeu partiel (${partialOk}/${N})`, partialOk === N);
  console.log(fail ? `\n${fail} échec(s)` : '\nTests d\'annulation OK.');
  process.exit(fail ? 1 : 0);
})();
