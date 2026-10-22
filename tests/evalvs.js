// Évalue un réglage candidat du Difficile contre plusieurs adversaires (calcul parallèle).
//   CAND='{"mcW":25}' OPPS='easy,normal,hard0' node tests/evalvs.js [parties]
//   adversaires : easy, normal, hard (version publiée), hard0 (« hard » sans Monte-Carlo), ou un objet JSON de paramètres
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');
if (!isMainThread) {
  const { Game } = require(path.join('..', 'js', 'engine.js'));
  const AI = require(path.join('..', 'js', 'ai.js'));
  const mk = (spec, rnd) => (typeof spec === 'string' ? (spec === 'hard0' ? AI.create('hard', rnd, { mcW: 0 }) : AI.create(spec, rnd)) : AI.create(spec.level || 'hard', rnd, spec.params));
  parentPort.on('message', async m => {
    let wins = 0;
    for (let i = 0; i < m.games; i++) {
      const swap = i % 2 === 1;
      const g = new Game({ seed: m.seed + i, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
      const a = AI.create('hard', g.rand.bind(g), m.cand), b = mk(m.opp, g.rand.bind(g));
      const ais = swap ? [b, a] : [a, b];
      g.ctrl = ais.map((ai, seat) => ({ decide: async (prompt, game) => ai.decide(game.viewFor(seat), prompt) }));
      await g.run();
      if ((g.s.winner === 0) !== swap) wins++;
    }
    parentPort.postMessage({ id: m.id, wins, n: m.games });
  });
  return;
}
const N = parseInt(process.argv[2] || '800');
const cand = process.env.CAND ? JSON.parse(process.env.CAND) : {};
const opps = (process.env.OPPS || 'easy,normal,hard0').split(',').map(s => (s.startsWith('{') ? JSON.parse(s) : s));
const NW = Math.max(1, os.cpus().length - 1);
const workers = [], idle = [], queue = [], pending = new Map(); let nid = 1;
const dispatch = () => { while (idle.length && queue.length) { const w = idle.pop(), t = queue.shift(); pending.set(t.msg.id, { w, res: t.res }); w.postMessage(t.msg); } };
for (let i = 0; i < NW; i++) { const w = new Worker(__filename); w.on('message', r => { const p = pending.get(r.id); pending.delete(r.id); idle.push(p.w); p.res(r); dispatch(); }); workers.push(w); idle.push(w); }
const run = (opp, games, seed) => new Promise(res => { queue.push({ msg: { id: nid++, cand, opp, games, seed }, res }); dispatch(); });
(async () => {
  const t0 = Date.now();
  const out = [];
  for (const opp of opps) {
    const chunk = Math.ceil(N / NW);
    const rs = await Promise.all(Array.from({ length: NW }, (_, k) => run(opp, chunk, 500000 + k * 100000)));
    const w = rs.reduce((s, r) => s + r.wins, 0), n = rs.reduce((s, r) => s + r.n, 0);
    out.push(`${typeof opp === 'string' ? opp : JSON.stringify(opp)} : ${(100 * w / n).toFixed(1)}%`);
  }
  console.log(`candidat ${JSON.stringify(cand)} → ` + out.join(' | ') + `  (${Math.round((Date.now() - t0) / 1000)} s)`);
  workers.forEach(w => w.terminate());
})();
