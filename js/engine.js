/* LUDUS — moteur de règles (indépendant de l'interface : tourne dans le navigateur et sous Node) */
(function (root) {
  'use strict';
  const D = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./data.js') : root.LudusData;
  const { CARDS, RANKS, QUARTIERS, EDICTS, COMPENSATION, REWARD_RANK, SUBSIDY_CAP, HAND_LIMIT } = D;

  const defOf = c => CARDS[c.def];
  const baseOf = c => { const d = CARDS[c.def]; return d.base || d.id; };
  const rankOrder = c => RANKS[defOf(c).rank].order;
  const Q_ORDER = ['tactic', 'debutant', 'aguerri', 'legendaire'];
  const G_QUARTIERS = ['debutant', 'aguerri', 'legendaire'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // =====================================================================================
  //  Calcul du combat (fonction pure : utilisée par le moteur ET par l'IA pour simuler)
  //  env = { zones:[z][seat] = {glad, gladFaceDown, renforts[], tactic, tacticFaceDown},
  //          emperor, edictId, noDeath:[[seat..],...] }
  // =====================================================================================
  function computeCombat(env) {
    const zones = env.zones, emperor = env.emperor, edictId = env.edictId;
    const noDeath = env.noDeath || [[], [], []];
    const brute = edictId === 'puissance-brute';
    const slot = (z, s) => zones[z][s];
    const gladAt = (z, s) => { const sl = slot(z, s); return sl.glad && !sl.gladFaceDown ? sl.glad : null; };
    const tacAt = (z, s) => { const sl = slot(z, s); return sl.tactic && !sl.tacticFaceDown ? sl.tactic : null; };

    const entries = [];
    for (let z = 0; z < 3; z++) for (let s = 0; s < 2; s++) {
      const g = gladAt(z, s);
      if (g) entries.push({ z, s, card: g, def: defOf(g), base: baseOf(g), mods: [], power: 0 });
    }
    const E = (z, s) => entries.find(e => e.z === z && e.s === s) || null;
    const protectedZone = z => [0, 1].some(s => { const t = tacAt(z, s); return t && baseOf(t) === 'summa-rudis'; });
    const blocked = e => { if (brute) return true; const o = E(e.z, 1 - e.s); return !!(o && o.base === 'scissor'); };
    const apps = e => { const t = tacAt(e.z, e.s); return (t && baseOf(t) === 'datura' && !protectedZone(e.z)) ? 2 : 1; };
    const adjacent = z => z === 1 ? [0, 2] : [1];
    const addMod = (e, amt, src) => { if (e && amt) e.mods.push({ amt, src }); };

    for (const e of entries) {
      if (edictId === 'encouragement' && e.def.rank === 'debutant') addMod(e, +1, 'Édit : Encouragement');
      const t = tacAt(e.z, e.s);
      if (t) {
        const tb = baseOf(t);
        if (tb === 'pugio') addMod(e, +1, 'Pugio');
        else if (tb === 'lion-apprivoise') addMod(e, +2, 'Lion apprivoisé');
        else if (tb === 'complices') addMod(e, Math.floor((t.deniers || 0) / 2), 'Complices');
      }
      if (!blocked(e)) {
        const n = apps(e);
        for (let k = 0; k < n; k++) {
          switch (e.base) {
            case 'provocator': addMod(e, emperor, 'Provocator'); break;
            case 'gallus': if (e.z === 1) addMod(e, 3, 'Gallus'); break;
            case 'samnite': if (entries.some(x => x.def.rank === 'depart')) addMod(e, -3, 'Samnite'); break;
            case 'retiarius': { const o = E(e.z, 1 - e.s); if (o && (o.def.rank === 'debutant' || o.def.rank === 'aguerri')) addMod(e, 2, 'Retiarius'); break; }
            case 'eques': { const c = entries.filter(x => x.s !== e.s && x.def.rank === 'legendaire').length; addMod(e, 2 * c, 'Eques'); break; }
            case 'crupellarius': { const c = [0, 1, 2].filter(z => tacAt(z, 1 - e.s)).length; addMod(e, -c, 'Crupellarius'); break; }
            case 'hoplomaque': { const c = entries.filter(x => x.s === e.s && x.base === 'hoplomaque').length; if (c === 2) addMod(e, 2, 'Hoplomaque'); else if (c >= 3) addMod(e, 3, 'Hoplomaque'); break; }
            case 'essedarius': for (const z2 of adjacent(e.z)) addMod(E(z2, e.s), +1, 'Essedarius'); break;
            case 'andabata': for (const z2 of adjacent(e.z)) addMod(E(z2, e.s), -1, 'Andabata'); break;
          }
        }
      }
    }
    for (const e of entries) {
      const mult = (!blocked(e) && e.base === 'dimacherus') ? Math.pow(2, apps(e)) : 1;
      const sum = e.mods.reduce((a, m) => a + m.amt, 0) * mult;
      const renf = slot(e.z, e.s).renforts.reduce((a, c) => a + defOf(c).power, 0);
      const baseP = edictId === 'effets-decisifs' ? 0 : e.def.power;
      e.mult = mult; e.renf = renf; e.baseP = baseP; e.blocked = blocked(e);
      e.power = Math.max(0, baseP + sum + renf);
    }

    const duels = []; const won = [0, 0]; const deniers = [0, 0]; const recruits = []; const deaths = [];
    for (let z = 0; z < 3; z++) {
      const a = E(z, 0), b = E(z, 1);
      let w = null, forced = false;
      if (!a && !b) w = null;
      else if (a && !b) w = 0;
      else if (b && !a) w = 1;
      else {
        if (a.power > b.power) w = 0;
        else if (b.power > a.power) w = 1;
        else if (a.def.avantage && !b.def.avantage) w = 0;
        else if (b.def.avantage && !a.def.avantage) w = 1;
        else w = null;
        if (w !== null) {
          const loser = w === 0 ? b : a;
          if (loser.base === 'veneficus' && !blocked(loser)) { w = null; forced = true; }
        }
      }
      if (w !== null) won[w]++;
      const duel = { z, a, b, winner: w, forcedTie: forced, empty: !a && !b, gain: [0, 0], recruited: null };
      if (w !== null) {
        const we = w === 0 ? a : b, le = w === 0 ? b : a;
        if (we && we.base === 'gladiatrix' && !blocked(we)) { duel.gain[w] = 3 * apps(we); deniers[w] += duel.gain[w]; }
        if (we && le && we.base === 'laquearius' && !blocked(we)) { duel.recruited = { from: 1 - w, to: w }; recruits.push({ z, from: 1 - w, to: w }); }
      }
      duels.push(duel);
    }
    const isRecruited = (z, s) => recruits.some(r => r.z === z && r.from === s);
    const isProtected = (z, s) => (noDeath[z] || []).includes(s);
    for (const d of duels) {
      const z = d.z;
      const tryDie = (e) => { if (e && !isRecruited(z, e.s) && !isProtected(z, e.s)) deaths.push({ z, s: e.s, card: e.card }); };
      if (d.empty) continue;
      if (d.winner === null) { tryDie(d.a); tryDie(d.b); }
      else {
        const le = d.winner === 0 ? d.b : d.a, we = d.winner === 0 ? d.a : d.b;
        if (le) tryDie(le);
        else if (edictId === 'soif-de-sang') tryDie(we);
      }
    }
    const dead = [0, 0]; deaths.forEach(d => dead[d.s]++);
    let winner = null;
    if (edictId === 'soif-de-sang') { if (dead[0] > dead[1]) winner = 0; else if (dead[1] > dead[0]) winner = 1; }
    else { if (won[0] > won[1]) winner = 0; else if (won[1] > won[0]) winner = 1; }
    return { duels, entries, won, deniers, recruits, deaths, dead, winner };
  }

  // =====================================================================================
  //  Partie
  // =====================================================================================
  class Game {
    constructor(cfg) {
      this.cfg = Object.assign({ advanced: true, variantEmperor: false, names: ['Joueur 1', 'Joueur 2'], colors: ['rouge', 'bleu'], seed: null, speed: 0 }, cfg || {});
      this.seed = this.cfg.seed == null ? ((Math.random() * 4294967296) >>> 0) : this.cfg.seed;
      this._rng = mulberry32(this.seed);
      this.ctrl = [null, null];
      this.listeners = new Set();
      this.history = [];
      this.logs = []; this._logN = 0; this._uid = 0; this._pid = 0;
      this.aborted = false;
      this.init();
    }

    // ---------- utilitaires ----------
    rand() { return this._rng(); }
    randInt(n) { return Math.floor(this._rng() * n); }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.randInt(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    mk(def) { return { uid: 'c' + (++this._uid), def }; }
    name(seat) { return this.s.players[seat].name; }
    cname(c) { return defOf(c).name; }
    edictId() { return this.s.edict ? this.s.edict.def : null; }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit() { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } }
    say(text, to) { this.logs.push({ n: ++this._logN, text, to: to == null ? null : to, round: this.s ? this.s.round : 0 }); if (this.logs.length > 400) this.logs.shift(); this.emit(); }
    async beat(ms) {
      this.checkAbort();
      const sp = this.cfg.speed;
      if (!sp) return;
      await new Promise(r => setTimeout(r, ms / sp));
      this.checkAbort();
    }
    checkAbort() { if (this.aborted) { const e = new Error('aborted'); e.aborted = true; throw e; } }
    abort() { this.aborted = true; for (const p of [0, 1]) { const c = this.ctrl[p]; if (c && c.cancel) c.cancel(); } this.emit(); }

    // ---------- initialisation ----------
    init() {
      const adv = this.cfg.advanced;
      const forum = {};
      for (const q of Q_ORDER) forum[q] = { reserve: [], depot: [], slots: QUARTIERS[q].unlock.map(() => null), unlock: QUARTIERS[q].unlock.slice() };
      for (const def of Object.values(CARDS)) {
        if (def.start) continue;
        if (def.advanced && !adv) continue;
        const q = def.type === 'tactic' ? 'tactic' : def.rank;
        for (let i = 0; i < def.copies; i++) forum[q].reserve.push(this.mk(def.id));
      }
      for (const q of Q_ORDER) this.shuffle(forum[q].reserve);
      const players = [0, 1].map(i => {
        const c = this.cfg.colors[i];
        return {
          name: this.cfg.names[i], color: c, deniers: 4,
          ludus: [this.mk('provocator-' + c), this.mk('provocator-' + c), this.mk('provocator-' + c)],
          hand: [this.mk('pugio-' + c), this.mk('a-la-fosse-' + c), this.mk('convoi-' + c)],
        };
      });
      this.s = {
        round: 0, emperor: 1, phase: 'setup', step: '', firstSeat: 0, extra: 0,
        players, forum, fosse: { gladiators: [], tactics: [] },
        edictDeck: this.shuffle(Object.keys(EDICTS).map(id => this.mk(id))), edictDiscard: [], edict: null,
        colisee: { zones: [0, 1, 2].map(() => [this.emptySide(), this.emptySide()]), noDeath: [[], [], []] },
        combat: null, prompts: { 0: null, 1: null }, purchases: [0, 0], buys: [[], []], wins: [0, 0],
        over: false, winner: null, endReason: '', toss: null,
      };
    }
    emptySide() { return { glad: null, gladFaceDown: false, renforts: [], tactic: null, tacticFaceDown: false }; }

    // ---------- dialogue avec les joueurs ----------
    async ask(seat, prompt) {
      this.checkAbort();
      prompt.id = ++this._pid; prompt.seat = seat;
      this.s.prompts[seat] = prompt; this.emit();
      let ans;
      try {
        for (let tries = 0; tries < 3 && ans === undefined; tries++) {
          const raw = await this.ctrl[seat].decide(prompt, this);
          this.checkAbort();
          const v = this.validate(prompt, raw);
          if (v.ok) ans = v.value;
        }
      } finally { this.s.prompts[seat] = null; }
      if (ans === undefined) ans = this.defaultAnswer(prompt);
      this.history.push({ seat, kind: prompt.kind, mode: prompt.mode, value: ans });   // pour « annuler le coup précédent » (rejeu déterministe)
      this.emit();
      return ans;
    }
    validate(p, raw) {
      switch (p.kind) {
        case 'choice': return p.options.some(o => o.id === raw) ? { ok: true, value: raw } : { ok: false };
        case 'cards': {
          if (!Array.isArray(raw)) return { ok: false };
          const set = new Set(raw);
          if (set.size !== raw.length) return { ok: false };
          if (!raw.every(u => p.cards.some(c => c.uid === u))) return { ok: false };
          if (raw.length < p.min || raw.length > p.max) return { ok: false };
          return { ok: true, value: raw };
        }
        case 'number': { const n = Math.floor(Number(raw)); return Number.isFinite(n) && n >= p.min && n <= p.max ? { ok: true, value: n } : { ok: false }; }
        default: return { ok: true, value: true };
      }
    }
    defaultAnswer(p) {
      switch (p.kind) {
        case 'choice': return p.default != null ? p.default : p.options[0].id;
        case 'cards': return p.cards.slice(0, p.min).map(c => c.uid);
        case 'number': return p.min;
        default: return true;
      }
    }
    // utilitaires de prompts
    cardV(c) { return { uid: c.uid, def: c.def }; }
    askCards(seat, title, cards, min, max, extra) {
      return this.ask(seat, Object.assign({ kind: 'cards', title, cards: cards.map(c => this.cardV(c)), min, max }, extra || {}));
    }
    askChoice(seat, title, options, extra) { return this.ask(seat, Object.assign({ kind: 'choice', title, options }, extra || {})); }
    async ackAll(text, button) {
      await Promise.all([0, 1].map(s => this.ask(s, { kind: 'ack', title: text, button: button || 'Continuer' })));
    }

    // =====================================================================================
    //  Déroulement général
    // =====================================================================================
    async run() {
      try {
        await this.coinToss(true);
        for (let round = 1; round <= 4 && !this.s.over; round++) {
          this.s.round = round;
          await this.renewal();
          await this.preparation();
          const res = await this.revelationAndCombat();
          if (round < 4) await this.rewards(res);
          else await this.finalCombats(res);
        }
      } catch (e) {
        if (!e.aborted) throw e;
      }
      return this.s;
    }

    async coinToss(initial) {
      const s = this.s;
      const hider = initial ? 1 : s.firstSeat, chooser = 1 - hider;
      this.say(`${this.name(hider)} cache le sesterce dans un poing et un denier dans l'autre.`);
      const pick = await this.askChoice(chooser, 'Choisissez un poing', [
        { id: 'left', label: '🤜 Poing gauche' }, { id: 'right', label: '🤛 Poing droit' }], { mode: 'toss', text: `${this.name(hider)} cache le sesterce dans un poing et un denier dans l'autre.` });
      const sesterceLeft = this.rand() < 0.5;
      const gotSesterce = (pick === 'left') === sesterceLeft;
      const holder = gotSesterce ? chooser : hider;
      s.toss = { hider, chooser, pick, holder };
      s.firstSeat = holder;
      this.say(`${this.name(chooser)} choisit le poing ${pick === 'left' ? 'gauche' : 'droit'} : ${gotSesterce ? 'le sesterce !' : 'le denier.'} ${this.name(holder)} est le premier laniste.`);
      if (initial) s.players[1 - holder].deniers += 1;
      await this.beat(900);
    }

    // =====================================================================================
    //  1 - RENOUVELLEMENT
    // =====================================================================================
    async renewal() {
      const s = this.s;
      s.phase = 'renewal'; s.step = 'emperor'; s.combat = null; s.purchases = [0, 0];
      this.say(`══ Manche ${s.round} ══`);
      if (s.round >= 2) { s.emperor = s.round; this.say(`L'Empereur avance à la marche ${s.round}.`); }
      await this.beat(500);
      s.step = 'edict';
      await this.revealEdict();
      s.step = 'forum';
      this.supplyAll();
      await this.beat(500);
    }

    drawEdict() {
      const s = this.s;
      if (!s.edictDeck.length) { s.edictDeck = this.shuffle(s.edictDiscard); s.edictDiscard = []; }
      return s.edictDeck.shift();
    }
    async revealEdict() {
      const s = this.s;
      if (s.edict) s.edictDiscard.push(s.edict);
      s.edict = this.drawEdict();
      const e = EDICTS[s.edict.def];
      this.say(`Édit de l'Empereur : « ${e.name} ».`);
      this.emit();
      await this.beat(500);
      // l'Édit s'affiche en grand : chaque laniste doit cliquer pour confirmer qu'il l'a lu avant que ses effets ne s'appliquent
      await Promise.all([0, 1].map(seat => this.ask(seat, { kind: 'ack', mode: 'edict', title: `Édit de l'Empereur : ${e.name}`, button: 'J\'ai lu', edict: s.edict.def })));
      await this.applyEdictReveal(s.edict.def);
    }
    async applyEdictReveal(id) {
      const s = this.s, r = s.round;
      const order = [s.firstSeat, 1 - s.firstSeat];
      switch (id) {
        case 'echange-force':
          if (r === 1) this.say('Échange forcé : aucun effet en manche 1.');
          else {
            const [a, b] = [s.players[0], s.players[1]];
            if (a.ludus.length && b.ludus.length) {
              const ca = a.ludus.splice(this.randInt(a.ludus.length), 1)[0];
              const cb = b.ludus.splice(this.randInt(b.ludus.length), 1)[0];
              a.ludus.push(cb); b.ludus.push(ca);
              this.say('Échange forcé : chaque laniste donne un gladiateur tiré au hasard à son adversaire.');
              this.say(`Vous donnez ${this.cname(ca)} et recevez ${this.cname(cb)}.`, 0);
              this.say(`Vous donnez ${this.cname(cb)} et recevez ${this.cname(ca)}.`, 1);
            } else this.say('Échange forcé : un des lanistes n\'a aucun gladiateur, rien ne se passe.');
          }
          break;
        case 'prime-de-victoire':
          if (r === 4) this.say('Prime de victoire : aucun effet en manche 4.');
          break;
        case 'nouvelle-recrue': {
          const qs = r === 4 ? G_QUARTIERS : [G_QUARTIERS[Math.min(r, 3) - 1]];
          for (const seat of order) for (const q of qs) {
            const c = this.drawReserve(q);
            if (c) { s.players[seat].ludus.push(c); this.say(`${this.name(seat)} recrute un gladiateur ${RANKS[q].label} (${this.cname(c)}).`, seat); this.say(`${this.name(seat)} recrute un gladiateur ${RANKS[q].label}.`, 1 - seat); }
          }
          break;
        }
        case 'prime-tactique':
          if (r === 4) {
            const got = [null, null];
            for (const seat of order) {
              const c = this.drawReserve('tactic');
              if (c) { got[seat] = c; s.players[seat].hand.push(c); this.say(`${this.name(seat)} pioche et révèle ${this.cname(c)} (${defOf(c).price} d.).`); }
            }
            if (got[0] && got[1]) {
              const d = defOf(got[0]).price - defOf(got[1]).price;
              if (d !== 0) { const who = d > 0 ? 1 : 0; s.players[who].deniers += Math.abs(d); this.say(`${this.name(who)} reçoit la différence : ${Math.abs(d)} denier(s).`); }
            }
          }
          break;
        case 'requisition':
          for (const seat of order) {
            const lud = s.players[seat].ludus;
            if (!lud.length) continue;
            let pool;
            if (r === 1) pool = lud.filter(c => defOf(c).rank === 'depart');
            else { const top = Math.max(...lud.map(rankOrder)); pool = lud.filter(c => rankOrder(c) === top); }
            if (!pool.length) continue;
            const c = pool[this.randInt(pool.length)];
            lud.splice(lud.indexOf(c), 1); s.fosse.gladiators.push(c);
            this.say(`Réquisition : ${this.name(seat)} perd ${this.cname(c)} (défaussé à la fosse).`);
          }
          break;
        case 'vente-forcee':
          for (const seat of order) {
            const p = s.players[seat];
            let gain = 0, n = 0;
            if (r === 1) {
              const dep = p.ludus.filter(c => defOf(c).rank === 'depart');
              dep.forEach(c => { p.ludus.splice(p.ludus.indexOf(c), 1); s.fosse.gladiators.push(c); n++; });
              gain = 3;
            } else {
              const rest = p.ludus.filter(c => defOf(c).rank !== 'depart');
              rest.forEach(c => { p.ludus.splice(p.ludus.indexOf(c), 1); s.fosse.gladiators.push(c); gain += RANKS[defOf(c).rank].price; n++; });
            }
            p.deniers += gain;
            this.say(`Vente forcée : ${this.name(seat)} défausse ${n} gladiateur(s) et reçoit ${gain} denier(s).`);
          }
          break;
      }
      this.emit();
    }

    // ---------- Forum ----------
    drawReserve(q) {
      const F = this.s.forum[q];
      if (!F.reserve.length && F.depot.length) { F.reserve = this.shuffle(F.depot); F.depot = []; this.say(`Le dépôt du Quartier ${QUARTIERS[q].label} est mélangé : nouvelle réserve.`); }
      return F.reserve.shift() || null;
    }
    // renouvellement d'un Quartier : envoi au dépôt de la carte la plus proche du dépôt, décalage, ravitaillement
    supplyQuarter(q, sendToDepot) {
      const s = this.s, F = s.forum[q];
      const avail = F.slots.map((_, i) => i).filter(i => F.unlock[i] <= s.round);
      if (sendToDepot) {
        for (let k = avail.length - 1; k >= 0; k--) {
          const i = avail[k];
          if (F.slots[i]) { F.depot.push(F.slots[i]); F.slots[i] = null; break; }
        }
      }
      // décalage maximal vers le dépôt
      const cards = avail.map(i => F.slots[i]).filter(Boolean);
      avail.forEach(i => { F.slots[i] = null; });
      for (let k = 0; k < cards.length; k++) F.slots[avail[avail.length - cards.length + k]] = cards[k];
      // ravitaillement : on remplit d'abord l'emplacement vide le plus proche du dépôt
      for (let k = avail.length - 1; k >= 0; k--) {
        const i = avail[k];
        if (!F.slots[i]) { const c = this.drawReserve(q); if (c) F.slots[i] = c; }
      }
    }
    supplyAll() {
      const s = this.s;
      for (const q of Q_ORDER) this.supplyQuarter(q, s.round >= 2);
      this.say('Le Forum est ravitaillé.');
      this.emit();
    }

    // =====================================================================================
    //  2 - PRÉPARATION
    // =====================================================================================
    quote(seat, q, from, card) {
      const s = this.s;
      let price = q === 'tactic' ? defOf(card).price : RANKS[q].price;
      const e = this.edictId();
      if (e === 'austerite') price += s.purchases[seat];
      if (e === 'destockage' && from === 'reserve' && (q === 'aguerri' || q === 'legendaire')) price -= 1;
      return Math.max(0, price);
    }
    freeGladSlots(seat) {
      const out = [];
      this.s.colisee.zones.forEach((zone, z) => { if (!zone[seat].glad) out.push(z); });
      return out;
    }
    canPlayPrep(seat, c) {
      const s = this.s, p = s.players[seat];
      switch (baseOf(c)) {
        case 'a-la-fosse': return p.ludus.length > 0;
        case 'clef-de-la-fosse': return s.fosse.tactics.length > 0;
        case 'convoi': return true;
        case 'promotion': return p.ludus.some(g => defOf(g).rank === 'debutant' || defOf(g).rank === 'aguerri');
        case 'reservation': return [0, 1].some(t => s.players[t].ludus.length > 0 && this.freeGladSlots(t).length > 0);
        case 'transfert': return p.ludus.length > 0;
      }
      return false;
    }
    prepOptions(seat, bought, allowance) {
      const s = this.s, p = s.players[seat], opts = [];
      for (const c of p.hand) if (defOf(c).prep && this.canPlayPrep(seat, c)) opts.push({ id: 'play:' + c.uid, type: 'play', uid: c.uid, def: c.def });
      if (bought < allowance) {
        for (const q of Q_ORDER) {
          const F = s.forum[q];
          F.slots.forEach((c, i) => {
            if (!c || F.unlock[i] > s.round) return;
            const price = this.quote(seat, q, 'slot', c);
            if (price <= p.deniers) opts.push({ id: `buy:${q}:${i}`, type: 'buy', q, i, from: 'slot', uid: c.uid, def: c.def, price });
          });
          if (q !== 'tactic' && !(q === 'legendaire' && s.round === 1) && (F.reserve.length + F.depot.length) > 0) {
            const price = this.quote(seat, q, 'reserve');
            if (price <= p.deniers) opts.push({ id: `buy:${q}:r`, type: 'buy', q, from: 'reserve', price });
          }
        }
      }
      if (bought > 0) opts.push({ id: 'end', type: 'end', label: 'Terminer mon tour' });
      else opts.push({ id: 'pass', type: 'pass', label: 'Ne rien acheter' });
      return opts;
    }

    async preparation() {
      const s = this.s;
      s.phase = 'preparation'; s.step = ''; s.purchases = [0, 0]; s.buys = [[], []];
      this.say('— Préparation —');
      const passed = [false, false];
      let cur = s.firstSeat, firstTurn = true;
      let guard = 0;
      while (!(passed[0] && passed[1]) && guard++ < 500) {
        if (passed[cur]) { cur = 1 - cur; continue; }
        const allowance = (s.round === 1 && firstTurn && cur === s.firstSeat) ? 2 : 1;
        firstTurn = false;
        let bought = 0;
        turn: while (true) {
          const opts = this.prepOptions(cur, bought, allowance);
          const onlyEnd = opts.every(o => o.type === 'pass' || o.type === 'end');
          let ans;
          if (onlyEnd) { if (bought === 0) this.say(`${this.name(cur)} ne peut rien acheter ni jouer : il passe.`); ans = bought > 0 ? 'end' : 'pass'; }
          else ans = await this.ask(cur, { kind: 'choice', mode: 'prep', title: 'Préparation : achetez au Forum ou utilisez une carte ⚙.', options: opts, deniers: s.players[cur].deniers, bought, allowance, default: bought > 0 ? 'end' : 'pass' });
          const o = opts.find(x => x.id === ans);
          switch (o.type) {
            case 'play': await this.playPrep(cur, o.uid); continue turn;
            case 'buy': await this.doBuy(cur, o); bought++; if (bought >= allowance) break turn; continue turn;
            case 'end': break turn;
            case 'pass': passed[cur] = true; this.say(`${this.name(cur)} annonce ne rien acheter : sa préparation est terminée.`); break turn;
          }
        }
        cur = 1 - cur;
        await this.beat(300);
      }
      // limite de main
      for (const seat of [s.firstSeat, 1 - s.firstSeat]) {
        const p = s.players[seat];
        if (p.hand.length > HAND_LIMIT) {
          const n = p.hand.length - HAND_LIMIT;
          const chosen = await this.askCards(seat, `Vous avez plus de ${HAND_LIMIT} tactiques : défaussez-en ${n}.`, p.hand, n, n, { source: 'hand' });
          for (const u of chosen) { const c = p.hand.find(x => x.uid === u); p.hand.splice(p.hand.indexOf(c), 1); s.fosse.tactics.push(c); }
          this.say(`${this.name(seat)} défausse ${n} tactique(s) (limite de main).`);
        }
      }
    }

    async doBuy(seat, o) {
      const s = this.s, p = s.players[seat], F = s.forum[o.q];
      p.deniers -= o.price;
      s.purchases[seat]++;
      if (o.from === 'slot') {
        const c = F.slots[o.i]; F.slots[o.i] = null;
        s.buys[seat].push({ uid: c.uid, def: c.def, pub: true });          // acheté face visible : l'adversaire le voit pendant toute la préparation
        if (o.q === 'tactic') { p.hand.push(c); this.say(`${this.name(seat)} achète la tactique ${this.cname(c)} (${o.price} d.).`); }
        else { p.ludus.push(c); this.say(`${this.name(seat)} achète ${this.cname(c)} (${RANKS[o.q].label}, ${o.price} d.).`); }
      } else {
        const c = this.drawReserve(o.q);
        p.ludus.push(c);
        s.buys[seat].push({ uid: c.uid, def: c.def, pub: false, q: o.q });  // pioché dans la réserve : l'adversaire ne le voit pas
        this.say(`${this.name(seat)} achète le gladiateur du dessus de la réserve ${RANKS[o.q].label} (${o.price} d.) : ${this.cname(c)}.`, seat);
        this.say(`${this.name(seat)} achète le gladiateur du dessus de la réserve ${RANKS[o.q].label} (${o.price} d.).`, 1 - seat);
      }
      await this.beat(400);
    }

    discardTactic(seat, c) {
      const p = this.s.players[seat];
      const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1);
      this.s.fosse.tactics.push(c);
    }
    sendToFosse(c) { this.s.fosse.gladiators.push(c); }

    async playPrep(seat, uid) {
      const s = this.s, p = s.players[seat];
      const card = p.hand.find(c => c.uid === uid);
      const b = baseOf(card);
      p.hand.splice(p.hand.indexOf(card), 1);   // la carte est jouée (défaussée après application)
      this.say(`${this.name(seat)} utilise ${this.cname(card)}.`);
      switch (b) {
        case 'a-la-fosse': {
          const [u] = await this.askCards(seat, 'À LA FOSSE ! : choisissez un gladiateur de votre ludus à défausser.', p.ludus, 1, 1, { source: 'ludus' });
          const g = p.ludus.find(x => x.uid === u); p.ludus.splice(p.ludus.indexOf(g), 1); this.sendToFosse(g);
          this.say(`${this.name(seat)} envoie ${this.cname(g)} à la fosse.`);
          break;
        }
        case 'clef-de-la-fosse': {
          const [u] = await this.askCards(seat, 'CLEF DE LA FOSSE : choisissez une tactique de la fosse.', s.fosse.tactics, 1, 1, { source: 'fosse' });
          const t = s.fosse.tactics.find(x => x.uid === u); s.fosse.tactics.splice(s.fosse.tactics.indexOf(t), 1); p.hand.push(t);
          this.say(`${this.name(seat)} récupère ${this.cname(t)} depuis la fosse.`);
          break;
        }
        case 'convoi': {
          const q = (await this.askChoice(seat, 'CONVOI : choisissez un Quartier à renouveler.', Q_ORDER.map(q => ({ id: q, label: QUARTIERS[q].label, ref: { q } })), { mode: 'quarter' }));
          const F = s.forum[q];
          F.slots.forEach((c, i) => { if (c) { F.depot.push(c); F.slots[i] = null; } });
          this.supplyQuarter(q, false);
          this.say(`Convoi : le Quartier ${QUARTIERS[q].label} est entièrement renouvelé.`);
          break;
        }
        case 'promotion': {
          const el = p.ludus.filter(g => defOf(g).rank === 'debutant' || defOf(g).rank === 'aguerri');
          const [u] = await this.askCards(seat, 'PROMOTION : choisissez et dévoilez un gladiateur Débutant ou Aguerri.', el, 1, 1, { source: 'ludus' });
          const g = p.ludus.find(x => x.uid === u); p.ludus.splice(p.ludus.indexOf(g), 1);
          const rk = defOf(g).rank; s.forum[rk].depot.push(g);
          const up = rk === 'debutant' ? 'aguerri' : 'legendaire';
          const n = this.drawReserve(up);
          this.say(`Promotion : ${this.name(seat)} dévoile ${this.cname(g)} (renvoyé au dépôt) et recrute un gladiateur ${RANKS[up].label}.`);
          if (n) { p.ludus.push(n); this.say(`Vous recrutez ${this.cname(n)}.`, seat); }
          break;
        }
        case 'reservation': {
          const targets = [0, 1].filter(t => s.players[t].ludus.length > 0 && this.freeGladSlots(t).length > 0);
          let t = seat;
          if (targets.length > 1) t = Number((await this.askChoice(seat, 'RÉSERVATION : désignez un laniste.', targets.map(x => ({ id: String(x), label: x === seat ? 'Moi-même' : this.name(x) })), { mode: 'seat' })));
          else t = targets[0];
          const [u] = await this.askCards(seat, `RÉSERVATION : choisissez un gladiateur du ludus de ${t === seat ? 'votre ludus' : this.name(t)}.`, s.players[t].ludus, 1, 1, { source: 'ludus', owner: t });
          const free = this.freeGladSlots(t);
          let z = free[0];
          if (free.length > 1) z = Number(await this.askChoice(seat, 'Placez-le face cachée dans un emplacement gladiateur vide.', free.map(zz => ({ id: String(zz), label: `Zone de duel ${zz + 1}`, ref: { z: zz, seat: t } })), { mode: 'slot' }));
          const g = s.players[t].ludus.find(x => x.uid === u); s.players[t].ludus.splice(s.players[t].ludus.indexOf(g), 1);
          const side = s.colisee.zones[z][t]; side.glad = g; side.gladFaceDown = true;
          this.say(`${this.name(seat)} place un gladiateur face cachée dans la zone ${z + 1}, côté ${this.name(t)}.`);
          break;
        }
        case 'transfert': {
          const [u] = await this.askCards(seat, 'TRANSFERT : choisissez un gladiateur de votre ludus, votre adversaire le recrute.', p.ludus, 1, 1, { source: 'ludus' });
          const g = p.ludus.find(x => x.uid === u); p.ludus.splice(p.ludus.indexOf(g), 1);
          s.players[1 - seat].ludus.push(g);
          this.say(`Transfert : ${this.name(seat)} donne un gladiateur à ${this.name(1 - seat)} (${this.cname(g)}).`);
          this.logs[this.logs.length - 1].text = `Transfert : ${this.name(seat)} donne un gladiateur à ${this.name(1 - seat)}.`;
          this.say(`Vous recrutez ${this.cname(g)} (offert par ${this.name(seat)}).`, 1 - seat);
          break;
        }
      }
      s.fosse.tactics.push(card);
      await this.beat(300);
    }

    // =====================================================================================
    //  3 - RÉVÉLATION
    // =====================================================================================
    async revelationAndCombat() {
      await this.revelation();
      return this.combat();
    }

    async revelation() {
      const s = this.s;
      s.phase = 'reveal'; s.step = 'draw'; s.combat = null;
      this.say('— Révélation : tirage des gladiateurs —');
      // A : tirage
      for (const seat of [0, 1]) this.shuffle(s.players[seat].ludus);
      for (const seat of [s.firstSeat, 1 - s.firstSeat]) {
        const p = s.players[seat];
        for (let z = 0; z < 3; z++) {
          const side = s.colisee.zones[z][seat];
          if (side.glad) continue;
          if (!p.ludus.length) break;
          side.glad = p.ludus.shift(); side.gladFaceDown = false;
        }
      }
      for (let z = 0; z < 3; z++) for (const seat of [0, 1]) { const side = s.colisee.zones[z][seat]; if (side.glad) { side.gladFaceDown = false; side.glad.done = false; } }
      for (const seat of [0, 1]) {
        const names = s.colisee.zones.map(zn => zn[seat].glad ? this.cname(zn[seat].glad) : '—').join(', ');
        this.say(`${this.name(seat)} envoie au Colisée : ${names}.`);
      }
      this.emit();
      await this.beat(1100);
      await this.resolveReveals('glad');
      // B : tactiques
      s.step = 'tactics';
      this.say('— Placement des tactiques —');
      await this.placeTactics();
      for (let z = 0; z < 3; z++) for (const seat of [0, 1]) { const side = s.colisee.zones[z][seat]; if (side.tactic) { side.tacticFaceDown = false; side.tactic.done = false; } }
      this.emit();
      await this.beat(900);
      s.step = 'tactic-reveal';
      const shown = s.colisee.zones.flatMap(zn => zn.map((sd, seat) => sd.tactic ? `${this.name(seat)} : ${this.cname(sd.tactic)}` : null)).filter(Boolean);
      this.say(shown.length ? `Tactiques révélées — ${shown.join(' · ')}.` : 'Aucune tactique n\'a été placée.');
      await this.resolveReveals('tactic');
    }

    tacticSlotsFree(seat) { const out = []; this.s.colisee.zones.forEach((zn, z) => { if (!zn[seat].tactic) out.push(z); }); return out; }

    async placeTactics() {
      const s = this.s;
      const passed = [false, false];
      let cur = s.firstSeat, guard = 0;
      while (!(passed[0] && passed[1]) && guard++ < 100) {
        if (passed[cur]) { cur = 1 - cur; continue; }
        const p = s.players[cur];
        const free = this.tacticSlotsFree(cur);
        if (!p.hand.length || !free.length) { passed[cur] = true; cur = 1 - cur; continue; }
        const opts = [];
        for (const c of p.hand) for (const z of free) opts.push({ id: `place:${c.uid}:${z}`, type: 'place', uid: c.uid, def: c.def, z });
        opts.push({ id: 'pass', type: 'pass', label: 'Ne plus placer de tactique' });
        const ans = await this.ask(cur, { kind: 'choice', mode: 'place', title: 'Placez une tactique face cachée dans un emplacement libre de votre côté du Colisée.', options: opts, default: 'pass' });
        const o = opts.find(x => x.id === ans);
        if (o.type === 'pass') { passed[cur] = true; this.say(`${this.name(cur)} ne place plus de tactique.`); }
        else {
          const c = p.hand.find(x => x.uid === o.uid); p.hand.splice(p.hand.indexOf(c), 1);
          const side = s.colisee.zones[o.z][cur]; side.tactic = c; side.tacticFaceDown = true;
          this.say(`${this.name(cur)} place une tactique face cachée (zone ${o.z + 1}).`);
          if (this.edictId() === 'prime-tactique' && s.round <= 3) { p.deniers += 1; this.say(`Prime tactique : ${this.name(cur)} reçoit 1 denier.`); }
          await this.beat(350);
        }
        cur = 1 - cur;
      }
    }

    // ---------- effets Révélation ----------
    gladBlockedNow(z, seat) {
      if (this.edictId() === 'puissance-brute') return true;
      const o = this.s.colisee.zones[z][1 - seat];
      return !!(o.glad && !o.gladFaceDown && baseOf(o.glad) === 'scissor');
    }
    zoneProtected(z) {
      return [0, 1].some(sd => { const t = this.s.colisee.zones[z][sd].tactic; return t && !this.s.colisee.zones[z][sd].tacticFaceDown && baseOf(t) === 'summa-rudis'; });
    }
    pendingReveals(kind) {
      const out = [[], []];
      this.s.colisee.zones.forEach((zn, z) => zn.forEach((side, seat) => {
        const c = kind === 'glad' ? side.glad : side.tactic;
        if (!c || c.done || (kind === 'glad' ? side.gladFaceDown : side.tacticFaceDown)) return;
        const b = baseOf(c);
        const has = kind === 'glad' ? ['caesarianus', 'pegma', 'sagittarius'].includes(b) : ['missio', 'complices', 'datura', 'dispense', 'repositionnement'].includes(b);
        if (has) out[seat].push({ card: c, z, seat });
      }));
      return out;
    }
    async resolveReveals(kind) {
      const s = this.s;
      let seat = s.firstSeat, guard = 0;
      while (guard++ < 60) {
        const pend = this.pendingReveals(kind);
        if (!pend[0].length && !pend[1].length) break;
        if (!pend[seat].length) seat = 1 - seat;
        const list = pend[seat];
        let item = list[0];
        if (list.length > 1) {
          const id = await this.askChoice(seat, 'Plusieurs effets ⚡ à appliquer : lequel appliquer en premier ?', list.map(it => ({ id: it.card.uid, label: `${this.cname(it.card)} (zone ${it.z + 1})`, def: it.card.def, ref: { z: it.z, seat: it.seat } })), { mode: 'order' });
          item = list.find(it => it.card.uid === id);
        }
        item.card.done = true;
        if (kind === 'glad') await this.applyGladReveal(item.seat, item.z, item.card);
        else await this.applyTacticReveal(item.seat, item.z, item.card);
        seat = 1 - seat;
        await this.beat(500);
      }
    }

    async applyGladReveal(seat, z, g) {
      const s = this.s, p = s.players[seat], b = baseOf(g);
      if (this.gladBlockedNow(z, seat)) { this.say(`L'effet de ${this.cname(g)} ne peut pas s'appliquer.`); return; }
      if (b === 'caesarianus') { p.deniers += 2; this.say(`${this.cname(g)} : ${this.name(seat)} reçoit 2 deniers.`); }
      else if (b === 'pegma' || b === 'sagittarius') {
        const side = s.colisee.zones[z][seat];
        const el = b === 'pegma' ? p.ludus.filter(c => defOf(c).rank === 'debutant' || defOf(c).rank === 'aguerri') : p.ludus.slice();
        if (!el.length) { this.say(`${this.cname(g)} : aucun gladiateur à placer en renfort.`); return; }
        const chosen = await this.askCards(seat,
          b === 'pegma' ? 'PEGMA : choisissez jusqu\'à 5 gladiateurs Débutants et/ou Aguerris à placer en renfort.' : 'SAGITTARIUS : choisissez un gladiateur à placer en renfort.',
          el, b === 'pegma' ? 0 : 1, b === 'pegma' ? Math.min(5, el.length) : 1, { source: 'ludus', reinforce: true });
        for (const u of chosen) { const c = p.ludus.find(x => x.uid === u); p.ludus.splice(p.ludus.indexOf(c), 1); side.renforts.push(c); }
        this.say(`${this.cname(g)} : ${this.name(seat)} place ${chosen.length} gladiateur(s) en renfort (zone ${z + 1}).`);
      }
    }

    async applyTacticReveal(seat, z, t) {
      const s = this.s, p = s.players[seat], b = baseOf(t);
      const side = s.colisee.zones[z][seat];
      switch (b) {
        case 'missio': {
          const opts = [0, 1].map(sd => ({ id: String(sd), label: sd === seat ? 'Mon emplacement gladiateur' : `Emplacement de ${this.name(sd)}`, ref: { z, seat: sd } }));
          const sd = Number(await this.askChoice(seat, 'MISSIO : désignez un emplacement gladiateur de cette zone. Aucun gladiateur n\'y mourra.', opts, { mode: 'slot' }));
          s.colisee.noDeath[z].push(sd);
          this.say(`Missio : l'emplacement de ${this.name(sd)} dans la zone ${z + 1} est protégé de la mort.`);
          break;
        }
        case 'complices': {
          if (p.deniers <= 0) { this.say('Complices : aucun denier à placer.'); break; }
          const n = await this.ask(seat, { kind: 'number', title: 'COMPLICES : combien de deniers placer ? (tous les 2 deniers = +1 puissance)', min: 0, max: p.deniers, default: 0 });
          p.deniers -= n; t.deniers = (t.deniers || 0) + n;
          this.say(`Complices : ${this.name(seat)} place ${n} denier(s) (zone ${z + 1}).`);
          break;
        }
        case 'datura': {
          if (this.zoneProtected(z)) { this.say('Datura : la zone est protégée par un Summa Rudis.'); break; }
          const g = side.glad && !side.gladFaceDown ? side.glad : null;
          if (!g) { this.say('Datura : aucun gladiateur dans cette zone.'); break; }
          this.say(`Datura : les effets ⚡ de ${this.cname(g)} sont réappliqués.`);
          await this.applyGladReveal(seat, z, g);
          break;
        }
        case 'dispense': {
          if (this.zoneProtected(z)) { this.say('Dispense : la zone est protégée par un Summa Rudis.'); break; }
          const g = side.glad && !side.gladFaceDown ? side.glad : null;
          if (!g || !p.ludus.length) { this.say('Dispense : rien à remplacer.'); break; }
          const n = p.ludus.shift();
          p.ludus.push(g); side.renforts.forEach(r => p.ludus.push(r)); side.renforts = [];
          side.glad = n; n.done = false;
          this.say(`Dispense : ${this.cname(g)} est remplacé par ${this.cname(n)} (zone ${z + 1}).`);
          this.emit(); await this.beat(500);
          await this.applyGladReveal(seat, z, n); n.done = true;
          break;
        }
        case 'repositionnement': {
          const opts = [0, 1, 2].map(zz => ({ id: String(zz), label: zz === z ? `Zone ${zz + 1} (celle-ci)` : `Zone ${zz + 1}`, ref: { z: zz, seat } }));
          const zz = Number(await this.askChoice(seat, 'REPOSITIONNEMENT : choisissez la zone de duel dont vous échangez vos cartes avec celle-ci.', opts, { mode: 'zone' }));
          if (zz === z) { this.say('Repositionnement : zone identique, aucun échange.'); break; }
          if (this.zoneProtected(z) || this.zoneProtected(zz)) { this.say('Repositionnement : une des zones est protégée par un Summa Rudis.'); break; }
          const zones = s.colisee.zones; const tmp = zones[z][seat]; zones[z][seat] = zones[zz][seat]; zones[zz][seat] = tmp;
          this.say(`Repositionnement : ${this.name(seat)} échange ses cartes des zones ${z + 1} et ${zz + 1}.`);
          break;
        }
      }
    }

    // =====================================================================================
    //  4 - COMBAT
    // =====================================================================================
    combatEnv() {
      const s = this.s;
      return { zones: s.colisee.zones, emperor: s.emperor, edictId: this.edictId(), noDeath: s.colisee.noDeath };
    }
    async combat() {
      const s = this.s;
      s.phase = 'combat'; s.step = 'fight';
      this.say('— Combat —');
      const res = computeCombat(this.combatEnv());
      s.combat = { res: this.packCombat(res), shown: 0, done: false };
      this.emit();
      await this.beat(800);
      for (let k = 0; k < 3; k++) {
        const d = res.duels[k];
        s.combat.shown = k + 1;
        this.narrateDuel(d);
        for (const sd of [0, 1]) if (d.gain[sd]) { s.players[sd].deniers += d.gain[sd]; this.say(`Gladiatrix : ${this.name(sd)} reçoit ${d.gain[sd]} deniers.`); }
        if (d.recruited) this.recruitFromColisee(d);
        this.emit();
        await this.beat(1300);
      }
      s.combat.done = true;
      const ed = this.edictId();
      if (res.winner === null) this.say(ed === 'soif-de-sang' ? 'Soif de sang : égalité de morts, personne ne remporte le combat.' : 'Égalité : personne ne remporte le combat.');
      else this.say(`${this.name(res.winner)} remporte le combat${ed === 'soif-de-sang' ? ` (${res.dead[res.winner]} gladiateur(s) mort(s) de son côté)` : ` (${res.won[res.winner]} duel(s) contre ${res.won[1 - res.winner]})`} !`);
      this.emit();
      await this.beat(600);
      await this.ackAll('Combat terminé.', 'Continuer');
      return res;
    }
    packCombat(res) {
      const pk = e => e ? { uid: e.card.uid, def: e.card.def, power: e.power, base: e.baseP, mods: e.mods.slice(), mult: e.mult, renf: e.renf, blocked: e.blocked } : null;
      return {
        duels: res.duels.map(d => ({ z: d.z, a: pk(d.a), b: pk(d.b), winner: d.winner, forcedTie: d.forcedTie, empty: d.empty, gain: d.gain, recruited: d.recruited })),
        won: res.won, winner: res.winner, dead: res.dead, deaths: res.deaths.map(d => ({ z: d.z, s: d.s })),
      };
    }
    narrateDuel(d) {
      const a = d.a, b = d.b, z = d.z + 1;
      if (d.empty) { this.say(`Duel ${z} : aucun gladiateur, égalité.`); return; }
      if (a && !b) { this.say(`Duel ${z} : ${this.cname(a.card)} (${a.power}) n'a pas d'adversaire et remporte le duel.`); return; }
      if (b && !a) { this.say(`Duel ${z} : ${this.cname(b.card)} (${b.power}) n'a pas d'adversaire et remporte le duel.`); return; }
      const txt = `${this.cname(a.card)} (${a.power}) contre ${this.cname(b.card)} (${b.power})`;
      if (d.winner === null) this.say(`Duel ${z} : ${txt} — ${d.forcedTie ? 'Veneficus provoque une égalité !' : 'égalité !'}`);
      else this.say(`Duel ${z} : ${txt} — ${this.name(d.winner)} gagne le duel.`);
    }
    recruitFromColisee(d) {
      const s = this.s, side = s.colisee.zones[d.z][d.recruited.from];
      const g = side.glad; if (!g) return;
      s.players[d.recruited.to].ludus.push(g);
      side.renforts.forEach(r => s.players[d.recruited.from].ludus.push(r));
      side.glad = null; side.renforts = [];
      this.say(`Laquearius : ${this.name(d.recruited.to)} recrute ${this.cname(g)} !`);
    }

    // =====================================================================================
    //  5 - RÉCOMPENSES
    // =====================================================================================
    async rewards(res) {
      const s = this.s, r = s.round;
      s.phase = 'rewards'; s.step = 'victory';
      const prime = this.edictId() === 'prime-de-victoire';
      this.say('— Récompenses —');
      for (const seat of [0, 1]) {
        const n = res.won[seat] * (prime ? 2 : 1);
        if (n) { s.players[seat].deniers += n; this.say(`${this.name(seat)} reçoit ${n} denier(s) pour ses duels remportés.`); }
      }
      if (res.winner !== null) {
        const count = prime ? 2 : 1;
        for (let i = 0; i < count; i++) await this.rewardGladiator(res.winner, REWARD_RANK[r - 1]);
      }
      s.step = 'deaths';
      await this.deathsAndDiscard(res, true);
      s.step = 'subsidies';
      for (const seat of [0, 1]) {
        const n = Math.min(SUBSIDY_CAP, s.players[seat].ludus.length);
        s.players[seat].deniers += n;
        this.say(`Subventions : ${this.name(seat)} reçoit ${n} denier(s) (${s.players[seat].ludus.length} gladiateur(s) dans son ludus).`);
      }
      s.step = 'sesterce';
      if (res.winner !== null) { s.firstSeat = res.winner; this.say(`${this.name(res.winner)} obtient le sesterce : il sera premier laniste.`); }
      else await this.coinToss(false);
      this.emit();
      await this.beat(500);
    }

    async rewardGladiator(seat, rank) {
      const s = this.s;
      const a = this.drawReserve(rank), b = this.drawReserve(rank);
      const got = [a, b].filter(Boolean);
      if (!got.length) { this.say(`La réserve ${RANKS[rank].label} est vide : pas de gladiateur récompense.`); return; }
      const chosen = await this.askCards(seat, `Récompense : piochez 2 gladiateurs ${RANKS[rank].label}, recrutez-en 1 (l'autre part au dépôt).`, got, 0, 1, { source: 'reward', rank });
      const F = s.forum[rank];
      for (const c of got) {
        if (chosen.includes(c.uid)) { s.players[seat].ludus.push(c); this.say(`${this.name(seat)} recrute ${this.cname(c)}.`, seat); }
        else F.depot.push(c);
      }
      this.say(`${this.name(seat)} ${chosen.length ? 'recrute un gladiateur' : 'ne recrute aucun gladiateur'} récompense (${RANKS[rank].label}).`, 1 - seat);
    }

    // mort, défausse des tactiques, retour des survivants dans le ludus
    async deathsAndDiscard(res, compensate) {
      const s = this.s, r = s.round;
      const gz = s.colisee.zones;
      const dying = res.deaths.filter(d => { const sd = gz[d.z][d.s]; return sd.glad && sd.glad.uid === d.card.uid; });
      // effets Mort (premier laniste d'abord)
      const order = [s.firstSeat, 1 - s.firstSeat];
      for (const seat of order) for (const d of dying.filter(x => x.s === seat)) {
        const b = baseOf(d.card);
        if (b !== 'nobile' && b !== 'munifex') continue;
        if (this.edictId() === 'puissance-brute') continue;
        const o = gz[d.z][1 - d.s]; if (o.glad && !o.gladFaceDown && baseOf(o.glad) === 'scissor') continue;
        const t = gz[d.z][d.s].tactic;
        const n = (t && !gz[d.z][d.s].tacticFaceDown && baseOf(t) === 'datura' && !this.zoneProtected(d.z)) ? 2 : 1;
        for (let k = 0; k < n; k++) {
          if (b === 'nobile') { s.players[seat].deniers += 6; this.say(`Nobile meurt : ${this.name(seat)} reçoit 6 deniers.`); }
          else {
            let got = 0;
            for (let zz = 0; zz < 3; zz++) { const sd = gz[zz][seat]; if (sd.tactic) { s.players[seat].hand.push(sd.tactic); sd.tactic = null; sd.tacticFaceDown = false; got++; } }
            if (got) this.say(`Munifex meurt : ${this.name(seat)} récupère ${got} tactique(s).`);
          }
        }
      }
      // défausse des morts + compensation
      for (const d of dying) {
        const side = gz[d.z][d.s];
        s.fosse.gladiators.push(side.glad); side.glad = null;
        side.renforts.forEach(c => s.players[d.s].ludus.push(c)); side.renforts = [];
        if (compensate && r <= 3) { s.players[d.s].deniers += COMPENSATION[r - 1]; }
      }
      if (dying.length) {
        const cnt = [0, 0]; dying.forEach(d => cnt[d.s]++);
        for (const seat of [0, 1]) if (cnt[seat]) this.say(`${cnt[seat]} gladiateur(s) de ${this.name(seat)} meurent${compensate && r <= 3 ? ` : compensation de ${cnt[seat] * COMPENSATION[r - 1]} denier(s)` : ''}.`);
      } else this.say('Aucun gladiateur ne meurt.');
      // tactiques restantes -> fosse ; deniers des Complices -> banque
      for (const zn of gz) for (const sd of zn) {
        if (sd.tactic) { sd.tactic.deniers = 0; s.fosse.tactics.push(sd.tactic); sd.tactic = null; sd.tacticFaceDown = false; }
      }
      // survivants (et renforts) retournent au ludus
      gz.forEach((zn, z) => zn.forEach((sd, seat) => {
        if (sd.glad) { s.players[seat].ludus.push(sd.glad); sd.glad = null; sd.gladFaceDown = false; }
        sd.renforts.forEach(c => s.players[seat].ludus.push(c)); sd.renforts = [];
      }));
      s.colisee.noDeath = [[], [], []];
      this.emit();
      await this.beat(900);
    }

    // =====================================================================================
    //  FIN DE PARTIE (manche 4 et combats supplémentaires)
    // =====================================================================================
    async finalCombats(res) {
      const s = this.s;
      const variant = this.cfg.variantEmperor;
      let safety = 0;
      while (!s.over && safety++ < 40) {
        if (res.winner !== null) {
          s.wins[res.winner]++;
          if (!variant || s.wins[res.winner] >= 2) { this.finish(res.winner, variant ? 'Deux combats remportés avec l\'Empereur sur la marche 4.' : 'A remporté le combat de la 4e manche.'); break; }
          this.say(`${this.name(res.winner)} a remporté ${s.wins[res.winner]} combat(s) : la variante demande 2 combats, on continue !`);
        }
        s.phase = 'rewards'; s.step = 'deaths';
        await this.deathsAndDiscard(res, false);
        const empty = [0, 1].every(i => s.players[i].ludus.length === 0);
        if (empty) {
          let w = s.firstSeat, why = 'Plus aucun gladiateur : le premier laniste l\'emporte.';
          if (variant && (s.wins[0] || s.wins[1])) { w = s.wins[0] > s.wins[1] ? 0 : s.wins[1] > s.wins[0] ? 1 : s.firstSeat; why = 'Plus aucun gladiateur : le laniste ayant remporté un combat l\'emporte.'; }
          this.finish(w, why); break;
        }
        s.extra++;
        this.say(`Combat supplémentaire n°${s.extra} : on recommence !`);
        res = await this.revelationAndCombat();
      }
      if (!s.over) this.finish(s.firstSeat, 'Trop de combats : le premier laniste l\'emporte.');
    }
    finish(seat, why) {
      const s = this.s;
      s.over = true; s.winner = seat; s.endReason = why; s.phase = 'over'; s.step = '';
      this.say(`★ ${this.name(seat)} remporte la partie ! ${why}`);
      this.emit();
    }

    // =====================================================================================
    //  Vue pour un joueur (informations cachées filtrées)
    // =====================================================================================
    viewFor(seat) {
      const s = this.s;
      const pub = c => c ? { uid: c.uid, def: c.def } : null;
      const players = [0, 1].map(i => {
        const p = s.players[i];
        return {
          name: p.name, color: p.color, deniers: p.deniers, ludusCount: p.ludus.length, handCount: p.hand.length,
          hand: i === seat ? p.hand.map(pub) : null,
          ludus: i === seat ? p.ludus.slice().sort((a, b) => rankOrder(a) - rankOrder(b) || defOf(a).name.localeCompare(defOf(b).name)).map(pub) : null,
        };
      });
      const forum = {};
      for (const q of Q_ORDER) {
        const F = s.forum[q];
        forum[q] = { reserve: F.reserve.length, depot: F.depot.length, slots: F.slots.map((c, i) => ({ card: pub(c), locked: F.unlock[i] > Math.max(1, s.round), unlock: F.unlock[i] })) };
      }
      const prices = {};
      for (const q of Q_ORDER) {
        const F = s.forum[q];
        prices[q] = { slots: F.slots.map(c => c ? this.quote(seat, q, 'slot', c) : null), reserve: q === 'tactic' ? null : this.quote(seat, q, 'reserve') };
      }
      const zones = s.colisee.zones.map(zn => zn.map((sd, sdSeat) => {
        let glad = null, tactic = null;
        if (sd.glad) glad = (sd.gladFaceDown && sdSeat !== seat) ? { hidden: true, faceDown: true } : Object.assign(pub(sd.glad), { faceDown: sd.gladFaceDown });
        if (sd.tactic) tactic = (sd.tacticFaceDown && sdSeat !== seat) ? { hidden: true, faceDown: true } : Object.assign(pub(sd.tactic), { faceDown: sd.tacticFaceDown, deniers: sd.tactic.deniers || 0 });
        return { glad, renforts: sd.renforts.map(pub), tactic };
      }));
      const e = s.edict ? EDICTS[s.edict.def] : null;
      return {
        seat, round: s.round, phase: s.phase, step: s.step, emperor: s.emperor, firstSeat: s.firstSeat, extra: s.extra,
        variant: this.cfg.variantEmperor, wins: s.wins.slice(), over: s.over, winner: s.winner, endReason: s.endReason,
        buys: [0, 1].map(i => s.buys[i].map(b => (i === seat || b.pub) ? { uid: b.uid, def: b.def, pub: b.pub } : { hidden: true, q: b.q })),
        edict: e ? { def: e.id, name: e.name, text: e.rounds[Math.max(0, Math.min(3, s.round - 1))] } : null,
        edictDeck: s.edictDeck.length,
        players, forum, prices, zones, noDeath: s.colisee.noDeath.map(a => a.slice()),
        fosse: { gladiators: s.fosse.gladiators.map(pub), tactics: s.fosse.tactics.map(pub) },
        combat: s.combat, toss: s.toss,
        prompt: s.prompts[seat], waiting: [0, 1].filter(i => s.prompts[i]),
        log: this.logs.filter(l => l.to == null || l.to === seat).slice(-160),
      };
    }
  }

  const api = { Game, computeCombat, mulberry32, baseOf, defOf };
  root.Ludus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
