// Simulation IA contre IA : vérifie que le moteur ne plante pas et que les cartes sont conservées.
// Usage : node tests/sim.js [nbParties] [niveau0] [niveau1] [avance(1/0)] [variante(1/0)]
const path = require('path');
const D = require(path.join('..', 'js', 'data.js'));
const { Game } = require(path.join('..', 'js', 'engine.js'));
const AI = require(path.join('..', 'js', 'ai.js'));

const N = parseInt(process.argv[2] || '200');
const L0 = process.argv[3] || 'normal', L1 = process.argv[4] || 'normal';
const ADV = (process.argv[5] || '1') === '1', VAR = (process.argv[6] || '0') === '1';

function countCards(g) {
  const s = g.s, uids = [];
  const add = c => { if (c) uids.push(c.uid); };
  for (const q of Object.keys(s.forum)) { const F = s.forum[q]; F.reserve.forEach(add); F.depot.forEach(add); F.slots.forEach(add); }
  s.fosse.gladiators.forEach(add); s.fosse.tactics.forEach(add);
  s.players.forEach(p => { p.ludus.forEach(add); p.hand.forEach(add); });
  s.colisee.zones.forEach(zn => zn.forEach(sd => { add(sd.glad); sd.renforts.forEach(add); add(sd.tactic); }));
  s.edictDeck.forEach(add); s.edictDiscard.forEach(add); add(s.edict);
  return uids;
}

(async () => {
  const stats = { wins: [0, 0], rounds: {}, extra: 0, reasons: {}, errors: 0, byFirst: [0, 0] };
  let totalLines = 0, maxExtra = 0; const cov = {};
  const left = [[0, 0, 0, 0], [0, 0, 0, 0]], leftN = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < N; i++) {
    const g = new Game({ seed: 1000 + i, advanced: ADV, variantEmperor: VAR, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    const chaos = () => ({
      decide(view, p) {
        const r = () => g.rand();
        switch (p.kind) {
          case 'ack': return true;
          case 'choice': {
            let opts = p.options;
            if (p.mode === 'prep' || p.mode === 'place') { const act = opts.filter(o => o.type !== 'pass' && o.type !== 'end'); if (act.length && r() < 0.85) opts = act; }
            return opts[Math.floor(r() * opts.length)].id;
          }
          case 'cards': { const k = p.min + Math.floor(r() * (p.max - p.min + 1)); return g.shuffle(p.cards.slice()).slice(0, k).map(c => c.uid); }
          case 'number': return p.min + Math.floor(r() * (p.max - p.min + 1));
        }
        return true;
      }
    });
    const idle = () => ({
      decide(view, p) {
        switch (p.kind) {
          case 'ack': return true;
          case 'choice': { const o = p.options.find(x => x.type === 'pass') || p.options[0]; return o.id; }
          case 'cards': return p.cards.slice(0, p.min).map(c => c.uid);
          case 'number': return p.min;
        }
        return true;
      }
    });
    const mkAI = lvl => lvl === 'chaos' ? chaos() : lvl === 'idle' ? idle() : AI.create(lvl, g.rand.bind(g));
    const ais = [mkAI(L0), mkAI(L1)];
    const origPrep = g.preparation.bind(g);
    g.preparation = async () => { await origPrep(); for (const s of [0, 1]) { const r = Math.min(g.s.round, 4) - 1; left[s][r] += g.s.players[s].deniers; leftN[s][r]++; } };
    let bad = null;
    const check = (where) => {
      if (bad) return;
      const u = countCards(g);
      if (new Set(u).size !== u.length) bad = 'doublon de carte (' + where + ')';
      else if (u.length !== g._uid) bad = `cartes perdues : ${u.length} / ${g._uid} (${where})`;
    };
    g.ctrl = ais.map(ai => ({
      decide: async (prompt, game) => {
        if (prompt.kind === 'choice' && (prompt.mode === 'prep' || prompt.mode === 'place')) check(`${prompt.mode} manche ${game.s.round}`);
        return ai.decide(game.viewFor(prompt.seat), prompt);
      }
    }));
    try {
      await g.run();
    } catch (e) {
      stats.errors++;
      console.log('ERREUR partie', i, 'seed', 1000 + i, e.stack);
      continue;
    }
    check('fin de partie');
    if (bad) { stats.errors++; console.log('INVARIANT violé partie', i, bad); continue; }
    if (!g.s.over) { stats.errors++; console.log('Partie non terminée', i); continue; }
    stats.wins[g.s.winner]++;
    stats.extra += g.s.extra; maxExtra = Math.max(maxExtra, g.s.extra);
    stats.reasons[g.s.endReason] = (stats.reasons[g.s.endReason] || 0) + 1;
    totalLines += g.logs.length;
    for (const l of g.logs) {
      const kw = ['utilise Convoi', 'utilise Promotion', 'utilise Transfert', 'utilise Réservation', 'utilise Clef de la fosse', 'utilise À la fosse',
        'Missio :', 'Datura :', 'Dispense :', 'Repositionnement :', 'Complices :', 'Summa Rudis', 'Munifex meurt', 'Nobile meurt', 'Laquearius :', 'Gladiatrix :',
        'Échange forcé', 'Réquisition', 'Vente forcée', 'Prime tactique', 'renfort', 'Austérité', 'Déstockage', 'Soif de sang', 'Nouvelle recrue', 'Combat supplémentaire',
        'Veneficus provoque', 'Le dépôt du Quartier', 'limite de main'];
      for (const k of kw) if (l.text.includes(k)) cov[k] = (cov[k] || 0) + 1;
      const m = l.text.match(/Édit de l'Empereur : « (.+?) »/); if (m) cov['Édit ' + m[1]] = (cov['Édit ' + m[1]] || 0) + 1;
    }
    if (i < 1 && process.env.SHOWLOG) console.log(g.logs.map(l => (l.to != null ? `[${l.to}] ` : '') + l.text).join('\n'));
  }
  console.log('Parties :', N, '| niveaux', L0, 'vs', L1, '| avancées', ADV, '| variante', VAR);
  console.log('Victoires J0/J1 :', stats.wins.join(' / '), '| erreurs :', stats.errors);
  console.log('Combats supplémentaires moyens :', (stats.extra / N).toFixed(2), '(max', maxExtra + ')');
  console.log('Fins :', stats.reasons);
  console.log('Lignes de journal / partie :', Math.round(totalLines / N));
  if (process.env.COV) console.log('Couverture :', cov);
  const fmt = s => left[s].map((x, r) => (x / Math.max(1, leftN[s][r])).toFixed(1)).join(' / ');
  console.log('Deniers restants après le Forum (manches 1/2/3/4) — J0 :', fmt(0), '| J1 :', fmt(1));
})();
