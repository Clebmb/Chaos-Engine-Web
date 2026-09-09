/**
 * FINAL perturbation validation v5 — harness fixed.
 *
 * c-space families (0,2,3,4,5,6,7,9,10): truth z₀=0, iterate c. Reference
 * orbit from c_ref = view center. Zhuoran rebasing valid (shared z₀=0):
 * |z̃|² > |Zₙ|² → z̃ ← Zₙ + z̃, n = 0.
 * Julia (1): z₀ = screen point, c = fixed seed. z̃₀ = screen offset, NO
 * per-step δc, NO rebasing (z₀ differs per pixel; the restart trick is
 * invalid). z̃ simply grows; f32 carries it until escape.
 *
 * Delta forms per family (all fround'ed):
 *   0: 2(Z×z̃) + z̃² + δc
 *   2: strick(w1, 2(X zx − Y zy) + (zx²−zy²) + δcx), strick(w2, 2(Y zx + X zy) + 2zxzy + δcy)
 *   3: (2(X zx − Y zy) + (zx²−zy²) + δcx, −(2(X zy + Y zx) + 2zxzy) + δcy)
 *   4: (strick(a, aδ) + δcx, bδ + δcy)
 *   5: (strick(a, aδ) + δcx, −strick(b, bδ) + δcy)
 *   6: (aδ + δcx, −2|X|zy − 2sign(X)zx(Y+zy) + δcy)
 *   7: 2(Z×z̃) + z̃² + P·dp + δc; dp←z̃ pre-update; rebase dp←dp+Z_{n-1}
 *   9: 3Z²z̃ + 3Z z̃² + z̃³ + δc
 *  10: 4Z³z̃ + 6Z²z̃² + 4Z z̃³ + z̃⁴ + δc
 *  Julia: 2(Z×z̃) + z̃²  (no δc)
 */
const fround = Math.fround;
const L = require('./ds-lib.cjs');
const P = 0.56667;

// double truth: c-space (z0=0) or julia (z0 = screen point)
function truth(type, sx, sy, cx, cy, maxI) {
    let zx, zy, pxx = 0, pyy = 0;
    if (type === 1) { zx = sx; zy = sy; } else { zx = 0; zy = 0; }
    for (let i = 0; i < maxI; i++) {
        const xo = zx, yo = zy;
        let nx, ny;
        switch (type) {
            case 0: case 1:
                nx = zx * zx - zy * zy + cx; ny = 2 * zx * zy + cy; break;
            case 2:
                nx = Math.abs(zx * zx - zy * zy + cx);
                ny = Math.abs(2 * Math.abs(zx * zy) + cy); break;
            case 3:
                nx = zx * zx - zy * zy + cx; ny = -2 * zx * zy + cy; break;
            case 4:
                nx = Math.abs(zx * zx - zy * zy) + cx; ny = 2 * zx * zy + cy; break;
            case 5:
                nx = Math.abs(zx * zx - zy * zy) + cx; ny = -2 * Math.abs(zx * zy) + cy; break;
            case 6:
                nx = zx * zx - zy * zy + cx; ny = -2 * Math.abs(zx) * zy + cy; break;
            case 7:
                nx = zx * zx - zy * zy + P * pxx + cx;
                ny = 2 * zx * zy + P * pyy + cy; break;
            case 9:
                nx = zx * zx * zx - 3 * zx * zy * zy + cx;
                ny = 3 * zx * zx * zy - zy * zy * zy + cy; break;
            case 10: {
                const a = zx * zx - zy * zy, b = 2 * zx * zy;
                nx = a * a - b * b + cx; ny = 2 * a * b + cy; break;
            }
            default:
                nx = zx * zx - zy * zy + cx; ny = 2 * zx * zy + cy;
        }
        zx = nx; zy = ny; pxx = xo; pyy = yo;
        if (zx * zx + zy * zy > 4) return i;
    }
    return maxI;
}

// reference orbit: row n = (zₙ, wₙ) — wₙ = pre-abs quadratic from zₙ
// z₀ = (z0x,z0y): 0 for c-space families, the view center for Julia
function makeRef(type, z0x, z0y, cx, cy, maxI) {
    const rows = [];
    let zx = z0x, zy = z0y, pxx = 0, pyy = 0, N = maxI;
    for (let n = 0; n <= maxI; n++) {
        let w1 = zx, w2 = zy;
        if (type === 2) { w1 = zx * zx - zy * zy + cx; w2 = 2 * Math.abs(zx * zy) + cy; }
        else if (type === 4 || type === 5) { w1 = zx * zx - zy * zy; w2 = 2 * zx * zy; }
        rows.push([zx, zy, w1, w2]);
        if (zx * zx + zy * zy > 16 && N === maxI) N = n;
        const xo = zx, yo = zy;
        let nx, ny;
        switch (type) {
            case 0:
                nx = zx * zx - zy * zy + cx; ny = 2 * zx * zy + cy; break;
            case 2:
                nx = Math.abs(w1); ny = Math.abs(w2); break;
            case 3:
                nx = zx * zx - zy * zy + cx; ny = -2 * zx * zy + cy; break;
            case 4:
                nx = Math.abs(w1) + cx; ny = w2 + cy; break;
            case 5:
                nx = Math.abs(w1) + cx; ny = -Math.abs(w2) + cy; break;
            case 6:
                nx = zx * zx - zy * zy + cx; ny = -2 * Math.abs(zx) * zy + cy; break;
            case 7:
                nx = zx * zx - zy * zy + P * pxx + cx;
                ny = 2 * zx * zy + P * pyy + cy; break;
            case 9:
                nx = zx * zx * zx - 3 * zx * zy * zy + cx;
                ny = 3 * zx * zx * zy - zy * zy * zy + cy; break;
            case 10: {
                const a = zx * zx - zy * zy, b = 2 * zx * zy;
                nx = a * a - b * b + cx; ny = 2 * a * b + cy; break;
            }
            default:
                nx = zx * zx - zy * zy + cx; ny = 2 * zx * zy + cy;
        }
        zx = nx; zy = ny; pxx = xo; pyy = yo;
        if (!isFinite(zx) || !isFinite(zy)) break;
    }
    return { rows, N: Math.min(N, rows.length - 1) };
}

function strick(q, d) {
    const aq = Math.abs(q), ad = Math.abs(d);
    if (ad < aq) return Math.sign(q) * d;
    const mag = (Math.sign(d) === Math.sign(q) || q === 0) ? fround(ad + aq) : fround(ad - aq);
    return fround(mag - aq);
}

// perturbation iteration; julia flag switches z̃₀ / δc / rebasing
function ptIter(type, rows, N, dcx, dcy, maxI, julia) {
    let zx = julia ? dcx : 0, zy = julia ? dcy : 0;
    const DCX = julia ? 0 : dcx, DCY = julia ? 0 : dcy;
    let dpx = 0, dpy = 0;
    let n = 0;
    for (let i = 0; i < maxI; i++) {
        let [X, Y, W1, W2] = rows[Math.min(n, N)];
        if (!julia) {
            const z2 = fround(fround(zx * zx) + fround(zy * zy));
            const Z2 = fround(fround(X * X) + fround(Y * Y));
            if (fround(z2 - Z2) > 0 || n >= N) {
                if (type === 7 && n > 0) {
                    const [Px, Py] = rows[Math.min(n - 1, N)];
                    dpx = fround(dpx + fround(Px)); dpy = fround(dpy + fround(Py));
                }
                zx = fround(zx + fround(X)); zy = fround(zy + fround(Y));
                n = 0;
                [X, Y, W1, W2] = rows[0];
            }
        }
        let nx, ny;
        switch (type) {
            case 0: case 1: {
                const t1 = fround(fround(X * zx) - fround(Y * zy));
                const t2 = fround(fround(X * zy) + fround(Y * zx));
                const xx = fround(zx * zx), yy = fround(zy * zy), xy = fround(zx * zy);
                nx = fround(fround(fround(2 * t1) + fround(xx - yy)) + DCX);
                ny = fround(fround(fround(2 * t2) + fround(2 * xy)) + DCY);
                break;
            }
            case 2: {
                const a_d = fround(fround(fround(2 * fround(fround(X * zx) - fround(Y * zy))) + fround(fround(zx * zx) - fround(zy * zy))) + DCX);
                const b_d = fround(fround(fround(2 * fround(fround(X * zy) + fround(Y * zx))) + fround(2 * fround(zx * zy))) + DCY);
                nx = strick(W1, a_d);
                ny = strick(W2, b_d);
                break;
            }
            case 3: {
                const t1 = fround(fround(X * zx) - fround(Y * zy));
                const t2 = fround(fround(X * zy) + fround(Y * zx));
                const xx = fround(zx * zx), yy = fround(zy * zy), xy = fround(zx * zy);
                nx = fround(fround(fround(2 * t1) + fround(xx - yy)) + DCX);
                ny = fround(fround(-fround(fround(2 * t2) + fround(2 * xy))) + DCY);
                break;
            }
            case 4: {
                const a_d = fround(fround(2 * fround(fround(X * zx) - fround(Y * zy))) + fround(fround(zx * zx) - fround(zy * zy)));
                const b_d = fround(fround(2 * fround(fround(X * zy) + fround(Y * zx))) + fround(2 * fround(zx * zy)));
                nx = fround(strick(W1, a_d) + DCX);
                ny = fround(b_d + DCY);
                break;
            }
            case 5: {
                const a_d = fround(fround(2 * fround(fround(X * zx) - fround(Y * zy))) + fround(fround(zx * zx) - fround(zy * zy)));
                const b_d = fround(fround(2 * fround(fround(X * zy) + fround(Y * zx))) + fround(2 * fround(zx * zy)));
                nx = fround(strick(W1, a_d) + DCX);
                ny = fround(-strick(W2, b_d) + DCY);
                break;
            }
            case 6: {
                const a_d = fround(fround(fround(2 * fround(fround(X * zx) - fround(Y * zy))) + fround(fround(zx * zx) - fround(zy * zy))) + DCX);
                nx = a_d;
                ny = fround(fround(-2 * fround(fround(Math.abs(X) * zy) + fround(Math.sign(X) * fround(zx * fround(Y + zy))))) + DCY);
                break;
            }
            case 7: {
                const t1 = fround(fround(X * zx) - fround(Y * zy));
                const t2 = fround(fround(X * zy) + fround(Y * zx));
                const xx = fround(zx * zx), yy = fround(zy * zy), xy = fround(zx * zy);
                nx = fround(fround(fround(fround(2 * t1) + fround(xx - yy)) + fround(P * dpx)) + DCX);
                ny = fround(fround(fround(fround(2 * t2) + fround(2 * xy)) + fround(P * dpy)) + DCY);
                break;
            }
            case 9: {
                const Z2r = fround(fround(X * X) - fround(Y * Y));
                const Z2i = fround(2 * fround(X * Y));
                const w1 = fround(fround(Z2r * zx) - fround(Z2i * zy));
                const w2 = fround(fround(Z2r * zy) + fround(Z2i * zx));
                const z2r = fround(fround(zx * zx) - fround(zy * zy));
                const z2i = fround(2 * fround(zx * zy));
                const v1 = fround(fround(X * z2r) - fround(Y * z2i));
                const v2 = fround(fround(X * z2i) + fround(Y * z2r));
                const z3r = fround(fround(z2r * zx) - fround(z2i * zy));
                const z3i = fround(fround(z2r * zy) + fround(z2i * zx));
                nx = fround(fround(fround(3 * w1) + fround(3 * v1)) + fround(z3r) + DCX);
                ny = fround(fround(fround(3 * w2) + fround(3 * v2)) + fround(z3i) + DCY);
                break;
            }
            case 10: {
                const Z2r = fround(fround(X * X) - fround(Y * Y));
                const Z2i = fround(2 * fround(X * Y));
                const Z3r = fround(fround(Z2r * X) - fround(Z2i * Y));
                const Z3i = fround(fround(Z2r * Y) + fround(Z2i * X));
                const z2r = fround(fround(zx * zx) - fround(zy * zy));
                const z2i = fround(2 * fround(zx * zy));
                const w1 = fround(fround(Z3r * zx) - fround(Z3i * zy));
                const w2 = fround(fround(Z3r * zy) + fround(Z3i * zx));
                const v1 = fround(fround(Z2r * z2r) - fround(Z2i * z2i));
                const v2 = fround(fround(Z2r * z2i) + fround(Z2i * z2r));
                const z3r = fround(fround(z2r * zx) - fround(z2i * zy));
                const z3i = fround(fround(z2r * zy) + fround(z2i * zx));
                const u1 = fround(fround(X * z3r) - fround(Y * z3i));
                const u2 = fround(fround(X * z3i) + fround(Y * z3r));
                const z4r = fround(fround(z2r * z2r) - fround(z2i * z2i));
                const z4i = fround(2 * fround(z2r * z2i));
                nx = fround(fround(fround(4 * w1) + fround(6 * v1)) + fround(fround(4 * u1) + z4r) + DCX);
                ny = fround(fround(fround(4 * w2) + fround(6 * v2)) + fround(fround(4 * u2) + z4i) + DCY);
                break;
            }
            default: nx = 0; ny = 0;
        }
        if (type === 7) { dpx = zx; dpy = zy; }
        zx = nx; zy = ny;
        n++;
        const wX = rows[Math.min(n, N)][0], wY = rows[Math.min(n, N)][1];
        const wx = fround(wX + zx), wy = fround(wY + zy);
        if (fround(fround(wx * wx) + fround(wy * wy)) > 4) return i;
    }
    return maxI;
}

// family-aware edge walk: for c-space families the probed point IS c;
// for Julia the walk moves the z₀-space view center while c stays the seed
function walk(type, startC, startZ, levels, maxI, juliaSeed) {
    let cx = startC[0], cy = startC[1], zoom = startZ;
    const W = 64, H = 48, aspect = W / H;
    for (let lv = 0; lv < levels; lv++) {
        let best = null;
        for (let py = 0; py < H && !best; py++)
            for (let px = 0; px < W && !best; px++) {
                const x = cx + (px / W - 0.5) * aspect * zoom;
                const y = cy + (0.5 - py / H) * zoom;
                const v = juliaSeed
                    ? truth(type, x, y, juliaSeed[0], juliaSeed[1], maxI)
                    : truth(type, x, y, x, y, maxI);
                if (v > maxI * 0.2 && v < maxI * 0.8) best = { x, y };
            }
        if (!best) break;
        cx = best.x; cy = best.y;
        zoom /= 10;
    }
    return { cx, cy, zoom };
}

function testFamily(type, cx0, cy0, zoom, maxI, label, juliaSeed) {
    const W = 64, H = 48, aspect = W / H;
    const julia = !!juliaSeed;
    const seed = juliaSeed || [cx0, cy0];
    // reference orbit: z₀ = view center (Julia) or 0 (c-space); c = seed (Julia) or view center
    const { rows, N } = makeRef(type, julia ? cx0 : 0, julia ? cy0 : 0, seed[0], seed[1], maxI);
    let bad = 0, maxErr = 0;
    const tSet = new Set(), pSet = new Set();
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const tx = cx0 + (px / W - 0.5) * aspect * zoom;
            const ty = cy0 + (0.5 - py / H) * zoom;
            const dcx = fround(fround(fround(px / W) - 0.5) * fround(aspect * zoom));
            const dcy = fround(fround(0.5 - fround(py / H)) * fround(zoom));
            const t = julia
                ? truth(type, tx, ty, seed[0], seed[1], maxI)
                : truth(type, tx, ty, tx, ty, maxI);
            const p = ptIter(type, rows, N, dcx, dcy, maxI, julia);
            if (p !== t) { bad++; maxErr = Math.max(maxErr, Math.abs(p - t)); }
            tSet.add(t); pSet.add(p);
        }
    }
    console.log(label.padEnd(20), 'zoom', zoom.toExponential(1).padEnd(8),
        '| N', String(N).padStart(3), '| wrong', String(bad).padStart(4), '/', W * H,
        '| maxErr', String(maxErr).padStart(3),
        '| distinct', tSet.size + '/' + pSet.size);
}


module.exports = { truth, makeRef };