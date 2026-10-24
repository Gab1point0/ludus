/* LUDUS — ambiances sonores de fond.
   • LUDUS : une musique épique de gladiateurs (morceau créé avec Gemini, assets/audio/gladiateurs.mp3, lu en boucle avec fondu enchaîné) ;
     si le fichier est introuvable, une version synthétisée équivalente prend le relais (cordes, cuivres, tambours de guerre, lyre).
   • Poké-Ludus : une petite musique d aventure façon console 8 bits, synthétisée par le navigateur (composition originale). */
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
  //  MUSIQUE « GLADIATEUR » (LUDUS) — composition originale, ré mineur, 84 BPM, boucle de 16 mesures :
  //  cordes graves, violoncelles, cuivres héroïques, tambours de guerre, lyre qui égrène des arpèges dans la seconde moitié
  // =====================================================================================================================
  const CHORDS = {
    Dm: { root: 38, pad: [57, 62, 65], arp: [62, 65, 69, 74] },
    Bb: { root: 34, pad: [53, 58, 62], arp: [58, 62, 65, 70] },
    Gm: { root: 43 - 12, pad: [55, 58, 62], arp: [55, 58, 62, 67] },
    A: { root: 33, pad: [57, 61, 64], arp: [57, 61, 64, 69] },
    F: { root: 29, pad: [53, 57, 60], arp: [57, 60, 65, 69] },
    C: { root: 36, pad: [55, 60, 64], arp: [55, 60, 64, 67] },
  };
  const EPROG = ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'F', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'F', 'C', 'A'];
  // thème des cuivres : [temps, note MIDI, durée en temps] ; 8 mesures, rejouées une octave plus haut dans la seconde moitié
  const THEME = [
    [[0, 69, 2], [2, 74, 1.5], [3.5, 72, 0.5]], [[0, 70, 2], [2, 74, 2]], [[0, 70, 1.5], [1.5, 69, 0.5], [2, 67, 2]], [[0, 69, 1], [1, 73, 1], [2, 76, 2]],
    [[0, 77, 2], [2, 76, 1], [3, 74, 1]], [[0, 72, 1.5], [1.5, 74, 0.5], [2, 77, 2]], [[0, 76, 2], [2, 72, 1], [3, 67, 1]], [[0, 76, 1.5], [1.5, 73, 0.5], [2, 69, 2]],
  ];

  function epic(c, out) {
    const BEAT = 60 / 84, BAR = BEAT * 4;
    const bus = c.createGain(); bus.gain.value = 0.62; bus.connect(out);
    // salle de pierre : réverbération
    const conv = c.createConvolver(), len = Math.floor(c.sampleRate * 2.4), imp = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2); }
    conv.buffer = imp; const wet = c.createGain(); wet.gain.value = 0.42; conv.connect(wet); wet.connect(bus);
    const dry = c.createGain(); dry.gain.value = 0.85; dry.connect(bus);
    const hall = c.createGain(); hall.gain.value = 1; hall.connect(dry); hall.connect(conv);
    const noise = noiseBuf(c, 1.5);

    function saws(f, t, dur, vol, dest, o) {
      o = o || {};
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q || 1.2;
      lp.frequency.setValueAtTime(o.f0 || 700, t);
      if (o.f1) { lp.frequency.exponentialRampToValueAtTime(o.f1, t + (o.rise || 0.1)); lp.frequency.exponentialRampToValueAtTime(o.f2 || o.f1 * 0.6, t + dur); }
      const g = c.createGain(), a = o.attack || 0.05, r = o.release || 0.12;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a + 0.01, dur - r)); g.gain.linearRampToValueAtTime(0.0001, t + dur + r * 0.5);
      (o.detune || [-7, 7]).forEach(dt => { const s = c.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = dt; s.connect(lp); s.start(t); s.stop(t + dur + r); });
      lp.connect(g); g.connect(dest);
    }
    const brass = (m, t, dur, vol) => saws(mtof(m), t, dur, vol, hall, { f0: 420, f1: 2600, f2: 1100, rise: 0.11, attack: 0.045, release: 0.14, q: 2 });
    const strings = (m, t, dur, vol) => saws(mtof(m), t, dur, vol, hall, { f0: 900, attack: 0.5, release: 0.6, detune: [-10, 0, 10], q: 0.6 });
    const cello = (m, t, dur, vol) => saws(mtof(m), t, dur, vol, dry, { f0: 380, f1: 520, f2: 360, rise: 0.2, attack: 0.08, release: 0.2, detune: [-4, 4], q: 0.9 });
    function lyre(m, t, vol) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(m) * 2;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      const g2 = c.createGain(); g2.gain.value = 0.25; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(hall); o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
    }
    function taiko(t, vol) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.28);
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); o.connect(g); g.connect(hall); o.start(t); o.stop(t + 0.6);
      const s = c.createBufferSource(); s.buffer = noise; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const ng = c.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      s.connect(f); f.connect(ng); ng.connect(hall); s.start(t, Math.random()); s.stop(t + 0.12);
    }
    function bar(i, t0) {
      const name = EPROG[i % 16], ch = CHORDS[name], second = (i % 16) >= 8;
      // cordes tenues + violoncelle
      ch.pad.forEach(m => strings(m, t0, BAR * 0.98, second ? 0.016 : 0.012));
      cello(ch.root + 12, t0, BEAT * 2, 0.07); cello(ch.root + 12, t0 + BEAT * 2, BEAT * 2, 0.06);
      cello(ch.root, t0, BAR, 0.055);
      // thème aux cuivres (seconde moitié : une octave plus haut, plus fort)
      THEME[i % 8].forEach(([b, m, l]) => brass(m + (second ? 12 : 0), t0 + b * BEAT, l * BEAT * 0.96, second ? 0.05 : 0.042));
      // tambours de guerre : coup profond au 1, plus léger au 3, roulement avant les mesures 4 et 8
      taiko(t0, 0.34); taiko(t0 + BEAT * 2, 0.2);
      if (i % 4 === 3) { taiko(t0 + BEAT * 3, 0.12); taiko(t0 + BEAT * 3.33, 0.16); taiko(t0 + BEAT * 3.67, 0.22); } else taiko(t0 + BEAT * 3.5, 0.08);
      // lyre dans la seconde moitié
      if (second) ch.arp.forEach((m, k) => { lyre(m + 12, t0 + BEAT * (0.5 * k), 0.034); lyre(m + 12, t0 + BEAT * (2 + 0.5 * k), 0.03); });
    }
    let nextBar = 0, nextT = c.currentTime + 0.2;
    const alive = { v: true };
    const tick = () => {
      if (!alive.v) return; if (c.state !== 'running') { nextT = Math.max(nextT, c.currentTime + 0.2); return; }
      while (nextT < c.currentTime + 1.0) { bar(nextBar, nextT); nextBar = (nextBar + 1) % 16; nextT += BAR; }
    };
    const iv = setInterval(tick, 150); tick();
    return {
      gain: bus,
      prime(sec) { while (nextT < sec) { bar(nextBar, nextT); nextBar = (nextBar + 1) % 16; nextT += BAR; } },
      stop() { alive.v = false; clearInterval(iv); const t = c.currentTime; try { bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(0.0001, t, 0.1); } catch (e) { /* ignore */ } setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 900); },
    };
  }


  // =====================================================================================================================
  //  LECTEUR du morceau « gladiateurs » (créé avec Gemini, assets/audio/gladiateurs.mp3) : boucle en fondu enchaîné.
  //  Si le fichier ne peut pas être chargé (ouverture hors ligne, etc.), on joue la version synthétisée ci-dessus.
  // =====================================================================================================================
  function filePlayer(c, out, url, fallback) {
    const bus = c.createGain(); bus.gain.value = 0.17; bus.connect(out);
    const XF = 3;               // durée du fondu enchaîné entre deux passages (s)
    const alive = { v: true }; let buf = null, timer = null, nextAt = 0, fb = null; const live = new Set();
    function playAt(t) {
      const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + XF * 0.5);
      g.gain.setValueAtTime(1, t + buf.duration - XF); g.gain.linearRampToValueAtTime(0.0001, t + buf.duration);
      s.connect(g); g.connect(bus); s.start(t); s.stop(t + buf.duration + 0.05); live.add(s); s.onended = () => live.delete(s);
      nextAt = t + buf.duration - XF;
    }
    function tick() {
      if (!alive.v || !buf) return;
      if (c.state !== 'running') { return; }
      while (nextAt < c.currentTime + 4) playAt(Math.max(nextAt, c.currentTime + 0.05));
    }
    fetch(url).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then(a => new Promise((ok, ko) => c.decodeAudioData(a, ok, ko)))
      .then(b => { if (!alive.v) return; buf = b; nextAt = c.currentTime + 0.1; timer = setInterval(tick, 500); tick(); })
      .catch(() => { if (alive.v && fallback) fb = fallback(c, out); });
    return {
      gain: bus,
      prime(sec) { if (buf) { while (nextAt < sec) playAt(nextAt); } },
      stop() {
        alive.v = false; clearInterval(timer); if (fb) fb.stop();
        const t = c.currentTime; try { bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(0.0001, t, 0.12); } catch (e) { /* ignore */ }
        setTimeout(() => { live.forEach(s => { try { s.stop(); } catch (e) { /* ignore */ } }); try { bus.disconnect(); } catch (e) { /* ignore */ } }, 900);
      },
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

  function start(c, out, kind) { return kind === 'poke' ? music(c, out) : filePlayer(c, out, 'assets/audio/gladiateurs.mp3?v=1', epic); }
  root.LudusAmbience = { start, epic, music, MELODY, PROG, THEME };
})(typeof window !== 'undefined' ? window : globalThis);
