// Construit les images de Poké-Ludus à partir des illustrations générées avec Gemini
// (dossier « Claude dump/Pokeludus-images », jamais modifié) : fond blanc retiré, recadrage, webp.
// Usage : node tests/build-poke-art.js   (nécessite @napi-rs/canvas)
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require(process.env.CANVAS_MODULE || '@napi-rs/canvas');
const SRC = 'C:/Users/gabin/Desktop/Claude dump/Pokeludus-images';
const OUT = path.join(__dirname, '..', 'assets', 'poke');
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const SIZE = { pokemon: 440, item: 420 };

function findSrc(o) {
  const png = path.join(SRC, 'lot1-1024', o.slug + '-01.png'); if (fs.existsSync(png)) return png;
  const jpg = path.join(SRC, o.slug + '-01.jpg'); if (fs.existsSync(jpg)) return jpg;
  return null;
}
// fond blanc -> transparent : remplissage depuis les bords (les blancs intérieurs, comme les yeux, sont conservés), puis lissage du contour
function cutout(img) {
  const W = img.width, H = img.height;
  const c = createCanvas(W, H), g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const white = i => d[i] >= 236 && d[i + 1] >= 236 && d[i + 2] >= 236;
  const seen = new Uint8Array(W * H), stack = [];
  const push = (x, y) => { const p = y * W + x; if (!seen[p] && white(p * 4)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const p = stack.pop(), x = p % W, y = (p / W) | 0; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  let minX = W, minY = H, maxX = 0, maxY = 0, kept = 0;
  for (let p = 0; p < W * H; p++) {
    if (seen[p]) { d[p * 4 + 3] = 0; continue; }
    kept++; const x = p % W, y = (p / W) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  // contour : les pixels clairs voisins du fond deviennent semi-transparents (évite le liseré blanc)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x; if (seen[p]) continue;
    if (seen[p - 1] || seen[p + 1] || seen[p - W] || seen[p + W]) { const i = p * 4, m = Math.min(d[i], d[i + 1], d[i + 2]); if (m > 200) d[i + 3] = Math.max(0, Math.round(255 * (255 - m) / 55)); }
  }
  g.putImageData(id, 0, 0);
  return { c, box: kept ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : [0, 0, W, H] };
}
function render(srcPath, size, keepScene) {
  return loadImage(srcPath).then(img => {
    let c = null, box = [0, 0, img.width, img.height];
    if (!keepScene) { const r = cutout(img); c = r.c; box = r.box; } else { c = createCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); }
    const pad = Math.round(Math.max(box[2], box[3]) * 0.03), side = Math.max(box[2], box[3]) + pad * 2;
    const out = createCanvas(size, size), g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
    const k = size / side;
    g.drawImage(c, box[0], box[1], box[2], box[3], (size - box[2] * k) / 2, (size - box[3] * k) / 2, box[2] * k, box[3] * k);
    return out.toBuffer('image/webp', 88);
  });
}
(async () => {
  const done = [], missing = [];
  for (const o of manifest) {
    const src = findSrc(o); if (!src) { missing.push(o.slug); continue; }
    let dest;
    if (o.group === 'object') {
      const ITEMFILE = { 'ob-protein': 'protein', 'ob-envoyer-au-pc': 'pokemon-box-link', 'ob-livraison': 'tm-case', 'ob-ceinture-force': 'focus-sash', 'ob-acces-pc': 'storage-key', 'ob-team-rocket': 'team-rocket', 'ob-cloche-echo': 'shell-bell', 'ob-poke-ball': 'poke-ball', 'ob-bandeau-choix': 'choice-band', 'ob-pierre-evolution': 'fire-stone', 'ob-changement': 'ultra-ball', 'ob-rapide-ball': 'quick-ball', 'ob-officier-jenny': 'officier-jenny', 'ob-echange': 'master-ball' };
      dest = path.join(OUT, 'items', ITEMFILE[o.slug] + '.webp');
      fs.writeFileSync(dest, await render(src, SIZE.item, ['ob-ceinture-force', 'ob-livraison', 'ob-acces-pc', 'ob-envoyer-au-pc'].includes(o.slug)));
    } else {
      dest = path.join(OUT, 'pokemon', o.dex + '.webp');
      fs.writeFileSync(dest, await render(src, SIZE.pokemon, false));
    }
    done.push(path.basename(dest));
  }
  console.log(done.length + ' images écrites ; manquantes : ' + (missing.join(', ') || 'aucune'));
})();
