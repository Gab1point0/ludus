/* POKÃ‰-LUDUS â€” thÃ¨me PokÃ©mon de LUDUS (fan-made, non officiel).
   Remplace les noms, les visuels et le vocabulaire ; les rÃ¨gles et le moteur restent ceux de LUDUS.
   Les images ne sont PAS copiÃ©es dans le projet : elles sont chargÃ©es depuis le dÃ©pÃ´t public PokeAPI/sprites. */
(function (root) {
  'use strict';
  const D = root.LudusData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const { CARDS, RANKS, QUARTIERS, EDICTS } = D;

  const ART = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  const ITEM = n => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${n}.png`;
  const TYPE_COLOR = { Normal: '#A8A878', Feu: '#F08030', Eau: '#6890F0', 'Ã‰lectrik': '#F8D030', Plante: '#78C850', Glace: '#98D8D8', Combat: '#C03028', Poison: '#A040A0', Sol: '#E0C068', Vol: '#A890F0', Psy: '#F85888', Insecte: '#A8B820', Roche: '#B8A038', Spectre: '#705898', Dragon: '#7038F8', 'TÃ©nÃ¨bres': '#705848', Acier: '#B8B8D0', 'FÃ©e': '#EE99AC' };

  // ---------- gladiateurs -> PokÃ©mon (nom franÃ§ais, nÂ° du PokÃ©dex, types, lien avec l'effet) ----------
  const POKEMON = {
    'provocator-rouge': [4, 'SalamÃ¨che', ['Feu'], 'Starter de PokÃ©mon Rouge : il gagne en puissance Ã  chaque Ã©tape de la Ligue (Ã©volution).'],
    'provocator-bleu': [7, 'Carapuce', ['Eau'], 'Starter de PokÃ©mon Bleu : il gagne en puissance Ã  chaque Ã©tape de la Ligue (Ã©volution).'],
    thraex: [19, 'Rattata', ['Normal'], 'Â« Le PokÃ©mon des hautes herbes : on en croise partout ! Â»'],
    hoplomaque: [81, 'MagnÃ©ti', ['Ã‰lectrik', 'Acier'], 'Il s\'Ã©volue et s\'unit en groupe : plus ils sont nombreux, plus ils sont forts (MagnÃ©ton).'],
    caesarianus: [52, 'Miaouss', ['Normal'], 'Sa capacitÃ© Jackpot lui fait gagner des PokÃ© Dollars.'],
    gallus: [100, 'Voltorbe', ['Ã‰lectrik'], 'Il se cache au milieu du terrain comme une PokÃ© Ball piÃ©gÃ©e.'],
    gladiatrix: [133, 'Ã‰voli', ['Normal'], 'Adaptable, il l\'emporte toujours de justesse (Avantage).'],
    munifex: [263, 'Zigzaton', ['Normal'], 'Sa capacitÃ© Ramassage rÃ©cupÃ¨re les objets laissÃ©s sur le terrain.'],
    samnite: [66, 'Machoc', ['Combat'], 'Costaud, mais intimidÃ© par les PokÃ©mon Starter.'],
    andabata: [143, 'Ronflex', ['Normal'], 'Son poids Ã©crase les alliÃ©s voisins.'],
    laquearius: [97, 'Hypnomade', ['Psy'], 'Il hypnotise et capture son adversaire.'],
    murmillo: [67, 'Machopeur', ['Combat'], 'Â« Machopeur ne recule jamais ! Â»'],
    nobile: [53, 'Persian', ['Normal'], 'Le noble fÃ©lin : quand il tombe, il laisse une fortune (Jackpot).'],
    pegma: [132, 'MÃ©tamorph', ['Normal'], 'Il se combine Ã  toute son Ã©quipe pour devenir immense.'],
    retiarius: [168, 'Migalos', ['Insecte', 'Poison'], 'Il piÃ¨ge ses adversaires dans sa toile.'],
    veneficus: [110, 'Smogogo', ['Poison'], 'Il se perd en Explosion : un adversaire gagnant ? Les deux sont K.O. !'],
    crupellarius: [379, 'Registeel', ['Acier'], 'LÃ©gendaire cuirassÃ© : il Ã©crase les objets adverses.'],
    dimacherus: [150, 'Mewtwo', ['Psy'], 'LÃ©gendaire amplificateur : les bonus et malus sont doublÃ©s.'],
    eques: [647, 'Keldeo', ['Eau', 'Combat'], 'Le LÃ©gendaire cavalier : il chasse les autres LÃ©gendaires.'],
    essedarius: [78, 'Galopa', ['Feu'], 'Il galope Ã  toute vitesse et entraÃ®ne ses voisins.'],
    sagittarius: [724, 'ArchÃ©duc', ['Plante', 'Spectre'], 'L\'archer : il dÃ©coche une plume sur son meilleur alliÃ©.'],
    scissor: [212, 'Cizayox', ['Insecte', 'Acier'], 'Ses pinces coupent net les capacitÃ©s adverses.'],
    secutor: [248, 'Tyranocif', ['Roche', 'TÃ©nÃ¨bres'], 'Â« Sa mÃ¢choire broie la roche. Â»'],
  };
  // ---------- tactiques -> objets / personnages ----------
  // [nom, ('item', sprite d'objet) ou ('dex', nÂ° PokÃ©dex), lien avec l'effet]
  const OBJECTS = {
    pugio: ['ProtÃ©ine', 'item', 'protein', 'Une vitamine : +1 de puissance.'],
    'a-la-fosse': ['RelÃ¢cher chez le Prof. Chen', 'item', 'escape-rope', 'On confie un PokÃ©mon au Professeur : il quitte l\'Ã©quipe.'],
    convoi: ['Livraison du PokÃ© MarchÃ©', 'item', 'tm-case', 'Le camion de livraison renouvelle un rayon entier.'],
    missio: ['Ceinture Force', 'item', 'focus-sash', 'Le PokÃ©mon tient bon : il ne sera pas mis K.O.'],
    'clef-de-la-fosse': ['Pass BoÃ®te PC', 'item', 'town-map', 'On rÃ©cupÃ¨re un objet rangÃ© dans la BoÃ®te PC.'],
    complices: ['Team Rocket', 'dex', 23, 'Les complices de la Team Rocket : Ã  payer pour qu\'ils aident.'],
    datura: ['MÃ©ga-Bracelet', 'item', 'mega-bracelet', 'Il double la puissance des effets du PokÃ©mon.'],
    dispense: ['PokÃ© Ball', 'item', 'poke-ball', 'On rappelle le PokÃ©mon et on en envoie un autre.'],
    'lion-apprivoise': ['Orbe Vie', 'item', 'life-orb', 'Un grand boost de puissance (+2).'],
    promotion: ['Pierre Ã‰volution', 'item', 'fire-stone', 'Le PokÃ©mon Ã©volue au rang supÃ©rieur.'],
    repositionnement: ['Changement de PokÃ©mon', 'item', 'ultra-ball', 'On Ã©change les places de ses PokÃ©mon dans l\'ArÃ¨ne.'],
    reservation: ['AppÃ¢t Ball', 'item', 'lure-ball', 'On attire un PokÃ©mon prÃ©cis dans l\'ArÃ¨ne.'],
    'summa-rudis': ['Ã‰voluroc', 'item', 'eviolite', 'Une protection : aucun objet ne peut cibler cette zone.'],
    transfert: ['Ã‰change PokÃ©mon', 'item', 'master-ball', 'On Ã©change un PokÃ©mon avec son adversaire.'],
  };
  const EDICT_THEME = {
    destockage: ['Soldes au PokÃ© MarchÃ©', 'ðŸ›’'], 'prime-tactique': ['Bonus Objets', 'ðŸŽ'], 'prime-de-victoire': ['Prix de la Ligue', 'ðŸ†'],
    requisition: ['Raid de la Team Rocket', 'ðŸš€'], austerite: ['PÃ©nurie au PokÃ© MarchÃ©', 'ðŸ“‰'], 'nouvelle-recrue': ['Ã‰closion d\'Å’ufs', 'ðŸ¥š'],
    'echange-force': ['Ã‰change Surprise', 'ðŸ”„'], 'vente-forcee': ['Revente forcÃ©e', 'ðŸ’°'], encouragement: ['Cri d\'Encouragement', 'ðŸ“£'],
    'puissance-brute': ['Combat sans Talents', 'ðŸš«'], 'effets-decisifs': ['DÃ©fi Niveau 1', '1ï¸âƒ£'], 'soif-de-sang': ['Match Ã  Mort Subite', 'ðŸ’€'],
  };

  // ---------- vocabulaire : LUDUS -> PokÃ©mon (appliquÃ© Ã  tous les textes affichÃ©s) ----------
  const L = '(?<![\\p{L}\\p{N}_])', R = '(?![\\p{L}\\p{N}_])';
  function cap(m, s) { return m[0] !== m[0].toLowerCase() && s ? s[0].toUpperCase() + s.slice(1) : s; }
  const rule = (pat, rep, flags) => [new RegExp(L + pat + R, flags || 'giu'), (m) => cap(m, rep)];
  const LEX = [
    rule("du ColisÃ©e", "de l'ArÃ¨ne"), rule("au ColisÃ©e", "Ã  l'ArÃ¨ne"), rule("le ColisÃ©e", "l'ArÃ¨ne"), rule("ce ColisÃ©e", "cette ArÃ¨ne"), rule('ColisÃ©e', 'ArÃ¨ne'),
    rule("Ã‰dits? de l'Empereur", "DÃ©cret du MaÃ®tre de la Ligue"), rule("de l'Empereur", "du MaÃ®tre de la Ligue"), rule("Ã  l'Empereur", "au MaÃ®tre de la Ligue"),
    rule("l'Empereur", "le MaÃ®tre de la Ligue"), rule('Empereur', 'MaÃ®tre de la Ligue'),
    rule('Ã‰dits', 'DÃ©crets'), rule('Ã‰dit', 'DÃ©cret'),
    rule('la fosse', 'la BoÃ®te PC'), rule('fosse', 'BoÃ®te PC'),
    rule('le ludus', "l'Ã©quipe", 'gu'), rule('du ludus', "de l'Ã©quipe", 'gu'), rule('au ludus', "Ã  l'Ã©quipe", 'gu'), rule('un ludus', 'une Ã©quipe', 'gu'), rule('ce ludus', 'cette Ã©quipe', 'gu'), rule('ludus', 'Ã©quipe', 'gu'),
    rule('gladiateurs?', 'PokÃ©mon'),
    rule('lanistes', 'Dresseurs'), rule('laniste', 'Dresseur'),
    rule('Forum', 'PokÃ© MarchÃ©', 'gu'),
    rule('Quartiers', 'Rayons'), rule('Quartier', 'Rayon'),
    rule('tactiques', 'cartes Objet', 'gu'), rule('tactique', 'carte Objet', 'gu'), rule('Tactiques', 'Objets', 'gu'), rule('Tactique', 'Objet', 'gu'),
    [new RegExp('(\\d+) ?deniers?(?:\\(s\\))?', 'giu'), (m, n) => n + ' â‚½'], rule('deniers?(?:\\(s\\))?', 'â‚½'),
    rule('sesterce', 'Badge'),
    rule('de DÃ©part', 'Starter'), rule('DÃ©part', 'Starter'),
    rule('DÃ©butants', 'Basiques'), rule('DÃ©butant', 'Basique'), rule('Aguerris', 'Ã‰voluÃ©s'), rule('Aguerri', 'Ã‰voluÃ©'),
    [/recrut/giu, (m) => (m[0] === 'R' ? 'Captur' : 'captur')],
    rule('meurent', 'sont K.O.'), rule('meurt', 'est K.O.'), rule('mourir', 'Ãªtre K.O.'), rule('morts', 'K.O.'),
    rule('manches?', 'Ã©tape'),
  ];
  let NAMEREPS = [];      // noms de cartes Ã©crits en MAJUSCULES dans les textes d'effets (ex. Â« X HOPLOMAQUE Â») -> nom PokÃ©mon
  function lex(s) {
    for (const [re, f] of NAMEREPS) s = s.replace(re, f);
    for (const [re, f] of LEX) s = s.replace(re, f);
    return s;
  }

  // ---------- rendu des cartes ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baseOf = id => (CARDS[id] && (CARDS[id].base || id));
  const typeGrad = types => { const a = TYPE_COLOR[types[0]] || '#888', b = TYPE_COLOR[types[1] || types[0]] || a; return `--c1:${a};--c2:${b}`; };
  const iconTxt = t => esc(t).replace(/([âš¡âˆžâš™âš”â˜ ])/g, '<b class="pk-ic">$1</b>');
  const RANK_CLS = { depart: 'st', debutant: 'ba', aguerri: 'ev', legendaire: 'le' };
  function artImg(url, alt, cls) { return `<img class="${cls || ''}" src="${url}" alt="${esc(alt)}" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'">`; }
  function face(defId) {
    const d = CARDS[defId];
    if (d.type === 'gladiator') {
      const p = POKEMON[defId]; if (!p) return `<div class="pk"><div class="pk-name">${esc(d.name)}</div></div>`;
      const star = d.avantage ? '<span class="pk-adv" title="Avantage">â˜…</span>' : '';
      const txt = d.text && !/^Â«/.test(d.text) ? iconTxt(d.text) : `<i>${esc(p[3])}</i>`;
      return `<div class="pk pk-g" style="${typeGrad(p[2])}">
        <div class="pk-top"><span class="pk-rank ${RANK_CLS[d.rank]}">${esc(RANKS[d.rank].label)}</span>${star}<span class="pk-pw" title="Puissance">${d.power}</span></div>
        <div class="pk-art">${artImg(ART(p[0]), p[1])}</div>
        <div class="pk-name">${esc(d.name)}</div>
        <div class="pk-types">${p[2].map(t => `<i style="background:${TYPE_COLOR[t]}">${t}</i>`).join('')}</div>
        <div class="pk-txt"><div>${txt}</div></div></div>`;
    }
    const b = baseOf(defId), o = OBJECTS[b]; if (!o) return `<div class="pk pk-t"><div class="pk-name">${esc(d.name)}</div></div>`;
    const art = o[1] === 'dex' ? artImg(ART(o[2]), o[0]) : artImg(ITEM(o[2]), o[0], 'pk-item');
    return `<div class="pk pk-t">
      <div class="pk-top"><span class="pk-rank ob">Objet${d.prep ? ' Â· âš™' : ''}</span><span class="pk-pw pk-price" title="Prix">â‚½${d.price}</span></div>
      <div class="pk-art">${art}</div>
      <div class="pk-name">${esc(d.name)}</div>
      <div class="pk-txt"><div>${iconTxt(d.text)}</div></div></div>`;
  }
  function edictFace(id) {
    const e = EDICTS[id], ic = (EDICT_THEME[id] || [])[1] || 'â˜…';
    return `<div class="pk pk-e"><div class="pk-etitle"><span>${ic}</span> ${esc(e.name)}</div><div class="pk-egrid">${e.rounds.map((t, i) => `<div><b>Ã‰tape ${i + 1}</b>${iconTxt(t)}</div>`).join('')}</div></div>`;
  }
  const backFace = kind => `<div class="pk-back pk-back-${kind === 'tactic' ? 't' : kind === 'edict' ? 'e' : 'g'}"></div>`;
  const edictIcon = id => (EDICT_THEME[id] || [])[1] || 'â˜…';

  // ---------- activation du thÃ¨me ----------
  const snap = { cards: null, ranks: null, quarters: null, edicts: null };
  const T = { active: false, name: 'ludus', brand: 'LUDUS', face, edictFace, backFace, edictIcon, lex, aiName: 'Ordinateur', trainerName: 'Laniste' };
  let observer = null, busy = false;
  function fixText(n) { const v = n.data, w = lex(v); if (w !== v) n.data = w; }
  function fixEl(el) {
    for (const a of ['title', 'alt', 'placeholder', 'aria-label']) { const v = el.getAttribute && el.getAttribute(a); if (v) { const w = lex(v); if (w !== v) el.setAttribute(a, w); } }
  }
  function walk(node) {
    if (node.nodeType === 3) { fixText(node); return; }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(node.tagName)) return;
    fixEl(node);
    node.querySelectorAll && node.querySelectorAll('[title],[alt],[placeholder],[aria-label]').forEach(fixEl);
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t; while ((t = tw.nextNode())) fixText(t);
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
    T.active = poke; T.name = poke ? 'poke' : 'ludus'; T.brand = poke ? 'POKÃ‰-LUDUS' : 'LUDUS';
    T.aiName = poke ? 'Rival' : 'Ordinateur'; T.trainerName = poke ? 'Dresseur' : 'Laniste';
    for (const c of Object.values(CARDS)) {
      if (!poke) { c.name = snap.cards[c.id]; continue; }
      if (c.type === 'gladiator' && POKEMON[c.id]) c.name = POKEMON[c.id][1];
      else if (c.type === 'tactic' && OBJECTS[c.base || c.id]) c.name = OBJECTS[c.base || c.id][0];
    }
    const RK = { depart: 'Starter', debutant: 'Basique', aguerri: 'Ã‰voluÃ©', legendaire: 'LÃ©gendaire' };
    const QK = { tactic: 'Objets', debutant: 'Basiques', aguerri: 'Ã‰voluÃ©s', legendaire: 'LÃ©gendaires' };
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
    document.title = poke ? 'POKÃ‰-LUDUS â€” le jeu de Dresseurs (fan-made)' : 'LUDUS â€” le jeu de lanistes';
    if (root.LudusSfx) root.LudusSfx.S.theme = T.name;
    if (poke) { startObserver(); walk(document.body); } else stopObserver();
    // textes de marque
    const q = s => document.querySelector(s);
    if (q('#menu .menu-logo')) q('#menu .menu-logo').textContent = T.brand;
    if (q('#menu .menu-sub')) q('#menu .menu-sub').innerHTML = poke
      ? 'Devenez le Dresseur le plus puissant de Kanto.<br>Une version PokÃ©mon de <b>LUDUS</b>, par des fans, pour le plaisir.' : 'Soyez le laniste le plus puissant de Rome.<br>Un jeu de <b>SÃ©raphin Gaillard</b> &amp; <b>Gabin Guyot</b>';
    if (q('#menu .menu-foot')) q('#menu .menu-foot').innerHTML = poke
      ? 'Projet de fans, non officiel : PokÃ©mon et ses personnages appartiennent Ã  Nintendo, Game Freak et The PokÃ©mon Company. Images : PokeAPI/sprites.' : 'Version 1.4 Â· Â© 2026 SÃ©raphin Gaillard &amp; Gabin Guyot';
    if (poke) walk(document.body);
  }
  T.set = set;
  root.LudusTheme = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);

