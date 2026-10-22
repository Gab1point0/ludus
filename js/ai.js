/* LUDUS — intelligence artificielle (n'utilise que la vue du joueur : informations publiques + sa propre main/ludus) */
(function (root) {
  'use strict';
  const D = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./data.js') : root.LudusData;
  const E = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./engine.js') : root.Ludus;
  const { CARDS, RANKS } = D;
  const { computeCombat } = E;

  const baseOf = defId => CARDS[defId].base || defId;

  // valeur « autonome » approximative d'un gladiateur (en points de puissance utiles)
  const GV = {
    andabata: 3.3, caesarianus: 2.3, crupellarius: 4.3, dimacherus: 3.6, eques: 3.0, essedarius: 3.2, gallus: 2.0,
    gladiatrix: 2.6, hoplomaque: 1.9, laquearius: 3.0, munifex: 1.0, murmillo: 3.0, nobile: 2.0, pegma: 3.4,
    retiarius: 3.3, sagittarius: 4.0, samnite: 1.3, scissor: 3.4, secutor: 4.0, thraex: 2.0, veneficus: 1.6,
  };
  const RANK_AVG = { debutant: 1.9, aguerri: 2.7, legendaire: 3.5 };
  // valeur d'une tactique dans la main
  const TV = {
    pugio: 2.3, 'lion-apprivoise': 3.3, missio: 1.4, dispense: 1.5, repositionnement: 2.0, datura: 1.7, 'summa-rudis': 0.5,
    complices: 1.2, convoi: 0.45, 'a-la-fosse': 0.4, 'clef-de-la-fosse': 1.0, promotion: 1.4, reservation: 1.1, transfert: 0.2,
  };

  function gladValue(defId, round) {
    const d = CARDS[defId];
    if (d.rank === 'depart') return Math.min(4, round + 1.2) * 0.9 + 0.2;   // la puissance du Provocator monte avec les manches
    return GV[defId] != null ? GV[defId] : d.power;
  }
  const tacticValue = defId => TV[baseOf(defId)] != null ? TV[baseOf(defId)] : 1;

  // ---- vue -> structures du moteur ----
  function sideFromView(z, me, hideOppTactic) {
    return {
      glad: z.glad && !z.glad.hidden ? { uid: z.glad.uid, def: z.glad.def } : null,
      gladFaceDown: !!(z.glad && z.glad.faceDown),
      renforts: z.renforts.map(r => ({ uid: r.uid, def: r.def })),
      tactic: z.tactic && !z.tactic.hidden ? { uid: z.tactic.uid, def: z.tactic.def, deniers: z.tactic.deniers || 0 } : null,
      tacticFaceDown: !!(z.tactic && z.tactic.faceDown),
      hiddenTactic: !!(z.tactic && z.tactic.hidden),
    };
  }
  function boardFromView(view, assumeOppTactics) {
    const me = view.seat, opp = 1 - me;
    return view.zones.map(zn => zn.map((sd, seat) => {
      const s = sideFromView(sd);
      if (s.glad && s.gladFaceDown && seat === me) s.gladFaceDown = false;   // nos gladiateurs face cachée seront révélés
      if (s.tactic && s.tacticFaceDown) s.tacticFaceDown = false;            // nos tactiques posées seront révélées
      if (seat === opp && s.hiddenTactic && assumeOppTactics) s.tactic = { uid: 'assumed', def: 'pugio-' + (view.players[opp].color === 'rouge' ? 'rouge' : 'bleu'), deniers: 0 };
      return s;
    }));
  }
  function cloneBoard(b) { return b.map(zn => zn.map(s => Object.assign({}, s, { renforts: s.renforts.slice() }))); }

  function evalBoard(board, ctx) {
    const res = computeCombat({ zones: board, emperor: ctx.emperor, edictId: ctx.edict, noDeath: ctx.noDeath });
    const me = ctx.me, opp = 1 - me;
    let S = 0;
    const big = ctx.round >= 4 ? 8 : 3;
    if (res.winner === me) S += big; else if (res.winner === opp) S -= big;
    S += 0.7 * (res.won[me] - res.won[opp]);
    for (const d of res.duels) {
      if (d.a && d.b) {
        const mine = me === 0 ? d.a : d.b, theirs = me === 0 ? d.b : d.a;
        S += 0.08 * Math.max(-3, Math.min(3, mine.power - theirs.power));
      }
    }
    if (ctx.round < 4) S -= 0.45 * (res.dead[me] - res.dead[opp]);
    return S;
  }

  function create(level, seedFn, params) {
    const rnd = seedFn || Math.random;
    const noise = level === 'easy' ? 1.6 : level === 'normal' ? 0.35 : 0;
    // « hard » : valeurs réglées par auto-jeu ; « normal » et « easy » : estimations plus grossières, plus de hasard
    const P = Object.assign({ thr: 0.35, tvScale: 2, gv: 0.8, bodies: 1.8, moneyR: [0.9, 0.9, 0.6, 0.12], placeThr: 0.6, placeThr4: 0.12, skip: 0 },
      level === 'normal' ? { tvScale: 1, gv: 1.15, bodies: 1 } : {},
      level === 'easy' ? { tvScale: 0.7, gv: 1.3, bodies: 1, thr: 0.15, skip: 0.3, placeThr: 1.2, placeThr4: 0.6 } : {}, params || {});
    const jitter = () => (rnd() - 0.5) * 2 * noise;
    const pickRand = arr => arr[Math.floor(rnd() * arr.length)];

    function avgLudusValue(view) {
      const l = view.players[view.seat].ludus || [];
      if (!l.length) return 2;
      return l.reduce((a, c) => a + gladValue(c.def, view.round), 0) / l.length;
    }

    // ---------------- achats / préparation ----------------
    function scorePrepOption(view, o) {
      const me = view.seat, hand = view.players[me].hand || [], ludus = view.players[me].ludus || [];
      const avg = avgLudusValue(view);
      if (o.type === 'pass' || o.type === 'end') return 0.3;
      if (o.type === 'play') {
        const b = baseOf(o.def);
        if (b === 'a-la-fosse') {
          if (ludus.length < 5) return -9;
          let worst = 99; ludus.forEach(c => { worst = Math.min(worst, gladValue(c.def, view.round)); });
          return worst < avg - 1.3 ? 1.2 : -9;
        }
        if (b === 'clef-de-la-fosse') return hand.length <= 5 && view.fosse.tactics.length ? 1.0 : -9;
        if (b === 'convoi') return -9;
        if (b === 'promotion') {
          let gain = -9;
          ludus.forEach(c => { const r = CARDS[c.def].rank; if (r === 'debutant' || r === 'aguerri') gain = Math.max(gain, (r === 'debutant' ? RANK_AVG.aguerri : RANK_AVG.legendaire) - gladValue(c.def, view.round)); });
          return gain > 0.8 ? gain * 0.9 + 0.5 : -9;
        }
        if (b === 'reservation') return view.round >= 2 ? 0.45 : -9;
        if (b === 'transfert') return -9;
        return -9;
      }
      // achat : l'argent compte de moins en moins au fil des manches (en manche 4, il ne sert plus à rien après le combat)
      const moneyW = P.moneyR[Math.min(view.round, 4) - 1];
      const bodiesBonus = P.bodies * (ludus.length < 6 ? 0.7 : (ludus.length < 8 ? 0.25 : (view.round >= 4 ? 0.05 : -0.3)));
      if (o.q === 'tactic') {
        let tv = tacticValue(o.def) * P.tvScale;
        const b = baseOf(o.def);
        if (hand.length >= 5) tv *= 0.45;
        if (hand.length >= 7) tv *= 0.2;
        if (b === 'datura' && ludus.filter(c => ['caesarianus', 'pegma', 'sagittarius', 'laquearius', 'gladiatrix'].includes(c.def)).length === 0) tv *= 0.5;
        return tv * 0.95 - o.price * 0.5 * (moneyW / 0.9) + (view.round === 4 ? 0.2 : 0);
      }
      if (o.from === 'slot') {
        const v = gladValue(o.def, view.round);
        return P.gv * v - moneyW * o.price + bodiesBonus;
      }
      const v = RANK_AVG[o.q] - 0.15;
      return P.gv * v - moneyW * o.price + bodiesBonus - 0.2;
    }

    function decidePrep(view, p) {
      let best = null, bs = -1e9;
      for (const o of p.options) {
        let sc = scorePrepOption(view, o);
        if (o.type !== 'pass' && o.type !== 'end') sc += jitter();
        if (sc > bs) { bs = sc; best = o; }
      }
      if (best && best.type !== 'pass' && best.type !== 'end' && (bs < P.thr || (P.skip && rnd() < P.skip))) best = p.options.find(o => o.type === 'pass' || o.type === 'end');
      return best.id;
    }

    // ---------------- placement de tactiques ----------------
    function decidePlace(view, p) {
      const me = view.seat, opp = 1 - me;
      const ctx = { me, round: view.round, emperor: view.emperor, edict: view.edict ? view.edict.def : null, noDeath: view.noDeath };
      const board = boardFromView(view, true);
      const base = evalBoard(board, ctx);
      const hand = view.players[me].hand || [];
      const deniers = view.players[me].deniers;
      const thr = view.round >= 4 ? P.placeThr4 : P.placeThr;
      let best = null, bd = thr;
      const seen = new Set();
      const free = p.options.filter(o => o.type === 'place');
      for (const o of free) {
        const key = o.def + ':' + o.z;
        if (seen.has(key)) continue; seen.add(key);
        const b = baseOf(o.def);
        const sim = cloneBoard(board);
        const side = sim[o.z][me];
        side.tactic = { uid: 'hyp', def: o.def, deniers: 0 }; side.tacticFaceDown = false;
        let delta = 0;
        const noDeath = view.noDeath.map(a => a.slice());
        const ctx2 = Object.assign({}, ctx, { noDeath });
        if (b === 'repositionnement') {
          let bestSwap = -1e9;
          for (let z2 = 0; z2 < 3; z2++) {
            if (z2 === o.z) continue;
            const sm = cloneBoard(board);
            sm[o.z][me].tactic = { uid: 'hyp', def: o.def, deniers: 0 }; sm[o.z][me].tacticFaceDown = false;
            const t = sm[o.z][me]; sm[o.z][me] = sm[z2][me]; sm[z2][me] = t;
            bestSwap = Math.max(bestSwap, evalBoard(sm, ctx2) - base);
          }
          delta = bestSwap;
        } else if (b === 'missio') {
          ctx2.noDeath[o.z].push(me);
          delta = evalBoard(sim, ctx2) - base;
        } else if (b === 'complices') {
          const n = Math.min(deniers, 4);
          side.tactic.deniers = n - (n % 2);
          delta = evalBoard(sim, ctx2) - base - 0.15 * side.tactic.deniers;
        } else if (b === 'dispense') {
          const g = side.glad;
          const avg = avgLudusValue(view);
          const curr = g ? gladValue(g.def, view.round) : 9;
          delta = g ? Math.max(0, (avg - curr)) * 0.5 - 0.1 : -1;
        } else if (b === 'datura') {
          delta = evalBoard(sim, ctx2) - base;
          const g = side.glad;
          if (g && ['caesarianus', 'pegma', 'sagittarius'].includes(baseOf(g.def))) delta += 0.9;
        } else if (b === 'summa-rudis') {
          delta = -1;
        } else {
          delta = evalBoard(sim, ctx2) - base;
        }
        delta -= 0.04 * tacticValue(o.def);
        delta += jitter() * 0.5;
        if (delta > bd) { bd = delta; best = o; }
      }
      if (level === 'easy' && !best && rnd() < 0.18 && free.length) best = pickRand(free);
      return best ? best.id : 'pass';
    }

    // ---------------- sélection de cartes ----------------
    function decideCards(view, p) {
      const me = view.seat;
      const val = c => (CARDS[c.def].type === 'gladiator' ? gladValue(c.def, view.round) : tacticValue(c.def));
      const sorted = p.cards.slice();
      const { min, max } = p;
      if (p.source === 'reward') {
        const b = sorted.sort((a, c) => val(c) - val(a))[0];
        return min === 0 ? [b.uid] : [b.uid];
      }
      if (p.reinforce) {
        const s2 = sorted.sort((a, c) => CARDS[c.def].power - CARDS[a.def].power);
        const out = s2.slice(0, max).filter(c => CARDS[c.def].power >= 1 || max === 1 || min > 0);
        return out.slice(0, Math.max(min, out.length)).map(c => c.uid);
      }
      if (p.source === 'hand') return sorted.sort((a, c) => val(a) - val(c)).slice(0, min).map(c => c.uid);
      if (p.source === 'fosse') return [sorted.sort((a, c) => val(c) - val(a))[0].uid];
      if (p.source === 'ludus') {
        if (p.owner != null && p.owner !== me) return [sorted.sort((a, c) => val(a) - val(c))[0].uid];   // Réservation sur l'adversaire : son plus faible
        const t = p.title || '';
        if (/PROMOTION/.test(t)) return [sorted.sort((a, c) => val(a) - val(c))[0].uid];
        if (/RÉSERVATION/.test(t)) return [sorted.sort((a, c) => val(c) - val(a))[0].uid];
        return [sorted.sort((a, c) => val(a) - val(c))[0].uid];
      }
      return sorted.slice(0, min).map(c => c.uid);
    }

    // ---------------- autres choix ----------------
    function decideChoice(view, p) {
      const me = view.seat, opts = p.options;
      switch (p.mode) {
        case 'toss': return pickRand(opts).id;
        case 'prep': return decidePrep(view, p);
        case 'place': return decidePlace(view, p);
        case 'quarter': {
          let best = null, bs = -1;
          for (const o of opts) {
            const f = view.forum[o.id]; let poor = 0;
            f.slots.forEach(s => { if (s.card && !s.locked) poor += o.id === 'tactic' ? 1 - tacticValue(s.card.def) / 3 : 3 - gladValue(s.card.def, view.round); });
            if (poor > bs) { bs = poor; best = o; }
          }
          return best.id;
        }
        case 'seat': { const o = opts.find(x => Number(x.id) !== me); return (o || opts[0]).id; }
        case 'slot': {
          // Missio : protéger notre emplacement ; Réservation : zone au hasard
          const own = opts.find(o => o.ref && o.ref.seat === me && /Mon/.test(o.label || ''));
          if (own) return own.id;
          return pickRand(opts).id;
        }
        case 'zone': {
          // Repositionnement : on simule chaque échange
          const ctx = { me, round: view.round, emperor: view.emperor, edict: view.edict ? view.edict.def : null, noDeath: view.noDeath };
          const board = boardFromView(view, true);
          let best = null, bs = -1e9;
          const cur = opts.find(o => /celle-ci/.test(o.label || ''));
          const curZ = cur ? cur.ref.z : 0;
          for (const o of opts) {
            const z2 = o.ref.z; const sm = cloneBoard(board);
            if (z2 !== curZ) { const t = sm[curZ][me]; sm[curZ][me] = sm[z2][me]; sm[z2][me] = t; }
            const sc = evalBoard(sm, ctx) + (z2 === curZ ? 0.01 : 0);
            if (sc > bs) { bs = sc; best = o; }
          }
          return best.id;
        }
        case 'order': return opts[0].id;
        default: return opts[0].id;
      }
    }

    function decideNumber(view, p) {
      // Complices : on mise le minimum pair utile pour faire basculer le duel, sinon rien
      const me = view.seat;
      if (p.max < 2) return 0;
      const ctx = { me, round: view.round, emperor: view.emperor, edict: view.edict ? view.edict.def : null, noDeath: view.noDeath };
      const board = boardFromView(view, true);
      const base = evalBoard(board, ctx);
      let best = 0, bs = base;
      for (let n = 2; n <= Math.min(p.max, 8); n += 2) {
        const sm = cloneBoard(board);
        sm.forEach(zn => { const t = zn[me].tactic; if (t && baseOf(t.def) === 'complices' && !t.done) t.deniers = n; });
        const sc = evalBoard(sm, ctx) - 0.2 * n;
        if (sc > bs + 0.3) { bs = sc; best = n; }
      }
      return best;
    }

    return {
      level,
      decide(view, p) {
        switch (p.kind) {
          case 'ack': return true;
          case 'choice': return decideChoice(view, p);
          case 'cards': return decideCards(view, p);
          case 'number': return decideNumber(view, p);
        }
        return true;
      },
    };
  }

  const api = { create, gladValue, tacticValue, boardFromView };
  root.LudusAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
