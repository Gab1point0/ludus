/* POKÉ-LUDUS — thème Pokémon de LUDUS (fan-made, non officiel).
   Remplace les noms, les visuels et le vocabulaire ; les règles et le moteur restent ceux de LUDUS.
   Les images ne sont PAS copiées dans le projet : elles sont chargées depuis le dépôt public PokeAPI/sprites. */
(function (root) {
  'use strict';
  const D = root.LudusData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const { CARDS, RANKS, QUARTIERS, EDICTS } = D;

  // images copiées dans le projet (assets/poke/), issues de PokeAPI/sprites
  const ART = id => `assets/poke/pokemon/${id}.webp?v=5`;
  // objets : illustrations Gemini (webp) quand elles existent, sinon sprite PokeAPI (png)
  const HD_ITEMS = new Set(['protein', 'pokemon-box-link', 'tm-case', 'focus-sash', 'storage-key', 'shell-bell', 'poke-ball', 'choice-band', 'fire-stone', 'ultra-ball', 'quick-ball', 'master-ball', 'officier-jenny']);
  const ITEM = n => (HD_ITEMS.has(n) ? `assets/poke/items/${n}.webp?v=5` : `assets/poke/items/${n}.png`);
  const TYPE_COLOR = { Normal: '#A8A878', Feu: '#F08030', Eau: '#6890F0', 'Électrik': '#F8D030', Plante: '#78C850', Glace: '#98D8D8', Combat: '#C03028', Poison: '#A040A0', Sol: '#E0C068', Vol: '#A890F0', Psy: '#F85888', Insecte: '#A8B820', Roche: '#B8A038', Spectre: '#705898', Dragon: '#7038F8', 'Ténèbres': '#705848', Acier: '#B8B8D0', 'Fée': '#EE99AC' };

  // ---------- gladiateurs -> Pokémon (nom français, n° du Pokédex, types, lien avec l'effet) ----------
  const POKEMON = {
    'provocator-rouge': [4, 'Salamèche', ['Feu'], 'Starter de Pokémon Rouge : il gagne en puissance à chaque étape de la Ligue (évolution).'],
    'provocator-bleu': [7, 'Carapuce', ['Eau'], 'Starter de Pokémon Bleu : il gagne en puissance à chaque étape de la Ligue (évolution).'],
    thraex: [66, 'Machoc', ['Combat'], '« Machoc s\'entraîne sans relâche ! »'],
    hoplomaque: [81, 'Magnéti', ['Électrik', 'Acier'], 'Il s\'évolue et s\'unit en groupe : plus ils sont nombreux, plus ils sont forts (Magnéton).'],
    caesarianus: [52, 'Miaouss', ['Normal'], 'Sa capacité Jackpot lui fait gagner des Poké Dollars.'],
    gallus: [25, 'Pikachu', ['Électrik'], 'La star de l\'Arène : il brille au centre de la scène.'],
    gladiatrix: [133, 'Évoli', ['Normal'], 'Adaptable, il l\'emporte toujours de justesse (Avantage).'],
    munifex: [263, 'Zigzaton', ['Normal'], 'Sa capacité Ramassage récupère les objets laissés sur le terrain.'],
    samnite: [19, 'Rattata', ['Normal'], 'Costaud pour un Rattata, mais intimidé par les Pokémon Starter.'],
    andabata: [143, 'Ronflex', ['Normal'], 'Son poids écrase les alliés voisins.'],
    laquearius: [97, 'Hypnomade', ['Psy'], 'Il hypnotise et capture son adversaire.'],
    murmillo: [67, 'Machopeur', ['Combat'], '« Machopeur ne recule jamais ! »'],
    nobile: [53, 'Persian', ['Normal'], 'Le noble félin : quand il tombe, il laisse une fortune (Jackpot).'],
    pegma: [870, 'Hexadron', ['Combat'], 'Sa formation en phalange rassemble jusqu\'à 5 alliés autour de lui.'],
    retiarius: [168, 'Migalos', ['Insecte', 'Poison'], 'Il piège ses adversaires dans sa toile.'],
    veneficus: [101, 'Électrode', ['Électrik'], 'Il explose quand il perd : l\'égalité est provoquée.'],
    crupellarius: [486, 'Regigigas', ['Normal'], 'Légendaire colossal : il écrase les objets adverses.'],
    dimacherus: [150, 'Mewtwo', ['Psy'], 'Légendaire amplificateur : les bonus et malus sont doublés.'],
    eques: [647, 'Keldeo', ['Eau', 'Combat'], 'Le Légendaire cavalier : il chasse les autres Légendaires.'],
    essedarius: [251, 'Celebi', ['Psy', 'Plante'], 'Légendaire de la forêt : il revitalise ses voisins.'],
    sagittarius: [249, 'Lugia', ['Psy', 'Vol'], 'Légendaire protecteur : il prend un allié sous son aile.'],
    scissor: [649, 'Genesect', ['Insecte', 'Acier'], 'Légendaire cybernétique : il neutralise les capacités adverses.'],
    secutor: [383, 'Groudon', ['Sol'], '« Le Légendaire qui fait trembler la terre. »'],
  };
  // ---------- tactiques -> objets / personnages ----------
  // [nom, ('item', sprite d'objet) ou ('dex', n° Pokédex), lien avec l'effet]
  const OBJECTS = {
    pugio: ['Protéine', 'item', 'protein', 'Une vitamine : +1 de puissance.'],
    'a-la-fosse': ['Envoyer au PC', 'item', 'pokemon-box-link', 'On range un Pokémon dans le PC : il quitte l\'équipe.'],
    convoi: ['Livraison du Poké Marché', 'item', 'tm-case', 'Le camion de livraison renouvelle un rayon entier.'],
    missio: ['Ceinture Force', 'item', 'focus-sash', 'Le Pokémon tient bon : il ne sera pas mis K.O.'],
    'clef-de-la-fosse': ['Accès au PC', 'item', 'storage-key', 'On récupère un objet rangé dans le PC.'],
    complices: ['Team Rocket', 'img', 'assets/poke/items/team-rocket.webp?v=5','Les complices de la Team Rocket : à payer pour qu\'ils aident.'],
    datura: ['Cloche Écho', 'item', 'shell-bell', 'L\'écho répète les effets du Pokémon une seconde fois.'],
    dispense: ['Poké Ball', 'item', 'poke-ball', 'On rappelle le Pokémon et on en envoie un autre.'],
    'lion-apprivoise': ['Bandeau Choix', 'item', 'choice-band', 'Un grand boost de puissance (+2).'],
    promotion: ['Pierre Évolution', 'item', 'fire-stone', 'Le Pokémon évolue au rang supérieur.'],
    repositionnement: ['Changement de Pokémon', 'item', 'ultra-ball', 'On échange les places de ses Pokémon dans l\'Arène.'],
    reservation: ['Rapide Ball', 'item', 'quick-ball', 'Ball ultra-rapide : on envoie un Pokémon précis dans l\'Arène.'],
    'summa-rudis': ['Officier Jenny', 'item', 'officier-jenny', 'La police de la ville (ici avec son Caninos) : personne n\'intervient dans cette zone.'],
    transfert: ['Échange Pokémon', 'item', 'master-ball', 'On échange un Pokémon avec son adversaire.'],
  };
  const EDICT_THEME = {
    destockage: ['Soldes au Poké Marché', '🛒'], 'prime-tactique': ['Bonus Objets', '🎁'], 'prime-de-victoire': ['Prix de la Ligue', '🏆'],
    requisition: ['Raid de la Team Rocket', '🚀'], austerite: ['Pénurie au Poké Marché', '📉'], 'nouvelle-recrue': ['Éclosion d\'Œufs', '🥚'],
    'echange-force': ['Échange Surprise', '🔄'], 'vente-forcee': ['Revente forcée', '💰'], encouragement: ['Cri d\'Encouragement', '📣'],
    'puissance-brute': ['Combat sans Talents', '🚫'], 'effets-decisifs': ['Défi Niveau 1', '1️⃣'], 'soif-de-sang': ['Match à Mort Subite', '💀'],
  };

  // ---------- vocabulaire : LUDUS -> Pokémon (appliqué à tous les textes affichés) ----------
  const L = '(?<![\\p{L}\\p{N}_])', R = '(?![\\p{L}\\p{N}_])';
  function cap(m, s) { return m[0] !== m[0].toLowerCase() && s ? s[0].toUpperCase() + s.slice(1) : s; }
  const rule = (pat, rep, flags) => [new RegExp(L + pat + R, flags || 'giu'), (m) => cap(m, rep)];
  const LEX = [
    rule("du Colisée", "de l'Arène"), rule("au Colisée", "à l'Arène"), rule("le Colisée", "l'Arène"), rule("ce Colisée", "cette Arène"), rule('Colisée', 'Arène'),
    rule("Édits? de l'Empereur", "Décret du Maître de la Ligue"), rule("de l'Empereur", "du Maître de la Ligue"), rule("à l'Empereur", "au Maître de la Ligue"),
    rule("l'Empereur", "le Maître de la Ligue"), rule('Empereur', 'Maître de la Ligue'),
    rule('Édits', 'Décrets'), rule('Édit', 'Décret'),
    rule('À LA FOSSE ?!?', 'Envoyer au PC'), rule('CLEF DE LA FOSSE', 'Accès au PC'),
    rule('à la fosse', 'au PC'), rule('de la fosse', 'du PC'), rule('dans la fosse', 'dans le PC'), rule('la fosse', 'le PC'), rule('fosse', 'PC'),
    rule('le ludus', "l'équipe", 'gu'), rule('du ludus', "de l'équipe", 'gu'), rule('au ludus', "à l'équipe", 'gu'), rule('un ludus', 'une équipe', 'gu'), rule('ce ludus', 'cette équipe', 'gu'), rule('ludus', 'équipe', 'gu'),
    rule('gladiateur\\(s\\)', 'Pokémon'), rule('gladiateurs?', 'Pokémon'),
    rule('lanistes', 'Dresseurs'), rule('laniste', 'Dresseur'),
    rule('Forum', 'Poké Marché', 'gu'),
    rule('Quartiers', 'Rayons'), rule('Quartier', 'Rayon'),
    rule('tactiques', 'cartes Objet', 'gu'), rule('tactique', 'carte Objet', 'gu'), rule('Tactiques', 'Objets', 'gu'), rule('Tactique', 'Objet', 'gu'),
    [new RegExp('(\\d+) ?deniers?(?:\\(s\\))?', 'giu'), (m, n) => n + ' ₽'],
    [/(\d+) d\.(?![\p{L}])/gu, (m, n) => n + ' ₽'], rule('deniers?(?:\\(s\\))?', '₽'),
    rule('sesterce', 'Badge'),
    rule('de Départ', 'Starter'), rule('Départ', 'Starter'),
    rule('Débutants', 'Basiques'), rule('Débutant', 'Basique'), rule('Aguerris', 'Évolués'), rule('Aguerri', 'Évolué'),
    [/recrut/giu, (m) => (m[0] === 'R' ? 'Captur' : 'captur')],
    rule('meurent', 'sont K.O.'), rule('meurt', 'est K.O.'), rule('mourir', 'être K.O.'), rule('morts', 'K.O.'),
    rule('manches?', 'étape'),
  ];
  // pictogrammes de LUDUS -> pictogrammes Pokémon ( = pastille Poké Ball dessinée en CSS, voir walk())
  const EMOJI = [['⚔️', '🏟️'], ['🏛️', '🛒'], ['🛡️', '🥋'], ['🛡', '🥋'], ['🏺', ''], ['🃏', '🎴'], ['💀', '💫'], ['☠', '💫'], ['⚔', '💥'], ['⚙️', '🎒'], ['⚙', '🎒'], ['⚡', '✨']];
  let NAMEREPS = [];      // noms de cartes écrits en MAJUSCULES dans les textes d'effets (ex. « X HOPLOMAQUE ») -> nom Pokémon
  function lex(s) {
    for (const [re, f] of NAMEREPS) s = s.replace(re, f);
    for (const [re, f] of LEX) s = s.replace(re, f);
    for (const [a, b] of EMOJI) if (s.includes(a)) s = s.split(a).join(b);
    return s;
  }

  // ---------- starters au choix : [clé, n° Pokédex, nom, type] ----------
  const STARTERS = [
    ['bulbizarre', 1, 'Bulbizarre', 'Plante'], ['salameche', 4, 'Salamèche', 'Feu'], ['carapuce', 7, 'Carapuce', 'Eau'],
    ['germignon', 152, 'Germignon', 'Plante'], ['hericendre', 155, 'Héricendre', 'Feu'], ['kaiminus', 158, 'Kaiminus', 'Eau'],
    ['arcko', 252, 'Arcko', 'Plante'], ['poussifeu', 255, 'Poussifeu', 'Feu'], ['gobou', 258, 'Gobou', 'Eau'],
    ['tortipouss', 387, 'Tortipouss', 'Plante'], ['ouisticram', 390, 'Ouisticram', 'Feu'], ['tiplouf', 393, 'Tiplouf', 'Eau'],
    ['vipelierre', 495, 'Vipélierre', 'Plante'], ['gruikui', 498, 'Gruikui', 'Feu'], ['moustillon', 501, 'Moustillon', 'Eau'],
    ['marisson', 650, 'Marisson', 'Plante'], ['feunnec', 653, 'Feunnec', 'Feu'], ['grenousse', 656, 'Grenousse', 'Eau'],
    ['brindibou', 722, 'Brindibou', 'Plante'], ['flamiaou', 725, 'Flamiaou', 'Feu'], ['otaquin', 728, 'Otaquin', 'Eau'],
    ['ouistempo', 810, 'Ouistempo', 'Plante'], ['flambino', 813, 'Flambino', 'Feu'], ['larmeleon', 816, 'Larméléon', 'Eau'],
    ['poussacha', 906, 'Poussacha', 'Plante'], ['chochodile', 909, 'Chochodile', 'Feu'], ['coiffeton', 912, 'Coiffeton', 'Eau'],
  ].map(([key, id, name, type]) => ({ key, id, name, type, color: type === 'Plante' ? 'vert' : type === 'Feu' ? 'rouge' : 'bleu' }));
  const STARTER_BY_KEY = {}; STARTERS.forEach(s => { STARTER_BY_KEY[s.key] = s; });
  const STARTER_HEX = { rouge: '#d8473d', bleu: '#3b8fe0', vert: '#3fb06a' };
  const STARTER_POKE = {};
  // chaque starter a son propre Provocator et ses 3 tactiques de départ (même règles que les cartes rouges / bleues)
  for (const s of STARTERS) {
    for (const base of ['provocator', 'a-la-fosse', 'convoi', 'pugio']) {
      const src = CARDS[base + '-rouge']; if (!src) continue;
      const id = base + '-' + s.key;
      CARDS[id] = Object.assign({}, src, { id, img: id, color: s.key, extra: true });
    }
    STARTER_POKE['provocator-' + s.key] = [s.id, s.name, [s.type], 'Ton Pokémon de départ : il gagne en puissance à chaque étape de la Ligue (évolution).'];
  }
  const colorOf = c => (STARTER_BY_KEY[c] ? STARTER_BY_KEY[c].color : c);

  // ---------- rendu des cartes ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baseOf = id => (CARDS[id] && (CARDS[id].base || id));
  const typeGrad = types => { const a = TYPE_COLOR[types[0]] || '#888', b = TYPE_COLOR[types[1] || types[0]] || a; return `--c1:${a};--c2:${b}`; };
  // cartes de départ : la couleur de la carte suit le type du starter (rouge = Feu, bleu = Eau, vert = Plante)
  const START_GRAD = { rouge: ['#f0653b', '#9d2418'], bleu: ['#4a86e8', '#1c3a8f'], vert: ['#58c46a', '#1f7137'] };
  const startGrad = c => { const g = START_GRAD[colorOf(c)]; return g ? `--c1:${g[0]};--c2:${g[1]}` : ''; };
  const iconTxt = t => esc(t).replace(/([⚡∞⚙⚔☠])/g, '<b class="pk-ic">$1</b>');
  const RANK_CLS = { depart: 'st', debutant: 'ba', aguerri: 'ev', legendaire: 'le' };
  function artImg(url, alt, cls) { return `<img class="${cls || ''}" src="${url}" alt="${esc(alt)}" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'">`; }
  function face(defId) {
    const d = CARDS[defId];
    if (d.type === 'gladiator') {
      const p = POKEMON[defId] || STARTER_POKE[defId]; if (!p) return `<div class="pk"><div class="pk-name">${esc(d.name)}</div></div>`;
      const star = d.avantage ? '<span class="pk-adv" title="Avantage">★</span>' : '';
      const txt = d.text && !/^«/.test(d.text) ? iconTxt(d.text) : `<i>${esc(p[3])}</i>`;
      return `<div class="pk pk-g" style="${d.start ? startGrad(d.color) : typeGrad(p[2])}">
        <div class="pk-top"><span class="pk-rank ${RANK_CLS[d.rank]}">${esc(RANKS[d.rank].label)}</span>${star}<span class="pk-pw" title="Puissance">${d.power}</span></div>
        <div class="pk-art">${artImg(ART(p[0]), p[1])}</div>
        <div class="pk-name">${esc(d.name)}</div>
        <div class="pk-txt"><div>${txt}</div></div></div>`;
    }
    const b = baseOf(defId), o = OBJECTS[b]; if (!o) return `<div class="pk pk-t"><div class="pk-name">${esc(d.name)}</div></div>`;
    const art = o[1] === 'dex' ? artImg(ART(o[2]), o[0]) : o[1] === 'img' ? artImg(o[2], o[0], 'pk-logo') : artImg(ITEM(o[2]), o[0], HD_ITEMS.has(o[2]) ? 'pk-item hd' : 'pk-item');
    return `<div class="pk pk-t" style="${d.start ? startGrad(d.color) : ''}">
      <div class="pk-top"><span class="pk-rank ob">Objet${d.prep ? ' · ⚙' : ''}</span><span class="pk-pw pk-price" title="Prix">₽${d.price}</span></div>
      <div class="pk-art">${art}</div>
      <div class="pk-name">${esc(d.name)}</div>
      <div class="pk-txt"><div>${iconTxt(d.text)}</div></div></div>`;
  }
  function edictFace(id) {
    const e = EDICTS[id], ic = (EDICT_THEME[id] || [])[1] || '★';
    return `<div class="pk pk-e"><div class="pk-etitle"><span>${ic}</span> ${esc(e.name)}</div><div class="pk-egrid">${e.rounds.map((t, i) => `<div><b>Étape ${i + 1}</b>${iconTxt(t)}</div>`).join('')}</div></div>`;
  }
  const backFace = kind => `<div class="pk-back pk-back-${kind === 'tactic' ? 't' : kind === 'edict' ? 'e' : 'g'}"></div>`;
  const edictIcon = id => (EDICT_THEME[id] || [])[1] || '★';

  // ---------- activation du thème ----------
  const snap = { cards: null, ranks: null, quarters: null, edicts: null };
  const T = {
    active: false, name: 'ludus', brand: 'LUDUS', face, edictFace, backFace, edictIcon, lex, aiName: 'Ordinateur', trainerName: 'Laniste',
    starters: STARTERS, starterByKey: STARTER_BY_KEY, art: ART,
    colorHex: c => STARTER_HEX[colorOf(c)] || null, colorClass: c => colorOf(c),
    // le Rival prend un starter d'un autre type que le vôtre (couleurs distinctes)
    randomRival: (myKey) => { const mine = STARTER_BY_KEY[myKey]; const pool = STARTERS.filter(s => !mine || s.color !== mine.color); return pool[Math.floor(Math.random() * pool.length)].key; },
  };
  let observer = null, busy = false;
  const ORIG = new Map();     // textes statiques de la page (menu, onglets…) à restaurer quand on revient à LUDUS
  const isStatic = n => n.parentElement && n.parentElement.closest('#menu,#tabs,#logdrawer,#hub');
  function fixText(n) {
    const v = n.data, w = lex(v);
    if (w === v) return;
    if (isStatic(n) && !ORIG.has(n)) ORIG.set(n, v);
    if (w.includes('')) {                       // pastille Poké Ball : on remplace le caractère par un petit élément
      const frag = document.createDocumentFragment();
      w.split('').forEach((part, i) => { if (i) { const b = document.createElement('span'); b.className = 'pkb'; frag.appendChild(b); } if (part) frag.appendChild(document.createTextNode(part)); });
      n.replaceWith(frag);
      return;
    }
    n.data = w;
  }
  function fixEl(el) {
    for (const a of ['title', 'alt', 'placeholder', 'aria-label']) { const v = el.getAttribute && el.getAttribute(a); if (v) { const w = lex(v); if (w !== v) el.setAttribute(a, w); } }
  }
  function walk(node) {
    if (node.nodeType === 3) { fixText(node); return; }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(node.tagName)) return;
    fixEl(node);
    node.querySelectorAll && node.querySelectorAll('[title],[alt],[placeholder],[aria-label]').forEach(fixEl);
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const all = []; let t; while ((t = tw.nextNode())) all.push(t);
    all.forEach(fixText);
  }
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(muts => {
      if (busy) return; busy = true;
      try { for (const m of muts) { if (m.type === 'childList') m.addedNodes.forEach(walk); else if (m.type === 'characterData') fixText(m.target); } } finally { observer.takeRecords(); busy = false; }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  function set(name) {
    const poke = name === 'poke';
    if (!snap.cards) {
      snap.cards = {}; Object.values(CARDS).forEach(c => { snap.cards[c.id] = c.name; });
      snap.ranks = {}; Object.values(RANKS).forEach(r => { snap.ranks[r.id] = r.label; });
      snap.quarters = {}; Object.values(QUARTIERS).forEach(q => { snap.quarters[q.id] = q.label; });
      snap.edicts = {}; Object.values(EDICTS).forEach(e => { snap.edicts[e.id] = e.name; });
    }
    T.active = poke; T.name = poke ? 'poke' : 'ludus'; T.brand = poke ? 'POKÉ-LUDUS' : 'LUDUS';
    T.aiName = poke ? 'Rival' : 'Ordinateur'; T.trainerName = poke ? 'Dresseur' : 'Laniste';
    for (const c of Object.values(CARDS)) {
      if (!poke) { c.name = snap.cards[c.id]; continue; }
      if (c.type === 'gladiator' && (POKEMON[c.id] || STARTER_POKE[c.id])) c.name = (POKEMON[c.id] || STARTER_POKE[c.id])[1];
      else if (c.type === 'tactic' && OBJECTS[c.base || c.id]) c.name = OBJECTS[c.base || c.id][0];
    }
    const RK = { depart: 'Starter', debutant: 'Basique', aguerri: 'Évolué', legendaire: 'Légendaire' };
    const QK = { tactic: 'Objets', debutant: 'Basiques', aguerri: 'Évolués', legendaire: 'Légendaires' };
    for (const r of Object.values(RANKS)) r.label = poke ? RK[r.id] : snap.ranks[r.id];
    for (const q of Object.values(QUARTIERS)) q.label = poke ? QK[q.id] : snap.quarters[q.id];
    for (const e of Object.values(EDICTS)) e.name = poke ? EDICT_THEME[e.id][0] : snap.edicts[e.id];
    NAMEREPS = [];
    if (poke) {
      const seen = new Set();
      for (const c of Object.values(CARDS)) {
        const orig = snap.cards[c.id].toUpperCase(), now = c.name.toUpperCase();
        if (orig === now || seen.has(orig) || /[ !]/.test(orig)) continue;
        seen.add(orig); NAMEREPS.push([new RegExp(L + orig + R, 'gu'), () => now]);
      }
    }
    document.body.classList.toggle('theme-poke', poke);
    document.title = poke ? 'POKÉ-LUDUS — le jeu de Dresseurs (fan-made)' : 'LUDUS — le jeu de lanistes';
    if (root.LudusSfx) root.LudusSfx.S.theme = T.name;
    if (!poke) { ORIG.forEach((v, n) => { if (n.isConnected) n.data = v; }); ORIG.clear(); document.querySelectorAll('.pkb').forEach(b => { if (b.closest('#menu,#tabs,#logdrawer,#hub')) b.replaceWith('🏺'); }); }
    const fav = document.querySelector('link[rel="icon"]');
    if (fav) fav.href = poke
      ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='28' fill='%23f4f4f4' stroke='%231b1b2a' stroke-width='5'/%3E%3Cpath d='M4 32a28 28 0 0 1 56 0z' fill='%23e63946' stroke='%231b1b2a' stroke-width='5'/%3E%3Ccircle cx='32' cy='32' r='8' fill='%23f4f4f4' stroke='%231b1b2a' stroke-width='5'/%3E%3C/svg%3E"
      : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23201813'/%3E%3Ctext x='32' y='46' font-size='38' text-anchor='middle'%3E%E2%9A%94%EF%B8%8F%3C/text%3E%3C/svg%3E";
    if (poke) { startObserver(); walk(document.body); } else stopObserver();
    // textes de marque
    const q = s => document.querySelector(s);
    if (q('#menu .menu-logo')) q('#menu .menu-logo').textContent = T.brand;
    if (q('#menu .menu-sub')) q('#menu .menu-sub').innerHTML = poke
      ? 'Devenez le Dresseur le plus puissant de Kanto.<br>Une version Pokémon de <b>LUDUS</b>, par des fans, pour le plaisir.' : 'Soyez le laniste le plus puissant de Rome.<br>Un jeu de <b>Séraphin Gaillard</b> &amp; <b>Gabin Guyot</b>';
    if (q('#menu .menu-foot')) q('#menu .menu-foot').innerHTML = poke
      ? 'Projet de fans, non officiel : Pokémon et ses personnages appartiennent à Nintendo, Game Freak et The Pokémon Company. Images : PokeAPI/sprites.' : 'Version 1.11.8 · © 2026 Séraphin Gaillard &amp; Gabin Guyot';
    if (poke) walk(document.body);
  }
  T.set = set;
  root.LudusTheme = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);

