/* LUDUS — animations : les cartes ne « sautent » plus d'un endroit à l'autre, elles voyagent.
   Principe (technique « FLIP ») : avant chaque rafraîchissement de l'écran on photographie la position de toutes les cartes (identifiées par data-uid),
   après le rafraîchissement on compare :
     • carte déjà présente mais ailleurs  → elle glisse de son ancienne place à la nouvelle ;
     • carte apparue (tirage, placement…)  → elle arrive depuis sa source (équipe, main, pile de la réserve…) ;
     • carte disparue (achat, mort, défausse) → une copie s'envole vers sa destination (équipe, PC / fosse, dépôt) ;
     • carte face cachée qui se révèle      → elle se retourne.
   Les copies volantes sont des « fantômes » posés au-dessus de tout (rien n'est coupé par les cadres du plateau). */
(function (root) {
  'use strict';
  const A = { mode: 'full', prev: null, sig: '', tab: null, counters: {}, suppressUntil: 0, inflight: new Map(), stats: { flights: 0, enters: 0, exits: 0, flips: 0, clashes: 0, counters: 0 } };
  try {
    const m = localStorage.getItem('ludus.anim');
    A.mode = m || ((root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'reduced' : 'full');
  } catch (e) { /* ignore */ }

  const $ = (s, r) => (r || document).querySelector(s);
  const EASE = 'cubic-bezier(.22,.9,.28,1)';
  const full = () => A.mode === 'full';
  const active = () => A.mode !== 'none' && Date.now() >= A.suppressUntil;
  const dur = ms => (A.mode === 'reduced' ? ms * 0.4 : ms);

  function areaOf(el) {
    if (el.closest('#hand')) return 'hand';
    if (el.closest('#buys')) return 'buys';
    if (el.closest('#forum')) return 'forum';
    if (el.closest('#colisee')) return 'colisee';
    return null;
  }
  function visible(el, area) {
    if (area === 'forum' || area === 'colisee') { const p = el.closest('.panel'); if (!p || !p.classList.contains('active')) return false; }
    return true;
  }
  function collect(only) {
    const m = new Map(), byUid = new Map(), bySlot = new Map();
    document.querySelectorAll('#forum .card[data-uid], #hand .card[data-uid], #buys .card[data-uid], #colisee .gslot[data-slot] > .card').forEach(el => {
      const area = areaOf(el); if (!area || !visible(el, area)) return;
      if (only && area !== only) return;
      const slotEl = el.closest('[data-slot]');
      const id = el.dataset.uid || (slotEl ? 'back:' + slotEl.dataset.slot : null); if (!id) return;
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
      const key = area + '|' + id;
      if (m.has(key)) return;
      const qr = el.closest('.qrow');
      const e = { key, el, uid: el.dataset.uid || null, area, rect: r, slot: slotEl ? slotEl.dataset.slot : null, q: qr ? qr.dataset.q : null, seat: slotEl ? Number(slotEl.dataset.s) : null };
      m.set(key, e);
      if (e.uid) { if (!byUid.has(e.uid)) byUid.set(e.uid, []); byUid.get(e.uid).push(e); }
      if (e.slot) bySlot.set(e.slot, e);
    });
    return { m, byUid, bySlot };
  }
  function signature(UI) {
    const g = $('#panels'); const r = g ? g.getBoundingClientRect() : { width: 0, height: 0 };
    return [UI.cw.forum, UI.cw.col, Math.round(r.width), Math.round(r.height), window.innerWidth, window.innerHeight].join('|');
  }

  // ---------- fantômes ----------
  function mkGhost(el, rect) {
    const g = el.cloneNode(true);
    g.classList.remove('can', 'sel', 'dim', 'hcard');
    g.removeAttribute('data-act'); g.removeAttribute('data-uid'); g.removeAttribute('data-fkey'); g.removeAttribute('id');
    g.classList.add('anim-ghost');
    Object.assign(g.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', margin: '0', zIndex: 460, pointerEvents: 'none', transform: 'none', transition: 'none', '--w': rect.width + 'px' });
    document.body.appendChild(g);
    return g;
  }
  const centre = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  function dist(a, b) { const p = centre(a), q = centre(b); return Math.hypot(p.x - q.x, p.y - q.y); }
  function flyTime(a, b) { return dur(Math.max(380, Math.min(760, 300 + dist(a, b) * 0.45))); }

  // la vraie carte reste invisible pendant que son fantôme voyage, puis prend sa place
  function fly(el, from, to, o) {
    o = o || {};
    const d = o.dur || flyTime(from, to), delay = o.delay || 0;
    A.stats.flights++;
    const g = mkGhost(el, to);
    const c1 = centre(from), c2 = centre(to);
    const s0 = Math.max(0.25, Math.min(1.6, from.width / to.width));
    const prevVis = el.style.visibility;
    el.style.visibility = 'hidden';
    if (o.key) A.inflight.set(o.key, Date.now() + d + delay + 60);
    const anim = g.animate([
      { transform: `translate(${c1.x - c2.x}px, ${c1.y - c2.y}px) scale(${s0}) rotate(${o.rot == null ? -6 : o.rot}deg)`, opacity: o.o0 == null ? 1 : o.o0, offset: 0 },
      { transform: `translate(${(c1.x - c2.x) * 0.45}px, ${(c1.y - c2.y) * 0.45 - Math.min(60, dist(from, to) * 0.12)}px) scale(${(s0 + 1) / 2 + 0.06}) rotate(${(o.rot == null ? -6 : o.rot) / 2}deg)`, opacity: 1, offset: 0.5 },
      { transform: 'none', opacity: 1, offset: 1 },
    ], { duration: d, delay, easing: EASE, fill: 'backwards' });
    const done = () => { g.remove(); if (o.key) A.inflight.delete(o.key); if (el.isConnected) el.style.visibility = prevVis || ''; };
    anim.onfinish = done; anim.oncancel = done;
    return d + delay;
  }
  function exitTo(el, from, toRect, o) {
    o = o || {};
    A.stats.exits++;
    const g = mkGhost(el, from);
    const c1 = centre(from);
    const c2 = toRect ? centre(toRect) : { x: c1.x, y: c1.y + 40 };
    const s1 = toRect ? Math.max(0.2, Math.min(1, toRect.width / from.width)) : 0.7;
    const d = dur(o.dur || (toRect ? flyTime(from, toRect) : 380));
    const anim = g.animate([
      { transform: 'none', opacity: 1, offset: 0 },
      { transform: `translate(${(c2.x - c1.x) * 0.5}px, ${(c2.y - c1.y) * 0.5 - 24}px) scale(${(1 + s1) / 2}) rotate(${o.rot == null ? 8 : o.rot / 2}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${c2.x - c1.x}px, ${c2.y - c1.y}px) scale(${s1}) rotate(${o.rot == null ? 8 : o.rot}deg)`, opacity: toRect ? 0.15 : 0, offset: 1 },
    ], { duration: d, delay: o.delay || 0, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' });
    anim.onfinish = () => g.remove(); anim.oncancel = () => g.remove();
  }
  function fade(el, d, delay, dy) {
    A.stats.enters++;
    el.animate([{ opacity: 0, transform: `translateY(${dy == null ? 14 : dy}px) scale(.94)` }, { opacity: 1, transform: 'none' }], { duration: dur(d || 320), delay: delay || 0, easing: EASE, fill: 'backwards' });
  }
  function flip(el, delay) {
    A.stats.flips++;
    el.animate([{ transform: 'perspective(700px) rotateY(88deg) scale(1.04)', filter: 'brightness(1.5)' }, { transform: 'none', filter: 'none' }], { duration: dur(420), delay: delay || 0, easing: EASE, fill: 'backwards' });
  }

  // ---------- origines / destinations ----------
  const rectOf = sel => { const e = $(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
  const teamRect = (seat, v) => (seat === v.seat ? rectOf('#piles [data-act="ludus"]') : rectOf('.pchip.opp'));
  const handRect = () => { const h = $('#hand'); if (!h) return null; const r = h.getBoundingClientRect(); return { left: r.left + r.width / 2 - 30, top: r.top + 10, width: 60, height: 84 }; };
  const chipRect = (seat, v) => (seat === v.seat ? rectOf('.pchip.me') : rectOf('.pchip.opp'));
  const fosseRect = () => rectOf('#colisee .fossecol .pile') || rectOf('#piles [data-act="fosse"]');
  function originOf(n, v) {
    if (n.area === 'colisee') {
      if (n.slot && n.slot[0] === 't') return n.seat === v.seat ? (handRect() || teamRect(n.seat, v)) : chipRect(n.seat, v);
      return teamRect(n.seat, v);
    }
    if (n.area === 'forum') { const row = n.el.closest('.qrow'); const p = row && row.querySelector('.pile.reserve'); const r = p && p.getBoundingClientRect(); return r && r.width ? r : null; }
    if (n.area === 'buys') return chipRect(n.el.closest('.bgrp') && n.el.closest('.bgrp').classList.contains('opp') ? 1 - v.seat : v.seat, v);
    if (n.area === 'hand') return rectOf('#forum .qrow[data-q="tactic"] .pile.reserve');
    return null;
  }
  function destOf(o, v, inFosse) {
    if (o.area === 'forum') {
      if (v.buys && v.buys[v.seat].some(b => b.uid === o.uid)) return teamRect(v.seat, v);
      if (v.phase === 'preparation') return teamRect(1 - v.seat, v);
      return (A.prevRows && A.prevRows[o.q]) || null;
    }
    if (o.area === 'colisee') return inFosse ? fosseRect() : (o.slot && o.slot[0] === 't' ? null : teamRect(o.seat, v));
    if (o.area === 'hand') return inFosse ? rectOf('#piles [data-act="fosse"]') : null;
    return null;
  }

  // ---------- cycle ----------
  A.begin = function (UI) {
    A.sig = signature(UI); A.tab = UI.tab;
    A.prevRows = {};
    document.querySelectorAll('#forum .qrow').forEach(r => { const d = r.querySelector('.pile.depot'); if (d && r.dataset.q) { const b = d.getBoundingClientRect(); if (b.width) A.prevRows[r.dataset.q] = b; } });
    A.prev = (A.mode === 'none') ? null : collect();
  };
  A.end = function (UI, v) {
    const prev = A.prev; A.prev = null;
    countersPass(v);
    if (!prev || !active()) return;
    let from = prev;
    if (A.tab !== UI.tab) {
      // changement d'onglet : seule la mise en scène automatique du Colisée (distribution des gladiateurs) est animée
      if (!(A.auto && UI.tab === 'colisee' && v.phase === 'reveal')) return;
      from = { m: new Map(), byUid: new Map(), bySlot: new Map() };
    } else if (A.sig !== signature(UI)) return;                   // la taille des cartes a changé : pas d'animation
    const cur = collect();
    const inFosse = new Set([...(v.fosse.gladiators || []), ...(v.fosse.tactics || [])].map(c => c.uid));
    let idx = 0, budget = 16, dealSounds = 0;
    const consumed = new Set();
    for (const [key, n] of cur.m) {
      const fl = A.inflight.get(key);
      if (fl && fl > Date.now()) {                                // sa copie voyage encore : on garde la vraie carte cachée jusqu'à l'arrivée
        n.el.style.visibility = 'hidden'; setTimeout(() => { if (n.el.isConnected) n.el.style.visibility = ''; }, fl - Date.now());
        continue;
      }
      const o = from.m.get(key);
      if (o) {
        const dx = (n.rect.left + n.rect.width / 2) - (o.rect.left + o.rect.width / 2), dy = (n.rect.top + n.rect.height / 2) - (o.rect.top + o.rect.height / 2);
        if (Math.hypot(dx, dy) > 18 && budget > 0 && full()) { budget--; fly(n.el, o.rect, n.rect, { key, delay: Math.min(idx++, 6) * 40, rot: dx > 0 ? 4 : -4 }); }
        continue;
      }
      // même carte, autre zone de l'écran (achat → équipe, main → Colisée…)
      const others = n.uid ? (from.byUid.get(n.uid) || []).filter(e => !cur.m.has(e.key) && !consumed.has(e.key)) : [];
      if (others.length) {
        const src = others[0]; consumed.add(src.key);
        if (budget > 0 && full()) { budget--; fly(n.el, src.rect, n.rect, { key, delay: Math.min(idx++, 6) * 60, rot: -10 }); } else fade(n.el, 260);
        continue;
      }
      // carte qui se retourne (dos → face, dans le même emplacement)
      const old = n.slot && from.bySlot.get(n.slot);
      if (old && old.key !== key && !cur.m.has(old.key) && old.key.indexOf('|back:') > 0) { consumed.add(old.key); flip(n.el, Math.min(idx++, 6) * 60); continue; }
      // carte qui arrive de nulle part : tirage, ravitaillement, effet…
      const org = originOf(n, v);
      if (org && budget > 0 && full()) {
        budget--;
        const delay = Math.min(idx++, 9) * 110;
        fly(n.el, org, n.rect, { key, delay, o0: 0, rot: -14 });
        if (n.area === 'colisee' && dealSounds++ < 6 && root.LudusSfx) root.LudusSfx.play('card', delay / 1000, 0.8);
      } else fade(n.el, 320, Math.min(idx++, 8) * 80);
    }
    // cartes parties
    for (const [key, o] of from.m) {
      if (cur.m.has(key) || consumed.has(key)) continue;
      if (budget <= 0 || !full()) continue;
      if (o.uid && (cur.byUid.get(o.uid) || []).length) continue;     // toujours là, ailleurs (déjà animée à l'arrivée)
      budget--;
      exitTo(o.el, o.rect, destOf(o, v, inFosse.has(o.uid)), { delay: Math.min(idx++, 6) * 50 });
    }
  };


  // ---------- compteurs (deniers, équipe, main…) qui défilent ----------
  function countersPass(v) {
    document.querySelectorAll('[data-ck]').forEach(el => {
      const k = el.dataset.ck, val = parseFloat(el.textContent);
      if (isNaN(val)) return;
      const p = A.counters[k]; A.counters[k] = val;
      if (p == null || p === val || !active() || A.mode === 'none') return;
      A.stats.counters++;
      const t0 = performance.now(), D = dur(650);
      el.classList.remove('bump-up', 'bump-down'); void el.offsetWidth; el.classList.add(val > p ? 'bump-up' : 'bump-down');
      const step = t => { const x = Math.min(1, (t - t0) / D); const e = 1 - Math.pow(1 - x, 3); if (el.isConnected) el.textContent = String(Math.round(p + (val - p) * e)); if (x < 1 && el.isConnected) requestAnimationFrame(step); else if (el.isConnected) el.textContent = String(val); };
      el.textContent = String(p);
      requestAnimationFrame(step);
      setTimeout(() => el.classList.remove('bump-up', 'bump-down'), dur(900));
    });
  }

  // ---------- duels : les deux gladiateurs s'entrechoquent, le gagnant brille, le perdant s'effondre ----------
  A.clash = function (z, winner, v) {
    if (!active() || A.mode !== 'full') return;
    const q = seat => $(`#colisee .gslot[data-z="${z}"][data-seat="${seat}"] > .card`);
    const me = q(v.seat), op = q(1 - v.seat);
    if (!me && !op) return;
    A.stats.clashes++;
    const h = (me || op).getBoundingClientRect().height, D = 0.34 * h;
    const hit = (el, dirY) => el && el.animate([
      { transform: 'none', offset: 0 },
      { transform: `translateY(${dirY * D}px) scale(1.08)`, offset: 0.4, easing: 'ease-in' },
      { transform: `translateY(${dirY * D * 0.55}px) scale(1.04) rotate(${dirY * 3}deg)`, offset: 0.52 },
      { transform: `translateY(${dirY * D * 0.7}px) scale(1.06) rotate(${-dirY * 2.5}deg)`, offset: 0.62 },
      { transform: 'none', offset: 1 },
    ], { duration: 720, easing: 'ease-out' });
    hit(me, -1); hit(op, 1);
    if (root.LudusSfx) root.LudusSfx.play('clash', 0.22, 0.7);
    setTimeout(() => {
      const win = winner === null ? null : (winner === v.seat ? me : op), lose = winner === null ? null : (winner === v.seat ? op : me);
      if (win) win.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.14)', filter: 'brightness(1.35)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
      if (lose) lose.animate([{ transform: 'none' }, { transform: 'translateX(-7px) rotate(-3deg)' }, { transform: 'translateX(7px) rotate(3deg)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
      [me, op].forEach(c => { const pb = c && c.querySelector('.pb'); if (pb) pb.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.6)', opacity: 1 }, { transform: 'scale(1)' }], { duration: 480, easing: EASE }); const sk = c && c.querySelector('.skull'); if (sk) sk.animate([{ transform: 'scale(2.4)', opacity: 0 }, { transform: 'scale(1)', opacity: .9 }], { duration: 420, easing: EASE }); });
    }, 330);
  };

  A.suppress = function (ms) { A.suppressUntil = Date.now() + (ms || 500); };
  A.setMode = function (m) { A.mode = m; try { localStorage.setItem('ludus.anim', m); } catch (e) { /* ignore */ } };
  A.reset = function () { A.prev = null; A.counters = {}; document.querySelectorAll('.anim-ghost').forEach(g => g.remove()); };
  if (A.mode === 'none' && document.body) document.body.classList.add('anim-none');
  root.LudusAnim = A;
})(typeof window !== 'undefined' ? window : globalThis);
