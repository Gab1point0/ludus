// Entraînement de l'IA par auto-jeu (méthode d'entropie croisée, calcul en parallèle sur tous les cœurs).
//   node tests/train.js [générations] [population] [parties par candidat]
// Les meilleurs paramètres sont écrits dans tests/trained/best.json ; `node tests/apply-trained.js` les injecte dans js/ai.js.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (!isMainThread) {
  // ---------------- travailleur : joue des parties pour évaluer un candidat ----------------
  const { Game } = require(path.join('..', 'js', 'engine.js'));
  const AI = require(path.join('..', 'js', 'ai.js'));
  async function play(vecA, vecB, seed, swap) {
    const g = new Game({ seed, advanced: true, names: ['A', 'B'], colors: ['rouge', 'bleu'], speed: 0 });
    const pA = vecA ? AI.vectorToParams(vecA) : undefined;
    const mkA = () => AI.create('hard', g.rand.bind(g), pA);
    // adversaire : un niveau prédéfini (« easy », « normal »…) ou un vecteur de paramètres
    const mkB = () => (typeof vecB === 'string' ? AI.create(vecB, g.rand.bind(g)) : AI.create('hard', g.rand.bind(g), vecB ? AI.vectorToParams(vecB) : undefined));
    const ais = swap ? [mkB(), mkA()] : [mkA(), mkB()];
    g.ctrl = ais.map(ai => ({ decide: async (prompt, game) => ai.decide(game.viewFor(prompt.seat), prompt) }));
    await g.run();
    return (g.s.winner === 0) !== swap;
  }
  parentPort.on('message', async (m) => {
    if (m.type === 'eval') {
      let wins = 0, n = 0;
      for (let i = 0; i < m.games; i++) {
        const opp = m.opps[i % m.opps.length];
        if (await play(m.vec, opp, m.seed + i, i % 2 === 1)) wins++;
        n++;
      }
      parentPort.postMessage({ id: m.id, wins, n });
    }
  });
  return;
}

// ---------------- chef d'orchestre ----------------
const AI = require(path.join('..', 'js', 'ai.js'));
const GENS = parseInt(process.argv[2] || '60'), POP = parseInt(process.argv[3] || '64'), GAMES = parseInt(process.argv[4] || '400');
const ELITE = Math.max(6, Math.round(POP * 0.2));
const NW = Math.max(1, os.cpus().length - 1);
const outDir = path.join(__dirname, 'trained'); fs.mkdirSync(outDir, { recursive: true });
const SPEC = AI.SPEC, DIM = SPEC.length;
const lo = SPEC.map(s => s[1]), hi = SPEC.map(s => s[2]);
const toReal = z => z.map((x, i) => lo[i] + Math.max(0, Math.min(1, x)) * (hi[i] - lo[i]));
const toNorm = v => v.map((x, i) => (x - lo[i]) / (hi[i] - lo[i]));

const workers = []; const pending = new Map(); let nextId = 1; const idle = []; const queue = [];
function dispatch() { while (idle.length && queue.length) { const w = idle.pop(); const t = queue.shift(); pending.set(t.msg.id, { w, resolve: t.resolve }); w.postMessage(t.msg); } }
for (let i = 0; i < NW; i++) {
  const w = new Worker(__filename);
  w.on('message', r => { const p = pending.get(r.id); pending.delete(r.id); idle.push(p.w); p.resolve(r); dispatch(); });
  w.on('error', e => { console.error('worker', e); process.exit(1); });
  workers.push(w); idle.push(w);
}
function evaluate(vec, opps, games, seed) {
  return new Promise(resolve => { queue.push({ msg: { type: 'eval', id: nextId++, vec, opps, games, seed }, resolve }); dispatch(); });
}
const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

(async () => {
  const defaultVec = AI.paramsToVector(AI.DEFAULT_P);
  const startFile = path.join(outDir, 'best.json');
  let startVec = defaultVec;
  if (fs.existsSync(startFile) && !process.env.FRESH) {            // reprise des paramètres déjà entraînés (associés par nom, au cas où la liste des paramètres a changé)
    const saved = JSON.parse(fs.readFileSync(startFile, 'utf8'));
    startVec = SPEC.map(([name], i) => { const j = (saved.spec || []).indexOf(name); return j >= 0 ? saved.vec[j] : defaultVec[i]; });
  }
  if (process.env.INIT) { const init = JSON.parse(process.env.INIT); startVec = startVec.map((v, i) => (init[SPEC[i][0]] != null ? init[SPEC[i][0]] : v)); }    // ex. INIT='{"mcW":30}'
  let mean = toNorm(startVec.map((v, i) => Math.max(lo[i], Math.min(hi[i], v))));
  const OPPS = (process.env.OPPS || 'champ,default').split(',');          // adversaires d'entraînement : easy, normal, champ (centre actuel), default
  let sigma = mean.map(() => parseFloat(process.env.SIGMA || '0.18'));
  console.log(`Entraînement : ${DIM} paramètres, population ${POP}, ${GAMES} parties/candidat, ${NW} cœurs, ${GENS} générations`);
  const t0 = Date.now();
  for (let gen = 1; gen <= GENS; gen++) {
    const seed = gen * 1000003;
    const champ = toReal(mean);
    const opps = OPPS.map(o => (o === 'champ' ? champ : o === 'default' ? defaultVec : o));
    const cands = [];
    for (let k = 0; k < POP; k++) cands.push(k === 0 ? mean.slice() : mean.map((m, i) => Math.max(0, Math.min(1, m + sigma[i] * randn()))));
    const res = await Promise.all(cands.map(z => evaluate(toReal(z), opps, GAMES, seed)));
    const fit = res.map(r => r.wins / r.n);
    const order = fit.map((f, i) => i).sort((a, b) => fit[b] - fit[a]);
    const elites = order.slice(0, ELITE).map(i => cands[i]);
    const newMean = mean.map((_, d) => elites.reduce((s, e) => s + e[d], 0) / elites.length);
    const std = mean.map((_, d) => Math.sqrt(elites.reduce((s, e) => s + (e[d] - newMean[d]) ** 2, 0) / elites.length));
    mean = mean.map((m, d) => 0.5 * m + 0.5 * newMean[d]);
    sigma = sigma.map((s, d) => Math.max(0.025, 0.7 * s + 0.3 * std[d] * 1.3));
    const avgSig = sigma.reduce((a, b) => a + b, 0) / DIM;
    const avgFit = fit.reduce((a, b) => a + b, 0) / POP;
    fs.writeFileSync(path.join(outDir, 'best.json'), JSON.stringify({ gen, vec: toReal(mean), spec: SPEC.map(s => s[0]) }));
    if (gen % 5 === 0 || gen === 1 || gen === GENS) {
      const be = await evaluate(toReal(mean), ['easy'], 1000, 777000 + gen), bn = await evaluate(toReal(mean), ['normal'], 1000, 778000 + gen);
      console.log(`gén ${String(gen).padStart(3)} | meilleur ${(fit[order[0]] * 100).toFixed(1)}% moyenne ${(avgFit * 100).toFixed(1)}% | σ ${avgSig.toFixed(3)} | centre vs FACILE : ${(be.wins / be.n * 100).toFixed(1)}% | vs NORMAL : ${(bn.wins / bn.n * 100).toFixed(1)}% | ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }
  for (const w of workers) w.terminate();
})();
