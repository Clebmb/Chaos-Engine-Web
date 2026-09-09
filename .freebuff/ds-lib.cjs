/**
 * Deep-zoom validation: find a boundary-rich point at 1e-10 by walking in
 * (recenter on an edge pixel each decade), then compare f32 vs ds vs double
 * truth on a 64x48 grid. Measures both coordinate precision and iteration
 * count fidelity.
 */
const fround = Math.fround;
const SPLIT = 8193.0;

function quickTwoSum(a, b) { const s = fround(a + b); const e = fround(b - fround(s - a)); return [s, e]; }
function split(a) { const t = fround(SPLIT * a); const hi = fround(t - fround(t - a)); const lo = fround(a - hi); return [hi, lo]; }
function twoProd(a, b) {
  const p = fround(a * b);
  const [ah, al] = split(a);
  const [bh, bl] = split(b);
  const err = fround(fround(fround(fround(ah * bh) - p) + fround(ah * bl)) + fround(al * bh));
  return [p, err];
}
function dsMul(a, b) {
  const [p1, e1] = twoProd(a[0], b[0]);
  const e2 = fround(fround(a[0] * b[1]) + fround(a[1] * b[0]));
  return quickTwoSum(p1, fround(e1 + e2));
}
function twoSum(a, b) {
  const s = fround(a + b);
  const ap = fround(s - a);
  const bp = fround(s - ap);
  const err = fround(fround(a - bp) + fround(b - ap));
  return [s, err];
}
function dsAdd(a, b) {
  const [s, e] = twoSum(a[0], b[0]);
  const e2 = fround(e + a[1] + b[1]);
  return quickTwoSum(s, e2);
}

function truth(cx, cy, maxI) {
  let zx = 0, zy = 0;
  for (let i = 0; i < maxI; i++) {
    const nx = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = nx;
    if (zx * zx + zy * zy > 4) return i;
  }
  return maxI;
}
function f32iter(cx, cy, maxI) {
  cx = fround(cx); cy = fround(cy);
  let zx = 0, zy = 0;
  for (let i = 0; i < maxI; i++) {
    const nx = fround(fround(fround(zx * zx) - fround(zy * zy)) + cx);
    zy = fround(fround(fround(2 * zx) * zy) + cy);
    zx = nx;
    if (fround(fround(zx * zx) + fround(zy * zy)) > 4) return i;
  }
  return maxI;
}
function dsIter(cxH, cxL, cyH, cyL, maxI) {
  const Cx = [cxH, cxL], Cy = [cyH, cyL];
  let X = [0, 0], Y = [0, 0];
  for (let i = 0; i < maxI; i++) {
    const xx = dsMul(X, X), yy = dsMul(Y, Y), xy = dsMul(X, Y);
    let nx = dsAdd(xx, [-yy[0], -yy[1]]);
    nx = dsAdd(nx, Cx);
    let ny = dsAdd([fround(2 * xy[0]), fround(2 * xy[1])], Cy);
    X = nx; Y = ny;
    const m2 = dsAdd(dsMul(X, X), dsMul(Y, Y));
    if (m2[0] > 4) return i;
  }
  return maxI;
}

// Walk from the classic seahorse valley point into depth, keeping the
// view centered on a boundary pixel (escape count between 20% and 80% of max).
function findDeepPoint(levels = 10) {
  let cx = -0.7443, cy = 0.1318, zoom = 3.5;
  const W = 64, H = 48, aspect = W / H;
  for (let level = 0; level < levels; level++) {
    // find an edge pixel
    let best = null;
    for (let py = 0; py < H && !best; py++) {
      for (let px = 0; px < W && !best; px++) {
        const x = cx + (px / W - 0.5) * aspect * zoom;
        const y = cy + (0.5 - py / H) * zoom;
        const v = truth(x, y, 300);
        if (v > 60 && v < 240) best = { x, y, v };
      }
    }
    if (!best) { console.log('no edge found at zoom', zoom.toExponential(1)); return { cx, cy, zoom }; }
    cx = best.x; cy = best.y;
    zoom /= 10;
  }
  return { cx, cy, zoom };
}


module.exports = { quickTwoSum, split, twoProd, dsMul, dsAdd, truth, f32iter, dsIter, findDeepPoint };