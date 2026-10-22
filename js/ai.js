/* LUDUS — intelligence artificielle (n'utilise que la vue du joueur : informations publiques + sa propre main/ludus)

   Principe : chaque décision est notée en « points de puissance » ; les paramètres (valeur des cartes, poids de l'argent, seuils…)
   ont été entraînés par auto-jeu massif (voir tests/train.js). L'ordinateur dépense TOUJOURS son argent au Forum s'il peut acheter
   quelque chose d'utile : garder des deniers après la préparation n'a presque jamais d'intérêt dans LUDUS. */
(function (root) {
  'use strict';
  const D = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./data.js') : root.LudusData;
  const E = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./engine.js') : root.Ludus;
  const { CARDS, RANKS } = D;
  const { computeCombat } = E;

  const baseOf = defId => CARDS[defId].base || defId;

  // valeur « autonome » d'un gladiateur quand il est tiré (en points de puissance) ; PEGMA, SAGITTARIUS, HOPLOMAQUE sont calculés selon le ludus
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
  const G_IDS = Object.keys(GV), T_IDS = Object.keys(TV);

  // ---------------- paramètres ----------------
  const DEFAULT_P = {
    wMean: 1.0, earlyMean: 0.8, wInc: 0.35, bodiesLow: 0.4, moneyW: [0.35, 0.35, 0.3, 0.05], denial: 0.3, resBias: 0,
    provFuture: 0.6, tvScale: 1.5, tacDecay: 0.35, playThr: 0.3,
    placeThr: 0.6, placeThr4: 0.12, eBig: 3, eBig4: 8, eWins: 0.7, eMargin: 0.08, eDead: 0.45,
    gm: {}, tm: {},
    noise: 0, noisePlace: 0, skipPlace: 0, thr: -3,
  };
  // intervalles explorés par l'entraînement : [chemin, min, max]
  const SPEC = [
    ['wMean', 0.2, 3], ['earlyMean', 0.2, 1.6], ['wInc', 0, 1.2], ['bodiesLow', 0, 1.5],
    ['moneyW.0', 0, 1], ['moneyW.1', 0, 1], ['moneyW.2', 0, 1], ['moneyW.3', 0, 0.6],
    ['denial', 0, 1.5], ['resBias', -1.5, 1.5], ['provFuture', 0, 1], ['tvScale', 0.3, 4], ['tacDecay', 0, 1], ['playThr', 0, 1.5],
    ['placeThr', 0, 1.6], ['placeThr4', -0.3, 0.8], ['eBig', 1, 10], ['eBig4', 2, 16], ['eWins', 0, 2], ['eMargin', 0, 0.4], ['eDead', 0, 1.2],
  ].concat(G_IDS.map(id => ['gm.' + id, 0.4, 1.8])).concat(T_IDS.map(id => ['tm.' + id, 0.3, 3]));
  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function defaultOf(path) { const v = getPath(DEFAULT_P, path); return v == null ? 1 : v; }
  function vectorToParams(vec, base) { const p = clone(base || DEFAULT_P); SPEC.forEach(([path], i) => setPath(p, path, vec[i])); return p; }
  function paramsToVector(p) { return SPEC.map(([path]) => { const v = getPath(p, path); return v == null ? defaultOf(path) : v; }); }

  // niveaux : « hard » = paramètres entraînés (PRESET_HARD) ; « normal » et « easy » = mêmes principes, mais estimations dégradées
  let PRESET_HARD = {};
  // Calibrés par tests/calibrate.js : « difficile » gagne ≈ 65 % des parties contre « normal » et ≈ 84 % contre « facile »
  let PRESET_NORMAL = { blend: 0.5, noise: 1.0, noisePlace: 0.5 };
  let PRESET_EASY = { blend: 1, noise: 2, noisePlace: 1, placeThr: 1.2, placeThr4: 0.5, skipPlace: 0.4 };
  function mergeParams(...objs) {
    const out = clone(DEFAULT_P);
    for (const o of objs) {
      if (!o) continue;
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = Object.assign({}, out[k], v);
        else out[k] = Array.isArray(v) ? v.slice() : v;
      }
    }
    return out;
  }
  // « blend » (0 à 1) : proportion d'oubli des réglages entraînés, au profit des réglages d'origine (une IA moins bien réglée)
  function blended(blend) {
    const hard = mergeParams(PRESET_HARD);
    if (!blend) return hard;
    const out = clone(hard);
    SPEC.forEach(([path]) => { const h = getPath(hard, path), d = defaultOf(path); setPath(out, path, h * (1 - blend) + d * blend); });
    return out;
  }
  function paramsFor(level, extra) {
    const pre = level === 'easy' ? PRESET_EASY : level === 'normal' ? PRESET_NORMAL : null;
    const b = extra && extra.blend != null ? extra.blend : (pre && pre.blend);
    return mergeParams(blended(b), pre, extra);
  }

  // ---------------- valeurs des cartes selon le ludus ----------------
  // renvoie la valeur de chaque gladiateur d'une liste de définitions (synergies : PEGMA, SAGITTARIUS, HOPLOMAQUE)
  function gladVals(defs, round, P) {
    const n = defs.length;
    const hop = defs.filter(d => d === 'hoplomaque').length;
    return defs.map((d, i) => {
      const c = CARDS[d];
      let v;
      if (c.rank === 'depart') v = (1 - P.provFuture) * Math.min(round, 4) + P.provFuture * 4;
      else if (d === 'pegma') {
        const pw = defs.filter((x, j) => j !== i && (CARDS[x].rank === 'debutant' || CARDS[x].rank === 'aguerri')).map(x => CARDS[x].power).sort((a, b) => b - a).slice(0, 5);
        v = 0.8 * pw.reduce((a, b) => a + b, 0);
      } else if (d === 'sagittarius') {
        let m = 0; defs.forEach((x, j) => { if (j !== i) m = Math.max(m, CARDS[x].power); });
        v = 2 + 0.85 * m;
      } else if (d === 'hoplomaque') {
        v = 1 + (hop >= 3 ? 3 : hop === 2 ? 2 : 0) * Math.min(1, 3 / Math.max(3, n)) * 1.1;
      } else v = GV[d] != null ? GV[d] : c.power;
      const m = P.gm && P.gm[d] != null ? P.gm[d] : 1;
      return v * m;
    });
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  function meanOf(defs, round, P) { return mean(gladVals(defs, round, P)); }
  // valeur moyenne d'un ludus + un gladiateur supplémentaire de valeur inconnue x (pour un achat au hasard dans une réserve)
  function meanWithExtra(defs, round, P, x) { const v = gladVals(defs, round, P); return (v.reduce((a, b) => a + b, 0) + x) / (v.length + 1); }
  function tacticValueCtx(defId, ctx, P) {
    const b = baseOf(defId);
    let tv = (TV[b] != null ? TV[b] : 1) * (P.tm && P.tm[b] != null ? P.tm[b] : 1) * P.tvScale;
    if (b === 'datura' && ctx.ludus.some(d => ['pegma', 'sagittarius', 'caesarianus', 'laquearius', 'gladiatrix'].includes(d))) tv *= 1.6;
    tv /= 1 + P.tacDecay * Math.max(0, ctx.handCount - 2);
    return tv;
  }
  const gladValue = (defId, round) => gladVals([defId], round, DEFAULT_P)[0];
  const tacticValue = defId => TV[baseOf(defId)] != null ? TV[baseOf(defId)] : 1;

  // ---- vue -> structures du moteur ----
  function sideFromView(z) {
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
      if (seat === opp && s.hiddenTactic && assumeOppTactics) s.tactic = { uid: 'assumed', def: 'pugio-' + view.players[opp].color, deniers: 0 };
      return s;
    }));
  }
  function cloneBoard(b) { return b.map(zn => zn.map(s => Object.assign({}, s, { renforts: s.renforts.slice() }))); }

  function evalBoard(board, ctx) {
    const P = ctx.P;
    const res = computeCombat({ zones: board, emperor: ctx.emperor, edictId: ctx.edict, noDeath: ctx.noDeath });
    const me = ctx.me, opp = 1 - me;
    let S = 0;
    const big = ctx.round >= 4 ? P.eBig4 : P.eBig;
    if (res.winner === me) S += big; else if (res.winner === opp) S -= big;
    S += P.eWins * (res.won[me] - res.won[opp]);
    for (const d of res.duels) {
      if (d.a && d.b) {
        const mine = me === 0 ? d.a : d.b, theirs = me === 0 ? d.b : d.a;
        S += P.eMargin * Math.max(-3, Math.min(3, mine.power - theirs.power));
      }
    }
    if (ctx.round < 4) S -= P.eDead * (res.dead[me] - res.dead[opp]);
    return S;
  }

  function create(level, seedFn, params) {
    const rnd = seedFn || Math.random;
    const P = paramsFor(level, params);
    const jitter = (s) => (rnd() - 0.5) * 2 * s;
    const pickRand = arr => arr[Math.floor(rnd() * arr.length)];
    const ctxOf = view => ({ me: view.seat, round: view.round, emperor: view.emperor, edict: view.edict ? view.edict.def : null, noDeath: view.noDeath, P });
    const roundsLeft = r => Math.max(0, 4 - r);          // manches où un gladiateur supplémentaire rapportera sa subvention
    const wm = r => P.wMean * (r >= 4 ? 1 : P.earlyMean);

    // ---------------- achats / préparation ----------------
    // score en « points de puissance » (équivalents) : gain de force du ludus + revenus futurs - coût
    function scorePrepOption(view, o) {
      const me = view.seat, round = view.round;
      const hand = view.players[me].hand || [], ludusC = view.players[me].ludus || [];
      const ludus = ludusC.map(c => c.def);
      const n = ludus.length;
      const opp = view.players[1 - me];
      if (o.type === 'pass' || o.type === 'end') return P.thr;
      if (o.type === 'play') {
        const b = baseOf(o.def);
        if (b === 'a-la-fosse') {
          if (n < 4) return -9;
          const base = meanOf(ludus, round, P);
          let best = -9;
          for (let i = 0; i < n; i++) {
            const rest = ludus.filter((_, j) => j !== i);
            const s = wm(round) * 3 * (meanOf(rest, round, P) - base) - P.wInc * (n <= 7 ? roundsLeft(round) : 0) - 0.2;
            if (s > best) best = s;
          }
          return best > P.playThr ? best : -9;
        }
        if (b === 'clef-de-la-fosse') {
          if (hand.length > 5 || !view.fosse.tactics.length) return -9;
          let bt = 0; view.fosse.tactics.forEach(c => { bt = Math.max(bt, tacticValueCtx(c.def, { ludus, handCount: hand.length }, P)); });
          return bt * 0.8 - 0.6;
        }
        if (b === 'promotion') {
          const base = meanOf(ludus, round, P);
          let best = -9;
          for (let i = 0; i < n; i++) {
            const rk = CARDS[ludus[i]].rank;
            if (rk !== 'debutant' && rk !== 'aguerri') continue;
            const up = rk === 'debutant' ? RANK_AVG.aguerri : RANK_AVG.legendaire;
            const rest = ludus.filter((_, j) => j !== i);
            const s = wm(round) * 3 * (meanWithExtra(rest, round, P, up) - base);
            if (s > best) best = s;
          }
          return best > P.playThr ? best : -9;
        }
        return -9;
      }
      // ---- achat ----
      const moneyW = P.moneyW[Math.min(round, 4) - 1];
      let score = -moneyW * o.price;
      if (o.q === 'tactic') {
        if (hand.length >= 7) return -5;
        const tv = tacticValueCtx(o.def, { ludus, handCount: hand.length }, P);
        if (tv < 0.35) return -5;                      // tactique sans intérêt : inutile de la payer
        score += tv;
        if (opp.deniers >= o.price) score += P.denial * 0.3 * tv;
        return score;
      }
      const base = meanOf(ludus, round, P);
      const incomeGain = (n < 7 ? 1 : 0) * roundsLeft(round);
      let dMean;
      if (o.from === 'slot') {
        dMean = meanOf(ludus.concat(o.def), round, P) - base;
        const gain = wm(round) * 3 * dMean;
        score += gain + P.wInc * incomeGain + P.bodiesLow * Math.max(0, 6 - n) / 3;
        if (opp.deniers >= o.price && gain > 0) score += P.denial * gain;
      } else {
        dMean = meanWithExtra(ludus, round, P, RANK_AVG[o.q] + P.resBias) - base;
        score += wm(round) * 3 * dMean + P.wInc * incomeGain + P.bodiesLow * Math.max(0, 6 - n) / 3 - 0.2;
      }
      return score;
    }

    function decidePrep(view, p) {
      let best = null, bs = -1e9;
      for (const o of p.options) {
        let sc = scorePrepOption(view, o);
        if (o.type !== 'pass' && o.type !== 'end') sc += jitter(P.noise);
        if (sc > bs) { bs = sc; best = o; }
      }
      // s'il reste de quoi acheter, on n'arrête pas : l'argent gardé après le Forum ne sert presque jamais
      return best.id;
    }

    // ---------------- placement de tactiques ----------------
    function decidePlace(view, p) {
      const me = view.seat;
      if (P.skipPlace && rnd() < P.skipPlace) return 'pass';
      const ctx = ctxOf(view);
      const board = boardFromView(view, true);
      const base = evalBoard(board, ctx);
      const deniers = view.players[me].deniers;
      const thr = view.round >= 4 ? P.placeThr4 : P.placeThr;
      const ludus = (view.players[me].ludus || []).map(c => c.def);
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
          const avg = meanOf(ludus, view.round, P);
          const curr = g ? gladVals([g.def], view.round, P)[0] : 9;
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
        delta += jitter(P.noisePlace);
        if (delta > bd) { bd = delta; best = o; }
      }
      return best ? best.id : 'pass';
    }

    // ---------------- sélection de cartes ----------------
    function decideCards(view, p) {
      const me = view.seat;
      const round = view.round;
      const ludus = (view.players[me].ludus || []).map(c => c.def);
      const gv = c => gladVals([c.def], round, P)[0];
      const val = c => (CARDS[c.def].type === 'gladiator' ? gv(c) : tacticValue(c.def));
      const sorted = p.cards.slice();
      const { min, max } = p;
      if (p.source === 'reward') {
        // gladiateur récompense : on recrute le meilleur (ou aucun s'il ferait baisser le niveau du ludus)
        const base = meanOf(ludus, round, P);
        let best = null, bs = -1e9;
        for (const c of sorted) {
          const s = wm(round) * 3 * (meanOf(ludus.concat(c.def), round, P) - base) + P.wInc * (ludus.length < 7 ? roundsLeft(round) : 0) + jitter(P.noise);
          if (s > bs) { bs = s; best = c; }
        }
        return bs < -1.5 && min === 0 ? [] : [best.uid];
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
        if (/RÉSERVATION/.test(t)) return [sorted.sort((a, c) => val(c) - val(a))[0].uid];
        // À LA FOSSE, PROMOTION, TRANSFERT : on se sépare du gladiateur dont le départ fait le plus monter la moyenne du ludus
        const base = meanOf(ludus, round, P);
        let best = sorted[0], bs = -1e9;
        for (const c of sorted) {
          const i = ludus.indexOf(c.def);
          const rest = ludus.filter((_, j) => j !== i);
          const s = meanOf(rest, round, P) - base;
          if (s > bs) { bs = s; best = c; }
        }
        return [best.uid];
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
          const own = opts.find(o => o.ref && o.ref.seat === me && /Mon/.test(o.label || ''));
          if (own) return own.id;
          return pickRand(opts).id;
        }
        case 'zone': {
          const ctx = ctxOf(view);
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
      const ctx = ctxOf(view);
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
      level, P,
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

  function setPresets(o) { if (o.hard) PRESET_HARD = o.hard; if (o.normal) PRESET_NORMAL = o.normal; if (o.easy) PRESET_EASY = o.easy; }

  // ---- PARAMÈTRES ENTRAÎNÉS (générés par tests/train.js) ----
  /*TRAINED_BEGIN*/
  // entraînement : génération 60
  setPresets({ hard: {"wMean":0.917,"earlyMean":0.368,"wInc":0.996,"bodiesLow":1.12,"moneyW":[0.922,0.016,0.012,0.03],"denial":0.257,"resBias":1.137,"provFuture":0.397,"tvScale":1.65,"tacDecay":0.78,"playThr":0.097,"placeThr":1.184,"placeThr4":-0.166,"eBig":5.892,"eBig4":11.74,"eWins":0.897,"eMargin":0.26,"eDead":0.693,"gm":{"andabata":1.308,"caesarianus":0.794,"crupellarius":0.628,"dimacherus":0.713,"eques":1.571,"essedarius":1.538,"gallus":1.393,"gladiatrix":0.627,"hoplomaque":0.695,"laquearius":0.823,"munifex":1.005,"murmillo":1.226,"nobile":0.747,"pegma":0.797,"retiarius":0.928,"sagittarius":1.155,"samnite":0.865,"scissor":1.526,"secutor":1.563,"thraex":1.316,"veneficus":1.153},"tm":{"pugio":2.377,"lion-apprivoise":2.185,"missio":0.513,"dispense":1.198,"repositionnement":2.887,"datura":1.523,"summa-rudis":1.26,"complices":0.744,"convoi":1.054,"a-la-fosse":2.027,"clef-de-la-fosse":2.353,"promotion":0.991,"reservation":0.379,"transfert":1.118}} });
  /*TRAINED_END*/

  const api = { create, gladValue, tacticValue, boardFromView, SPEC, DEFAULT_P, vectorToParams, paramsToVector, mergeParams, setPresets, paramsFor, getPath, setPath };
  root.LudusAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
