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
    noise: 0, noisePlace: 0, skipPlace: 0, thr: -3, legBonus: 0, mcW: 0, mcEarly: 0.5, mcK: 24, oldW: 1, resW: 0, xferOpp: 0,
  };
  // intervalles explorés par l'entraînement : [chemin, min, max]
  const SPEC = [
    ['wMean', 0.2, 3], ['earlyMean', 0.2, 1.6], ['wInc', 0, 1.2], ['bodiesLow', 0, 1.5],
    ['moneyW.0', 0, 1], ['moneyW.1', 0, 1], ['moneyW.2', 0, 1], ['moneyW.3', 0, 0.6],
    ['denial', 0, 1.5], ['resBias', -1.5, 1.5], ['provFuture', 0, 1], ['tvScale', 0.3, 4], ['tacDecay', 0, 1], ['playThr', 0, 1.5],
    ['legBonus', -1, 3], ['mcW', 0, 80], ['mcEarly', 0, 0.6], ['oldW', 0, 2], ['resW', 0, 60], ['xferOpp', 0, 1.5], ['placeThr', 0, 1.6], ['placeThr4', -0.3, 0.8], ['eBig', 1, 10], ['eBig4', 2, 16], ['eWins', 0, 2], ['eMargin', 0, 0.4], ['eDead', 0, 1.2],
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
  let PRESET_NORMAL = { blend: 0.3, noise: 2.2, noisePlace: 0.8, legBonus: 1.2 };
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

  // ---------------- simulation « Monte-Carlo » de la force d'un ludus au combat final ----------------
  // On tire au hasard 3 gladiateurs de ce ludus (comme à la révélation) contre 3 gladiateurs d'un ludus adverse typique, on résout les duels avec les vraies
  // règles (computeCombat) et on mesure la marge moyenne. Les tirages sont fixés d'avance (mêmes dés pour toutes les comparaisons) : ça donne des
  // différences fiables entre « avec cette carte » et « sans cette carte », y compris la dilution d'un ludus trop large ou l'intérêt du PROVOCATOR en manche 4.
  const MC_RAND = (() => { const r = E.mulberry32(20261022), a = new Float64Array(6000); for (let i = 0; i < a.length; i++) a[i] = r(); return a; })();
  const POOL_ALL = []; Object.values(CARDS).forEach(c => { if (c.type === 'gladiator' && !c.start) for (let i = 0; i < c.copies; i++) POOL_ALL.push(c.id); });
  const POOL_RANK = {}; Object.values(CARDS).forEach(c => { if (c.type === 'gladiator' && !c.start) (POOL_RANK[c.rank] = POOL_RANK[c.rank] || []).push(c.id); });
  const mcCache = new Map();
  function emptySide() { return { glad: null, gladFaceDown: false, renforts: [], tactic: null, tacticFaceDown: false }; }
  // forced : gladiateur imposé dans la zone du centre (RÉSERVATION sur soi-même) ; emperor : marche de l'Empereur du combat évalué (4 = combat final)
  function deckMargin(defs, oppCount, starterId, K, edict, forced, emperor) {
    if (!defs.length) return -1;
    const emp = emperor || 4;
    const key = defs.slice().sort().join(',') + '|' + oppCount + '|' + K + '|' + (edict || '') + '|' + (forced || '') + '|' + emp;
    const hit = mcCache.get(key); if (hit !== undefined) return hit;
    let pool = defs;
    if (forced) { const fi = defs.indexOf(forced); if (fi < 0) return -1; pool = without(defs, fi); }
    const n = pool.length, need = forced ? 2 : 3, m = Math.max(3, Math.min(14, oppCount || 6));
    let tot = 0;
    for (let k = 0; k < K; k++) {
      const o = (k * 14) % (MC_RAND.length - 14);
      // mes cartes (sans remise)
      const idx = []; const used = [];
      for (let j = 0; j < Math.min(need, n); j++) { let x = Math.floor(MC_RAND[o + j] * (n - j)); for (const u of used.slice().sort((a, b) => a - b)) if (x >= u) x++; used.push(x); idx.push(x); }
      const zones = [0, 1, 2].map(z => [emptySide(), emptySide()]);
      if (forced) { zones[1][0].glad = { uid: 'mf', def: forced }; const zs = [0, 2]; idx.forEach((x, j) => { zones[zs[j]][0].glad = { uid: 'm' + j, def: pool[x] }; }); }
      else idx.forEach((x, z) => { zones[z][0].glad = { uid: 'm' + z, def: pool[x] }; });
      // l'adversaire : ses 3 Provocator + des cartes quelconques du Forum
      for (let z = 0; z < 3; z++) {
        const f = MC_RAND[o + 4 + z], f2 = MC_RAND[o + 8 + z];
        const def = f < 3 / m ? starterId : POOL_ALL[Math.floor(f2 * POOL_ALL.length)];
        zones[z][1].glad = { uid: 'o' + z, def };
      }
      const r = computeCombat({ zones, emperor: emp, edictId: edict || null, noDeath: [[], [], []] });
      tot += 0.5 * (r.won[0] - r.won[1]) / 3 + (r.winner === 0 ? 0.5 : r.winner === 1 ? -0.5 : 0);
    }
    const v = tot / K;
    if (mcCache.size > 20000) mcCache.clear();
    mcCache.set(key, v);
    return v;
  }
  const without = (arr, i) => arr.filter((_, j) => j !== i);

  function create(level, seedFn, params) {
    const rnd = seedFn || Math.random;
    const P = paramsFor(level, params);
    const jitter = (s) => (rnd() - 0.5) * 2 * s;
    const pickRand = arr => arr[Math.floor(rnd() * arr.length)];
    const ctxOf = view => ({ me: view.seat, round: view.round, emperor: view.emperor, edict: view.edict ? view.edict.def : null, noDeath: view.noDeath, P });
    const roundsLeft = r => Math.max(0, 4 - r);          // manches où un gladiateur supplémentaire rapportera sa subvention
    const wm = r => P.wMean * (r >= 4 ? 1 : P.earlyMean);
    // valeur Monte-Carlo (marge au combat final) d'un ludus donné, vue du joueur de « view »
    const mcOn = P.mcW > 0;
    const mcV = (view, defs) => deckMargin(defs, view.players[1 - view.seat].ludusCount, 'provocator-' + view.players[1 - view.seat].color, P.mcK, view.round >= 4 && view.edict ? view.edict.def : null);
    const mcF = round => P.mcW * (round >= 4 ? 1 : P.mcEarly);
    // RÉSERVATION sur soi : on choisit sa meilleure carte (marge du combat de cette manche avec cette carte imposée + 2 tirées au hasard)
    const mcForced = (view, ludus, def) => deckMargin(ludus, view.players[1 - view.seat].ludusCount, 'provocator-' + view.players[1 - view.seat].color, P.mcK, view.edict ? view.edict.def : null, def, view.emperor);
    const mcNow = (view, ludus) => deckMargin(ludus, view.players[1 - view.seat].ludusCount, 'provocator-' + view.players[1 - view.seat].color, P.mcK, view.edict ? view.edict.def : null, null, view.emperor);
    const bestForced = (view, ludus) => { let best = null, bv = -9; for (const d of Array.from(new Set(ludus))) { const v = mcForced(view, ludus, d); if (v > bv) { bv = v; best = d; } } return { def: best, v: bv }; };
    const rankPool = r => POOL_RANK[r] || [];
    const mcExpectedAdd = (view, ludus, rank) => { const pool = rankPool(rank); let s = 0; for (const d of pool) s += mcV(view, ludus.concat(d)); return s / Math.max(1, pool.length); };

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
          const v0 = mcOn ? mcV(view, ludus) : 0;
          let best = -9;
          for (let i = 0; i < n; i++) {
            const rest = without(ludus, i);
            let s = P.oldW * wm(round) * 3 * (meanOf(rest, round, P) - base) - P.wInc * (n <= 7 ? roundsLeft(round) : 0) - 0.2;
            if (mcOn) s += mcF(round) * (mcV(view, rest) - v0);
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
          const v0 = mcOn ? mcV(view, ludus) : 0;
          let best = -9;
          for (let i = 0; i < n; i++) {
            const rk = CARDS[ludus[i]].rank;
            if (rk !== 'debutant' && rk !== 'aguerri') continue;
            const up = rk === 'debutant' ? RANK_AVG.aguerri : RANK_AVG.legendaire;
            const rest = without(ludus, i);
            let s = P.oldW * wm(round) * 3 * (meanWithExtra(rest, round, P, up) - base);
            if (mcOn) s += mcF(round) * (mcExpectedAdd(view, rest, rk === 'debutant' ? 'aguerri' : 'legendaire') - v0);
            if (s > best) best = s;
          }
          return best > P.playThr ? best : -9;
        }
        if (b === 'reservation' && mcOn && P.resW > 0 && n >= 3) {
          // je m'impose ma meilleure carte dans l'Arène pour ce combat (au lieu de tirer 3 cartes au hasard)
          const bf = bestForced(view, ludus);
          const s = P.resW * (bf.v - mcNow(view, ludus));
          return s > P.playThr ? s : -9;
        }
        if (b === 'transfert' && mcOn && P.xferOpp > 0 && n >= 5) {
          // je donne ma carte la plus faible à l'adversaire : mon ludus se resserre, le sien se dilue
          const v0 = mcV(view, ludus); let bv = -9;
          for (const d of new Set(ludus)) { const v = mcV(view, without(ludus, ludus.indexOf(d))); if (v > bv) bv = v; }
          const s = mcF(view.round) * (bv - v0) + P.xferOpp - P.wInc * roundsLeft(view.round);
          return s > P.playThr ? s : -9;
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
      // « réflexe du joueur normal » : un Légendaire est la carte la plus puissante du Forum, on ne le laisse pas de côté
      if (o.q === 'legendaire') score += P.legBonus * (round >= 4 ? 0.6 : 1);
      let dMean;
      const v0 = mcOn ? mcV(view, ludus) : 0;
      if (o.from === 'slot') {
        dMean = meanOf(ludus.concat(o.def), round, P) - base;
        let gain = P.oldW * wm(round) * 3 * dMean;
        if (mcOn) gain += mcF(round) * (mcV(view, ludus.concat(o.def)) - v0);
        score += gain + P.wInc * incomeGain + P.bodiesLow * Math.max(0, 6 - n) / 3;
        if (opp.deniers >= o.price && gain > 0) score += P.denial * gain;
      } else {
        dMean = meanWithExtra(ludus, round, P, RANK_AVG[o.q] + P.resBias) - base;
        let gain = P.oldW * wm(round) * 3 * dMean;
        if (mcOn) gain += mcF(round) * (mcExpectedAdd(view, ludus, o.q) - v0);
        score += gain + P.wInc * incomeGain + P.bodiesLow * Math.max(0, 6 - n) / 3 - 0.2;
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

    // ---------------- niveau « Facile » : un joueur débutant ----------------
    // Il joue toutes les phases du jeu, mais avec des réflexes simples : il dépense tout son argent, préfère la carte la plus chère
    // qu'il peut se payer (un Légendaire dès qu'il a 5 deniers), sans calculer les synergies ; il pose les tactiques qu'il comprend (bonus de puissance).
    function decidePrepNaive(view, p) {
      const me = view.seat, hand = view.players[me].hand || [];
      const buys = p.options.filter(o => o.type === 'buy');
      const pass = p.options.find(o => o.type === 'pass' || o.type === 'end');
      const pw = o => (o.def ? (CARDS[o.def].power || 0) : 0) + rnd() * 0.5;
      const bestOf = list => list.sort((a, b) => pw(b) - pw(a))[0];
      const glads = r => buys.filter(o => o.q === r);
      for (const r of ['legendaire', 'aguerri']) {
        const pool = glads(r); if (pool.length) { const slot = pool.filter(o => o.from === 'slot'); return (slot.length ? bestOf(slot) : pool[0]).id; }
      }
      const tacs = buys.filter(o => o.q === 'tactic' && hand.length < 5);
      const deb = glads('debutant');
      if (tacs.length && rnd() < 0.4) { const buff = tacs.filter(o => ['pugio', 'lion-apprivoise', 'missio', 'dispense'].includes(baseOf(o.def))); return (buff.length ? buff : tacs)[Math.floor(rnd() * (buff.length || tacs.length))].id; }
      if (deb.length) { const slot = deb.filter(o => o.from === 'slot'); return (slot.length ? bestOf(slot) : deb[0]).id; }
      if (tacs.length) return tacs[0].id;
      return pass.id;
    }
    function decidePlaceNaive(view, p) {
      const me = view.seat;
      const free = p.options.filter(o => o.type === 'place');
      const hasGlad = z => { const sd = view.zones[z][me]; return !!(sd.glad && !sd.glad.hidden); };
      const buffs = free.filter(o => ['pugio', 'lion-apprivoise'].includes(baseOf(o.def)) && hasGlad(o.z));
      if (buffs.length) return buffs[Math.floor(rnd() * buffs.length)].id;
      const others = free.filter(o => hasGlad(o.z) && !['summa-rudis', 'transfert', 'a-la-fosse', 'convoi', 'clef-de-la-fosse', 'promotion', 'reservation'].includes(baseOf(o.def)));
      if (others.length && rnd() < 0.5) return others[Math.floor(rnd() * others.length)].id;
      return 'pass';
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
        const v0 = mcOn ? mcV(view, ludus) : 0;
        for (const c of sorted) {
          let s = P.oldW * wm(round) * 3 * (meanOf(ludus.concat(c.def), round, P) - base) + P.wInc * (ludus.length < 7 ? roundsLeft(round) : 0) + jitter(P.noise);
          if (mcOn) s += mcF(round) * (mcV(view, ludus.concat(c.def)) - v0);
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
        if (/RÉSERVATION/.test(t)) {
          if (mcOn && P.resW > 0) { const bf = bestForced(view, ludus); const c = sorted.find(x => x.def === bf.def); if (c) return [c.uid]; }
          return [sorted.sort((a, c) => val(c) - val(a))[0].uid];
        }
        // À LA FOSSE, PROMOTION, TRANSFERT : on se sépare du gladiateur dont le départ fait le plus monter la moyenne du ludus
        const base = meanOf(ludus, round, P);
        let best = sorted[0], bs = -1e9;
        for (const c of sorted) {
          const i = ludus.indexOf(c.def);
          const rest = ludus.filter((_, j) => j !== i);
          let s = P.oldW * (meanOf(rest, round, P) - base) / 3;
          if (mcOn) s += (mcV(view, rest) - mcV(view, ludus));
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
        case 'toss': case 'tosshide': return pickRand(opts).id;
        case 'prep': return level === 'easy' ? decidePrepNaive(view, p) : decidePrep(view, p);
        case 'place': return level === 'easy' ? decidePlaceNaive(view, p) : decidePlace(view, p);
        case 'quarter': {
          let best = null, bs = -1;
          for (const o of opts) {
            const f = view.forum[o.id]; let poor = 0;
            f.slots.forEach(s => { if (s.card && !s.locked) poor += o.id === 'tactic' ? 1 - tacticValue(s.card.def) / 3 : 3 - gladValue(s.card.def, view.round); });
            if (poor > bs) { bs = poor; best = o; }
          }
          return best.id;
        }
        case 'seat': {
          if (mcOn && P.resW > 0) { const s = opts.find(x => Number(x.id) === me); if (s) return s.id; }     // RÉSERVATION sur soi-même
          const o = opts.find(x => Number(x.id) !== me); return (o || opts[0]).id;
        }
        case 'slot': {
          const own = opts.find(o => o.ref && o.ref.seat === me && /Mon/.test(o.label || ''));
          if (own) return own.id;
          if (mcOn && P.resW > 0) { const c = opts.find(o => o.id === '1'); if (c) return c.id; }              // zone centrale si elle est libre
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
  // entraînement : génération 50
  setPresets({ hard: {"wMean":1.09,"earlyMean":0.419,"wInc":1.041,"bodiesLow":1.281,"moneyW":[0.807,0.084,0.024,0.09],"denial":0.484,"resBias":0.657,"provFuture":0.762,"tvScale":1.776,"tacDecay":0.75,"playThr":0.442,"legBonus":1.05,"mcW":27.219,"mcEarly":0.027,"oldW":0.655,"resW":40.897,"xferOpp":0.348,"placeThr":1.512,"placeThr4":-0.144,"eBig":2.432,"eBig4":9.51,"eWins":0.216,"eMargin":0.323,"eDead":0.726,"gm":{"andabata":0.854,"caesarianus":0.773,"crupellarius":0.634,"dimacherus":0.904,"eques":1.451,"essedarius":0.964,"gallus":1.105,"gladiatrix":0.524,"hoplomaque":0.875,"laquearius":0.694,"munifex":1.611,"murmillo":1.25,"nobile":0.747,"pegma":0.816,"retiarius":0.45,"sagittarius":0.867,"samnite":1.137,"scissor":1.38,"secutor":0.864,"thraex":1.243,"veneficus":1.114},"tm":{"pugio":2.235,"lion-apprivoise":1.297,"missio":0.501,"dispense":0.647,"repositionnement":2.624,"datura":1.357,"summa-rudis":0.867,"complices":0.877,"convoi":0.93,"a-la-fosse":2.655,"clef-de-la-fosse":2.292,"promotion":0.787,"reservation":1.723,"transfert":1.707}} });
  /*TRAINED_END*/

  const api = { create, gladValue, tacticValue, boardFromView, SPEC, DEFAULT_P, vectorToParams, paramsToVector, mergeParams, setPresets, paramsFor, getPath, setPath };
  root.LudusAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
