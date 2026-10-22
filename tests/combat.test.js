// Tests unitaires du calcul de combat (cartes une par une). Usage : node tests/combat.test.js
const path = require('path');
const { computeCombat } = require(path.join('..', 'js', 'engine.js'));

let n = 0, fail = 0;
const side = (glad, o) => Object.assign({ glad: glad ? { uid: 'g' + (++n), def: glad } : null, gladFaceDown: false, renforts: [], tactic: null, tacticFaceDown: false }, o || {});
const withTactic = (s, def, deniers) => { s.tactic = { uid: 't' + (++n), def, deniers: deniers || 0 }; return s; };
const withRenf = (s, ...defs) => { s.renforts = defs.map(d => ({ uid: 'r' + (++n), def: d })); return s; };
function board(z0, z1, z2) { return [z0, z1, z2]; }           // chaque zone = [sideSeat0, sideSeat1]
function run(zones, o) { return computeCombat(Object.assign({ zones, emperor: 1, edictId: null, noDeath: [[], [], []] }, o || {})); }
function eq(name, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('✗', name, '→ obtenu', JSON.stringify(got), 'attendu', JSON.stringify(want)); }
  else console.log('✓', name);
}
const E = () => side(null);
const pw = (res, z, s) => (s === 0 ? res.duels[z].a : res.duels[z].b).power;

// Provocator : +X (marche de l'Empereur)
for (const emp of [1, 4]) {
  const r = run(board([side('provocator-rouge'), side('thraex')], [E(), E()], [E(), E()]), { emperor: emp });
  eq(`Provocator marche ${emp}`, pw(r, 0, 0), emp);
}
// Gallus : +3 seulement au centre
{
  const r = run(board([side('gallus'), E()], [side('gallus'), E()], [E(), E()]));
  eq('Gallus zone 1 (bord) = 1', pw(r, 0, 0), 1); eq('Gallus zone centrale = 4', pw(r, 1, 0), 4);
}
// Samnite : -3 s'il y a un gladiateur de Départ en combat (plancher à 0)
{
  const r = run(board([side('samnite'), side('provocator-bleu')], [E(), E()], [E(), E()]));
  eq('Samnite avec Provocator adverse = 0', pw(r, 0, 0), 0);
  const r2 = run(board([side('samnite'), side('thraex')], [E(), E()], [E(), E()]));
  eq('Samnite sans gladiateur de Départ = 3', pw(r2, 0, 0), 3);
}
// Hoplomaque : x2 -> +2, x3 -> +3
{
  const r = run(board([side('hoplomaque'), E()], [side('hoplomaque'), E()], [E(), E()]));
  eq('2 Hoplomaques = 3 chacun', [pw(r, 0, 0), pw(r, 1, 0)], [3, 3]);
  const r3 = run(board([side('hoplomaque'), E()], [side('hoplomaque'), E()], [side('hoplomaque'), E()]));
  eq('3 Hoplomaques = 4 chacun', [pw(r3, 0, 0), pw(r3, 1, 0), pw(r3, 2, 0)], [4, 4, 4]);
  const r1 = run(board([side('hoplomaque'), E()], [E(), E()], [E(), E()]));
  eq('1 Hoplomaque = 1', pw(r1, 0, 0), 1);
}
// Essedarius (+1 adjacents) / Andabata (-1 adjacents, alliés)
{
  const r = run(board([side('thraex'), E()], [side('essedarius'), E()], [side('thraex'), E()]));
  eq('Essedarius : +1 aux zones adjacentes', [pw(r, 0, 0), pw(r, 1, 0), pw(r, 2, 0)], [3, 2, 3]);
  const r2 = run(board([side('thraex'), E()], [side('andabata'), E()], [side('thraex'), E()]));
  eq('Andabata : -1 à ses alliés adjacents', [pw(r2, 0, 0), pw(r2, 1, 0), pw(r2, 2, 0)], [1, 4, 1]);
  const r3 = run(board([side('thraex'), E()], [E(), E()], [side('essedarius'), E()]));
  eq('Essedarius en bord : n\'affecte pas la zone 1 (non adjacente)', pw(r3, 0, 0), 2);
}
// Crupellarius : -1 par tactique adverse ; Eques : +2 par Légendaire adverse ; Retiarius
{
  const opp = [withTactic(side('thraex'), 'pugio-bleu'), E()];
  const zs = board([side('crupellarius'), withTactic(side('thraex'), 'pugio-bleu')], [E(), withTactic(side(null), 'missio')], [E(), E()]);
  const r = run(zs);
  eq('Crupellarius : 5 - 2 tactiques adverses = 3', pw(r, 0, 0), 3);
  const r2 = run(board([side('eques'), side('thraex')], [E(), side('scissor')], [E(), side('crupellarius')]));
  eq('Eques : +2 par Légendaire adverse (2) = 6', pw(r2, 0, 0), 6);
  const r3 = run(board([side('retiarius'), side('thraex')], [side('retiarius'), side('provocator-bleu')], [side('retiarius'), side('secutor')]));
  eq('Retiarius : +2 vs Débutant, pas vs Départ ni Légendaire', [pw(r3, 0, 0), pw(r3, 1, 0), pw(r3, 2, 0)], [4, 2, 2]);
}
// Scissor : annule les effets adverses mais pas l'Avantage ; Avantage départage les égalités
{
  const r = run(board([E(), E()], [side('gallus'), side('scissor')], [E(), E()]));
  eq('Gallus face à Scissor : pas de +3', pw(r, 1, 0), 1);
  const r2 = run(board([side('thraex'), side('scissor')], [E(), E()], [E(), E()]));
  eq('Scissor (2, Avantage) bat Thraex (2)', r2.duels[0].winner, 1);
  const r3 = run(board([side('essedarius'), side('scissor')], [E(), E()], [E(), E()]));
  eq('Avantage contre Avantage à égalité = égalité', r3.duels[0].winner, null);
  const r4 = run(board([side('crupellarius'), side('scissor')], [E(), E()], [E(), E()]));
  eq('Scissor annule le malus de Crupellarius (5 vs 2)', [pw(r4, 0, 0), r4.duels[0].winner], [5, 0]);
}
// Veneficus : égalité s'il perd
{
  const r = run(board([side('veneficus'), side('secutor')], [E(), E()], [E(), E()]));
  eq('Veneficus perdant → égalité forcée', [r.duels[0].winner, r.duels[0].forcedTie], [null, true]);
  const r2 = run(board([side('veneficus'), side('veneficus')], [E(), E()], [E(), E()]));
  eq('Veneficus vs Veneficus (0-0) → égalité', r2.duels[0].winner, null);
  const r3 = run(board([side('veneficus'), side('scissor')], [E(), E()], [E(), E()]));
  eq('Veneficus bloqué par Scissor → il perd', r3.duels[0].winner, 1);
}
// Dimacherus : bonus/malus doublés ; avec Datura : x4
{
  const r = run(board([withTactic(side('dimacherus'), 'pugio-rouge'), E()], [E(), E()], [E(), E()]));
  eq('Dimacherus + Pugio = 3 + 2', pw(r, 0, 0), 5);
  const r2 = run(board([withTactic(side('dimacherus'), 'datura'), E()], [E(), E()], [E(), E()]));
  eq('Dimacherus + Datura sans bonus = 3', pw(r2, 0, 0), 3);
}
// Datura : doublement des effets ⚔
{
  const r = run(board([E(), E()], [withTactic(side('gallus'), 'datura'), E()], [E(), E()]));
  eq('Gallus + Datura (zone centrale) = 1 + 6', pw(r, 1, 0), 7);
  const r2 = run(board([E(), E()], [withTactic(side('gallus'), 'datura'), E()], [withTactic(side(null), 'summa-rudis'), E()]));
  eq('Datura non protégé par un Summa dans une autre zone', pw(r2, 1, 0), 7);
  const zs = board([E(), E()], [withTactic(side('gallus'), 'datura'), withTactic(side(null), 'summa-rudis')], [E(), E()]);
  eq('Datura annulé par un Summa Rudis dans la zone', pw(run(zs), 1, 0), 4);
}
// Puissance brute / Effets décisifs / Encouragement
{
  const zs = () => board([side('gallus'), E()], [side('gallus'), E()], [E(), E()]);
  eq('Puissance brute : Gallus central = 1', pw(run(zs(), { edictId: 'puissance-brute' }), 1, 0), 1);
  eq('Effets décisifs : puissance initiale 0 (Gallus central = 0 + 3)', pw(run(zs(), { edictId: 'effets-decisifs' }), 1, 0), 3);
  eq('Effets décisifs : Provocator garde son +X', pw(run(board([side('provocator-rouge'), E()], [E(), E()], [E(), E()]), { edictId: 'effets-decisifs', emperor: 3 }), 0, 0), 3);
  eq('Encouragement : +1 aux Débutants uniquement', [pw(run(board([side('thraex'), E()], [side('murmillo'), E()], [E(), E()]), { edictId: 'encouragement' }), 0, 0), pw(run(board([side('thraex'), E()], [side('murmillo'), E()], [E(), E()]), { edictId: 'encouragement' }), 1, 0)], [3, 3]);
}
// Tactiques ⚔ + Complices + renforts
{
  eq('Pugio +1 / Lion +2', [pw(run(board([withTactic(side('thraex'), 'pugio-bleu'), E()], [withTactic(side('thraex'), 'lion-apprivoise'), E()], [E(), E()]), {}), 0, 0), pw(run(board([withTactic(side('thraex'), 'pugio-bleu'), E()], [withTactic(side('thraex'), 'lion-apprivoise'), E()], [E(), E()]), {}), 1, 0)], [3, 4]);
  eq('Complices : 5 deniers = +2', pw(run(board([withTactic(side('thraex'), 'complices', 5), E()], [E(), E()], [E(), E()])), 0, 0), 4);
  eq('Renforts : puissance initiale ajoutée', pw(run(board([withRenf(side('pegma'), 'murmillo', 'thraex'), E()], [E(), E()], [E(), E()])), 0, 0), 5);
}
// Duels sans adversaire, duel vide, gains
{
  const r = run(board([side('thraex'), E()], [E(), E()], [E(), E()]));
  eq('Gladiateur sans adversaire gagne ; zones vides = égalité', [r.duels[0].winner, r.duels[1].winner, r.won], [0, null, [1, 0]]);
  const r2 = run(board([side('gladiatrix'), side('thraex')], [E(), E()], [E(), E()]));
  eq('Gladiatrix (1, Avantage) perd contre Thraex 2 → pas de deniers', r2.deniers, [0, 0]);
  const r3 = run(board([side('gladiatrix'), side('caesarianus')], [E(), E()], [E(), E()]));
  eq('Gladiatrix gagne (Avantage à égalité) : +3 deniers', [r3.duels[0].winner, r3.deniers], [0, [3, 0]]);
  const r4 = run(board([side('laquearius'), side('thraex')], [E(), E()], [E(), E()]));
  eq('Laquearius (2, avantage non) vs Thraex 2 → égalité, pas de recrutement', [r4.duels[0].winner, r4.recruits.length], [null, 0]);
  const r5 = run(board([side('laquearius'), side('caesarianus')], [E(), E()], [E(), E()]));
  eq('Laquearius gagne : recrute et ne tue pas l\'adversaire', [r5.recruits.length, r5.deaths.length], [1, 0]);
}
// Morts, Missio, Soif de sang
{
  const r = run(board([side('secutor'), side('thraex')], [side('thraex'), side('thraex')], [E(), E()]));
  eq('Morts : perdant + les deux en cas d\'égalité', r.deaths.map(d => d.z + ':' + d.s), ['0:1', '1:0', '1:1']);
  const r2 = run(board([side('secutor'), side('thraex')], [E(), E()], [E(), E()]), { noDeath: [[1], [], []] });
  eq('Missio : le gladiateur protégé ne meurt pas', r2.deaths.length, 0);
  const r3 = run(board([side('secutor'), side('thraex')], [side('thraex'), E()], [side('thraex'), E()]), { edictId: 'soif-de-sang' });
  eq('Soif de sang : gladiateurs sans adversaire meurent, 2 morts du côté 0 contre 1', [r3.dead, r3.winner], [[2, 1], 0]);
  const r4 = run(board([side('secutor'), side('thraex')], [E(), E()], [E(), E()]));
  eq('Combat normal : 1 duel gagné = vainqueur', r4.winner, 0);
  const r5 = run(board([side('secutor'), side('thraex')], [side('thraex'), side('secutor')], [E(), E()]));
  eq('Combat à égalité de duels : pas de vainqueur', r5.winner, null);
}
console.log(fail ? `\n${fail} test(s) en échec` : '\nTous les tests passent.');
process.exit(fail ? 1 : 0);
