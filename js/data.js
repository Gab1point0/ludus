/* LUDUS — données des cartes (transcrites depuis les PDF des cartes et du livret de règles) */
(function (root) {
  'use strict';

  const RANKS = {
    depart:     { id: 'depart',     label: 'Départ',     order: 0, price: null },
    debutant:   { id: 'debutant',   label: 'Débutant',   order: 1, price: 1 },
    aguerri:    { id: 'aguerri',    label: 'Aguerri',    order: 2, price: 3 },
    legendaire: { id: 'legendaire', label: 'Légendaire', order: 3, price: 5 },
  };

  // Quartiers du Forum : manche de déverrouillage de chaque emplacement achat,
  // dans l'ordre réserve -> dépôt (le dernier est le plus proche du dépôt).
  const QUARTIERS = {
    tactic:     { id: 'tactic',     label: 'Tactiques',  unlock: [1, 1, 1, 2, 3, 4] },
    debutant:   { id: 'debutant',   label: 'Débutants',  unlock: [1, 1, 1] },
    aguerri:    { id: 'aguerri',    label: 'Aguerris',   unlock: [1, 1, 1] },
    legendaire: { id: 'legendaire', label: 'Légendaires', unlock: [2, 2, 2] },
  };

  const COMPENSATION = [1, 2, 3];                       // deniers par gladiateur mort, manches 1 à 3
  const REWARD_RANK = ['debutant', 'aguerri', 'legendaire']; // rang du gladiateur récompense, manches 1 à 3
  const SUBSIDY_CAP = 7;
  const HAND_LIMIT = 7;

  const CARDS = {};
  const G = (id, name, rank, power, o) => {
    CARDS[id] = Object.assign({ id, type: 'gladiator', name, rank, power, avantage: false, advanced: false, copies: 3, img: id, text: '' }, o || {});
  };
  const T = (id, name, price, o) => {
    CARDS[id] = Object.assign({ id, type: 'tactic', name, price, advanced: false, copies: 3, img: id, text: '', prep: false }, o || {});
  };

  // ---------- Gladiateurs de Départ (2 couleurs) ----------
  const PROV = '⚔ : +X puissance, X étant le numéro de la marche sur laquelle l\'Empereur se trouve.';
  G('provocator-bleu', 'Provocator', 'depart', 0, { base: 'provocator', color: 'bleu', start: true, text: PROV });
  G('provocator-rouge', 'Provocator', 'depart', 0, { base: 'provocator', color: 'rouge', start: true, text: PROV });

  // ---------- Gladiateurs Débutants (24) ----------
  G('caesarianus', 'Caesarianus', 'debutant', 1, { text: '⚡ : +2 deniers.' });
  G('gallus', 'Gallus', 'debutant', 1, { text: '⚔ : +3 puissance si ce gladiateur se trouve sur la zone de duel centrale.' });
  G('gladiatrix', 'Gladiatrix', 'debutant', 1, { avantage: true, advanced: true, text: '⚔ : +3 deniers si ce gladiateur a remporté le duel.' });
  G('hoplomaque', 'Hoplomaque', 'debutant', 1, { copies: 6, text: '⚔ : Si vous avez X HOPLOMAQUE en combat : 2 → +2 puissance ; 3 → +3 puissance.' });
  G('munifex', 'Munifex', 'debutant', 0, { advanced: true, text: '☠ : Récupérez toutes les tactiques placées sur les emplacements tactiques de votre côté du Colisée.' });
  G('samnite', 'Samnite', 'debutant', 3, { text: '⚔ : −3 puissance s\'il y a un gladiateur de Départ en combat.' });
  G('thraex', 'Thraex', 'debutant', 2, { text: '« Infirmus ! »' });

  // ---------- Gladiateurs Aguerris (21 : 7 cartes × 3 exemplaires, PEGMA et NOBILE compris) ----------
  G('andabata', 'Andabata', 'aguerri', 4, { text: '⚔ : −1 puissance à vos gladiateurs en combat dans les zones de duel adjacentes.' });
  G('laquearius', 'Laquearius', 'aguerri', 2, { advanced: true, text: '⚔ : Si ce gladiateur a remporté le duel, recrutez le gladiateur adverse.' });
  G('murmillo', 'Murmillo', 'aguerri', 3, { text: '« Audaces fortuna iuvat ! »' });
  // Tableur V4.x.10 : 3 exemplaires (la carte du PDF d'impression en comptait 5, avec 1 seul PEGMA : l'Aguerri doit totaliser 21 cartes)
  G('nobile', 'Nobile', 'aguerri', 0, { copies: 3, text: '☠ : +6 deniers.' });
  G('pegma', 'Pegma', 'aguerri', 0, { advanced: true, copies: 3, text: '⚡ : Choisissez jusqu\'à 5 gladiateurs Débutants et/ou Aguerris de votre ludus. Placez-les en renfort de ce gladiateur.' });
  G('retiarius', 'Retiarius', 'aguerri', 2, { text: '⚔ : +2 puissance si contre un gladiateur Débutant ou Aguerri.' });
  G('veneficus', 'Veneficus', 'aguerri', 0, { text: '⚔ : Si ce gladiateur est en train de perdre le duel, une égalité est provoquée.' });

  // ---------- Gladiateurs Légendaires (21) ----------
  G('crupellarius', 'Crupellarius', 'legendaire', 5, { avantage: true, text: '⚔ : −1 puissance par tactique adverse en combat.' });
  G('dimacherus', 'Dimacherus', 'legendaire', 3, { advanced: true, text: '⚔ : Les bonus et malus de puissance appliqués à ce gladiateur comptent double.' });
  G('eques', 'Eques', 'legendaire', 2, { text: '⚔ : +2 puissance par gladiateur Légendaire adverse en combat.' });
  G('essedarius', 'Essedarius', 'legendaire', 2, { avantage: true, text: '⚔ : +1 puissance à vos gladiateurs en combat dans les zones de duel adjacentes.' });
  G('sagittarius', 'Sagittarius', 'legendaire', 2, { advanced: true, text: '⚡ : Choisissez un gladiateur de votre ludus. Placez-le en renfort de ce gladiateur.' });
  G('scissor', 'Scissor', 'legendaire', 2, { avantage: true, text: '∞ : Les effets du gladiateur adverse ne peuvent pas s\'appliquer.' });
  G('secutor', 'Secutor', 'legendaire', 4, { text: '« Pugna non perfecta est ! »' });

  // ---------- Tactiques de départ (par couleur) ----------
  const FOSSE_TXT = '⚙ : Choisissez un des gladiateurs de votre ludus. Défaussez-le.';
  const CONVOI_TXT = '⚙ : Choisissez un Quartier. Envoyez au dépôt les cartes présentes sur ses emplacements achats. Ravitaillez-le.';
  const PUGIO_TXT = '⚔ : +1 puissance à votre gladiateur.';
  for (const c of ['bleu', 'rouge']) {
    T('a-la-fosse-' + c, 'À la fosse !', 1, { base: 'a-la-fosse', color: c, start: true, copies: 1, prep: true, text: FOSSE_TXT });
    T('convoi-' + c, 'Convoi', 1, { base: 'convoi', color: c, start: true, copies: 1, prep: true, text: CONVOI_TXT });
    T('pugio-' + c, 'Pugio', 2, { base: 'pugio', color: c, start: true, copies: 1, text: PUGIO_TXT });
  }

  // ---------- Tactiques du Forum (52 - 6 de départ = 46) ----------
  T('missio', 'Missio', 1, { copies: 4, text: '⚡ : Désignez un emplacement gladiateur de cette zone de duel. ∞ : Aucun gladiateur ne peut mourir sur l\'emplacement désigné.' });
  T('a-la-fosse', 'À la fosse !', 1, { prep: true, text: FOSSE_TXT });
  T('clef-de-la-fosse', 'Clef de la fosse', 4, { copies: 1, advanced: true, prep: true, text: '⚙ : Choisissez une tactique de la fosse. Ajoutez-la à votre main.' });
  T('complices', 'Complices', 1, { advanced: true, text: '⚡ : Placez autant de deniers que vous voulez sur ce COMPLICES. À la fin du COMBAT, défaussez-les. ⚔ : Tous les 2 deniers : +1 puissance à votre gladiateur.' });
  T('convoi', 'Convoi', 1, { prep: true, text: CONVOI_TXT });
  T('datura', 'Datura', 3, { copies: 4, text: '⚡ : Réappliquez les effets ⚡ de votre gladiateur. ∞ : Quand vous appliquez ses effets ⚔ ou ☠, appliquez-les une seconde fois.' });
  T('dispense', 'Dispense', 1, { copies: 5, text: '⚡ : Remplacez votre gladiateur par le gladiateur du dessus de votre ludus. Mettez le gladiateur dispensé en dessous de votre ludus.' });
  T('lion-apprivoise', 'Lion apprivoisé', 5, { text: '⚔ : +2 puissance à votre gladiateur.' });
  T('promotion', 'Promotion', 2, { advanced: true, prep: true, text: '⚙ : Choisissez et dévoilez un gladiateur Débutant ou Aguerri de votre ludus. Envoyez-le au dépôt de son Quartier. Recrutez le gladiateur du dessus de la réserve de rang supérieur.' });
  T('pugio', 'Pugio', 2, { text: PUGIO_TXT });
  T('repositionnement', 'Repositionnement', 2, { copies: 5, text: '⚡ : Choisissez une zone de duel (celle-ci y compris). Échangez vos cartes de la zone de duel (gladiateur et tactique) avec vos cartes de cette zone de duel.' });
  T('reservation', 'Réservation', 4, { advanced: true, prep: true, text: '⚙ : Désignez un laniste. Choisissez un des gladiateurs de son ludus. Placez-le face cachée dans un emplacement gladiateur vide de son côté du Colisée.' });
  T('summa-rudis', 'Summa Rudis', 2, { text: '∞ : Aucun effet ⚡ ou ∞ de tactique ne peut cibler les gladiateurs et tactiques de cette zone de duel.' });
  T('transfert', 'Transfert', 3, { advanced: true, prep: true, text: '⚙ : Choisissez un des gladiateurs de votre ludus. Votre adversaire le recrute.' });

  // ---------- Édits de l'Empereur ----------
  const EDICT_DEFS = {};
  const E = (id, name, rounds) => { EDICT_DEFS[id] = { id, name, type: 'edict', img: id, rounds }; };
  const same = t => [t, t, t, t];
  E('austerite', 'Austérité', same('∞ : À chaque fois qu\'un laniste effectue un achat, le coût de ses futurs achats augmente de 1 denier.'));
  E('destockage', 'Déstockage', [
    '∞ : Le prix des gladiateurs achetés depuis la réserve du Quartier Aguerri est réduit de 1 denier.',
    '∞ : Le prix des gladiateurs achetés depuis la réserve des Quartiers Aguerri et Légendaire est réduit de 1 denier.',
    '∞ : Le prix des gladiateurs achetés depuis la réserve des Quartiers Aguerri et Légendaire est réduit de 1 denier.',
    '∞ : Le prix des gladiateurs achetés depuis la réserve des Quartiers Aguerri et Légendaire est réduit de 1 denier.']);
  const SWAP = '⚡ : Si les 2 lanistes ont au moins 1 gladiateur dans leur ludus, ils s\'échangent au hasard un de leurs gladiateurs.';
  const NONE = '/ : Aucun effet cette manche.';     // « / » dans le tableur V4.x.10
  E('echange-force', 'Échange forcé', [NONE, SWAP, SWAP, SWAP]);
  E('effets-decisifs', 'Effets décisifs', same('⚔ : Tous les gladiateurs en combat sont considérés comme ayant une puissance initiale de 0.'));
  E('encouragement', 'Encouragement', same('⚔ : +1 puissance aux gladiateurs Débutants.'));
  E('nouvelle-recrue', 'Nouvelle recrue', [
    '⚡ : Les lanistes piochent et recrutent un gladiateur de la réserve du Quartier Débutant sans le montrer à leur adversaire.',
    '⚡ : Les lanistes piochent et recrutent un gladiateur de la réserve du Quartier Aguerri sans le montrer à leur adversaire.',
    '⚡ : Les lanistes piochent et recrutent un gladiateur de la réserve du Quartier Légendaire sans le montrer à leur adversaire.',
    '⚡ : Les lanistes piochent et recrutent un gladiateur de la réserve de chaque Quartier sans les montrer à leur adversaire.']);
  const PV = '∞ : Les lanistes reçoivent 2 deniers par duel remporté (au lieu de 1). Si un laniste remporte le combat, il obtient 2 gladiateurs récompense (au lieu de 1).';
  E('prime-de-victoire', 'Prime de victoire', [PV, PV, PV, NONE]);
  const PT = '∞ : Les lanistes reçoivent 1 denier par tactique qu\'ils placent dans le Colisée.';
  E('prime-tactique', 'Prime tactique', [PT, PT, PT, '⚡ : Les lanistes piochent, révèlent et ajoutent à leur main une tactique de la réserve. Celui ayant obtenu la moins chère reçoit la différence en deniers.']);
  E('puissance-brute', 'Puissance brute', same('∞ : Aucun effet de gladiateur ne peut s\'appliquer.'));
  const REQ = '⚡ : Les lanistes défaussent au hasard un gladiateur du rang le plus cher qu\'ils possèdent. (Légendaire > Aguerri > Débutant > Départ)';
  E('requisition', 'Réquisition', ['⚡ : Les lanistes défaussent au hasard un de leurs gladiateurs de Départ.', REQ, REQ, REQ]);
  E('soif-de-sang', 'Soif de sang', same('⚔ : Le laniste qui remporte le combat est celui qui a le plus de gladiateurs morts de son côté du Colisée (un gladiateur face à aucun autre gladiateur meurt).'));
  const VF = '⚡ : Les lanistes défaussent tous leurs gladiateurs (hors gladiateurs de Départ). Ils reçoivent autant de deniers que le prix associé à leur rang.';
  E('vente-forcee', 'Vente forcée', ['⚡ : Les lanistes défaussent leurs 3 gladiateurs de Départ. Ils reçoivent 3 deniers.', VF, VF, VF]);

  root.LudusData = { RANKS, QUARTIERS, CARDS, EDICTS: EDICT_DEFS, COMPENSATION, REWARD_RANK, SUBSIDY_CAP, HAND_LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LudusData;
})(typeof window !== 'undefined' ? window : globalThis);
