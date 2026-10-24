/* LUDUS — sons synthétisés (Web Audio) : cors romains, tambours de guerre, entrechoquement d'épées, foule de l'arène, petite musique de Poké-Ludus…
   Aucun fichier audio : tout est calculé par le navigateur. */
(function (root) {
  'use strict';
  const S = {
    enabled: true, volume: 0.7, musicVolume: 0.7, ambient: true, mus: null, ctx: null, master: null, ambNodes: null,
    primed: false, lastLogN: 0, lastPid: null, lastShown: 0, overDone: false, noise: new WeakMap(),
  };
  try {
    S.enabled = localStorage.getItem('ludus.sound') !== '0';
    const mv = localStorage.getItem('ludus.mvol'); if (mv != null && mv !== '') S.musicVolume = Math.max(0, Math.min(1, Number(mv) / 100));
    const v = localStorage.getItem('ludus.vol'); if (v != null && v !== '') S.volume = Math.max(0, Math.min(1, Number(v) / 100));
    S.ambient = localStorage.getItem('ludus.amb') !== '0';
  } catch (e) { /* ignore */ }

  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- briques de base ----------
  function getNoise(c) {
    let b = S.noise.get(c);
    if (!b) {
      b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      S.noise.set(c, b);
    }
    return b;
  }
  function env(c, o, t, peak, a, d) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0.01, d));
    g.connect(o);
    return g;
  }
  function osc(c, g, type, f, t, dur, f2) {
    const s = c.createOscillator();
    s.type = type; s.frequency.setValueAtTime(f, t);
    if (f2) s.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(g); s.start(t); s.stop(t + dur + 0.05);
    return s;
  }
  function nz(c, o, t, dur, p) {
    const s = c.createBufferSource(); s.buffer = getNoise(c); s.loop = true;
    const f = c.createBiquadFilter(); f.type = p.type || 'bandpass';
    f.frequency.setValueAtTime(p.f || 1000, t);
    if (p.f2) f.frequency.exponentialRampToValueAtTime(p.f2, t + dur);
    f.Q.value = p.q || 1;
    const a = p.a || 0.003;
    const mk = (p.type || 'bandpass') === 'bandpass' ? 3 : 1;      // un filtre passe-bande étroit retire beaucoup d'énergie : on compense
    const g = env(c, o, t, (p.peak == null ? 0.3 : p.peak) * mk, a, Math.max(0.01, dur - a));
    s.connect(f); f.connect(g); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // ---------- voix : (contexte, sortie, instant, volume) ----------
  const V = {};
  // épées qui s'entrechoquent : impact métallique + résonances inharmoniques
  V.clash = (c, o, t, v = 1) => {
    nz(c, o, t, 0.09, { type: 'highpass', f: 3000, q: 0.7, peak: 0.45 * v });
    [[1480, 0.55, 0.1], [2270, 0.45, 0.09], [3150, 0.36, 0.07], [4390, 0.26, 0.05], [5870, 0.18, 0.035]].forEach(([f, d, p]) => osc(c, env(c, o, t, p * v, 0.002, d), 'sine', f * rnd(0.985, 1.015), t, d + 0.02));
    osc(c, env(c, o, t, 0.22 * v, 0.002, 0.1), 'sine', 230, t, 0.12, 110);
  };
  V.whoosh = (c, o, t, v = 1) => nz(c, o, t, 0.26, { f: 450, f2: 3000, q: 1.4, peak: 0.22 * v, a: 0.09 });
  // pièces qui tintent
  V.coin = (c, o, t, v = 1) => {
    [[0, 2637, 0.28], [0.075, 3951, 0.22]].forEach(([dt, f, d]) => {
      osc(c, env(c, o, t + dt, 0.16 * v, 0.002, d), 'sine', f, t + dt, d + 0.02);
      osc(c, env(c, o, t + dt, 0.05 * v, 0.002, d * 0.6), 'sine', f * 2.01, t + dt, d);
    });
  };
  // tambour de guerre
  V.drum = (c, o, t, v = 1, f0 = 85) => {
    osc(c, env(c, o, t, 0.7 * v, 0.004, 0.32), 'sine', f0 * 1.9, t, 0.34, f0);
    osc(c, env(c, o, t, 0.18 * v, 0.003, 0.14), 'triangle', f0 * 2.6, t, 0.16, f0 * 1.8);
    nz(c, o, t, 0.05, { f: 900, q: 1, peak: 0.25 * v });
  };
  V.thud = (c, o, t, v = 1) => {
    osc(c, env(c, o, t, 0.55 * v, 0.004, 0.22), 'sine', 95, t, 0.24, 38);
    nz(c, o, t, 0.07, { type: 'lowpass', f: 450, peak: 0.3 * v });
  };
  // cor / tuba romain (cornu) : dents de scie filtrées, léger vibrato
  V.horn = (c, o, t, v = 1, f = 130.8, dur = 0.6) => {
    if (S.theme === 'poke') {                       // thème Pokémon : sons « 8 bits » (ondes carrées)
      const g = env(c, o, t, 0.13 * v, 0.01, dur);
      const s = c.createOscillator(); s.type = 'square'; s.frequency.setValueAtTime(f * 2, t);
      s.frequency.setValueAtTime(f * 3, t + Math.min(0.08, dur / 3)); s.frequency.setValueAtTime(f * 4, t + Math.min(0.16, dur / 2));
      s.connect(g); s.start(t); s.stop(t + dur + 0.1);
      return;
    }
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.26 * v + 0.0002, t + 0.07);
    out.gain.setValueAtTime(0.26 * v + 0.0002, t + Math.max(0.08, dur - 0.1));
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.exponentialRampToValueAtTime(1900, t + 0.1);
    lp.frequency.exponentialRampToValueAtTime(1100, t + Math.max(0.2, dur));
    lp.connect(out); out.connect(o);
    const lfo = c.createOscillator(); lfo.frequency.value = 5.2;
    const lg = c.createGain(); lg.gain.value = f * 0.006; lfo.connect(lg);
    [1, 1.004, 0.5].forEach((m, i) => {
      const s = c.createOscillator(); s.type = i === 2 ? 'square' : 'sawtooth'; s.frequency.value = f * m;
      lg.connect(s.frequency);
      const gg = c.createGain(); gg.gain.value = i === 2 ? 0.22 : 0.55;
      s.connect(gg); gg.connect(lp); s.start(t); s.stop(t + dur + 0.2);
    });
    lfo.start(t); lfo.stop(t + dur + 0.2);
  };
  // la foule : bruit filtré qui gonfle et retombe
  V.crowd = (c, o, t, v = 1, dur = 1.8) => {
    nz(c, o, t, dur, { f: 650, q: 0.6, peak: 0.2 * v, a: 0.5 });
    nz(c, o, t + 0.05, dur, { f: 1500, q: 0.8, peak: 0.1 * v, a: 0.45 });
    nz(c, o, t, dur * 0.8, { type: 'lowpass', f: 2600, peak: 0.06 * v, a: 0.4 });
  };
  V.gong = (c, o, t, v = 1) => {
    [[110, 2.4, 0.2], [164.8, 2.0, 0.14], [247, 1.6, 0.1], [331, 1.2, 0.07], [441, 0.9, 0.05]].forEach(([f, d, p]) => osc(c, env(c, o, t, p * v, 0.01, d), 'sine', f * rnd(0.995, 1.005), t, d + 0.05));
    nz(c, o, t, 0.12, { type: 'lowpass', f: 1800, peak: 0.2 * v });
  };
  V.card = (c, o, t, v = 1) => {
    nz(c, o, t, 0.06, { f: 1700, q: 0.9, peak: 0.22 * v, a: 0.004 });
    nz(c, o, t + 0.045, 0.05, { f: 2400, q: 1, peak: 0.14 * v, a: 0.003 });
  };
  V.blip = (c, o, t, v = 1) => { [[0, 740], [0.09, 988]].forEach(([dt, f]) => osc(c, env(c, o, t + dt, 0.12 * v, 0.003, 0.16), 'triangle', f, t + dt, 0.18)); };
  V.tick = (c, o, t, v = 1) => osc(c, env(c, o, t, 0.05 * v, 0.001, 0.03), 'sine', 1300, t, 0.04);
  V.swish = (c, o, t, v = 1) => {
    nz(c, o, t, 0.32, { type: 'highpass', f: 900, f2: 4500, q: 0.8, peak: 0.14 * v, a: 0.12 });
    osc(c, env(c, o, t, 0.07 * v, 0.1, 0.25), 'sine', 520, t, 0.4, 1250);
  };
  V.shuffle = (c, o, t, v = 1) => { for (let i = 0; i < 6; i++) V.card(c, o, t + i * 0.045, 0.6 * v); };
  V.ding = (c, o, t, v = 1) => V.horn(c, o, t, 0.5 * v, 329.6, 0.16);
  V.entrance = (c, o, t, v = 1) => { [0, 0.22, 0.44].forEach((dt, i) => V.drum(c, o, t + dt, (0.55 + i * 0.15) * v, 80 - i * 5)); };
  V.reveal = (c, o, t, v = 1) => { V.whoosh(c, o, t, 0.7 * v); V.card(c, o, t + 0.12, v); V.card(c, o, t + 0.2, v); };
  V.death = (c, o, t, v = 1) => { V.drum(c, o, t, 0.9 * v, 60); V.thud(c, o, t + 0.02, 0.8 * v); };
  V.cheer = (c, o, t, v = 1) => V.crowd(c, o, t, v, 1.9);
  V.edict = (c, o, t, v = 1) => { V.gong(c, o, t, 0.8 * v); V.horn(c, o, t + 0.15, 0.7 * v, 196, 0.5); V.horn(c, o, t + 0.7, 0.7 * v, 261.6, 0.7); };
  V.manche = (c, o, t, v = 1) => { V.drum(c, o, t, 0.5 * v, 70); V.horn(c, o, t, v, 130.8, 0.28); V.horn(c, o, t + 0.32, v, 196, 0.28); V.horn(c, o, t + 0.64, v, 261.6, 0.8); };
  V.prep = (c, o, t, v = 1) => V.gong(c, o, t, 0.45 * v);
  V.drumroll = (c, o, t, v = 1) => {
    let tt = t, gap = 0.13, amp = 0.3;
    for (let i = 0; i < 9; i++) { V.drum(c, o, tt, amp * v, i % 2 ? 78 : 92); tt += gap; gap = Math.max(0.045, gap * 0.82); amp = Math.min(0.75, amp + 0.05); }
    V.drum(c, o, tt + 0.03, 1.0 * v, 70);
    nz(c, o, tt + 0.03, 0.9, { type: 'highpass', f: 5500, q: 0.5, peak: 0.12 * v, a: 0.01 });
    V.horn(c, o, tt + 0.03, 0.8 * v, 130.8, 0.5);
  };
  // un duel : coup d'épée, puis foule (victoire), choc sourd (défaite) ou bouclier (égalité). res : 'win' | 'lose' | 'tie'
  V.duel = (c, o, t, v = 1, res) => {
    V.whoosh(c, o, t, v);
    V.clash(c, o, t + 0.14, v);
    if (res === 'win') V.crowd(c, o, t + 0.3, 0.75 * v, 1.5);
    else if (res === 'lose') { V.thud(c, o, t + 0.3, 0.8 * v); V.crowd(c, o, t + 0.32, 0.3 * v, 1.1); }
    else { V.clash(c, o, t + 0.34, 0.5 * v); V.thud(c, o, t + 0.34, 0.4 * v); }
  };
  V.win = (c, o, t, v = 1) => {
    let tt = t;
    [[130.8, 0.2], [196, 0.2], [261.6, 0.2], [329.6, 0.2], [392, 0.2]].forEach(([f, d]) => { V.horn(c, o, tt, v, f, d); tt += d + 0.05; });
    [261.6, 329.6, 392, 523.3].forEach(f => V.horn(c, o, tt, 0.8 * v, f, 1.3));
    V.drum(c, o, tt, 0.9 * v, 75); V.crowd(c, o, tt, v, 2.8); V.gong(c, o, tt, 0.6 * v);
  };
  V.lose = (c, o, t, v = 1) => {
    V.horn(c, o, t, 0.8 * v, 164.8, 0.45); V.horn(c, o, t + 0.55, 0.8 * v, 155.6, 0.45); V.horn(c, o, t + 1.1, 0.8 * v, 130.8, 1.2);
    V.drum(c, o, t + 1.1, 0.9 * v, 55); V.thud(c, o, t + 1.1, 0.8 * v);
  };

  // ---------- contexte audio ----------
  function ensure() {
    if (S.ctx) return S.ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      const c = new AC();
      const master = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.25;
      master.connect(comp); comp.connect(c.destination);
      const mus = c.createGain(); mus.connect(comp); S.mus = mus;      // la musique a son propre volume, indépendant des bruitages
      S.ctx = c; S.master = master; applyVolume();
    } catch (e) { S.ctx = null; }
    return S.ctx;
  }
  function applyVolume() { if (S.master) S.master.gain.value = S.enabled ? 0.9 * S.volume : 0; if (S.mus) S.mus.gain.value = S.enabled && S.ambient ? 0.9 * S.musicVolume : 0; if (S.ambNodes) S.ambNodes.gain.gain.value = S.enabled && S.ambient ? 1 : 0; }
  function play(name, delay, vol) {
    if (!S.enabled || !V[name]) return;
    const c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    try { V[name](c, S.master, c.currentTime + 0.02 + (delay || 0), vol == null ? 1 : vol, undefined); } catch (e) { console.warn('son', name, e); }
  }
  function playDuel(res, delay) {
    if (!S.enabled) return; const c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    try { V.duel(c, S.master, c.currentTime + 0.02 + (delay || 0), 1, res); } catch (e) { console.warn('son duel', e); }
  }

  // ---------- ambiance de l'arène (foule lointaine, très discrète) ----------
  function startAmbient() {
    if (S.ambNodes || !S.enabled || !S.ambient) return;
    const c = ensure(); if (!c || !root.LudusAmbience) return;
    const gain = c.createGain(); gain.gain.value = 1; gain.connect(S.mus || S.master);
    const kind = root.LudusTheme && root.LudusTheme.active ? 'poke' : 'arena';       // Poké-Ludus : petite musique ; LUDUS : foule de l'arène
    let inst = null;
    try { inst = root.LudusAmbience.start(c, gain, kind); } catch (e) { console.warn('ambiance', e); }
    S.ambNodes = { gain, inst, kind };
  }
  function stopAmbient() {
    const a = S.ambNodes; if (!a) return;
    try { if (a.inst) a.inst.stop(); } catch (e) { /* ignore */ }
    setTimeout(() => { try { a.gain.disconnect(); } catch (e) { /* ignore */ } }, 900);
    S.ambNodes = null;
  }

  // ---------- réactions à la partie ----------
  const LOG_RULES = [
    [/^══ Manche/, 'manche'], [/^— Combat —/, 'drumroll'], [/^— Révélation/, 'entrance'], [/^— Préparation —/, 'prep'],
    [/^— Placement des tactiques/, 'tick'], [/^Édit de l'Empereur/, 'edict'], [/^Duel \d/, null], [/^★/, null],
    [/achète la tactique/, 'coinCard'], [/achète/, 'coin'], [/place une tactique face cachée/, 'card'], [/^Tactiques révélées/, 'reveal'],
    [/ utilise /, 'swish'], [/meurent|meurt/, 'death'], [/remporte le combat/, 'cheer'], [/recrute|Recrute/, 'ding'],
    [/reçoit .*denier|Subventions|compensation|Gladiatrix/, 'coin'], [/défausse|à la fosse|Réquisition|Vente forcée/, 'thud'],
    [/mélangé|ravitaillé/, 'shuffle'], [/renfort|Datura|Dispense|Repositionnement|Missio|Complices|Laquearius|Veneficus/, 'swish'],
  ];
  function reset() { S.primed = false; S.lastLogN = 0; S.lastPid = null; S.lastShown = 0; S.overDone = false; }
  function onView(v) {
    if (!v) return;
    const last = v.log && v.log.length ? v.log[v.log.length - 1].n : 0;
    if (!S.primed) { S.primed = true; S.lastLogN = last; S.lastPid = v.prompt ? v.prompt.id : null; S.lastShown = v.combat ? v.combat.shown : 0; S.overDone = !!v.over; return; }
    if (!S.enabled) { S.lastLogN = last; S.lastShown = v.combat ? v.combat.shown : 0; S.lastPid = v.prompt ? v.prompt.id : null; return; }
    let d = 0;
    // 1. nouvelles lignes du journal
    const fresh = (v.log || []).filter(l => l.n > S.lastLogN);
    S.lastLogN = last;
    let count = 0;
    for (const l of fresh) {
      for (const [re, snd] of LOG_RULES) {
        if (!re.test(l.text)) continue;
        if (snd && count < 6) {
          if (snd === 'coinCard') { play('coin', d); play('card', d + 0.12, 0.8); } else play(snd, d);
          d += snd === 'drumroll' || snd === 'manche' || snd === 'edict' ? 0.5 : 0.17; count++;
        }
        break;
      }
    }
    // 2. duels révélés un par un
    const shown = v.combat ? v.combat.shown : 0;
    if (shown > S.lastShown && v.combat && v.combat.res) {
      for (let k = S.lastShown; k < shown; k++) {
        const du = v.combat.res.duels[k]; if (!du || du.empty) continue;
        const res = du.winner === null ? 'tie' : (du.winner === v.seat ? 'win' : 'lose');
        playDuel(res, Math.max(d, 0));
      }
    }
    S.lastShown = shown;
    // 3. à nous de jouer
    const pid = v.prompt ? v.prompt.id : null;
    if (pid != null && pid !== S.lastPid && v.prompt.kind !== 'ack') play('blip', 0.1, 0.8);
    S.lastPid = pid;
    // 4. fin de partie
    if (v.over && !S.overDone) { S.overDone = true; play(v.winner === v.seat || (root.LudusUI && root.LudusUI.UI.session && root.LudusUI.UI.session.mode === 'hotseat') ? 'win' : 'lose', 0.6); }
    if (!v.over) S.overDone = false;
  }

  // ---------- réglages ----------
  function save() { try { localStorage.setItem('ludus.sound', S.enabled ? '1' : '0'); localStorage.setItem('ludus.vol', String(Math.round(S.volume * 100))); localStorage.setItem('ludus.mvol', String(Math.round(S.musicVolume * 100))); localStorage.setItem('ludus.amb', S.ambient ? '1' : '0'); } catch (e) { /* ignore */ } }
  function setEnabled(on) { S.enabled = !!on; save(); applyVolume(); if (on) { ensure(); startAmbient(); } else stopAmbient(); }
  function setVolume(x) { S.volume = Math.max(0, Math.min(1, x)); save(); applyVolume(); }
  function setMusicVolume(x) { S.musicVolume = Math.max(0, Math.min(1, x)); save(); applyVolume(); }
  function setAmbient(on) { S.ambient = !!on; save(); applyVolume(); if (on) startAmbient(); else stopAmbient(); }
  // le navigateur n'autorise le son qu'après un premier clic
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
  if (typeof document !== 'undefined') ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));

  // rendu hors ligne d'une voix (tests)
  function renderOffline(name, seconds) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const c = new OAC(1, Math.ceil(44100 * seconds), 44100);
    const g = c.createGain(); g.connect(c.destination);
    if (name === 'duel') V.duel(c, g, 0.01, 1, 'win'); else V[name](c, g, 0.01, 1);
    return c.startRendering().then(b => b.getChannelData(0));
  }

  root.LudusSfx = { S, V, play, playDuel, onView, reset, startAmbient, stopAmbient, setEnabled, setVolume, setMusicVolume, setAmbient, renderOffline, unlock, names: Object.keys(V) };
})(typeof window !== 'undefined' ? window : globalThis);
