/* LUDUS — ambiances sonores de fond, entièrement synthétisées (Web Audio, aucun fichier audio).
   • 'arena' (LUDUS) : une vraie foule — une dizaine de « bavards » (voix synthétiques à formants : voyelles, syllabes, intonations de phrases),
     une salle qui résonne, et des réactions de temps en temps (« oooh », applaudissements, acclamations).
   • 'poke' (Poké-Ludus) : une petite musique d'aventure façon console 8 bits (ondes carrées, basse triangle, batterie), composée pour le jeu. */
(function (root) {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function noiseBuf(c, seconds) {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // =====================================================================================================================
  //  FOULE
  // =====================================================================================================================
  // voyelles : formants F1, F2, F3 (Hz) — voix d'homme ; les voix de femme sont décalées vers le haut
  const VOWELS = { a: [780, 1200, 2500], e: [430, 2000, 2650], i: [300, 2300, 3000], o: [500, 900, 2400], u: [350, 800, 2300], an: [650, 1050, 2450], eu: [450, 1450, 2400] };
  const VOW_LIST = Object.keys(VOWELS);

  function makeSpeaker(c, bus, noise, o) {
    o = o || {};
    const female = o.female != null ? o.female : Math.random() < 0.38;
    const sp = { female, f0: o.f0 || (female ? rnd(175, 255) : rnd(95, 150)), t: c.currentTime + rnd(0, 2.5), loud: o.loud || rnd(0.35, 1), scale: female ? rnd(1.12, 1.2) : rnd(0.95, 1.05), nodes: [] };
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = sp.f0;
    const vib = c.createOscillator(); vib.frequency.value = rnd(4.5, 6); const vg = c.createGain(); vg.gain.value = sp.f0 * 0.012; vib.connect(vg); vg.connect(osc.frequency);
    const env = c.createGain(); env.gain.value = 0.0001;
    sp.bp = [0, 1, 2].map(i => {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [7, 9, 11][i]; f.frequency.value = VOWELS.a[i];
      const g = c.createGain(); g.gain.value = [1, 0.7, 0.4][i] * [1.1, 1.3, 1.6][i];
      osc.connect(f); f.connect(g); g.connect(env); return f;
    });
    // consonnes (souffle bref)
    const ns = c.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = rnd(2800, 5200); nf.Q.value = 1.2;
    const ng = c.createGain(); ng.gain.value = 0; ns.connect(nf); nf.connect(ng); ng.connect(env);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rnd(1700, 3400); lp.Q.value = 0.5;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null; if (pan) pan.pan.value = rnd(-0.85, 0.85);
    env.connect(lp); if (pan) { lp.connect(pan); pan.connect(bus); } else lp.connect(bus);
    osc.start(); vib.start(); ns.start(0, Math.random() * 1.5);
    sp.osc = osc; sp.env = env; sp.ng = ng;
    sp.nodes = [osc, vib, ns];
    sp.stop = () => { try { osc.stop(); vib.stop(); ns.stop(); } catch (e) { /* ignore */ } };
    return sp;
  }
  // une phrase : quelques syllabes avec une intonation descendante
  function phrase(sp, t, strength) {
    const n = 3 + Math.floor(Math.random() * 5);
    let f = sp.f0 * rnd(1.0, 1.22), vow = pick(VOW_LIST);
    const peak = 0.12 * sp.loud * (strength || 1);
    for (let i = 0; i < n; i++) {
      const dur = rnd(0.11, 0.21), v = Math.random() < 0.35 ? vow : pick(VOW_LIST); vow = v;
      const F = VOWELS[v];
      sp.osc.frequency.setTargetAtTime(f, t, 0.03);
      sp.bp.forEach((b, k) => b.frequency.setTargetAtTime(F[k] * sp.scale * rnd(0.97, 1.03), t, 0.02));
      sp.env.gain.setTargetAtTime(peak * rnd(0.6, 1), t, 0.014);
      sp.env.gain.setTargetAtTime(0.0001, t + dur * 0.72, 0.03);
      if (Math.random() < 0.5) { sp.ng.gain.setValueAtTime(peak * 1.4, t); sp.ng.gain.setTargetAtTime(0, t + 0.012, 0.012); }
      t += dur + rnd(0.02, 0.075);
      f *= rnd(0.93, 1.04) * (i > n - 3 ? 0.93 : 1);
    }
    return t;
  }

  function crowd(c, out) {
    const bus = c.createGain(); bus.gain.value = 1;
    // salle : écho diffus
    const conv = c.createConvolver(), len = Math.floor(c.sampleRate * 1.8), imp = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    conv.buffer = imp;
    const wet = c.createGain(); wet.gain.value = 0.55; const dry = c.createGain(); dry.gain.value = 0.9;
    bus.connect(dry); dry.connect(out); bus.connect(conv); conv.connect(wet); wet.connect(out);
    const noise = noiseBuf(c, 3);
    // un fond très léger (jamais de « vague » : pas de modulation lente)
    const bed = c.createBufferSource(); bed.buffer = noise; bed.loop = true;
    const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 900; bf.Q.value = 0.35; const bg = c.createGain(); bg.gain.value = 0.004;
    bed.connect(bf); bf.connect(bg); bg.connect(bus); bed.start(0, 0.4);
    const speakers = []; for (let i = 0; i < 11; i++) speakers.push(makeSpeaker(c, bus, noise));
    const alive = { v: true }, timers = [];
    const tick = () => {
      if (!alive.v || c.state !== 'running') return;
      const now = c.currentTime;
      for (const sp of speakers) { let guard = 0; while (sp.t < now + 1.2 && guard++ < 4) { const end = phrase(sp, Math.max(sp.t, now + 0.05), 1); sp.t = end + rnd(0.5, 3.4); } }
    };
    const iv = setInterval(tick, 350); tick();

    // réactions de la foule
    function burst(kind) {
      const t0 = c.currentTime + 0.1, tmp = [];
      if (kind === 'applause') {
        const ns = c.createBufferSource(); ns.buffer = noise; ns.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3300; f.Q.value = 0.9;
        const g = c.createGain(); g.gain.value = 0; ns.connect(f); f.connect(g); g.connect(bus); ns.start(t0, Math.random());
        const dur = rnd(1.8, 3.2);
        for (let i = 0; i < 120; i++) { const u = Math.random(), t = t0 + dur * (u * u * (3 - 2 * u)); g.gain.setValueAtTime(rnd(0.03, 0.1), t); g.gain.setTargetAtTime(0, t + 0.003, 0.007); }
        ns.stop(t0 + dur + 0.5); return;
      }
      const n = kind === 'cheer' ? 12 : 9;
      for (let i = 0; i < n; i++) tmp.push(makeSpeaker(c, bus, noise, { loud: rnd(0.8, 1.2), f0: (Math.random() < 0.4 ? rnd(190, 260) : rnd(105, 165)) * (kind === 'cheer' ? 1.15 : 1) }));
      const dur = kind === 'cheer' ? rnd(1.3, 1.9) : rnd(1.5, 2.2);
      tmp.forEach(sp => {
        const t = t0 + rnd(0, 0.35), F = kind === 'cheer' ? VOWELS.a : VOWELS.o, F2 = kind === 'cheer' ? VOWELS.e : VOWELS.an;
        sp.bp.forEach((b, k) => { b.frequency.setValueAtTime(F[k] * sp.scale, t); b.frequency.linearRampToValueAtTime(F2[k] * sp.scale, t + dur); });
        sp.osc.frequency.setValueAtTime(sp.f0, t); sp.osc.frequency.linearRampToValueAtTime(sp.f0 * (kind === 'cheer' ? 1.25 : 1.12), t + dur * 0.7);
        sp.env.gain.setValueAtTime(0.0001, t); sp.env.gain.linearRampToValueAtTime(0.11 * sp.loud, t + dur * 0.35); sp.env.gain.setTargetAtTime(0.0001, t + dur * 0.55, dur * 0.22);
        sp.ng.gain.setValueAtTime(0, t); sp.ng.gain.linearRampToValueAtTime(0.05, t + dur * 0.35); sp.ng.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.2);
        setTimeout(() => sp.stop(), (dur + 2) * 1000);
      });
    }
    function nextEvent() {
      if (!alive.v) return;
      if (c.state === 'running') { const r = Math.random(); burst(r < 0.5 ? 'ooh' : r < 0.78 ? 'applause' : 'cheer'); }
      timers.push(setTimeout(nextEvent, rnd(11000, 24000)));
    }
    timers.push(setTimeout(nextEvent, rnd(5000, 9000)));
    return {
      gain: bus, burst,
      prime(sec) { for (const sp of speakers) { let g = 0; while (sp.t < sec && g++ < 200) { const end = phrase(sp, Math.max(sp.t, 0.05), 1); sp.t = end + rnd(0.5, 3.4); } } },      // (tests hors ligne)
      stop() { alive.v = false; clearInterval(iv); timers.forEach(clearTimeout); speakers.forEach(s => s.stop()); try { bed.stop(); } catch (e) { /* ignore */ } try { bus.disconnect(); } catch (e) { /* ignore */ } },
    };
  }

  // =====================================================================================================================
  //  MUSIQUE « AVENTURE » (Poké-Ludus) — composition originale, 138 BPM, do majeur, boucle de 16 mesures
  // =====================================================================================================================
  const _ = null;
  // mélodie : 8 croches par mesure (notes MIDI ; null = on tient / silence)
  const MELODY = [
    [76, _, 79, _, 76, 74, 72, _], [74, _, 79, _, 71, _, 74, _], [72, _, 76, _, 81, _, 79, 76], [77, _, 76, _, 74, _, 72, _],
    [76, 79, 84, _, 83, 79, 76, _], [74, _, 79, _, 81, 83, 79, _], [81, _, 79, 77, 76, _, 74, _], [79, _, _, _, 74, _, 71, _],
    [69, 72, 76, _, 81, _, 76, _], [77, _, 81, _, 84, _, 81, 77], [79, _, 76, _, 79, _, 84, _], [83, _, 79, _, 74, _, 79, _],
    [76, _, 81, _, 84, _, 83, 81], [81, _, 77, _, 81, _, 84, _], [86, _, 83, _, 79, _, 74, _], [84, _, _, _, 79, _, 76, 79],
  ];
  // accords (fondamentale, tierce, quinte) par mesure
  const CH = { C: [60, 64, 67], G: [55, 59, 62], Am: [57, 60, 64], F: [53, 57, 60] };
  const PROG = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'C'];
  const BASS_ROOT = { C: 36, G: 31, Am: 33, F: 29 };

  function pulseWave(c, duty) {
    const N = 32, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) { const a = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty); re[n] = a * Math.cos(n * Math.PI * duty); im[n] = a * Math.sin(n * Math.PI * duty); }
    return c.createPeriodicWave(re, im);
  }

  function music(c, out) {
    const bus = c.createGain(); bus.gain.value = 0.27;
    const lead = c.createGain(); lead.gain.value = 1; lead.connect(bus);
    // petit écho sur la mélodie
    const dl = c.createDelay(1); dl.delayTime.value = 60 / 138 * 0.75; const fb = c.createGain(); fb.gain.value = 0.28; const dw = c.createGain(); dw.gain.value = 0.22;
    lead.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(dw); dw.connect(bus);
    bus.connect(out);
    const W25 = pulseWave(c, 0.25), W125 = pulseWave(c, 0.125), W50 = pulseWave(c, 0.5), noise = noiseBuf(c, 1);
    const EIGHTH = 60 / 138 / 2, BAR = EIGHTH * 8, LOOP = BAR * 16;
    function note(wave, type, f, t, dur, vol, dest, slideTo) {
      const o = c.createOscillator(); if (wave) o.setPeriodicWave(wave); else o.type = type;
      o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.01, dur - 0.04)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    }
    function hat(t, vol) { const s = c.createBufferSource(); s.buffer = noise; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + 0.06); }
    function snare(t) { const s = c.createBufferSource(); s.buffer = noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8; const g = c.createGain(); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + 0.13); note(null, 'triangle', 190, t, 0.08, 0.05, bus, 120); }
    function kick(t) { note(null, 'sine', 150, t, 0.13, 0.12, bus, 45); }
    function bar(i, t0) {
      const chord = PROG[i % 16], tri = CH[chord], root = BASS_ROOT[chord], mel = MELODY[i % 16];
      for (let k = 0; k < 8; k++) {
        const t = t0 + k * EIGHTH;
        // mélodie : une note dure jusqu'à la suivante
        if (mel[k] != null) { let len = 1; while (k + len < 8 && mel[k + len] == null) len++; note(W25, null, mtof(mel[k]), t, len * EIGHTH * 0.94, 0.12, lead); }
        // arpège d'accompagnement
        note(W125, null, mtof(tri[[0, 1, 2, 1, 0, 1, 2, 1][k]] + 12), t, EIGHTH * 0.8, 0.045, bus);
        // basse « sautillante » en octaves
        note(null, 'triangle', mtof(root + (k % 2 ? 12 : 0)) , t, EIGHTH * 0.9, 0.085, bus);
        // batterie
        if (k % 4 === 0) kick(t); if (k % 4 === 2) snare(t); hat(t + 0, k % 2 ? 0.035 : 0.02);
      }
    }
    // planification « en avance » : toutes les 120 ms on programme les mesures des 0,6 prochaines secondes
    let nextBar = 0, nextT = c.currentTime + 0.15;
    const alive = { v: true };
    const tick = () => {
      if (!alive.v || c.state !== 'running') { if (c.state !== 'running') nextT = Math.max(nextT, c.currentTime + 0.15); return; }
      while (nextT < c.currentTime + 0.8) { bar(nextBar, nextT); nextBar = (nextBar + 1) % 16; nextT += BAR; }
    };
    const iv = setInterval(tick, 120); tick();
    return { gain: bus, loop: LOOP, prime(sec) { while (nextT < sec) { bar(nextBar, nextT); nextBar = (nextBar + 1) % 16; nextT += BAR; } }, stop() { alive.v = false; clearInterval(iv); const t = c.currentTime; try { bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(0.0001, t, 0.08); } catch (e) { /* ignore */ } setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 700); } };
  }

  function start(c, out, kind) { return kind === 'poke' ? music(c, out) : crowd(c, out); }
  root.LudusAmbience = { start, VOWELS, MELODY, PROG };
})(typeof window !== 'undefined' ? window : globalThis);
