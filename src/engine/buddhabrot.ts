/**
 * Buddhabrot — the ghost of the set.
 *
 * Instead of coloring each pixel by escape time, the orbits of escaping
 * starting points are scattered into a fixed plane region as accumulating
 * light. The accumulator runs on the CPU in small chunks per frame, so the
 * god-form emerges progressively: the longer you sit (shrine mode!), the
 * more detail materializes out of chaos.
 *
 * The Mandelbrot map (z → z² + c) is used regardless of the selected
 * fractal family — this is the ghost of The Root.
 *
 * Sampling is probe-filtered: a point is kept only if it escapes within a
 * band [minEscape, cap) — fast escapers add nothing but noise, interiors
 * never escape and would burn the whole iteration budget. The kept orbit's
 * path (stored during the probe, no re-iteration) is then splatted as light.
 * The PRNG is seeded from the Quantum Seed entropy stream, so every
 * session's ghost is unique but reproducible from its seed.
 */

/** Plane-space region the field covers (the classic whole-set frame). */
export const BB_REGION_MIN: [number, number] = [-2.4, -1.5];
export const BB_REGION_SIZE: [number, number] = [4.0, 3.0];

const BAILOUT2 = 4.0; // |z|² > 4 ⇒ escaped
/** Orbits escaping in fewer iterations than this are discarded. */
const MIN_ESCAPE = 12;
/** Hard cap on plotted iterations (protects the frame budget). */
const MAX_PLOT_CAP = 250;

export interface BuddhabrotAcc {
    /** Raw light counts, row-major, top-to-bottom. */
    counts: Float32Array;
    /** Normalized view (0..255, log-scaled) refreshed by prepareView(). */
    view: Uint8Array;
    width: number;
    height: number;
    maxVal: number;
    /** True when new light landed since the last upload. */
    dirty: boolean;
    orbitsPlotted: number;
    steps: number;
    /** Advance one chunk of accumulation work (budget in iterations). */
    step(budget: number, maxIterations: number): void;
    /** Refresh view from counts/maxVal (log normalization) for upload. */
    prepareView(): Uint8Array;
    reset(): void;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createBuddhabrot(seedHex: string, width = 640, height = 480): BuddhabrotAcc {
    const counts = new Float32Array(width * height);
    const view = new Uint8Array(width * height);
    const seed = parseInt(seedHex.slice(0, 8) || '12345678', 16) || 12345678;
    const rand = mulberry32(seed);
    const [rx, ry] = BB_REGION_MIN;
    const [rw, rh] = BB_REGION_SIZE;
    // Scratch orbit path (2 floats per iterate).
    const path = new Float32Array(2 * MAX_PLOT_CAP);

    const acc: BuddhabrotAcc = {
        counts,
        view,
        width,
        height,
        maxVal: 0,
        dirty: false,
        orbitsPlotted: 0,
        steps: 0,

        step(budget, maxIterations) {
            const cap = Math.min(Math.max(maxIterations, 50), MAX_PLOT_CAP);
            const cw = acc.width;
            const ch = acc.height;
            const cts = acc.counts;
            let work = 0;
            while (work < budget) {
                const cx = rx + rand() * rw;
                const cy = ry + rand() * rh;
                let zx = 0;
                let zy = 0;
                let i = 0;
                // Probe phase: iterate, storing the path, until escape or cap.
                for (; i < cap; i++) {
                    const nx = zx * zx - zy * zy + cx;
                    zy = 2 * zx * zy + cy;
                    zx = nx;
                    path[2 * i] = zx;
                    path[2 * i + 1] = zy;
                    if (zx * zx + zy * zy > BAILOUT2) {
                        i++;
                        break;
                    }
                }
                work += i;
                // Fast escaper (noise) or interior (never escapes) — skip.
                if (i < MIN_ESCAPE || i >= cap) continue;

                // Plot the stored path as light (2×2 nearest-neighbour splat).
                let plotted = 0;
                for (let j = 0; j < i; j++) {
                    const px = (path[2 * j] - rx) / rw;
                    const py = (path[2 * j + 1] - ry) / rh;
                    if (px >= 0 && px < 1 && py >= 0 && py < 1) {
                        const idx = ((py * ch) | 0) * cw + ((px * cw) | 0);
                        const nv = cts[idx] + 1;
                        cts[idx] = nv;
                        if (nv > acc.maxVal) acc.maxVal = nv;
                        plotted++;
                    }
                }
                work += plotted;
                acc.orbitsPlotted++;
                acc.dirty = true;
            }
            acc.steps++;
        },

        prepareView() {
            const inv = 1 / Math.log1p(acc.maxVal);
            for (let i = 0; i < acc.counts.length; i++) {
                acc.view[i] = Math.min(255, Math.round(255 * Math.log1p(acc.counts[i]) * inv));
            }
            return acc.view;
        },

        reset() {
            acc.counts.fill(0);
            acc.maxVal = 0;
            acc.orbitsPlotted = 0;
            acc.steps = 0;
            acc.dirty = true;
            acc.prepareView();
        },
    };

    return acc;
}