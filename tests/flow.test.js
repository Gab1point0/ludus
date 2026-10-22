// Tests de déroulement : limite de main, deniers/subventions, fin de partie sans gladiateur, etc. Usage : node tests/flow.test.js
const path = require('path');
const { Game } = require(path.join('..', 'js', 'engine.js'));
let fail = 0;
const ok = (name, cond, extra) => { if (!cond) { fail++; console.log('✗', name, extra || ''); } else console.log('✓', name); };
const idle = { decide: async (p) => { switch (p.kind) { case 'choice': return (p.options.find(o => o.type === 'pass') || p.options[0]).id; case 'cards': return p.cards.slice(0, p.min).map(c => c.uid); case 'number': return p.min; default: return true; } } };

(async () => {
  // 1. limite de main : 5 tactiques en plus => défausse jusqu'à 7
  {
    const g = new Game({ seed: 1, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    g.ctrl = [idle, idle];
    await g.coinToss(true);
    g.s.round = 1; await g.renewal();
    for (let i = 0; i < 5; i++) g.s.players[0].hand.push(g.drawReserve('tactic'));
    const before = g.s.fosse.tactics.length;
    await g.preparation();
    ok('limite de main à 7', g.s.players[0].hand.length === 7, g.s.players[0].hand.length);
    ok('les tactiques en trop vont à la fosse', g.s.fosse.tactics.length === before + 1);
  }
  // 2. premier laniste : 2 achats au 1er tour de la manche 1, 4 deniers (+1 pour le second)
  {
    const g = new Game({ seed: 2, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    g.ctrl = [idle, idle];
    await g.coinToss(true);
    const first = g.s.firstSeat;
    ok('le second laniste a 1 denier de plus', g.s.players[1 - first].deniers === 5 && g.s.players[first].deniers === 4);
  }
  // 3. Forum : manche 1 = 3 tactiques + 3 débutants + 3 aguerris, 0 légendaire ; manche 2 débloque la 4e tactique et les légendaires
  {
    const g = new Game({ seed: 3, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    g.ctrl = [idle, idle];
    await g.coinToss(true);
    g.s.round = 1; await g.renewal();
    const cnt = q => g.s.forum[q].slots.filter(Boolean).length;
    ok('manche 1 : 3/3/3/0 cartes au Forum', cnt('tactic') === 3 && cnt('debutant') === 3 && cnt('aguerri') === 3 && cnt('legendaire') === 0, [cnt('tactic'), cnt('debutant'), cnt('aguerri'), cnt('legendaire')]);
    // on retire une carte du milieu de chaque Quartier gladiateur, puis manche 2
    g.s.round = 2; await g.renewal();
    ok('manche 2 : 4 tactiques et 3 légendaires', cnt('tactic') === 4 && cnt('legendaire') === 3, [cnt('tactic'), cnt('legendaire')]);
    ok('manche 2 : une carte envoyée au dépôt par Quartier', g.s.forum.tactic.depot.length === 1 && g.s.forum.debutant.depot.length === 1 && g.s.forum.legendaire.depot.length === 0);
    g.s.round = 3; await g.renewal(); g.s.round = 4; await g.renewal();
    ok('manche 4 : 6 tactiques', cnt('tactic') === 6, cnt('tactic'));
  }
  // 4. décalage du Forum : la carte la plus proche du dépôt part, les autres glissent vers le dépôt
  {
    const g = new Game({ seed: 4, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    g.ctrl = [idle, idle];
    g.s.round = 2;
    const F = g.s.forum.debutant;
    const [c1, c2] = [g.drawReserve('debutant'), g.drawReserve('debutant')];
    F.slots = [c1, null, c2];               // slot0 (près de la réserve), slot2 (près du dépôt)
    g.supplyQuarter('debutant', true);
    ok('la carte du dernier emplacement part au dépôt', F.depot.includes(c2));
    ok('l\'autre carte glisse jusqu\'au dernier emplacement', F.slots[2] === c1);
    ok('les emplacements restants sont ravitaillés', F.slots[0] && F.slots[1]);
  }
  // 5. fin de partie sans gladiateur : le premier laniste l'emporte
  {
    const g = new Game({ seed: 5, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    g.ctrl = [idle, idle];
    g.s.players.forEach(p => { p.ludus = []; });
    g.s.round = 4; g.s.firstSeat = 1;
    await g.finalCombats({ winner: null, won: [0, 0], deaths: [], dead: [0, 0], recruits: [], duels: [] });
    ok('plus aucun gladiateur : le premier laniste gagne', g.s.over && g.s.winner === 1);
  }
  console.log(fail ? `\n${fail} test(s) en échec` : '\nTous les tests de déroulement passent.');
  process.exit(fail ? 1 : 0);
})();
