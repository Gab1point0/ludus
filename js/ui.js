/* LUDUS — interface de jeu */
(function (root) {
  'use strict';
  const { CARDS, RANKS, QUARTIERS, EDICTS } = root.LudusData;
  const E = root.Ludus, AI = root.LudusAI;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const Q_ORDER = ['tactic', 'debutant', 'aguerri', 'legendaire'];
  const Q_COLOR = { tactic: '#ff8a2a', debutant: '#d4d4d4', aguerri: '#36b863', legendaire: '#a86de6' };
  const COLOR_HEX = { rouge: '#d8473d', bleu: '#3b8fe0' };
  const coin = '<span class="coin"></span>';
  const HOVER_SEL = '[data-def],[data-back],[data-edict]';

  const UI = {
    session: null, view: null, tab: 'forum', selected: null, autoKey: '', logN: -1,
    pickSel: new Set(), promptPid: null, endShown: false, settings: { calc: true },
    cw: { forum: 96, col: 110 }, start: { forum: 96, col: 110 }, html: {}, hoverEl: null, refit: true, sizeKey: '',
  };

  // ============================== petites briques HTML ==============================
  const TH = () => (root.LudusTheme && root.LudusTheme.active ? root.LudusTheme : null);
  // visuel d'une carte : image du PDF (LUDUS) ou carte dessinée en HTML (autres thèmes)
  function faceImg(defId, big) { const t = TH(); if (t) return t.face(defId); const d = CARDS[defId]; return `<img src="assets/cards/${d.img}${big ? '' : '-sm'}.webp" alt="${esc(d.name)}" draggable="false">`; }
  function edictImg(id, big) { const t = TH(); if (t) return t.edictFace(id); return `<img src="assets/edicts/${id}${big ? '' : '-sm'}.webp" alt="" draggable="false">`; }
  function backImg(kind) { const t = TH(); if (t) return t.backFace(kind); return `<img src="assets/backs/${kind}.webp" alt="Dos de carte" draggable="false">`; }
  const brand = () => (root.LudusTheme ? root.LudusTheme.brand : 'LUDUS');
  function cardHTML(defId, o) {
    o = o || {};
    const data = o.back ? `data-back="${o.back}"` : `data-def="${defId}"`;
    const uid = o.uid ? ` data-uid="${o.uid}"` : '';
    const style = o.w ? ` style="--w:${o.w}"` : '';
    return `<div class="card ${o.cls || ''}" ${data}${uid}${style} ${o.attrs || ''}>${o.back ? backImg(o.back) : faceImg(defId, o.big)}${o.inner || ''}</div>`;
  }
  const pHex = color => (TH() && TH().colorHex(color)) || COLOR_HEX[color] || '#999';
  const ccls = color => (TH() ? TH().colorClass(color) : color) || '';
  function phaseLabel(v) {
    switch (v.phase) {
      case 'setup': return 'Mise en place';
      case 'renewal': return 'Renouvellement';
      case 'preparation': return 'Préparation';
      case 'reveal': return v.step === 'draw' ? 'Révélation · gladiateurs' : v.step === 'tactics' ? 'Révélation · placement des tactiques' : 'Révélation · effets des tactiques';
      case 'combat': return 'Combat';
      case 'rewards': return 'Récompenses';
      case 'over': return 'Fin de partie';
    }
    return '';
  }
  function nameSpan(v, seat) { return `<span class="n${ccls(v.players[seat].color)}">${esc(v.players[seat].name)}</span>`; }
  function setHTML(key, el, html) { if (UI.html[key] === html) return; UI.html[key] = html; el.innerHTML = html; }

  // ============================== mise en page ==============================
  function fitPanel(el, key, min) {
    let cw = UI.start[key], guard = 0;
    el.style.setProperty('--cw', cw + 'px');
    while (cw > min && guard++ < 60 && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)) { cw -= 3; el.style.setProperty('--cw', cw + 'px'); }
    UI.cw[key] = cw;
  }
  function fitAll() { if (!UI.refit) return; UI.refit = false; fitPanel($('#forum'), 'forum', 48); fitPanel($('#colisee'), 'col', 48); }
  function layout() {
    const st = $('#panels'); if (!st) return;
    const r = st.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    const sizeKey = Math.round(r.width) + 'x' + Math.round(r.height);
    if (sizeKey !== UI.sizeKey) { UI.sizeKey = sizeKey; UI.refit = true; }
    const availW = r.width - 4 - 24 - 20;
    const availH = r.height - 4 - 20;
    // Forum : les quartiers (étiquette + réserve + emplacements + dépôt) passent à la ligne
    const rowW = (n, cw) => 20 + (n + 1.4) * cw + (n + 2) * 6 + 12;
    const rowH = cw => cw * 1.398 + 62;
    let fcw = 56;
    for (let cw = 150; cw >= 56; cw -= 2) {
      const widths = [rowW(6, cw), rowW(3, cw), rowW(3, cw), rowW(3, cw)];
      if (widths[0] > availW) continue;
      let rows = 1, cur = widths[0];
      for (let i = 1; i < 4; i++) { if (cur + 16 + widths[i] <= availW) cur += 16 + widths[i]; else { rows++; cur = widths[i]; } }
      if (rows * rowH(cw) + (rows - 1) * 14 <= availH) { fcw = cw; break; }
    }
    // Colisée : 3 couloirs côte à côte (adversaire en haut, vous en bas) + fosse
    const lh = cw => 2 * cw * 1.398 + 34 + 12 + 24 + 20;
    const lw = cw => 3 * (2 * cw + 8 + 24 + 4) + 2 * 20 + (cw * 0.8 + 30) + 22;
    let ccw = 56;
    for (let cw = 170; cw >= 56; cw -= 2) { if (lh(cw) <= availH - 70 && lw(cw) <= availW) { ccw = cw; break; } }
    UI.start = { forum: fcw, col: ccw };
    const hw = Math.max(76, Math.min(124, Math.floor(window.innerHeight * 0.13)));
    document.documentElement.style.setProperty('--hw', hw + 'px');
  }

  // ============================== rendu global ==============================
  function render() {
    const s = UI.session; if (!s) return;
    const pass = s.needsPass ? s.needsPass() : null;
    renderPassScreen(pass, s);
    const v = s.getView();
    if (!v) { renderWaiting(); return; }
    UI.view = v;
    if (pass != null) return;               // écran de passage : on ne dévoile rien
    if (v.undoStamp !== UI.undoStamp) {     // un coup vient d'être annulé : on repart d'un affichage neuf
      UI.undoStamp = v.undoStamp; UI.logN = -1; UI.logLen = -1; UI.html = {}; UI.selected = null; UI.promptPid = null; UI.lastPromptId = null;
      closeAll(m => ['prompt', 'confirm'].includes(m.dataset.mid));
    }
    if (root.LudusSfx) root.LudusSfx.onView(v);
    layout();
    // changement de phase -> onglet automatique + bannière
    const key = `${v.round}|${v.phase}|${v.step}`;
    if (key !== UI.autoKey) {
      UI.autoKey = key;
      UI.tab = ['reveal', 'combat', 'rewards'].includes(v.phase) ? 'colisee' : 'forum';
      UI.selected = null;
      showBanner(v);
    }
    const p = v.prompt;
    if (p && p.kind === 'choice' && p.mode === 'prep' && UI.lastPromptId !== p.id) UI.tab = 'forum';
    if (p && p.kind === 'choice' && p.mode === 'place' && UI.lastPromptId !== p.id) UI.tab = 'colisee';
    if (p && p.kind === 'choice' && ['zone', 'slot', 'seat', 'order'].includes(p.mode) && UI.lastPromptId !== p.id) UI.tab = 'colisee';
    if (p && p.kind === 'choice' && p.mode === 'quarter' && UI.lastPromptId !== p.id) UI.tab = 'forum';
    if (p) UI.lastPromptId = p.id;
    if (!p) UI.selected = null;
    if (p && p.kind === 'choice' && p.mode === 'place' && UI.selected && !p.options.some(o => o.uid === UI.selected)) UI.selected = null;

    renderHUD(v);
    renderTabs(v);
    setHTML('forum', $('#forum'), forumHTML(v, p));
    setHTML('colisee', $('#colisee'), colHTML(v, p));
    fitAll();
    renderHand(v, p);
    renderPromptBar(v, p);
    renderLog(v);
    renderBuys(v);
    if (UI.hoverEl && !document.contains(UI.hoverEl)) hidePreview();     // la carte survolée a disparu : on ferme son aperçu
    renderPromptModal(v, p);
    renderUndo(v);
    renderEnd(v);
    renderLost(s);
  }

  function renderWaiting() {
    $('#hud').innerHTML = `<div class="hud-logo">${brand()}</div><div class="hud-round"><div class="rt"><span class="spinner"></span> En attente de l'hôte…</div></div>`;
  }

  // ---------- HUD ----------
  function renderHUD(v) {
    const me = v.seat, op = 1 - me, P = v.players;
    const chip = (seat, cls) => {
      const p = P[seat];
      return `<div class="pchip ${cls} ${v.waiting.includes(seat) && !v.over ? 'turn' : ''}" style="--pc:${pHex(p.color)}">
        <span class="dot"></span><span class="nm">${esc(p.name)}</span>
        <span class="st"><span title="Deniers">${coin} <b>${p.deniers}</b></span><span title="Gladiateurs dans le ludus">🏺 ${p.ludusCount}</span><span title="Tactiques en main">🃏 ${p.handCount}</span></span>
        ${v.firstSeat === seat && v.round ? '<span class="sester" title="Sesterce : premier laniste">Sesterce</span>' : ''}</div>`;
    };
    const steps = [1, 2, 3, 4].map(i => `<span class="step ${i === v.emperor ? 'on' : i < v.emperor ? 'past' : ''}">${i}</span>`).join('');
    let edict = '<div class="edict-chip" style="opacity:.5"><div class="ex">Aucun édit pour l\'instant</div></div>';
    if (v.edict) edict = `<div class="edict-chip" data-edict="${v.edict.def}">${TH() ? `<span class="edict-ico">${TH().edictIcon(v.edict.def)}</span>` : `<img src="assets/edicts/${v.edict.def}-sm.webp" alt="">`}<div><div class="et">Édit : ${esc(v.edict.name)}</div><div class="ex">${esc(v.edict.text)}</div></div></div>`;
    const variant = v.variant ? ' · variante Empereur' : '';
    setHTML('hud', $('#hud'), `
      <div class="hud-logo">${brand()}</div>
      <div class="hud-round"><div class="rt">Manche ${v.round || '–'} / 4${v.extra ? ` · combat supplémentaire ${v.extra}` : ''}${variant}</div><div class="ph">${phaseLabel(v)}</div></div>
      <div class="steps" title="Marche de l'Empereur">${steps}</div>
      ${edict}
      <div class="hud-spacer"></div>
      ${chip(me, 'me')}${chip(op, 'opp')}
      <div class="hud-btns">
        <button class="iconbtn" data-act="undo" title="Annuler mon dernier coup (l'adversaire doit accepter)" ${v.canUndo ? '' : 'disabled'}>↩</button>
        <button class="iconbtn" data-act="sound" title="Sons : activer / couper">${root.LudusSfx && root.LudusSfx.S.enabled ? '🔊' : '🔇'}</button>
        <button class="iconbtn" data-act="log" title="Journal de la partie">📜</button>
        <button class="iconbtn" data-act="help" title="Règles et cartes">📖</button>
        <button class="iconbtn" data-act="menu" title="Menu">☰</button>
      </div>`);
  }

  function renderTabs(v) {
    $$('#tabs button').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === UI.tab);
      const p = v.prompt;
      const need = p && p.kind === 'choice' && ((p.mode === 'prep' && b.dataset.tab === 'forum') || (p.mode === 'place' && b.dataset.tab === 'colisee'));
      b.classList.toggle('attn', !!need && UI.tab !== b.dataset.tab);
    });
    $('#forum').classList.toggle('active', UI.tab === 'forum');
    $('#colisee').classList.toggle('active', UI.tab === 'colisee');
    const p = v.prompt;
    $('#tabs-hint').textContent = p && p.kind === 'choice' && p.mode === 'prep' ? 'Cliquez une carte du Forum pour l\'acheter' : p && p.kind === 'choice' && p.mode === 'place' ? (UI.selected ? 'Choisissez l\'emplacement libre' : 'Cliquez une tactique de votre main') : '';
  }

  // ============================== FORUM ==============================
  function forumHTML(v, p) {
    const prep = p && p.kind === 'choice' && p.mode === 'prep' ? p : null;
    const buy = {};
    if (prep) prep.options.forEach(o => { if (o.type === 'buy') buy[`${o.q}:${o.from === 'reserve' ? 'r' : o.i}`] = o; });
    const big = UI.cw.forum >= 120;
    let h = '<div class="forum-wrap">';
    for (const q of Q_ORDER) {
      const F = v.forum[q], pr = v.prices[q], col = Q_COLOR[q];
      const basePrice = q === 'tactic' ? null : RANKS[q].price;
      const back = q === 'tactic' ? 'tactic' : 'gladiator';
      const rb = buy[q + ':r'];
      // prix modifié par un Édit : vert (▼) si c'est moins cher que le prix normal, rouge (▲) si c'est plus cher
      const cmp = (pz, base) => (base == null || pz == null || pz === base) ? '' : (pz < base ? 'down' : 'up');
      const arrow = c => (c === 'down' ? '▼' : c === 'up' ? '▲' : '');
      const rc = q === 'tactic' ? '' : cmp(pr.reserve, basePrice);
      const res = F.reserve > 0
        ? `<div class="pile reserve ${rb ? 'buy' : ''}" ${rb ? `data-act="buy" data-opt="${rb.id}"` : ''} title="Réserve : ${F.reserve} carte(s)${rc ? (rc === 'down' ? ' — prix réduit par l\'Édit' : ' — prix augmenté par l\'Édit') : ''}">${[0, 1, 2].map(() => cardHTML(null, { back })).join('')}<span class="cnt">${F.reserve}</span>${rb ? `<span class="cap ${rc}">Dessus · ${coin} ${rb.price}${arrow(rc)}</span>` : (q !== 'tactic' && pr.reserve != null && (prep || rc) ? `<span class="cap ${prep ? 'no' : ''} ${rc}">${coin} ${pr.reserve}${arrow(rc)}</span>` : '')}</div>`
        : '<div class="pile reserve empty" title="Réserve vide (le dépôt est mélangé quand on en a besoin)"></div>';
      const dep = F.depot > 0
        ? `<div class="pile depot" title="Dépôt : ${F.depot} carte(s) (face cachée)">${[0, 1].map(() => cardHTML(null, { back })).join('')}<span class="cnt">${F.depot}</span></div>`
        : '<div class="pile depot empty" title="Dépôt vide"></div>';
      const slots = F.slots.map((sl, i) => {
        if (sl.locked) return `<div class="slot locked">🔒<b>${sl.unlock}</b>manche</div>`;
        if (!sl.card) return `<div class="slot">${q === 'tactic' ? '◆' : (TH() ? '🏺' : '⚔')}</div>`;
        const o = buy[`${q}:${i}`];
        const price = pr.slots[i];
        const base = q === 'tactic' ? CARDS[sl.card.def].price : basePrice;
        const pc = cmp(price, base);
        const priceHTML = `<span class="price ${!o && prep ? 'no' : ''} ${pc}" title="${pc === 'down' ? 'Prix réduit par l\'Édit (normalement ' + base + ')' : pc === 'up' ? 'Prix augmenté par l\'Édit (normalement ' + base + ')' : ''}">${coin} ${price}${arrow(pc)}</span>`;
        return cardHTML(sl.card.def, { uid: sl.card.uid, big, cls: `${o ? 'can' : ''} ${prep && !o ? 'dim' : ''}`, inner: priceHTML, attrs: o ? `data-act="buy" data-opt="${o.id}"` : '' });
      }).join('');
      // en-tête du Quartier : prix « sur table » (emplacements achats) et, s'il diffère, prix de la réserve
      let lab = 'prix sur chaque carte';
      if (basePrice) {
        const sp = pr.slots.find(x => x != null);
        const sc = sp != null ? cmp(sp, basePrice) : '';
        if (sp != null) {
          lab = `<span class="pv ${sc}">${coin} ${sp}${arrow(sc)}</span> par gladiateur`;
          if (pr.reserve != null && pr.reserve !== sp) lab += ` · réserve <span class="pv ${rc}">${coin} ${pr.reserve}${arrow(rc)}</span>`;
        } else lab = `réserve <span class="pv ${rc}">${coin} ${pr.reserve}${arrow(rc)}</span> par gladiateur`;
        if (sc || rc) lab += ` <i class="was">(normalement ${basePrice})</i>`;
      }
      h += `<div class="qrow" style="--q:${col}"><div class="qlabel">${QUARTIERS[q].label}<small>${lab}</small></div>
        <div class="qline">${res}<span class="arrowb">▶</span>${slots}<span class="arrowb">▶</span>${dep}</div></div>`;
    }
    return h + '</div>';
  }

  // ============================== COLISÉE ==============================
  function simPowers(v) {
    try {
      const board = AI.boardFromView(v, false);
      const res = E.computeCombat({ zones: board, emperor: v.emperor, edictId: v.edict ? v.edict.def : null, noDeath: v.noDeath });
      const m = {};
      res.entries.forEach(e => { m[e.z + ':' + e.s] = e.power; });
      return m;
    } catch (e) { return {}; }
  }
  function powerTip(m) {
    const lines = [`Puissance initiale : ${m.base}`];
    m.mods.forEach(x => lines.push(`${x.amt > 0 ? '+' : ''}${x.amt} ${x.src}`));
    if (m.mult > 1) lines.push(`Bonus et malus ×${m.mult} (Dimacherus)`);
    if (m.renf) lines.push(`+${m.renf} renforts`);
    if (m.blocked) lines.push('Effets annulés');
    return lines.join('\n');
  }
  function colHTML(v, p) {
    const me = v.seat, op = 1 - me;
    const place = p && p.kind === 'choice' && p.mode === 'place' ? p : null;
    const slotTargets = new Set();
    if (place && UI.selected) place.options.forEach(o => { if (o.type === 'place' && o.uid === UI.selected) slotTargets.add(o.z); });
    const inCombat = v.combat && v.combat.res;
    const shown = v.combat ? v.combat.shown : 0;
    const est = UI.settings.calc && v.phase === 'reveal' ? simPowers(v) : {};
    const certain = v.phase === 'reveal' && v.step === 'tactic-reveal';
    const big = UI.cw.col >= 120;
    const gslot = (z, seat) => {
      const zn = v.zones[z][seat]; const g = zn.glad;
      let inner = '';
      if (!g) inner = `<span>${TH() ? '🏺' : '🛡'}</span>`;
      else if (g.hidden) inner = cardHTML(null, { back: 'gladiator' });
      else {
        let cls = '', badge = '';
        if (inCombat && z < shown) {
          const d = v.combat.res.duels[z];
          const mine = seat === 0 ? d.a : d.b;
          const w = d.winner;
          cls = w === null ? 'tie' : (w === seat ? 'win' : 'lose');
          if (mine) badge = `<span class="pb ${w === null ? 't' : (w === seat ? 'w' : 'l')}" title="${esc(powerTip(mine))}">${mine.power}</span>`;
        } else if (est[z + ':' + seat] != null) {
          badge = `<span class="pb ${certain ? '' : 'est'}" title="Puissance actuelle${certain ? '' : ' (estimation : les tactiques adverses cachées ne sont pas comptées)'}">${est[z + ':' + seat]}</span>`;
        }
        const shield = v.noDeath[z].includes(seat) ? '<span class="shield" title="Emplacement protégé par Missio : aucun gladiateur n\'y mourra">🛡️</span>' : '';
        const skull = inCombat && z < shown && cls === 'lose' ? '<span class="skull">☠</span>' : '';
        inner = cardHTML(g.def, { uid: g.uid, big, cls: `${cls} ${g.faceDown ? 'dim' : ''}`, inner: badge + shield + skull + (g.faceDown ? '<span class="chip-deniers mid">face cachée</span>' : '') });
      }
      const dir = seat === me ? 1 : -1;
      const renf = (zn.renforts || []).map((r, i) => `<div class="card" data-def="${r.def}" style="top:${dir * (9 + i * 9)}px;left:${(i % 2 ? 4 : -4)}px;z-index:0">${faceImg(r.def)}</div>`).join('');
      const wrapper = zn.renforts && zn.renforts.length ? `<div class="renfwrap" title="${zn.renforts.length} gladiateur(s) en renfort">${renf}</div>` : '';
      return `<div class="gslot" data-z="${z}" data-seat="${seat}">${wrapper}${inner}</div>`;
    };
    const tslot = (z, seat) => {
      const zn = v.zones[z][seat]; const t = zn.tactic;
      const target = seat === me && !t && slotTargets.has(z);
      if (!t) return `<div class="gslot tac ${target ? 'target' : ''}" ${target ? `data-act="place" data-z="${z}"` : ''}>${target ? '＋' : '◆'}</div>`;
      if (t.hidden) return `<div class="gslot tac">${cardHTML(null, { back: 'tactic' })}</div>`;
      const den = t.deniers ? `<span class="chip-deniers">${coin} ${t.deniers}</span>` : '';
      const fd = t.faceDown ? '<span class="chip-deniers mid">face cachée</span>' : '';
      return `<div class="gslot tac">${cardHTML(t.def, { uid: t.uid, big, cls: t.faceDown ? 'dim' : '', inner: den + fd })}</div>`;
    };
    let lanes = '';
    for (let z = 0; z < 3; z++) {
      let res = '';
      if (inCombat && z < shown) {
        const d = v.combat.res.duels[z];
        if (d.empty) res = '<span class="res t">Zone vide</span>';
        else if (d.winner === null) res = `<span class="res t">${d.forcedTie ? 'Égalité forcée' : 'Égalité'}</span>`;
        else res = `<span class="res ${d.winner === me ? 'w' : 'l'}">${d.winner === me ? '▲ Victoire' : '▼ Défaite'}</span>`;
      }
      lanes += `<div class="lane ${z === 1 ? 'mid' : ''}"><div class="lrow">${gslot(z, op)}${tslot(z, op)}</div>
        <div class="lmid"><span>ZONE ${z + 1}${z === 1 ? ' · centrale' : ''}</span>${res || '<span class="vsb">VS</span>'}</div>
        <div class="lrow">${gslot(z, me)}${tslot(z, me)}</div></div>`;
    }
    const F = v.fosse;
    const top = arr => arr.length ? arr[arr.length - 1] : null;
    const tg = top(F.gladiators), tt = top(F.tactics);
    const fosse = `<div class="fossecol"><div class="ft">☠ Fosse</div>
      <div class="pile ${tg ? '' : 'empty'}" data-act="fosse" title="Gladiateurs défaussés (${F.gladiators.length})">${tg ? cardHTML(tg.def, { cls: 'dim' }) : ''}<span class="cnt">${F.gladiators.length}</span></div>
      <div class="pile ${tt ? '' : 'empty'}" data-act="fosse" title="Tactiques défaussées (${F.tactics.length})">${tt ? cardHTML(tt.def, { cls: 'dim' }) : ''}<span class="cnt">${F.tactics.length}</span></div></div>`;
    return `<div class="col-inner"><div class="lanes">${lanes}</div>${fosse}</div>`;
  }

  // ============================== MAIN ==============================
  function renderHand(v, p) {
    const me = v.seat;
    const hand = (v.players[me].hand || []).slice().sort((a, b) => CARDS[a.def].name.localeCompare(CARDS[b.def].name));
    const prep = p && p.kind === 'choice' && p.mode === 'prep' ? p : null;
    const place = p && p.kind === 'choice' && p.mode === 'place' ? p : null;
    let h = '';
    for (const c of hand) {
      const canPlay = prep && prep.options.some(o => o.type === 'play' && o.uid === c.uid);
      const canPlace = place && place.options.some(o => o.type === 'place' && o.uid === c.uid);
      const cls = ['hcard', canPlay || canPlace ? 'can' : '', UI.selected === c.uid ? 'sel' : ''].join(' ');
      h += cardHTML(c.def, { uid: c.uid, cls, big: false, attrs: `${canPlay || canPlace ? `data-act="hand" data-uid="${c.uid}" draggable="${canPlace ? 'true' : 'false'}"` : ''}` });
    }
    setHTML('hand', $('#hand'), h || '<div class="hempty">Votre main de tactiques est vide.</div>');
    const f = v.fosse;
    setHTML('piles', $('#piles'), `
      <button class="btn small" data-act="ludus" title="Voir les gladiateurs de votre ludus">🏺 Mon ludus (${v.players[me].ludusCount})</button>
      <button class="btn small" data-act="fosse" title="Voir la fosse">☠ Fosse (${f.gladiators.length + f.tactics.length})</button>`);
  }

  // ============================== barre d'action ==============================
  function renderPromptBar(v, p) {
    const bar = $('#promptbar');
    const me = v.seat;
    let text = '', btns = '', act = false;
    if (v.over) { text = `<b>Partie terminée.</b> ${esc(v.endReason)}`; }
    else if (p && p.kind === 'choice' && p.mode === 'prep') {
      act = true;
      const pass = p.options.find(o => o.type === 'pass' || o.type === 'end');
      text = `<b>Préparation</b> — vous avez ${coin} <b>${p.deniers}</b>. Achetez une carte du Forum (cliquez-la), utilisez une carte <b>⚙</b> de votre main, ou passez.${p.allowance > 1 ? ` <i>(1ᵉʳ tour de la manche 1 : 2 achats possibles${p.bought ? ', 1 déjà fait' : ''})</i>` : ''}`;
      btns = `<button class="btn ${p.bought ? 'primary' : ''}" data-act="opt" data-opt="${pass.id}">${esc(pass.label)}</button>`;
    } else if (p && p.kind === 'choice' && p.mode === 'place') {
      act = true;
      const pass = p.options.find(o => o.type === 'pass');
      text = `<b>Tactiques</b> — ${UI.selected ? 'cliquez sur un emplacement libre de votre côté (ou glissez la carte).' : 'cliquez une tactique de votre main pour la placer <b>face cachée</b> dans le Colisée.'}`;
      btns = `<button class="btn" data-act="opt" data-opt="${pass.id}">${esc(pass.label)}</button>`;
    } else if (p && p.kind === 'ack' && p.mode === 'edict') {
      act = true; text = `<b>${esc(p.title)}</b> — cliquez « J'ai lu » dans la fenêtre pour continuer.`;
    } else if (p && p.kind === 'ack') {
      act = true; text = `<b>${esc(p.title)}</b>`; btns = `<button class="btn primary" data-act="ack">${esc(p.button || 'Continuer')}</button>`;
    } else if (p) { act = true; text = `<b>${esc(p.title || 'À vous de jouer')}</b>`; }
    else {
      const who = v.waiting.filter(s => s !== me);
      const last = v.log.length ? v.log[v.log.length - 1].text : '';
      text = (who.length ? `<span class="spinner"></span> En attente de ${nameSpan(v, who[0])}… ` : `<span class="spinner"></span> ${esc(phaseLabel(v))}… `) + `<span class="last">${esc(last)}</span>`;
    }
    bar.className = act ? 'act' : '';
    setHTML('promptbar', bar, `<div class="pt">${text}</div>${btns}`);
  }

  // ============================== journal ==============================
  function renderLog(v) {
    const L = v.log; const last = L.length ? L[L.length - 1].n : 0;
    if (last === UI.logN && UI.logLen === L.length) return;
    UI.logN = last; UI.logLen = L.length;
    const names = v.players.map(p => p.name).filter(n => n && n.length > 1);
    const re = names.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + names.map(reEsc).sort((a, b) => b.length - a.length).join('|') + ')(?![\\p{L}\\p{N}])', 'gu') : null;
    const colorOf = {}; v.players.forEach(p => { colorOf[p.name] = p.color; });
    const wrap = $('#log-wrap');
    const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 40;
    $('#log').innerHTML = L.map(l => {
      let t = esc(l.text);
      if (re) t = t.replace(re, m => `<span class="n${ccls(colorOf[m] || '')}">${m}</span>`);
      const cls = l.text.startsWith('══') ? 'sep' : l.text.startsWith('★') ? 'win' : l.text.startsWith('—') ? 'hd' : '';
      return `<div class="ll ${cls}">${t.replace(/^══ (.*) ══$/, '$1')}</div>`;
    }).join('');
    if (atBottom || UI.logFirst) { wrap.scrollTop = wrap.scrollHeight; UI.logFirst = false; }
  }

  // ============================== aperçu flottant ==============================
  function showPreview(el) {
    const box = $('#preview'); if (!box) return;
    const def = el.dataset.def, back = el.dataset.back, ed = el.dataset.edict;
    let html = '', land = false;
    const big = (inner, cls, ratio) => TH() ? `<div class="card ${cls}" style="--w:100%">${inner}</div>` : inner.replace('<img ', `<img style="aspect-ratio:${ratio}" `);
    if (ed) {
      html = `${big(edictImg(ed, true), 'edict', '820/586')}<div class="cap"><b>${esc(EDICTS[ed].name)}</b><br>Édit de l'Empereur (la ligne de la manche en cours s'applique)</div>`; land = true;
    } else if (back) {
      html = `${big(backImg(back), '', '520/727')}<div class="cap"><b>${back === 'tactic' ? 'Tactique' : 'Gladiateur'}</b><br>Face cachée</div>`;
    } else if (def) {
      const d = CARDS[def];
      let meta = d.type === 'tactic' ? `Tactique · ${d.price} denier(s)` : `${RANKS[d.rank].label} · puissance ${d.power}${d.avantage ? ' (Avantage)' : ''}`;
      if (d.advanced) meta += ' · carte avancée';
      html = `${big(faceImg(def, true), '', '520/727')}<div class="cap"><b>${esc(d.name)}</b><br>${meta}</div>`;
    } else return;
    box.className = 'show' + (land ? ' land' : '');
    box.innerHTML = html;
    const r = el.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
    let x = r.right + 14;
    if (x + bw > window.innerWidth - 8) x = r.left - bw - 14;
    if (x < 8) x = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));
    let y = r.top + r.height / 2 - bh / 2;
    y = Math.max(8, Math.min(window.innerHeight - bh - 8, y));
    if (r.top + r.height / 2 > window.innerHeight - 140) y = Math.max(8, window.innerHeight - bh - 8);
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }
  function hidePreview() { const box = $('#preview'); if (box) box.className = ''; UI.hoverEl = null; }

  // ============================== bannière / toasts ==============================
  function showBanner(v) {
    let t = '', sub = '';
    if (v.phase === 'renewal' && v.step === 'emperor') { t = `Manche ${v.round}`; sub = v.round > 1 ? `L'Empereur avance à la marche ${v.round}` : 'Que les jeux commencent !'; }
    else if (v.phase === 'preparation') { t = 'Préparation'; sub = 'Achetez gladiateurs et tactiques au Forum'; }
    else if (v.phase === 'reveal' && v.step === 'draw') { t = 'Révélation'; sub = 'Les gladiateurs entrent dans le Colisée'; }
    else if (v.phase === 'reveal' && v.step === 'tactics') { t = 'Tactiques'; sub = 'Placez vos tactiques face cachée'; }
    else if (v.phase === 'combat') { t = 'Combat !'; sub = ''; }
    else if (v.phase === 'rewards' && v.step === 'victory') { t = 'Récompenses'; sub = ''; }
    else return;
    const b = $('#banner'); b.innerHTML = `${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  let toastT = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

  // ============================== fenêtres ==============================
  function openModal(html, o) {
    o = o || {};
    const el = document.createElement('div');
    el.className = 'modal-backdrop' + (o.light ? ' light' : '') + (o.dock ? ' dock' : '');
    el.dataset.mid = o.id || '';
    el.innerHTML = `<div class="modal ${o.cls || ''}" ${o.style ? `style="${o.style}"` : ''}>${html}</div>`;
    if (o.closable !== false) el.addEventListener('mousedown', e => { if (e.target === el) closeModal(el); });
    $('#overlay-root').appendChild(el);
    return el;
  }
  function closeModal(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
  function closeAll(filter) { $$('#overlay-root .modal-backdrop').forEach(m => { if (!filter || filter(m)) closeModal(m); }); }

  // ---------- fenêtre liée à une question du moteur ----------
  function renderPromptModal(v, p) {
    const existing = $('#overlay-root .modal-backdrop[data-mid="prompt"]');
    const needs = p && (p.kind === 'cards' || p.kind === 'number' || (p.kind === 'ack' && p.mode === 'edict') || (p.kind === 'choice' && !['prep', 'place'].includes(p.mode)));
    const DOCK = ['zone', 'slot', 'seat', 'order'];
    const dock = !!(p && p.kind === 'choice' && DOCK.includes(p.mode));
    if (!needs) { if (existing) closeModal(existing); UI.promptPid = null; return; }
    if (existing && UI.promptPid === p.id) return;
    if (existing) closeModal(existing);
    UI.promptPid = p.id; UI.pickSel = new Set(); UI.numVal = p.kind === 'number' ? (p.default || p.min) : 0;
    let html = '', light = false, cls = '';
    if (p.kind === 'ack') {
      const e = v.edict;
      cls = 'edict-big';
      html = `<h2>📜 ${esc(p.title)}</h2><div class="card edict" data-edict="${e.def}">${edictImg(e.def, true)}</div>
        <div class="now"><b>Effet pour la manche ${v.round} :</b>${esc(e.text)}</div>
        <div class="row center" style="margin-top:12px"><button class="btn primary big" style="justify-content:center;min-width:220px" data-act="ack">${esc(p.button || 'J\'ai lu')}</button></div>`;
    } else if (p.kind === 'cards') {
      const reward = p.source === 'reward';
      const cards = p.cards.map(c => cardHTML(c.def, { uid: c.uid, big: reward, attrs: `data-act="pick" data-uid="${c.uid}"` })).join('');
      html = `<h2>${esc(p.title)}</h2>
        ${p.source === 'ludus' && p.owner != null && p.owner !== v.seat ? '<p>Voici le ludus de votre adversaire.</p>' : ''}
        ${p.reinforce ? '<p>Les gladiateurs en renfort ajoutent leur puissance initiale à celui-ci, puis reviennent au ludus après le combat.</p>' : ''}
        <div class="cardgrid ${reward ? 'big' : ''}" id="pick-grid">${cards}</div>
        <div class="pick-foot"><span id="pick-count"></span><span class="row">${p.min === 0 ? `<button class="btn" data-act="pick-none">${reward ? 'Ne rien recruter' : 'Aucun'}</button>` : ''}<button class="btn primary" data-act="pick-ok" id="pick-ok">${reward ? 'Recruter la carte choisie' : 'Valider'}</button></span></div>`;
    } else if (p.kind === 'number') {
      html = `<h2>${esc(p.title)}</h2><div class="numrow"><button class="btn" data-act="num" data-d="-1">−</button><span id="numval">${UI.numVal}</span><button class="btn" data-act="num" data-d="1">+</button></div>
        <p style="text-align:center;color:var(--muted)">Entre ${p.min} et ${p.max} deniers</p>
        <div class="row center"><button class="btn" data-act="num-max">Tout</button><button class="btn primary" data-act="num-ok">Valider</button></div>`;
    } else if (p.mode === 'toss') {
      html = `<h2>Qui commence ?</h2><p>${esc(p.text || '')}</p><p>L'un des poings contient le <b>sesterce</b> (premier laniste), l'autre un denier. Choisissez !</p>
        <div class="row center" style="margin-top:14px">${p.options.map(o => `<button class="btn big" style="font-size:22px;justify-content:center;min-width:200px" data-act="opt" data-opt="${o.id}">${esc(o.label)}</button>`).join('')}</div>`;
    } else if (p.mode === 'quarter') {
      html = `<h2>${esc(p.title)}</h2><div class="optlist">${p.options.map(o => `<button class="btn" style="border-left:6px solid ${Q_COLOR[o.id]}" data-act="opt" data-opt="${o.id}">${esc(o.label)} — ${v.forum[o.id].slots.filter(s => s.card).length} carte(s) à renouveler</button>`).join('')}</div>`;
    } else if (p.mode === 'order') {
      html = `<h2>${esc(p.title)}</h2><div class="cardgrid">${p.options.map(o => `<div><div class="card can" data-def="${o.def}" data-act="opt" data-opt="${o.id}">${faceImg(o.def)}</div><div class="cap2">${esc(o.label)}</div></div>`).join('')}</div>`;
    } else {
      light = true;
      html = `<h2>${esc(p.title)}</h2><div class="optlist">${p.options.map(o => `<button class="btn" data-act="opt" data-opt="${o.id}">${esc(o.label)}</button>`).join('')}</div>`;
    }
    if (dock) html = html.replace(/<h2>(.*?)<\/h2>/, '<h2>$1</h2><div class="dock-hint">Le plateau reste visible : regardez, puis choisissez.</div>');
    openModal(html, { id: 'prompt', closable: false, light, dock, cls });
    if (p.kind === 'cards') updatePick(p);
  }
  function updatePick(p) {
    const n = UI.pickSel.size;
    $$('#pick-grid .card').forEach(c => c.classList.toggle('sel', UI.pickSel.has(c.dataset.uid)));
    const cnt = $('#pick-count'); if (cnt) cnt.textContent = p.max > 1 || p.min !== p.max ? `Sélection : ${n} / ${p.max}${p.min ? ` (min. ${p.min})` : ''}` : (n ? 'Carte choisie' : 'Choisissez une carte');
    const ok = $('#pick-ok');
    if (ok) ok.disabled = p.source === 'reward' ? n !== 1 : !(n >= p.min && n <= p.max && (n > 0 || p.min === 0));
  }

  // ---------- fenêtres libres ----------
  function showLudus() {
    const v = UI.view; if (!v) return;
    const l = v.players[v.seat].ludus || [];
    const groups = ['legendaire', 'aguerri', 'debutant', 'depart'].map(r => ({ r, cards: l.filter(c => CARDS[c.def].rank === r) })).filter(g => g.cards.length);
    openModal(`<h2>🏺 Votre ludus (${l.length} gladiateur${l.length > 1 ? 's' : ''})</h2><p style="color:var(--muted)">L'ordre de pioche est mélangé avant chaque révélation. Vous recevez 1 denier par gladiateur à chaque manche (maximum 7).</p>
      <div class="cardgrid view">${groups.map(g => `<div class="group-h">${RANKS[g.r].label} (${g.cards.length})</div>${g.cards.map(c => cardHTML(c.def, { uid: c.uid })).join('')}`).join('') || '<p>Votre ludus est vide.</p>'}</div>
      <div class="row end"><button class="btn" data-act="close">Fermer</button></div>`, { id: 'ludus' });
  }
  function showFosse() {
    const v = UI.view; if (!v) return;
    const f = v.fosse;
    openModal(`<h2>☠ La fosse</h2><div class="cardgrid view"><div class="group-h">Gladiateurs (${f.gladiators.length})</div>${f.gladiators.map(c => cardHTML(c.def)).join('') || '<span style="color:var(--muted)">Aucun</span>'}
      <div class="group-h">Tactiques (${f.tactics.length})</div>${f.tactics.map(c => cardHTML(c.def)).join('') || '<span style="color:var(--muted)">Aucune</span>'}</div>
      <div class="row end"><button class="btn" data-act="close">Fermer</button></div>`, { id: 'fosse' });
  }
  function showGameMenu() {
    openModal(`<h2>Menu</h2><div class="optlist">
      <button class="btn" data-act="close">▶ Reprendre la partie</button>
      <button class="btn" data-act="help">📖 Règles et cartes</button>
      <label class="check"><input type="checkbox" id="opt-calc" ${UI.settings.calc ? 'checked' : ''}><span>Afficher la puissance calculée des gladiateurs<small>Aide au calcul pendant la révélation (les tactiques adverses cachées ne sont pas comptées)</small></span></label>
      <div class="field"><label for="opt-vol">🔊 Volume des sons</label><input type="range" id="opt-vol" min="0" max="100" value="${Math.round(root.LudusSfx.S.volume * 100)}"></div>
      <label class="check"><input type="checkbox" id="opt-amb" ${root.LudusSfx.S.ambient ? 'checked' : ''}><span>Ambiance de l'arène<small>Murmure lointain de la foule, très discret</small></span></label>
      <button class="btn danger" data-act="quit">🚪 Abandonner la partie</button></div>`, { id: 'gmenu' });
  }
  // ---------- achats de la manche, visibles pendant toute la phase de préparation ----------
  function renderBuys(v) {
    const box = $('#buys');
    const on = v.phase === 'preparation';
    if (box.classList.contains('on') !== on) { box.classList.toggle('on', on); UI.sizeKey = ''; }
    if (!on) { setHTML('buys', box, ''); return; }
    const grp = seat => {
      const list = v.buys[seat], mine = seat === v.seat;
      const cards = list.map(b => b.hidden
        ? cardHTML(null, { back: 'gladiator', cls: 'hid', inner: '<span class="hidtag">caché</span>' })
        : cardHTML(b.def, { uid: b.uid, cls: b.pub ? '' : '' })).join('');
      return `<div class="bgrp ${mine ? '' : 'opp'}"><span class="lab">Achats de la manche<b>${mine ? 'Vous' : esc(v.players[seat].name)}</b></span>${cards || '<span class="none">aucun achat pour l\'instant</span>'}</div>`;
    };
    setHTML('buys', box, grp(1 - v.seat) + grp(v.seat));
  }

  // ---------- annulation du dernier coup : demande à l'adversaire ----------
  function renderUndo(v) {
    const u = v.undo, ex = $('#overlay-root .modal-backdrop[data-mid="undo"]');
    const hot = UI.session.mode === 'hotseat';
    const nm = s => esc(v.players[s].name);
    if (!u) { if (ex) closeModal(ex); UI.undoKey = null; return; }
    const key = u.id + ':' + u.status + ':' + v.seat;
    if (u.status === 'refused') {
      if (ex) closeModal(ex);
      if (UI.undoToast !== u.id && (hot || u.from === v.seat)) { UI.undoToast = u.id; toast(`${v.players[u.to].name} a refusé d'annuler le coup.`); }
      UI.undoKey = key; return;
    }
    if (UI.undoKey === key && ex) return;
    if (ex) closeModal(ex);
    UI.undoKey = key;
    if (hot || u.to === v.seat) {
      openModal(`<h2>↩ Annuler le dernier coup ?</h2><p><b>${nm(u.from)}</b> demande à annuler son dernier coup (par exemple une carte jouée par erreur). ${hot ? `<b>${nm(u.to)}</b>, acceptez-vous ?` : 'Acceptez-vous ?'}</p>
        <div class="row end"><button class="btn" data-act="undo-no">Refuser</button><button class="btn primary" data-act="undo-yes">Accepter</button></div>`, { id: 'undo', closable: false });
    } else if (u.from === v.seat) {
      openModal(`<h2>↩ Annuler le dernier coup</h2><p><span class="spinner"></span> En attente de la réponse de <b>${nm(u.to)}</b>…</p>`, { id: 'undo', closable: false, light: true });
    }
  }
  function renderEnd(v) {
    if (!v.over) { UI.endShown = false; return; }
    if (UI.endShown) return;
    UI.endShown = true;
    closeAll(m => m.dataset.mid === 'prompt');
    const won = v.winner === v.seat;
    const hot = UI.session.mode === 'hotseat';
    const title = hot ? `${esc(v.players[v.winner].name)} remporte la partie !` : (won ? 'Victoire !' : 'Défaite…');
    openModal(`<div class="end-card"><div class="big">${won || hot ? '🏆' : '💀'}</div><h1>${title}</h1>
      <div class="why">${hot || won ? '' : `${esc(v.players[v.winner].name)} remporte la partie. `}${esc(v.endReason)}</div>
      <div class="row center"><button class="btn primary" data-act="rematch">⚔ Rejouer</button><button class="btn" data-act="viewboard">Voir le plateau</button><button class="btn" data-act="tomenu">Menu principal</button></div></div>`, { id: 'end', closable: false });
  }
  function renderLost(s) {
    const lost = s.connLost && !s.finished;
    const ex = $('#overlay-root .modal-backdrop[data-mid="lost"]');
    if (lost && !ex) {
      const host = s.mode === 'host';
      openModal(`<h2>Connexion perdue</h2><p>${host ? 'Votre adversaire s\'est déconnecté. Il peut rejoindre la partie avec le même code ; la partie reprendra là où elle s\'est arrêtée.' : 'La connexion avec l\'hôte est interrompue.'}</p>
        <div class="row end"><button class="btn danger" data-act="quit">Quitter la partie</button></div>`, { id: 'lost', closable: false });
    } else if (!lost && ex) closeModal(ex);
  }
  function renderPassScreen(t, s) {
    const ex = $('#overlay-root .pass-screen');
    if (t == null) { if (ex) ex.remove(); return; }
    const name = s.game.s.players[t].name;
    if (ex && ex.dataset.seat == t) return;
    if (ex) ex.remove();
    const el = document.createElement('div');
    el.className = 'pass-screen'; el.dataset.seat = t;
    el.innerHTML = `<div><div style="font-size:60px">🔒</div><h1>Au tour de ${esc(name)}</h1><p>Passez l'écran à <b>${esc(name)}</b>. Les cartes cachées de l'autre joueur ne doivent pas être visibles.</p><button class="btn primary big" style="margin:0 auto" data-act="pass-ok">Je suis ${esc(name)}</button></div>`;
    $('#overlay-root').appendChild(el);
  }

  // ---------- aide / bibliothèque ----------
  const RULES_HTML = `
    <p><b>But du jeu :</b> remporter le combat de la <b>4ᵉ manche</b> sous les yeux de l'Empereur. Chaque laniste gère un <b>ludus</b> (ses gladiateurs) et une <b>main</b> de tactiques.</p>
    <h3>Une manche, 5 phases</h3>
    <ol>
      <li><b>Renouvellement</b> — l'Empereur avance d'une marche, un nouvel <b>Édit</b> est révélé, le Forum est ravitaillé (la carte la plus proche du dépôt part au dépôt, les autres glissent, de nouvelles cartes arrivent).</li>
      <li><b>Préparation</b> — achats par tours alternés (1 carte par tour). Gladiateur : 1 / 3 / 5 deniers selon le Quartier ; tactique : prix indiqué. Vous pouvez aussi utiliser les cartes <b>⚙</b> avant d'acheter. Annoncer « rien » met fin à votre préparation. 7 tactiques maximum en main.</li>
      <li><b>Révélation</b> — vos 3 gladiateurs tirés au hasard dans le ludus entrent dans le Colisée, puis les effets <b>⚡</b> sont appliqués à tour de rôle. Ensuite, placez vos tactiques <b>face cachée</b> (1 par zone) : elles sont révélées ensemble.</li>
      <li><b>Combat</b> — dans chaque zone, la puissance la plus haute gagne le duel (égalité = pas de vainqueur, sauf <b>Avantage</b>). Celui qui gagne le plus de duels gagne le combat.</li>
      <li><b>Récompenses</b> — 1 denier par duel gagné ; le vainqueur recrute un gladiateur (Débutant, puis Aguerri, puis Légendaire) ; les perdants et les égalités meurent (compensation en deniers) ; 1 denier de subvention par gladiateur du ludus (max 7) ; le vainqueur reçoit le <b>sesterce</b> et sera premier laniste.</li>
    </ol>
    <h3>Symboles</h3>
    <ul><li><b>⚙ Préparation</b> : se joue pendant vos tours d'achat, puis la carte est défaussée.</li><li><b>∞ Continu</b> : tant que la carte est face visible dans le Colisée.</li><li><b>⚡ Révélation</b> : quand la carte apparaît face visible.</li><li><b>⚔ Combat</b> : pendant la phase de combat.</li><li><b>☠ Mort</b> : quand le gladiateur meurt dans le Colisée.</li></ul>
    <h3>Mots-clés</h3>
    <ul><li><b>Avantage</b> : à puissance égale, vous êtes considéré comme strictement supérieur (deux Avantages égaux = égalité).</li><li><b>Renfort</b> : le gladiateur renfort ajoute sa puissance initiale puis retourne au ludus ; il ne peut ni mourir ni être ciblé.</li><li><b>Recruter</b> : la carte rejoint immédiatement votre ludus.</li></ul>
    <h3>Fin de partie</h3>
    <p>Si personne ne remporte le combat de la 4ᵉ manche, les gladiateurs morts sont retirés puis on recommence Révélation + Combat jusqu'à ce qu'un laniste gagne. Variante « <b>L'Empereur en redemande</b> » : il faut remporter 2 combats une fois l'Empereur sur la marche 4.</p>`;
  function showHelp(tab) {
    tab = tab || 'rules';
    let body = '';
    if (tab === 'rules') body = `<div class="help-body">${RULES_HTML}</div>`;
    else if (tab === 'aide') body = `<div class="help-imgs"><img src="assets/cards/aide-recto.webp" alt="Aide de jeu"><img src="assets/backs/aide-verso.webp" alt="Aide de jeu (verso)"></div>`;
    else if (tab === 'edicts') body = `<div class="cardgrid view" style="max-width:900px">${Object.keys(EDICTS).map(id => `<div class="libcard"><div class="card edict" data-edict="${id}" style="--w:420px">${edictImg(id, true)}</div></div>`).join('')}</div>`;
    else {
      const f = UI.libFilter || 'all';
      const list = Object.values(CARDS).filter(d => !d.start || d.id.endsWith('rouge'))
        .filter(d => f === 'all' ? true : f === 'tactic' ? d.type === 'tactic' : f === 'gladiator' ? d.type === 'gladiator' : d.rank === f);
      const order = d => d.type === 'tactic' ? 10 : (RANKS[d.rank].order);
      list.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
      body = `<div class="libfilter">${[['all', 'Tout'], ['gladiator', 'Gladiateurs'], ['tactic', 'Tactiques'], ['depart', 'Départ'], ['debutant', 'Débutants'], ['aguerri', 'Aguerris'], ['legendaire', 'Légendaires']].map(([k, t]) => `<button class="${f === k ? 'on' : ''}" data-act="libf" data-f="${k}">${t}</button>`).join('')}</div>
        <div class="cardgrid view">${list.map(d => `<div class="libcard"><div class="card" data-def="${d.id}" style="--w:150px">${faceImg(d.id)}</div><span class="cc">${d.start ? d.copies + ' par couleur' : '×' + d.copies}${d.advanced ? ' · avancée' : ''}</span></div>`).join('')}</div>`;
    }
    const html = `<h2>📖 Règles et cartes</h2><div class="tabs-row">${[['rules', 'Résumé des règles'], ['cards', 'Toutes les cartes'], ['edicts', 'Édits de l\'Empereur'], ['aide', 'Aide de jeu']].filter(([k]) => !(k === 'aide' && TH())).map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-act="helptab" data-t="${k}">${t}</button>`).join('')}</div>${body}<div class="row end"><button class="btn" data-act="close">Fermer</button></div>`;
    const ex = $('#overlay-root .modal-backdrop[data-mid="help"]');
    if (ex) { ex.querySelector('.modal').innerHTML = html; return; }
    openModal(html, { id: 'help', style: 'width:min(96vw,1000px)' });
  }

  // ============================== événements ==============================
  function answerOpt(id) { const v = UI.view; if (v && v.prompt) { UI.session.answer(v.prompt.id, id); UI.selected = null; } }
  function updateSoundButtons() {
    const on = root.LudusSfx.S.enabled;
    const m = $('#menu-sound'); if (m) m.textContent = on ? '🔊 Sons activés' : '🔇 Sons coupés';
  }
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, v = UI.view, p = v && v.prompt;
    if (root.LudusSfx && act !== 'sound') root.LudusSfx.play('tick');
    switch (act) {
      case 'sound': {
        const Sx = root.LudusSfx; Sx.setEnabled(!Sx.S.enabled); updateSoundButtons(); if (Sx.S.enabled) Sx.play('blip');
        UI.html.hud = null; if (UI.session) render(); break;
      }
      case 'buy': {
        // sur écran tactile (pas de survol pour voir la carte) : on demande confirmation avant d'acheter
        const o = p && p.options ? p.options.find(x => x.id === el.dataset.opt) : null;
        if (o && window.matchMedia && window.matchMedia('(hover: none)').matches) {
          const img = o.def ? `<div class="card" style="--w:210px" data-def="${o.def}">${faceImg(o.def, true)}</div>` : '<p>Le gladiateur du dessus de la réserve (vous le découvrirez après l\'achat).</p>';
          openModal(`<h2>Acheter ${o.def ? esc(CARDS[o.def].name) : 'le dessus de la réserve'} ?</h2><div class="row center">${img}</div><p style="text-align:center">Prix : ${coin} <b>${o.price}</b></p><div class="row center"><button class="btn primary" data-act="play-ok" data-opt="${o.id}">Acheter</button><button class="btn" data-act="close">Annuler</button></div>`, { id: 'confirm', light: true });
        } else answerOpt(el.dataset.opt);
        break;
      }
      case 'opt': answerOpt(el.dataset.opt); break;
      case 'hand': {
        if (!p || p.kind !== 'choice') break;
        const uid = el.dataset.uid;
        if (p.mode === 'prep') {
          const o = p.options.find(x => x.type === 'play' && x.uid === uid);
          if (o) {
            const d = CARDS[o.def];
            openModal(`<h2>Utiliser ${esc(d.name)} ?</h2><div class="row center"><div class="card" style="--w:170px" data-def="${o.def}">${faceImg(o.def)}</div></div><p style="text-align:center">La carte sera défaussée après application de son effet.</p><div class="row center"><button class="btn primary" data-act="play-ok" data-opt="${o.id}">Utiliser</button><button class="btn" data-act="close">Annuler</button></div>`, { id: 'confirm', light: true });
          }
        } else if (p.mode === 'place') { UI.selected = UI.selected === uid ? null : uid; UI.tab = 'colisee'; render(); }
        break;
      }
      case 'play-ok': closeAll(m => m.dataset.mid === 'confirm'); answerOpt(el.dataset.opt); break;
      case 'place': {
        if (p && p.mode === 'place' && UI.selected) { const o = p.options.find(x => x.type === 'place' && x.uid === UI.selected && x.z === Number(el.dataset.z)); if (o) answerOpt(o.id); }
        break;
      }
      case 'undo': if (v && v.canUndo) UI.session.requestUndo(v.seat); break;
      case 'undo-yes': UI.session.answerUndo(true); break;
      case 'undo-no': UI.session.answerUndo(false); break;
      case 'ack': if (p && p.kind === 'ack') UI.session.answer(p.id, true); break;
      case 'pick': {
        const uid = el.dataset.uid;
        if (UI.pickSel.has(uid)) UI.pickSel.delete(uid);
        else { if (p.max === 1) UI.pickSel.clear(); if (UI.pickSel.size < p.max) UI.pickSel.add(uid); }
        updatePick(p); break;
      }
      case 'pick-ok': if (p && p.kind === 'cards') UI.session.answer(p.id, Array.from(UI.pickSel)); break;
      case 'pick-none': if (p && p.kind === 'cards') UI.session.answer(p.id, []); break;
      case 'num': { const d = Number(el.dataset.d); UI.numVal = Math.max(p.min, Math.min(p.max, UI.numVal + d)); $('#numval').textContent = UI.numVal; break; }
      case 'num-max': UI.numVal = p.max; $('#numval').textContent = UI.numVal; break;
      case 'num-ok': if (p && p.kind === 'number') UI.session.answer(p.id, UI.numVal); break;
      case 'ludus': showLudus(); break;
      case 'fosse': showFosse(); break;
      case 'menu': showGameMenu(); break;
      case 'help': showHelp('rules'); break;
      case 'helptab': showHelp(el.dataset.t); break;
      case 'libf': UI.libFilter = el.dataset.f; showHelp('cards'); break;
      case 'log': $('#logdrawer').classList.toggle('open'); break;
      case 'close': closeModal(el.closest('.modal-backdrop')); break;
      case 'pass-ok': UI.session.confirmPass(); break;
      case 'quit': if (confirm('Abandonner la partie en cours ?')) { closeAll(); root.LudusApp.toMenu(); } break;
      case 'rematch': root.LudusApp.rematch(); break;
      case 'viewboard': closeModal(el.closest('.modal-backdrop')); break;
      case 'tomenu': closeAll(); root.LudusApp.toMenu(); break;
    }
  }
  function init() {
    document.addEventListener('click', onClick);
    let raf = 0;
    document.addEventListener('mousemove', e => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = e.target.closest && e.target.closest(HOVER_SEL);
        if (!t) { if (UI.hoverEl) hidePreview(); return; }
        if (t !== UI.hoverEl) { UI.hoverEl = t; showPreview(t); }
      });
    });
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { UI.tab = b.dataset.tab; render(); } });
    document.addEventListener('input', e => { if (e.target.id === 'opt-vol') root.LudusSfx.setVolume(Number(e.target.value) / 100); });
    document.addEventListener('change', e => {
      if (e.target.id === 'opt-vol') root.LudusSfx.play('clash', 0, 0.6);
      if (e.target.id === 'opt-amb') root.LudusSfx.setAmbient(e.target.checked);
    });
    updateSoundButtons();
    document.addEventListener('change', e => { if (e.target.id === 'opt-calc') { UI.settings.calc = e.target.checked; try { localStorage.setItem('ludus.calc', e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } render(); } });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const d = $('#logdrawer'); if (d.classList.contains('open')) { d.classList.remove('open'); return; }
      const ms = $$('#overlay-root .modal-backdrop').filter(m => !['prompt', 'end', 'lost'].includes(m.dataset.mid));
      if (ms.length) closeModal(ms[ms.length - 1]);
    });
    // glisser-déposer d'une tactique de la main vers un emplacement
    document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.hcard[data-uid]'); if (c) { UI.selected = c.dataset.uid; try { e.dataTransfer.setData('text/plain', c.dataset.uid); } catch (x) { /* ignore */ } setTimeout(render, 0); } });
    document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('.gslot.target')) e.preventDefault(); });
    document.addEventListener('drop', e => { const t = e.target.closest && e.target.closest('.gslot.target'); if (t) { e.preventDefault(); t.click(); } });
    window.addEventListener('resize', () => { UI.refit = true; UI.sizeKey = ''; UI.html.forum = UI.html.colisee = null; render(); });
    try { UI.settings.calc = localStorage.getItem('ludus.calc') !== '0'; } catch (e) { /* ignore */ }
  }

  function attach(session) {
    UI.session = session; UI.view = null; UI.tab = 'forum'; UI.autoKey = ''; UI.logN = -1; UI.logLen = -1; UI.logFirst = true; UI.endShown = false; UI.selected = null; UI.promptPid = null; UI.lastPromptId = null; UI.html = {};
    if (UI.unsub) UI.unsub();
    UI.unsub = session.onChange(() => render());
    $('#logdrawer').classList.remove('open');
    $('#log').innerHTML = '';
    hidePreview();
    if (root.LudusSfx) { root.LudusSfx.reset(); root.LudusSfx.startAmbient(); }
    UI.refit = true; UI.sizeKey = '';
    render(); setTimeout(() => { UI.refit = true; UI.sizeKey = ''; UI.html.forum = UI.html.colisee = null; render(); }, 60);
  }
  function detach() { if (root.LudusSfx) root.LudusSfx.stopAmbient(); if (UI.unsub) UI.unsub(); UI.unsub = null; UI.session = null; closeAll(); $('#overlay-root').innerHTML = ''; hidePreview(); }

  root.LudusUI = { init, attach, detach, openModal, closeModal, closeAll, toast, showHelp, layout, UI };
})(typeof window !== 'undefined' ? window : globalThis);
