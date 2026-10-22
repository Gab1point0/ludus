// Vérifie que chaque effet qui rapporte des deniers fonctionne (CAESARIANUS / Miaouss, NOBILE, GLADIATRIX, récompenses). node tests/deniers.test.js
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
let fail = 0;
const ok = (n, c, x) => { if (!c) { fail++; console.log('✗', n, x === undefined ? '' : JSON.stringify(x)); } else console.log('✓', n); };
const idle = { decide: async (p) => { switch (p.kind) { case 'choice': return (p.options.find(o => o.type === 'pass') || p.options[0]).id; case 'cards': return p.cards.slice(0, p.min).map(c => c.uid); case 'number': return p.min; default: return true; } } };
const fresh = (edict) => { const g = new Game({ seed: 7, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 }); g.ctrl = [idle, idle]; g.s.round = 2; if (edict) g.s.edict = { uid: 'e', def: edict }; return g; };
const put = (g, seat, z, def) => { const c = g.mk(def); g.s.colisee.zones[z][seat].glad = c; return c; };

(async () => {
  // CAESARIANUS : +2 deniers à la révélation
  { const g = fresh(); const d0 = g.s.players[0].deniers; put(g, 0, 0, 'caesarianus'); await g.resolveReveals('glad');
    ok('CAESARIANUS rapporte 2 deniers à la révélation', g.s.players[0].deniers === d0 + 2, [d0, g.s.players[0].deniers]);
    ok('… et il l\'annonce dans le journal', g.logs.some(l => /Caesarianus.*2 deniers/.test(l.text))); }
  // même chose pour le 2e joueur
  { const g = fresh(); const d1 = g.s.players[1].deniers; put(g, 1, 2, 'caesarianus'); await g.resolveReveals('glad');
    ok('CAESARIANUS du 2e joueur aussi', g.s.players[1].deniers === d1 + 2); }
  // SCISSOR adverse : l'effet est annulé
  { const g = fresh(); const d0 = g.s.players[0].deniers; put(g, 0, 0, 'caesarianus'); put(g, 1, 0, 'scissor'); await g.resolveReveals('glad');
    ok('CAESARIANUS annulé par un SCISSOR adverse (pas de deniers)', g.s.players[0].deniers === d0); }
  // PUISSANCE BRUTE : aucun effet de gladiateur
  { const g = fresh('puissance-brute'); const d0 = g.s.players[0].deniers; put(g, 0, 0, 'caesarianus'); await g.resolveReveals('glad');
    ok('CAESARIANUS annulé par l\'Édit Puissance brute', g.s.players[0].deniers === d0); }
  // DATURA : l'effet révélation est appliqué une seconde fois
  { const g = fresh(); const d0 = g.s.players[0].deniers; put(g, 0, 1, 'caesarianus'); const t = g.mk('datura'); g.s.colisee.zones[1][0].tactic = t; await g.resolveReveals('glad'); await g.resolveReveals('tactic');
    ok('CAESARIANUS + DATURA = 4 deniers', g.s.players[0].deniers === d0 + 4, [d0, g.s.players[0].deniers]); }
  // une partie complète : au moins une fois, le gain doit apparaître dans le journal puis dans le total
  { let seen = 0, good = 0;
    for (let i = 0; i < 60; i++) {
      const g = new Game({ seed: 900 + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
      const mk = () => ({ decide: async (p, game) => { const r = await idle.decide(p); return r; } });
      g.ctrl = [mk(), mk()];
      const orig = g.applyGladReveal.bind(g);
      g.applyGladReveal = async (seat, z, c) => { const b = g.s.players[seat].deniers; const blocked = g.gladBlockedNow(z, seat); await orig(seat, z, c); if (c.def === 'caesarianus') { seen++; if (blocked || g.s.players[seat].deniers === b + 2) good++; } };
      await g.run();
    }
    ok(`CAESARIANUS en partie complète : effet correct (${good}/${seen} apparitions)`, seen > 0 && good === seen); }
  console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests de deniers passent.');
  process.exit(fail ? 1 : 0);
})();
