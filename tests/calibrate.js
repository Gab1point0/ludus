// Calibrage des niveaux : combien de parties la version « hard » gagne contre des réglages candidats (blend, bruit, placement…)
//   node tests/calibrate.js [parties]
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');
if (!isMainThread) {
  const { Game } = require(path.join('..', 'js', 'engine.js'));
  const AI = require(path.join('..', 'js', 'ai.js'));
  parentPort.on('message', async m => {
    let wins = 0;
    for (let i = 0; i < m.games; i++) {
      const swap = i % 2 === 1;
      const g = new Game({ seed: m.seed + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
      const mk = (lvl, p) => AI.create(lvl, g.rand.bind(g), p);
      const a = mk('hard'), b = mk(m.level, m.extra);
      const ais = swap ? [b, a] : [a, b];
      g.ctrl = ais.map(ai => ({ decide: async (prompt, game) => ai.decide(game.viewFor(prompt.seat), prompt) }));
      await g.run();
      if ((g.s.winner === 0) !== swap) wins++;
    }
    parentPort.postMessage({ id: m.id, wins, n: m.games });
  });
  return;
}
const N = parseInt(process.argv[2] || '1200');
const NW = Math.max(1, os.cpus().length - 1);
const workers = []; const idle = []; const queue = []; const pending = new Map(); let nid = 1;
const dispatch = () => { while (idle.length && queue.length) { const w = idle.pop(), t = queue.shift(); pending.set(t.msg.id, { w, res: t.res }); w.postMessage(t.msg); } };
for (let i = 0; i < NW; i++) { const w = new Worker(__filename); w.on('message', r => { const p = pending.get(r.id); pending.delete(r.id); idle.push(p.w); p.res(r); dispatch(); }); workers.push(w); idle.push(w); }
const run = (level, extra, games, seed) => new Promise(res => { queue.push({ msg: { id: nid++, level, extra, games, seed }, res }); dispatch(); });
async function winrate(level, extra) {
  const chunk = Math.ceil(N / NW);
  const rs = await Promise.all(Array.from({ length: NW }, (_, k) => run(level, extra, chunk, 900000 + k * 100000)));
  const w = rs.reduce((s, r) => s + r.wins, 0), n = rs.reduce((s, r) => s + r.n, 0);
  return w / n;
}
(async () => {
  const cands = process.env.CANDS ? JSON.parse(process.env.CANDS) : [
    ['normal actuel', 'normal', {}],
    ['blend .4 bruit .8', 'normal', { blend: 0.4, noise: 0.8, noisePlace: 0.5 }],
    ['blend .5 bruit 1', 'normal', { blend: 0.5, noise: 1.0, noisePlace: 0.6, placeThr: 0.9 }],
    ['blend .6 bruit 1.2', 'normal', { blend: 0.6, noise: 1.2, noisePlace: 0.7, placeThr: 1.0 }],
    ['easy actuel', 'easy', {}],
    ['blend .8 bruit 2', 'easy', { blend: 0.8, noise: 2.0, noisePlace: 1.0, placeThr: 1.3, placeThr4: 0.6, skipPlace: 0.4 }],
    ['blend 1 bruit 2.5', 'easy', { blend: 1, noise: 2.5, noisePlace: 1.2, placeThr: 1.5, placeThr4: 0.8, skipPlace: 0.5 }],
  ];
  for (const [name, level, extra] of cands) {
    const w = await winrate(level, extra);
    console.log(`hard gagne ${(w * 100).toFixed(1)}%  contre  ${name}`);
  }
  workers.forEach(w => w.terminate());
})();
