/* LUDUS — mode tutoriel.
   Le moteur (engine.js) marque des pauses pédagogiques (prompt « ack » de mode 'tuto', clé = étape) pendant les manches 1 et 2 ;
   ce fichier affiche à côté du plateau un panneau de conseils qui suit l'état de la partie (sans rien imposer) :
     • les règles apparaissent ligne après ligne, au moment où elles servent ;
     • les cartes / boutons à utiliser sont entourés (surbrillance) ;
     • à partir de la manche 3 le panneau disparaît : le joueur finit seul. */
(function (root) {
  'use strict';
  const T = { shown: null, html: '', hl: [], lastId: null, hidden: false };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const li = (...a) => a;
  // ---------- pauses pédagogiques ----------
  const STOPS = {
    welcome: { id: 'welcome', t: '🎓 Bienvenue dans l\'arène !', l: li(
      'Vous êtes un <b>laniste</b> : vous dirigez une école de gladiateurs (votre <b>ludus</b>) et vous les envoyez combattre dans le <b>Colisée</b>.',
      '<b>But du jeu :</b> remporter le combat de la <b>4ᵉ manche</b> sous les yeux de l\'Empereur.',
      'Cette partie est un <b>tutoriel</b> contre un adversaire débutant. Je vous guide pendant les <b>2 premières manches</b> ; vous jouerez ensuite les manches 3 et 4 en toute liberté.',
      'Pas besoin de lire les règles : tout s\'explique ici, au fur et à mesure. Cliquez sur <b>Suivant</b> quand vous êtes prêt.') },
    first: { id: 'first', t: 'Vous êtes premier laniste !', l: li(
      'Le <b>sesterce</b> désigne le <b>premier laniste</b> : il joue en premier à chaque phase. On le gagne en remportant les combats.',
      'Votre adversaire, lui, reçoit <b>1 denier</b> de compensation (le denier est la monnaie du jeu).',
      'Chacun démarre avec <b>4 deniers</b>, <b>3 gladiateurs « Provocator »</b> dans son ludus et <b>3 tactiques</b> en main (en bas de l\'écran).') },
    round1: { id: 'round1', t: 'Manche 1 · Le Renouvellement', hl: ['.steps', '.hud-round'], l: li(
      'Une manche se joue en <b>5 phases</b> : <b>Renouvellement → Préparation → Révélation → Combat → Récompenses</b>. La phase en cours est écrite en haut.',
      'Premier temps, le <b>Renouvellement</b> : l\'<b>Empereur</b> avance d\'une marche (ronds numérotés de 1 à 4). Plus il avance, plus certains gladiateurs deviennent puissants.',
      'Puis il décrète un <b>Édit</b> : une règle spéciale pour cette manche.') },
    round2: { id: 'round2', t: 'Manche 2 · Le Renouvellement', hl: ['.steps'], l: li(
      'L\'Empereur avance sur la <b>marche 2</b> : le <b>Provocator</b> gagne +X puissance, X étant le numéro de la marche. Il vaut donc maintenant +2.',
      'Un nouvel <b>Édit</b> va être révélé, et le Forum se renouvelle.') },
    edict: { id: 'edict', t: 'L\'Édit de l\'Empereur', l: li(
      'Chaque manche, l\'Empereur impose une règle spéciale, <b>valable pour tous les joueurs</b> pendant cette manche seulement.',
      'Elle est résumée sous la carte (« Effet pour la manche »). Les prix qui changent s\'afficheront en <span class="g">vert</span> (moins cher) ou en <span class="r">rouge</span> (plus cher).'),
      d: 'Cliquez « J\'ai lu » pour continuer.' },
    forum: { id: 'forum', t: 'Le Forum : le marché', hl: ['#forum'], tab: 'forum', l: li(
      'Le <b>Forum</b> est l\'endroit où vous recrutez. Il comporte 4 <b>Quartiers</b> : <b>Débutants</b> (1 denier), <b>Aguerris</b> (3 deniers), <b>Légendaires</b> (5 deniers) et <b>Tactiques</b>.',
      'À gauche, la <b>réserve</b> (cartes face cachée) ; au milieu, les cartes <b>en vente</b> avec leur prix ; à droite, le <b>dépôt</b>.',
      'Les emplacements <b>🔒 verrouillés</b> s\'ouvriront aux manches suivantes : le Forum s\'agrandit au fil de la partie.') },
    prep: { id: 'prep', t: 'La Préparation : les achats', hl: ['#buys'], tab: 'forum', l: li(
      'C\'est le moment de <b>faire vos achats</b>, chacun votre tour : <b>1 carte par tour</b> (cliquez sur une carte du Forum pour l\'acheter).',
      'Un <b>gladiateur</b> acheté rejoint votre <b>ludus</b> ; une <b>tactique</b> achetée rejoint votre <b>main</b>.',
      'Quand vous ne voulez (ou ne pouvez) plus rien acheter, annoncez « <b>Ne rien acheter</b> » : votre préparation est terminée.',
      'Les achats de la manche s\'affichent en haut : vous voyez ce que prend l\'adversaire.') },
    hand: { id: 'hand', t: 'Votre main de tactiques', hl: ['#hand'], l: li(
      'En bas : vos <b>tactiques</b>. Survolez une carte avec la souris pour lire son effet en grand.',
      'Une tactique se pose <b>face cachée</b> dans le Colisée avant le combat, puis elle se révèle et agit. Les cartes <b>⚙</b> se jouent tout de suite, pendant la préparation.',
      'Vous pouvez garder jusqu\'à <b>7 tactiques</b> en main.') },
    draw: { id: 'draw', t: 'La Révélation : les gladiateurs entrent', hl: ['#colisee .gslot > .card'], tab: 'colisee', l: li(
      'Chaque laniste envoie <b>3 gladiateurs tirés au hasard</b> dans son ludus : un par <b>zone</b> du Colisée. Les vôtres sont en bas, ceux de l\'adversaire en haut.',
      'Dans chaque zone, les deux gladiateurs face à face vont s\'affronter en <b>duel</b>. Le chiffre dans le cercle est leur <b>puissance</b>.',
      'Les effets <b>⚡ Révélation</b> (par exemple gagner des deniers) s\'appliquent maintenant, à tour de rôle.') },
    tactics: { id: 'tactics', t: 'Placer ses tactiques', hl: ['#hand'], tab: 'colisee', l: li(
      'Vous pouvez poser <b>1 tactique par zone</b>, <b>face cachée</b> : l\'adversaire ne sait pas ce que c\'est. Toutes les tactiques seront <b>révélées en même temps</b>.',
      'Une tactique peut renforcer votre gladiateur, affaiblir le sien ou protéger votre zone. Poser une carte coûte parfois autant qu\'un bluff !',
      'Vous n\'êtes pas obligé d\'en poser : vous pouvez les garder pour plus tard.') },
    combat: { id: 'combat', t: 'Le Combat', hl: ['.pb'], tab: 'colisee', l: li(
      'Les duels sont résolus <b>zone par zone</b>. Dans chaque zone, la <b>puissance la plus haute</b> gagne le duel.',
      'À égalité, personne ne gagne le duel (sauf carte « Avantage »).',
      'Le laniste qui remporte <b>le plus de duels</b> remporte le <b>combat</b>. Les gladiateurs qui ne gagnent pas leur duel <b>meurent</b> ☠ (ils partent à la fosse).') },
    rewards: { id: 'rewards', t: 'Les Récompenses', hl: ['.pchip'], l: li(
      '<b>1 denier</b> pour chaque duel remporté.',
      'Le <b>vainqueur du combat</b> recrute un gladiateur : il pioche 2 cartes du rang de la manche (Débutant en manche 1, Aguerri en manche 2, Légendaire en manche 3) et en <b>garde 1</b>.',
      'Chaque mort rapporte une petite <b>compensation</b> en deniers ; les survivants rentrent au ludus. Puis chacun touche une <b>subvention</b> : 1 denier par gladiateur du ludus (7 maximum).',
      'Le vainqueur reçoit le <b>sesterce</b> : il sera premier laniste à la prochaine manche.') },
    free: { id: 'free', t: 'À vous de jouer seul !', l: li(
      'Fin du guidage ! Vous connaissez le déroulement complet d\'une manche : <b>Renouvellement → Préparation → Révélation → Combat → Récompenses</b>.',
      'Les <b>Légendaires</b> (5 deniers) et davantage de tactiques sont maintenant en vente. Souvenez-vous : <b>gagner le combat de la manche 4 fait gagner la partie</b>.',
      'Je vous laisse jouer les manches 3 et 4 tranquillement. Besoin d\'un rappel ? Le bouton <b>📖</b> en haut à droite donne les règles.') },
  };

  const win = (v, n) => `<span class="g">${n}</span>`;

  // ---------- étape à afficher d'après l'état de la partie ----------
  function pick(v) {
    const p = v.prompt, me = v.seat, mine = v.players[me];
    if (v.over) return null;
    if (p && p.kind === 'ack' && p.mode === 'tuto') {
      const k = p.key;
      if (k === 'round') return v.round === 1 ? STOPS.round1 : STOPS.round2;
      return Object.assign({ btn: true }, STOPS[k]);
    }
    if (v.round >= 3) return null;
    if (p && p.kind === 'choice' && p.mode === 'toss') return { id: 'toss', t: 'Pile ou face à la romaine', hl: ['.modal [data-act="opt"]'], l: li(
      'Avant de commencer, on désigne le <b>premier laniste</b>. L\'adversaire cache le <b>sesterce</b> dans un poing et un denier dans l\'autre.', 'Choisissez un poing : si vous trouvez le sesterce, vous jouerez en premier.'), d: 'Cliquez sur un poing.' };
    if (p && p.kind === 'ack' && p.mode === 'edict') {
      const own = { encouragement: 'Ici, <b>Encouragement</b> : tous les gladiateurs <b>Débutants</b> gagnent <b>+1 puissance</b> pendant le combat.', 'prime-tactique': 'Ici, <b>Prime tactique</b> : chaque tactique que vous placez dans le Colisée vous rapporte <b>1 denier</b>.' }[v.edict && v.edict.def];
      return own ? Object.assign({}, STOPS.edict, { id: 'edict' + v.round, l: STOPS.edict.l.concat([own]) }) : STOPS.edict;
    }
    if (p && p.kind === 'choice' && p.mode === 'prep') {
      const first = p.allowance > 1;
      if (v.round === 1 && first) {
        if (!p.bought) return { id: 'buy1', t: 'Votre premier achat', tab: 'forum', hl: ['.qrow[data-q="debutant"] .card.can', '.qrow[data-q="debutant"] .pile.buy'], fb: ['.card.can[data-act="buy"]'], l: li(
          `Vous avez <b>${p.deniers} deniers</b>. Comme vous êtes premier laniste, vous avez <b>droit à 2 achats d'affilée</b> ce tour-ci.`,
          'Commençons par un <b>gladiateur Débutant</b> : il ne coûte que <b>1 denier</b> et renforce votre ludus.',
          'Astuce : survolez une carte pour lire son effet (⚔ combat, ⚡ révélation, ∞ continu, ☠ mort).'), d: 'Cliquez sur une carte entourée dans la ligne « Débutants ».' };
        return { id: 'buy2', t: 'Votre deuxième achat', tab: 'forum', hl: ['.qrow[data-q="aguerri"] .card.can', '.qrow[data-q="aguerri"] .pile.buy'], fb: ['.card.can[data-act="buy"]', '#promptbar [data-act="opt"]'], l: li(
          `Il vous reste <b>${p.deniers} deniers</b>. Un gladiateur <b>Aguerri</b> coûte 3 deniers : il est nettement plus fort qu'un Débutant.`,
          'Vous pouvez aussi <b>terminer votre tour</b> et garder vos deniers pour plus tard.'), d: 'Achetez un Aguerri (ou terminez votre tour).' };
      }
      const can = p.options.filter(o => o.type === 'buy').length;
      return { id: 'buyN' + (p.bought ? 'b' : 'a'), t: 'À vous d\'acheter', tab: 'forum', hl: ['.card.can[data-act="buy"]', '.pile.buy[data-act="buy"]'], fb: [], l: li(
        `Vous avez <b>${p.deniers} deniers</b>.${can ? ' Les cartes que vous pouvez payer sont <b>entourées</b>.' : ' Vous ne pouvez rien acheter pour l\'instant.'}`,
        'Conseil : des <b>gladiateurs</b> pour avoir de bons duels, quelques <b>tactiques</b> pour les surprises. Ne gardez pas trop de deniers : ils ne rapportent rien !',
        'Quand vous avez fini, cliquez « <b>Ne rien acheter</b> » : votre préparation est terminée et le tour passe à l\'adversaire.'), d: can ? 'Cliquez sur la carte à acheter, ou terminez.' : 'Cliquez « Ne rien acheter ».' };
    }
    if (p && p.kind === 'choice' && p.mode === 'place') {
      const placed = [0, 1, 2].some(z => v.zones[z][me].tactic);
      const sel = !!(root.LudusUI && root.LudusUI.UI.selected);
      return { id: 'place' + (placed ? 'b' : 'a') + (sel ? 's' : ''), t: 'Posez une tactique', tab: 'colisee', hl: sel ? ['.gslot.target'] : ['.hcard.can'], fb: ['#promptbar [data-act="opt"]'], l: li(
        sel ? 'Choisissez maintenant l\'<b>emplacement ◆ libre</b> de votre côté (dans la zone de votre choix) : la carte y sera posée <b>face cachée</b>.' : 'Cliquez sur une tactique de votre main (<b>surlignée</b>) : vous pourrez ensuite choisir sa zone.',
        placed ? 'Vous pouvez en poser une autre, dans une zone différente, ou cliquer « <b>Ne plus placer de tactique</b> ».' : 'Pensez à la zone : mettez un renfort là où votre gladiateur est le plus faible, ou là où vous voulez faire un coup d\'éclat.'), d: sel ? 'Cliquez sur l\'emplacement.' : 'Cliquez sur une carte de votre main (ou passez).' };
    }
    if (p && p.kind === 'cards' && p.source === 'reward') return { id: 'reward', t: 'Votre récompense', hl: ['#pick-grid .card'], l: li('Vous avez gagné le combat ! Deux gladiateurs ont été piochés : <b>gardez-en un</b>, il rejoint immédiatement votre ludus. L\'autre part au dépôt du Forum.'), d: 'Cliquez sur une carte, puis « Recruter la carte choisie ».' };
    if (p && p.kind === 'ack' && p.mode === 'recap') return { id: 'recap', t: 'Le bilan du combat', l: li('Ce tableau détaille <b>d\'où viennent vos deniers</b> : duels gagnés, effets de cartes, compensation des morts, subventions.', 'Gardez-le en tête : plus votre ludus est grand, plus les subventions sont généreuses.'), d: 'Cliquez « Continuer ».' };
    if (p && p.kind === 'ack' && /^Combat terminé/.test(p.title || '')) {
      const r = v.combat && v.combat.res; const won = r && r.winner === me, lost = r && r.winner !== null && r.winner !== me;
      return { id: 'cend' + (r ? String(r.winner) : ''), t: 'Fin du combat', hl: ['.lmid .res'], l: li(
        r ? `Vous avez remporté <b>${r.won[me]}</b> duel(s), l'adversaire <b>${r.won[1 - me]}</b>. ${won ? '<b>Vous gagnez le combat !</b> 🏆' : lost ? 'L\'adversaire gagne ce combat — pas de panique, il reste des manches !' : 'Égalité : personne ne gagne ce combat.'}` : 'Le combat est terminé.',
        'Les perdants vont à la fosse ☠, les survivants rentrent au ludus, et les tactiques utilisées sont défaussées.'), d: 'Cliquez « Continuer ».' };
    }
    if (p && p.kind !== 'ack') return { id: 'other', t: 'Un choix à faire', l: li('Une carte vous demande de prendre une décision : lisez la fenêtre, puis cliquez sur votre choix.') };
    // l'adversaire (ou le jeu) agit
    return { id: 'wait', t: '⏳ Patientez…', quiet: true, l: li(v.phase === 'preparation' ? 'L\'adversaire fait ses achats. Regardez la barre « Achats de la manche » en haut.' : 'Observez le Colisée : le jeu avance tout seul jusqu\'à votre prochaine décision.') };
  }

  function linesHTML(st, fresh) {
    return st.l.map((x, i) => `<p class="co-l" style="${fresh ? `animation-delay:${(0.15 + i * 0.9).toFixed(2)}s` : 'animation:none'}">${x}</p>`).join('');
  }
  function stepsBar(v) {
    const r = Math.min(v.round || 1, 4);
    return `<div class="co-prog">${[1, 2, 3, 4].map(i => `<span class="${i < r ? 'past' : i === r ? 'on' : ''} ${i <= 2 ? 'guided' : ''}">${i}</span>`).join('')}<small>${r <= 2 ? 'manche guidée' : 'mode libre'}</small></div>`;
  }

  // ---------- panneau ----------
  T.update = function (v) {
    const g = $('#game'), box = $('#coach'); if (!g || !box) return;
    const on = !!(v && v.tutorial && !v.over);
    let st = on ? pick(v) : null;
    const hide = !st;
    g.classList.toggle('tuto-on', !!(v && v.tutorial));
    g.classList.toggle('tuto-hide', hide);
    document.documentElement.style.setProperty('--coachw', (!hide && window.innerWidth > 860) ? ($('#coach').offsetWidth || 320) + 'px' : '0px');
    T.cur = st;
    if (!st) { T.html = ''; box.innerHTML = ''; T.lastId = null; return; }
    const fresh = st.id !== T.lastId;
    const html = `<div class="co-head"><span class="co-ico">🎓</span><b>Tutoriel</b>${stepsBar(v)}</div>
      <div class="co-body ${st.quiet ? 'quiet' : ''}"><h3>${st.t}</h3>${linesHTML(st, fresh)}${st.d ? `<div class="co-do" style="${fresh ? `animation-delay:${(0.4 + st.l.length * 0.9).toFixed(2)}s` : 'animation:none'}">👉 ${st.d}</div>` : ''}</div>
      ${st.btn ? `<button class="btn primary big co-next" data-act="ack">Suivant ▶</button>` : ''}`;
    if (html !== T.html) {
      T.html = html; box.innerHTML = html;
      if (fresh && root.LudusSfx && !st.quiet) root.LudusSfx.play('ding', 0, 0.5);
      if (fresh) box.scrollTop = 0;
    }
    T.lastId = st.id;
  };

  // ---------- surbrillance des éléments à utiliser ----------
  T.highlight = function () {
    $$('.tuto-hl').forEach(e => e.classList.remove('tuto-hl'));
    const st = T.cur; if (!st || !st.hl) return;
    let list = [];
    st.hl.forEach(sel => { try { list = list.concat($$(sel)); } catch (e) { /* ignore */ } });
    if (!list.length && st.fb) st.fb.forEach(sel => { try { list = list.concat($$(sel)); } catch (e) { /* ignore */ } });
    list.forEach(e => e.classList.add('tuto-hl'));
  };

  document.addEventListener('click', e => { const h = e.target.closest && e.target.closest('#coach .co-head'); if (h && window.innerWidth <= 860) h.parentNode.classList.toggle('min'); });

  T.reset = function () { T.html = ''; T.lastId = null; T.cur = null; $$('.tuto-hl').forEach(e => e.classList.remove('tuto-hl')); };
  root.LudusTutorial = T;
})(typeof window !== 'undefined' ? window : globalThis);
