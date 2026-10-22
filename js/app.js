/* LUDUS — menu, réglages, parties en ligne */
(function (root) {
  'use strict';
  const { LocalSession, GuestSession, Net } = root.LudusSession;
  const UI = root.LudusUI;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SPEEDS = { lente: 0.7, normale: 1, rapide: 2.2 };

  const App = { session: null, lastCfg: null, conn: null, netHandle: null, guestName: '', settings: null };

  function loadSettings() {
    const d = { name: '', name2: '', color: 'rouge', starter: 'salameche', starter2: 'carapuce', level: 'normal', advanced: true, variant: false, speed: 'normale' };
    try { Object.assign(d, JSON.parse(localStorage.getItem('ludus.settings') || '{}')); } catch (e) { /* ignore */ }
    return d;
  }
  function saveSettings() { try { localStorage.setItem('ludus.settings', JSON.stringify(App.settings)); } catch (e) { /* ignore */ } }

  function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
  function toMenu() {
    if (App.session) { App.session.stop(); App.session = null; }
    if (App.netHandle) { App.netHandle.destroy(); App.netHandle = null; }
    App.conn = null; App.lastCfg = null;
    UI.detach(); show('menu');
  }

  // ---------- éléments de formulaire ----------
  const seg = (name, items, val) => `<div class="seg" data-seg="${name}">${items.map(([k, t, cls]) => `<button type="button" data-v="${k}" class="${k === val ? 'on ' + (cls || '') : ''}">${t}</button>`).join('')}</div>`;
  const segVal = (root_, name) => { const b = $(`.seg[data-seg="${name}"] button.on`, root_); return b ? b.dataset.v : null; };
  const check = (id, checked, label, small) => `<label class="check"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span>${label}${small ? `<small>${small}</small>` : ''}</span></label>`;

  // choix de la couleur (LUDUS) ou du starter (Poké-Ludus : la couleur de la carte dépend du type Plante / Feu / Eau)
  function colorPicker(label, group, val) {
    const T = root.LudusTheme;
    if (!T.active) return `<div class="field"><span class="lab">${label}</span>${seg(group === 'starter' ? 'color' : 'color2', [['rouge', 'Rouge', 'red'], ['bleu', 'Bleu', 'blue']], group === 'starter' ? App.settings.color : val)}</div>`;
    const sel = T.starterByKey[val] ? val : T.starters[1].key;
    return `<div class="field"><span class="lab">${label} — choisissez votre starter (sa couleur : 🟢 Plante · 🔴 Feu · 🔵 Eau)</span>
      <div class="starter-grid" data-picker="${group}">${T.starters.map(s => `<button type="button" class="stb c-${s.color} ${s.key === sel ? 'on' : ''}" data-key="${s.key}" title="${s.name} (${s.type})"><img src="${T.art(s.id)}" alt="" draggable="false"><span>${s.name}</span></button>`).join('')}</div></div>`;
  }
  function optionsHTML(s, withSpeed) {
    return `${check('f-adv', s.advanced, 'Partie complète (avec les cartes avancées ⊕)', 'Décochez pour une première partie « découverte » : les cartes marquées ⊕ sont retirées.')}
      ${check('f-var', s.variant, 'Variante « L\'Empereur en redemande »', 'Il faut remporter 2 combats une fois l\'Empereur sur la marche 4.')}
      ${withSpeed ? `<div class="field"><span class="lab">Vitesse des animations</span>${seg('speed', [['lente', 'Lente'], ['normale', 'Normale'], ['rapide', 'Rapide']], s.speed)}</div>` : ''}`;
  }

  // ---------- fenêtre de réglages ----------
  function openSetup(mode) {
    const s = App.settings;
    let title = '', body = '';
    const colorField = colorPicker('Votre couleur', 'starter', s.starter);
    if (mode === 'ai') {
      title = '⚔️ Contre l\'ordinateur';
      body = `<div class="field"><label for="f-name">Votre nom</label><input type="text" id="f-name" maxlength="16" value="${esc(s.name)}" placeholder="Laniste"></div>${colorField}
        <div class="field"><span class="lab">Niveau de l'ordinateur</span>${seg('level', [['easy', 'Facile'], ['normal', 'Normal'], ['hard', 'Difficile']], s.level)}</div>${optionsHTML(s, true)}`;
    } else if (mode === 'hotseat') {
      title = '👥 Deux joueurs, même écran';
      body = `<p style="color:var(--muted)">Les joueurs se passent l'écran : un écran de transition masquera les cartes cachées entre deux tours.</p>
        <div class="field"><label for="f-name">Nom du joueur 1</label><input type="text" id="f-name" maxlength="16" value="${esc(s.name)}" placeholder="Joueur 1"></div>
        <div class="field"><label for="f-name2">Nom du joueur 2</label><input type="text" id="f-name2" maxlength="16" value="${esc(s.name2)}" placeholder="Joueur 2"></div>${colorPicker('Couleur du joueur 1', 'starter', s.starter)}${root.LudusTheme.active ? colorPicker('Joueur 2', 'starter2', s.starter2) : ''}${optionsHTML(s, true)}`;
    }
    const html = `<h2>${title}</h2>${body}<div class="row end"><button class="btn" data-app="cancel">Annuler</button><button class="btn primary" data-app="go-${mode}">Commencer la partie</button></div>`;
    UI.openModal(html, { id: 'setup' });
  }
  function readSetup(m) {
    const s = App.settings;
    const nm = $('#f-name', m); if (nm) s.name = nm.value.trim().slice(0, 16);
    const n2 = $('#f-name2', m); if (n2) s.name2 = n2.value.trim().slice(0, 16);
    const c = segVal(m, 'color'); if (c) s.color = c;
    $$('.starter-grid', m).forEach(g => { const b = $('.stb.on', g); if (b) s[g.dataset.picker] = b.dataset.key; });
    const l = segVal(m, 'level'); if (l) s.level = l;
    const sp = segVal(m, 'speed'); if (sp) s.speed = sp;
    const a = $('#f-adv', m); if (a) s.advanced = a.checked;
    const v = $('#f-var', m); if (v) s.variant = v.checked;
    saveSettings();
  }
  function cfgFrom(mode, names) {
    const s = App.settings;
    const T = root.LudusTheme;
    let colors = s.color === 'rouge' ? ['rouge', 'bleu'] : ['bleu', 'rouge'];
    if (T.active) {       // Poké-Ludus : la « couleur » est le starter choisi (la couleur de la carte suit son type)
      const mine = T.starterByKey[s.starter] ? s.starter : 'salameche';
      let other;
      if (mode === 'hotseat') other = T.starterByKey[s.starter2] ? s.starter2 : 'carapuce';
      else if (mode === 'host') other = T.starterByKey[App.guestStarter] ? App.guestStarter : T.randomRival(mine);
      else other = T.randomRival(mine);
      colors = [mine, other];
    }
    return { mode, names, colors, level: s.level, advanced: s.advanced, variant: s.variant, speed: SPEEDS[s.speed] || 1 };
  }

  // ---------- démarrage ----------
  function startLocal(cfg) {
    UI.closeAll();
    if (App.session) App.session.stop();
    App.lastCfg = cfg;
    const sess = new LocalSession(cfg);
    App.session = sess;
    show('game'); UI.attach(sess); sess.start();
  }

  // ---------- partie en ligne ----------
  function openOnline(tab) {
    tab = tab || 'create';
    const s = App.settings;
    const tabs = `<div class="tabs-row"><button class="${tab === 'create' ? 'on' : ''}" data-app="otab" data-t="create">Créer une partie</button><button class="${tab === 'join' ? 'on' : ''}" data-app="otab" data-t="join">Rejoindre une partie</button></div>`;
    let body = '';
    if (!Net.available()) body = '<p class="err">La bibliothèque de connexion en ligne n\'a pas pu être chargée.</p>';
    else if (tab === 'create') {
      body = `<p style="color:var(--muted)">Vous créez la partie et envoyez le code à votre ami. Il n'y a rien à installer : tout se passe dans le navigateur.</p>
        <div class="field"><label for="f-name">Votre nom</label><input type="text" id="f-name" maxlength="16" value="${esc(s.name)}" placeholder="Laniste"></div>
        ${colorPicker('Votre couleur', 'starter', s.starter)}${optionsHTML(s, true)}
        <div id="online-status"></div>
        <div class="row end"><button class="btn" data-app="cancel">Annuler</button><button class="btn primary" data-app="host-create" id="btn-host">Créer la partie</button></div>`;
    } else {
      body = `<p style="color:var(--muted)">Demandez le code à 5 caractères à votre ami (il apparaît quand il crée la partie).</p>
        <div class="field"><label for="f-name">Votre nom</label><input type="text" id="f-name" maxlength="16" value="${esc(s.name)}" placeholder="Laniste"></div>
        <div class="field"><label for="f-code">Code de la partie</label><input type="text" id="f-code" maxlength="5" placeholder="ABCDE" style="text-transform:uppercase;letter-spacing:.3em;font-size:24px;text-align:center"></div>
        ${root.LudusTheme.active ? colorPicker('Votre couleur', 'starter', s.starter) : ''}
        <div id="online-status"></div>
        <div class="row end"><button class="btn" data-app="cancel">Annuler</button><button class="btn primary" data-app="join-go" id="btn-join">Rejoindre</button></div>`;
    }
    const html = `<h2>🌐 Jouer en ligne</h2>${tabs}${body}`;
    const ex = $('#overlay-root .modal-backdrop[data-mid="online"]');
    if (ex) ex.querySelector('.modal').innerHTML = html; else UI.openModal(html, { id: 'online' });
  }
  function setStatus(html) { const e = $('#online-status'); if (e) e.innerHTML = html; }

  function hostCreate() {
    const m = $('#overlay-root .modal-backdrop[data-mid="online"]');
    readSetup(m);
    const btn = $('#btn-host'); if (btn) btn.disabled = true;
    setStatus('<p><span class="spinner"></span> Création de la salle…</p>');
    if (App.netHandle) App.netHandle.destroy();
    App.guestName = '';
    App.netHandle = Net.host({
      onCode(code) {
        setStatus(`<p>Dites à votre ami d'ouvrir le jeu, de choisir <b>« Jouer en ligne » → « Rejoindre une partie »</b> et d'entrer ce code :</p><div class="codebox" id="room-code">${code}</div>
          <p id="host-wait" style="text-align:center"><span class="spinner"></span> En attente de votre adversaire…</p>`);
        const b = $('#btn-host'); if (b) { b.textContent = 'Lancer la partie'; b.dataset.app = 'host-start'; b.disabled = true; }
      },
      onGuest(conn) {
        // reconnexion pendant une partie en cours
        if (App.session && App.session.mode === 'host' && !App.session.finished) {
          conn.on('data', msg => { if (msg && msg.t === 'hello') { conn.send({ t: 'start', theme: root.LudusTheme.name }); App.session.attach(conn); App.conn = conn; } });
          return;
        }
        if (App.conn && App.conn.open) { conn.on('open', () => conn.close()); return; }
        App.conn = conn;
        conn.on('data', msg => {
          if (msg && msg.t === 'hello') {
            App.guestName = String(msg.name || 'Invité').slice(0, 16);
            App.guestStarter = msg.starter || null;
            const w = $('#host-wait'); if (w) w.innerHTML = `✅ <b>${esc(App.guestName)}</b> est connecté.`;
            const b = $('#btn-host'); if (b) b.disabled = false;
            try { conn.send({ t: 'welcome', host: App.settings.name || 'Hôte' }); } catch (e) { /* ignore */ }
          }
        });
        conn.on('close', () => { if (!App.session || App.session.finished) { const w = $('#host-wait'); if (w) w.innerHTML = '<span class="spinner"></span> L\'adversaire s\'est déconnecté, en attente…'; const b = $('#btn-host'); if (b) b.disabled = true; App.conn = null; } });
      },
      onError(msg) { setStatus(`<p class="err">${esc(msg)}</p>`); const b = $('#btn-host'); if (b) { b.disabled = false; b.textContent = 'Réessayer'; b.dataset.app = 'host-create'; } },
    });
  }
  function hostStart() {
    if (!App.conn || !App.conn.open) return;
    const s = App.settings;
    const hostName = s.name || 'Hôte';
    let guest = App.guestName || 'Invité';
    if (guest.toLowerCase() === hostName.toLowerCase()) guest += ' 2';
    const cfg = cfgFrom('host', [hostName, guest]);
    UI.closeAll();
    if (App.session) App.session.stop();
    App.lastCfg = cfg;
    const sess = new LocalSession(cfg);
    App.session = sess;
    App.conn.send({ t: 'start', theme: root.LudusTheme.name });
    sess.attach(App.conn);
    show('game'); UI.attach(sess); sess.start();
  }

  function joinGo() {
    const m = $('#overlay-root .modal-backdrop[data-mid="online"]');
    readSetup(m);
    const code = ($('#f-code', m).value || '').trim().toUpperCase();
    if (code.length !== 5) { setStatus('<p class="err">Le code comporte 5 caractères.</p>'); return; }
    const btn = $('#btn-join'); if (btn) btn.disabled = true;
    setStatus('<p><span class="spinner"></span> Connexion à la partie…</p>');
    if (App.netHandle) App.netHandle.destroy();
    App.netHandle = Net.join(code, {
      onOpen(conn) {
        App.conn = conn;
        conn.send({ t: 'hello', name: App.settings.name || 'Invité', starter: root.LudusTheme.active ? App.settings.starter : null });
        setStatus('<p>✅ Connecté ! <span class="spinner"></span> En attente du lancement par l\'hôte…</p>');
        conn.on('data', msg => {
          if (msg && msg.t === 'start') {
            root.LudusTheme.set(msg.theme === 'poke' ? 'poke' : 'ludus');
            UI.closeAll();
            if (App.session) App.session.stop();
            const sess = new GuestSession(conn);
            App.session = sess; App.lastCfg = { mode: 'guest' };
            show('game'); UI.attach(sess);
          }
        });
      },
      onError(msg) { setStatus(`<p class="err">${esc(msg)}</p>`); const b = $('#btn-join'); if (b) b.disabled = false; },
    });
  }

  function rematch() {
    const cfg = App.lastCfg;
    if (!cfg) { toMenu(); return; }
    if (cfg.mode === 'guest') { UI.toast('C\'est à l\'hôte de relancer la partie : patientez un instant.'); return; }
    if (cfg.mode === 'host') {
      if (!App.conn || !App.conn.open) { UI.toast('Votre adversaire n\'est plus connecté.'); return; }
      UI.closeAll();
      App.session.stop();
      const sess = new LocalSession(cfg);
      App.session = sess;
      App.conn.send({ t: 'start', theme: root.LudusTheme.name });
      sess.attach(App.conn);
      UI.attach(sess); sess.start();
      return;
    }
    startLocal(cfg);
  }

  // ---------- événements du menu ----------
  function onClick(e) {
    const hub = e.target.closest('[data-hub],[data-hub-back]');
    if (hub) {
      if (hub.dataset.hub) { root.LudusTheme.set(hub.dataset.hub); show('menu'); }
      else { root.LudusTheme.set('ludus'); show('hub'); }
      return;
    }
    const stb = e.target.closest('.stb');
    if (stb) { $$('.stb', stb.parentNode).forEach(b => b.classList.remove('on')); stb.classList.add('on'); return; }
    const el = e.target.closest('[data-action],[data-app],.seg button');
    if (!el) return;
    if (el.matches('.seg button')) {
      $$('button', el.parentNode).forEach(b => b.classList.remove('on', 'red', 'blue'));
      el.classList.add('on'); if (el.dataset.v === 'rouge') el.classList.add('red'); if (el.dataset.v === 'bleu') el.classList.add('blue');
      return;
    }
    const a = el.dataset.action || el.dataset.app;
    const modal = el.closest('.modal-backdrop');
    switch (a) {
      case 'new-ai': openSetup('ai'); break;
      case 'new-hotseat': openSetup('hotseat'); break;
      case 'new-online': openOnline('create'); break;
      case 'open-help': UI.showHelp('rules'); break;
      case 'cancel': if (App.netHandle && !App.session) { App.netHandle.destroy(); App.netHandle = null; App.conn = null; } UI.closeModal(modal); break;
      case 'go-ai': {
        readSetup(modal);
        UI.closeModal(modal);
        startLocal(cfgFrom('ai', [App.settings.name || root.LudusTheme.trainerName, root.LudusTheme.aiName]));
        break;
      }
      case 'go-hotseat': {
        readSetup(modal);
        const n1 = App.settings.name || 'Joueur 1'; let n2 = App.settings.name2 || 'Joueur 2';
        if (n2.toLowerCase() === n1.toLowerCase()) n2 += ' 2';
        UI.closeModal(modal);
        startLocal(cfgFrom('hotseat', [n1, n2]));
        break;
      }
      case 'otab': { readSetup(modal); openOnline(el.dataset.t); break; }
      case 'host-create': hostCreate(); break;
      case 'host-start': hostStart(); break;
      case 'join-go': joinGo(); break;
    }
  }

  function init() {
    App.settings = loadSettings();
    UI.init();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && $('#f-code')) joinGo(); });
    root.LudusApp = { toMenu, rematch, startLocal, state: App };
  }
  init();
})(typeof window !== 'undefined' ? window : globalThis);
