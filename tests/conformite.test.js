// Conformité avec le tableur des auteurs (onglets V4.x.10) : nombre de cartes, rangs, coûts, puissances, effets, Édits.
// La photographie du tableur est dans tests/sheet-v4x10.json. Usage : node tests/conformite.test.js
const path = require('path');
const D = require(path.join('..', 'js', 'data.js'));
const sheet = require('./sheet-v4x10.json');
const { CARDS, EDICTS, RANKS } = D;

let fail = 0, warn = 0;
const ko = (m) => { fail++; console.log('✗', m); };
const ok = (m) => console.log('✓', m);
const w = (m) => { warn++; console.log('⚠', m); };
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/[^a-z0-9+\-' ]/g, ' ').replace(/\s+/g, ' ').trim();
const key = s => norm(s).replace(/ /g, '-').replace(/[!']/g, '');
const tokens = s => new Set(norm(s).split(' ').filter(x => x.length > 2));
function similarity(a, b) { const A = tokens(a), B = tokens(b); let i = 0; A.forEach(x => { if (B.has(x)) i++; }); return i / Math.max(1, Math.min(A.size, B.size)); }
const stripIcon = s => s.replace(/^[∞⚡⚙⚔☠]\s*:\s*/, '');

// ---------- gladiateurs ----------
const gl = Object.values(CARDS).filter(c => c.type === 'gladiator' && !c.start);
const gladByName = {}; gl.forEach(c => { gladByName[c.name.toUpperCase()] = c; });
const provo = Object.values(CARDS).filter(c => c.base === 'provocator');
for (const s of sheet.gladiators) {
  if (s.name === 'PROVOCATOR') {
    const total = provo.reduce((a, c) => a + c.copies, 0);
    if (total !== s.copies) ko(`PROVOCATOR : ${total} exemplaires (tableur : ${s.copies})`);
    if (provo[0].power !== s.power) ko(`PROVOCATOR : puissance ${provo[0].power} (tableur : ${s.power})`);
    continue;
  }
  const c = gladByName[s.name];
  if (!c) { ko(`${s.name} : absent du jeu`); continue; }
  const probs = [];
  if (RANKS[c.rank].label !== s.rank) probs.push(`rang ${RANKS[c.rank].label} ≠ ${s.rank}`);
  if (c.power !== s.power) probs.push(`puissance ${c.power} ≠ ${s.power}`);
  if (c.copies !== s.copies) probs.push(`exemplaires ${c.copies} ≠ ${s.copies}`);
  if (!!c.avantage !== s.avantage) probs.push(`Avantage ${c.avantage} ≠ ${s.avantage}`);
  if (!!c.advanced !== s.advanced) probs.push(`carte avancée ${!!c.advanced} ≠ ${s.advanced}`);
  if (RANKS[c.rank].price !== null && RANKS[c.rank].price !== s.cost) probs.push(`coût du rang ${RANKS[c.rank].price} ≠ ${s.cost}`);
  if (probs.length) ko(`${s.name} : ${probs.join(' ; ')}`); else ok(`${s.name}`);
  const sim = similarity(stripIcon(c.text), s.wording);
  if (s.wording && s.wording !== '/' && !/^"/.test(s.wording) && !/\[\]/.test(s.wording) && sim < 0.5) w(`${s.name} : texte de l'effet différent (similarité ${sim.toFixed(2)})\n     jeu    : ${c.text}\n     tableur : ${s.wording}`);
}
for (const c of gl) if (!sheet.gladiators.some(s => s.name === c.name.toUpperCase())) ko(`${c.name} : absent du tableur V4.x.10`);
// totaux par rang (matériel : 24 / 21 / 21)
const tot = r => gl.filter(c => c.rank === r).reduce((a, c) => a + c.copies, 0);
[['debutant', 24], ['aguerri', 21], ['legendaire', 21]].forEach(([r, n]) => tot(r) === n ? ok(`total ${RANKS[r].label} = ${n}`) : ko(`total ${RANKS[r].label} = ${tot(r)} (attendu ${n})`));

// ---------- tactiques ----------
const tacs = Object.values(CARDS).filter(c => c.type === 'tactic');
const byBase = {};
tacs.forEach(c => { const b = c.base || c.id; (byBase[b] = byBase[b] || []).push(c); });
for (const s of sheet.tactics) {
  const b = key(s.name);
  const group = byBase[b];
  if (!group) { ko(`${s.name} : absente du jeu`); continue; }
  const neutral = group.find(c => !c.start), total = group.reduce((a, c) => a + c.copies, 0);
  const probs = [];
  if (neutral.price !== s.cost) probs.push(`coût ${neutral.price} ≠ ${s.cost}`);
  if (total !== s.copies) probs.push(`exemplaires ${total} ≠ ${s.copies}`);
  if (!!neutral.advanced !== s.advanced) probs.push(`carte avancée ${!!neutral.advanced} ≠ ${s.advanced}`);
  if (probs.length) ko(`${s.name} : ${probs.join(' ; ')}`); else ok(`${s.name}`);
  const sim = similarity(neutral.text.replace(/[∞⚡⚙⚔☠]\s*:/g, ' '), s.wording.replace(/Révélation|Continu|Préparation|Combat/g, ' '));
  if (sim < 0.75) w(`${s.name} : texte de l'effet différent (similarité ${sim.toFixed(2)})\n     jeu    : ${neutral.text}\n     tableur : ${s.wording}`);
}
for (const b of Object.keys(byBase)) if (!sheet.tactics.some(s => key(s.name) === b)) ko(`tactique ${b} absente du tableur`);
const totalT = tacs.reduce((a, c) => a + c.copies, 0);
totalT === 52 ? ok('total tactiques = 52') : ko(`total tactiques = ${totalT} (attendu 52)`);

// ---------- édits ----------
for (const s of sheet.edicts) {
  const e = EDICTS[s.id];
  if (!e) { ko(`édit ${s.name} : absent`); continue; }
  if (norm(e.name) !== norm(s.name)) ko(`édit ${s.id} : nom « ${e.name} » ≠ « ${s.name} »`);
  let okAll = true;
  s.rounds.forEach((txt, i) => {
    const mine = stripIcon(e.rounds[i]);
    const sim = similarity(mine, txt);
    const isNone = txt.trim() === '/';
    if (isNone && !/aucun effet/i.test(mine)) { ko(`édit ${s.name}, manche ${i + 1} : le tableur indique « / » (aucun effet) mais le jeu applique « ${e.rounds[i]} »`); okAll = false; }
    else if (!isNone && sim < 0.5) { w(`édit ${s.name}, manche ${i + 1} : texte différent (similarité ${sim.toFixed(2)})\n     jeu    : ${e.rounds[i]}\n     tableur : ${txt}`); okAll = false; }
  });
  if (okAll) ok(`édit ${s.name}`);
}
Object.keys(EDICTS).forEach(id => { if (!sheet.edicts.some(s => s.id === id)) ko(`édit ${id} absent du tableur V4.x.10`); });

console.log(`\n${fail ? fail + ' écart(s) avec le tableur' : 'Conforme au tableur V4.x.10'}${warn ? ` — ${warn} avertissement(s) de formulation à relire` : ''}`);
process.exit(fail ? 1 : 0);
