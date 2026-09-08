/**
 * The Sigilarium engine — grid-and-line sigils, ported from the original
 * Sigilarium project so the Sigil Workshop can draw them alongside its own
 * rose glyphs.
 *
 * A sigil is a polyline through 9 anchor points on a chosen grid:
 *   - Saturn (3×3), Witch Wheel (9-point circle), or Chaos Scatter (random)
 * fed by four source modes: reduced text, digits, freehand drawing, or an
 * image sampled along its diagonal. The frame renderer layers the classical
 * Sigilarium effects — kaleidoscope segments, X/Y mirroring, and six
 * animations (segment draw, line flow, rotate CW/CCW, pulse, chroma) — all
 * driven by a timestamp so live preview and GIF frames render identically.
 *
 * Points are stored in unit space (0..1) so one path renders at any size.
 */

import GIF from 'gif.js';
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url';

export type Pt = { x: number; y: number };

export type SigilSourceMode = 'rose' | 'text' | 'number' | 'draw' | 'image';
export type SigilGrid = 'saturn' | 'wheel' | 'scatter';

/** Virtual canvas the original Sigilarium drew on; ratios derive from it. */
export const SIGIL_DESIGN_SIZE = 600;

export interface SigilAnimationState {
    segmentDraw: boolean; segmentSpeed: number;
    lineDash: boolean; lineDashSpeed: number;
    rotateCw: boolean; rotateCwSpeed: number;
    rotateCcw: boolean; rotateCcwSpeed: number;
    pulse: boolean; pulseSpeed: number;
    chroma: boolean; chromaSpeed: number;
}

export const DEFAULT_SIGIL_ANIM: SigilAnimationState = {
    segmentDraw: false, segmentSpeed: 5,
    lineDash: false, lineDashSpeed: 5,
    rotateCw: false, rotateCwSpeed: 5,
    rotateCcw: false, rotateCcwSpeed: 5,
    pulse: false, pulseSpeed: 5,
    chroma: false, chromaSpeed: 5,
};

export interface SigilGeomState {
    grid: SigilGrid;
    kaleidoscope: number; // 1..16
    symX: boolean;
    symY: boolean;
    glow: boolean;
    curves: boolean;
    anim: SigilAnimationState;
}

export const DEFAULT_SIGIL_GEOM: SigilGeomState = {
    grid: 'saturn',
    kaleidoscope: 1,
    symX: false,
    symY: false,
    glow: true,
    curves: false,
    anim: DEFAULT_SIGIL_ANIM,
};

/** Classical Golden-Dawn-style letter→number table used by the Sigilarium. */
export const LETTER_GRID: Record<string, number> = {
    A: 1, J: 1, S: 1, B: 2, K: 2, T: 2, C: 3, L: 3, U: 3, D: 4, M: 4, W: 4,
    E: 5, N: 5, V: 5, F: 6, O: 6, X: 6, G: 7, P: 7, Y: 7, H: 8, Q: 8, Z: 8,
    I: 9, R: 9,
};

export const NUMBER_GRID: Record<string, number> = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '0': 5,
};

const MARGIN = 80 / SIGIL_DESIGN_SIZE;

/** The 9 anchor points of a grid system, in unit space. Scatter re-rolls. */
export function gridCoords(grid: SigilGrid): Record<number, Pt> {
    const m = MARGIN;
    const span = 1 - 2 * m;
    if (grid === 'saturn') {
        return {
            1: { x: m, y: m }, 2: { x: 0.5, y: m }, 3: { x: 1 - m, y: m },
            4: { x: m, y: 0.5 }, 5: { x: 0.5, y: 0.5 }, 6: { x: 1 - m, y: 0.5 },
            7: { x: m, y: 1 - m }, 8: { x: 0.5, y: 1 - m }, 9: { x: 1 - m, y: 1 - m },
        };
    }
    if (grid === 'wheel') {
        const p: Record<number, Pt> = {};
        for (let i = 0; i < 9; i++) {
            const a = (i * (2 * Math.PI / 9)) - (Math.PI / 2);
            p[i + 1] = { x: 0.5 + (span / 2) * Math.cos(a), y: 0.5 + (span / 2) * Math.sin(a) };
        }
        return p;
    }
    // scatter — a fresh arrangement on every call, as in the original
    const p: Record<number, Pt> = {};
    for (let i = 1; i <= 9; i++) {
        p[i] = { x: m + Math.random() * span, y: m + Math.random() * span };
    }
    return p;
}

/**
 * Builds the path for text or number sources. Text reduces the statement the
 * Sigilarium way: strip vowels and whitespace, dedupe, then map each letter
 * to its grid number. Numbers map digits directly ('0' sits on 5).
 * `coords` comes from `gridCoords` so scatter layouts stay stable per draw.
 */
export function buildTextPath(
    input: string,
    mode: 'text' | 'number',
    coords: Record<number, Pt>
): Pt[] {
    const processed = mode === 'text'
        ? Array.from(new Set(input.toUpperCase().replace(/[AEIOU\s]/g, ''))).join('')
        : input.replace(/[^0-9]/g, '');
    const table = mode === 'text' ? LETTER_GRID : NUMBER_GRID;
    const pts: Pt[] = [];
    for (const ch of processed) {
        const n = table[ch];
        if (n) pts.push(coords[n]);
    }
    return pts;
}

/** Maps an already-computed digit sequence (e.g. from an image) onto a grid. */
export function buildDigitPath(digits: string, coords: Record<number, Pt>): Pt[] {
    const pts: Pt[] = [];
    for (const d of digits) {
        const n = NUMBER_GRID[d];
        if (n) pts.push(coords[n]);
    }
    return pts;
}

/**
 * Samples an image along its diagonal into a digit sequence (brightness →
 * 1..9), exactly as the Sigilarium's image mode did.
 */
export function imageToDigits(img: HTMLImageElement, samples = 20): string {
    const size = 100;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let seq = '';
    for (let i = 0; i < samples; i++) {
        const x = Math.floor((i / samples) * size);
        const y = Math.floor((i / samples) * size);
        const idx = (y * size + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        seq += String(Math.floor((brightness / 255) * 8) + 1);
    }
    return seq;
}

export function pathLength(pts: Pt[]): number {
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return len;
}

/** The polyline truncated after `drawn` units of arc length. */
export function partialPath(pts: Pt[], drawn: number): Pt[] {
    if (pts.length < 2 || drawn >= pathLength(pts)) return pts;
    const out: Pt[] = [pts[0]];
    let remaining = drawn;
    for (let i = 0; i < pts.length - 1; i++) {
        const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        if (remaining <= segLen) {
            const t = segLen === 0 ? 0 : remaining / segLen;
            out.push({
                x: pts[i].x + t * (pts[i + 1].x - pts[i].x),
                y: pts[i].y + t * (pts[i + 1].y - pts[i].y),
            });
            return out;
        }
        remaining -= segLen;
        out.push(pts[i + 1]);
    }
    return out;
}

function mirrorPoints(pts: Pt[], mx: boolean, my: boolean): Pt[] {
    return pts.map(p => ({ x: mx ? 1 - p.x : p.x, y: my ? 1 - p.y : p.y }));
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Pt[], curves: boolean): void {
    if (pts.length < 1) return;
    ctx.beginPath();
    if (curves && pts.length > 1) {
        const m = pts.map((p, i) => {
            const n = pts[i + 1] ?? p;
            return { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 };
        });
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(m[0].x, m[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, m[i].x, m[i].y);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    } else {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Start/end nodes, as the original drew them.
    if (pts.length > 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 5, 0, 2 * Math.PI);
        ctx.fill();
    }
}

export interface SigilFrameOpts {
    points: Pt[];
    color: string;
    /** Stroke width in px at the current canvas size. */
    lineWidth: number;
    /** Shadow blur in px; 0 disables. */
    glow: number;
    curves: boolean;
    symX: boolean;
    symY: boolean;
    kaleidoscope: number;
    rotation: number;
    alpha: number;
    anim: SigilAnimationState;
    /** 0..1 draw-in; omit or 1 for the complete sigil. */
    chargeProgress?: number;
}

/**
 * Draws one frame of the sigil at `size`×`size`. `timestamp` drives every
 * animation; pass 0 for a static render (exports, GIF frames handle their
 * own timestamps).
 */
export function drawSigilFrame(
    ctx: CanvasRenderingContext2D,
    size: number,
    o: SigilFrameOpts,
    timestamp = 0
): void {
    if (o.points.length < 1) return;
    ctx.save();
    ctx.globalAlpha = o.alpha;

    const color = o.anim.chroma
        ? `hsl(${(timestamp * (o.anim.chromaSpeed * 0.02)) % 360}, 100%, 50%)`
        : o.color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = o.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowBlur = o.glow;

    if (o.anim.lineDash) {
        ctx.setLineDash([20, 15]);
        ctx.lineDashOffset = -(timestamp * (o.anim.lineDashSpeed * 0.015));
    } else {
        ctx.setLineDash([]);
    }

    const scaled = o.points.map(p => ({ x: p.x * size, y: p.y * size }));
    const total = pathLength(scaled);

    let drawn = total;
    if (o.chargeProgress !== undefined && o.chargeProgress < 1) {
        drawn = total * o.chargeProgress;
    } else if (o.anim.segmentDraw) {
        const duration = Math.max(100, 10000 / (o.anim.segmentSpeed || 1));
        drawn = total * ((timestamp % duration) / duration);
    }
    let pts = drawn < total ? partialPath(scaled, drawn) : scaled;

    const paths: Pt[][] = [pts];
    if (o.symX) paths.push(mirrorPoints(pts, true, false));
    if (o.symY) paths.push(mirrorPoints(pts, false, true));
    if (o.symX && o.symY) paths.push(mirrorPoints(pts, true, true));

    ctx.translate(size / 2, size / 2);
    if (o.anim.pulse) {
        const s = 0.95 + 0.05 * Math.sin(timestamp * (o.anim.pulseSpeed * 0.001));
        ctx.scale(s, s);
    }
    ctx.rotate(o.rotation);
    ctx.translate(-size / 2, -size / 2);

    const segments = Math.max(1, Math.round(o.kaleidoscope));
    const angleIncrement = (2 * Math.PI) / segments;
    for (let i = 0; i < segments; i++) {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(angleIncrement * i);
        ctx.translate(-size / 2, -size / 2);
        paths.forEach(path => strokePath(ctx, path, o.curves));
        ctx.restore();
    }
    ctx.restore();
}

export interface SigilGifOptions {
    points: Pt[];
    color: string;
    lineWidth: number;
    /** Shadow blur in px at the GIF canvas size; 0 disables. */
    glow: number;
    curves: boolean;
    symX: boolean;
    symY: boolean;
    kaleidoscope: number;
    /** Opaque fill color for every frame; ignored when transparent is set. */
    bgColor: string;
    /**
     * When true, frames keep an alpha channel: pixels with alpha below
     * `alphaThreshold` are keyed out and become the GIF's transparent index.
     * gif.js conveys transparency by color (its pixel pipeline discards
     * alpha), so keyed pixels are painted a rare magic color that is passed
     * to the encoder as the `transparent` option.
     */
    transparent?: boolean;
    alphaThreshold?: number;
    anim: SigilAnimationState;
    size?: number;
    frames?: number;
    fps?: number;
    onProgress?: (pct: number) => void;
}

/**
 * The magic color used to key transparency, packed 0xRRGGBB. gif.js finds
 * the closest palette entry to this color among those actually used and
 * marks that index transparent, so the key only needs to be rare among the
 * artwork's colors, not unique. A slightly-off black reads as black to the
 * eye but is vanishingly unlikely to collide with a rendered sigil line.
 */
const GIF_TRANSPARENT_KEY = 0x010101;

/**
 * Reads a canvas into ImageData with alpha<threshold painted the magic key
 * color. Frames must be passed to gif.js as raw ImageData: its canvas path
 * (`copy: true`) routes through an opaque internal canvas that would
 * destroy the alpha information this pipeline depends on.
 */
function keyedFrameData(canvas: HTMLCanvasElement, threshold: number): ImageData {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < threshold) {
            d[i] = (GIF_TRANSPARENT_KEY >> 16) & 0xff;
            d[i + 1] = (GIF_TRANSPARENT_KEY >> 8) & 0xff;
            d[i + 2] = GIF_TRANSPARENT_KEY & 0xff;
            d[i + 3] = 255;
        }
    }
    return img;
}

/**
 * Renders the animated sigil to a GIF with gif.js. Rotation loops seamlessly
 * over the clip (one full turn scaled by speed), matching the original
 * Sigilarium export.
 */
export async function exportSigilGif(o: SigilGifOptions): Promise<Blob> {
    const size = Math.round(o.size ?? SIGIL_DESIGN_SIZE);
    const frames = o.frames ?? 60;
    const fps = o.fps ?? 30;
    const delay = Math.round(1000 / fps);
    const duration = frames * delay;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');

    const transparent = o.transparent === true;
    const threshold = o.alphaThreshold ?? 128;

    const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: gifWorkerUrl,
        width: size,
        height: size,
        // Convey transparency by color: the encoder marks the palette entry
        // closest to this key (among used entries) as the transparent index.
        transparent: transparent ? GIF_TRANSPARENT_KEY : null,
    });

    gif.on('progress', (p: number) => o.onProgress?.(Math.round(p * 100)));

    return new Promise<Blob>((resolve, reject) => {
        gif.on('finished', (blob: Blob) => resolve(blob));
        gif.on('error', (err: Error) => reject(err));

        let frame = 0;
        const renderFrame = () => {
            if (frame >= frames) {
                gif.render();
                return;
            }
            const timestamp = frame * delay;
            const a = o.anim;
            let rotation = 0;
            if (a.rotateCw) rotation = (a.rotateCwSpeed / 5) * (2 * Math.PI) * (timestamp / duration);
            else if (a.rotateCcw) rotation = -(a.rotateCcwSpeed / 5) * (2 * Math.PI) * (timestamp / duration);

            if (!transparent) {
                ctx.fillStyle = o.bgColor;
                ctx.fillRect(0, 0, size, size);
            } else {
                // Start from fully transparent so untouched pixels key out.
                ctx.clearRect(0, 0, size, size);
            }
            drawSigilFrame(ctx, size, {
                points: o.points,
                color: o.color,
                lineWidth: o.lineWidth,
                glow: o.glow,
                curves: o.curves,
                symX: o.symX,
                symY: o.symY,
                kaleidoscope: o.kaleidoscope,
                rotation,
                alpha: 1,
                anim: a,
            }, timestamp);
            if (transparent) {
                // Raw ImageData preserves the alpha the canvas path would
                // destroy; keyed pixels carry the transparency by color.
                gif.addFrame(keyedFrameData(canvas, threshold), { delay });
            } else {
                gif.addFrame(canvas, { copy: true, delay });
            }
            frame++;
            requestAnimationFrame(renderFrame);
        };
        renderFrame();
    });
}
