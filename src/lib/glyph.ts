/**
 * Shared Spare-style glyph renderer.
 *
 * Reduces a statement of intent to its unique letters, positions them on a
 * 26-letter rose wheel, and connects them into a single glyph. Used by both
 * the Sigil Workshop and the Servitor creation wizard so every sigil in the
 * app is drawn by one engine.
 */

export interface GlyphStyle {
    lineColor: string;
    lineWidth: number;
    glow: number;
    smooth: boolean;
    showNodes: boolean;
    showMarkers: boolean;
    showRose: boolean;
    /** Export options: transparent background (default) or filled. */
    transparentBg: boolean;
    bgColor: string;
}

export const DEFAULT_GLYPH_STYLE: GlyphStyle = {
    lineColor: '#ff2a2a',
    lineWidth: 2.5,
    glow: 6,
    smooth: true,
    showNodes: true,
    showMarkers: true,
    showRose: true,
    transparentBg: true,
    bgColor: '#000000',
};

/** Letter position on the rose wheel: 26 letters around a circle. */
export function roseLetterPos(letter: string, size: number): { x: number; y: number } {
    const idx = letter.charCodeAt(0) - 65;
    const angle = (idx / 26) * Math.PI * 2 - Math.PI / 2;
    const r = size * 0.36;
    return {
        x: size / 2 + Math.cos(angle) * r,
        y: size / 2 + Math.sin(angle) * r,
    };
}

/** Unique A–Z letters of a statement of intent, in order of first appearance. */
export function uniqueLetters(text: string): string[] {
    return Array.from(new Set(text.toUpperCase().split('').filter(c => /[A-Z]/.test(c))));
}

/**
 * Draws the glyph into a context covering `size` × `size` square units.
 * When `bg` is null the background is left transparent (live checkerboard
 * preview and the export default). `includeRose` controls the decorative
 * rose wheel; it is never baked into a charged/exported glyph.
 */
export function renderGlyph(
    ctx: CanvasRenderingContext2D,
    size: number,
    letters: string[],
    s: GlyphStyle,
    opts: { includeRose: boolean; bg: string | null }
): void {
    ctx.clearRect(0, 0, size, size);
    if (opts.bg) {
        ctx.fillStyle = opts.bg;
        ctx.fillRect(0, 0, size, size);
    }

    if (opts.includeRose) {
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = '13px "Courier New", monospace';
        ctx.fillStyle = 'rgba(139, 0, 0, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i);
            const p = roseLetterPos(letter, size);
            ctx.fillText(letter, p.x, p.y);
        }
    }

    if (letters.length === 0) return;

    const points = letters.map(l => roseLetterPos(l, size));

    ctx.strokeStyle = s.lineColor;
    ctx.lineWidth = s.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.glow > 0) {
        ctx.shadowColor = s.lineColor;
        ctx.shadowBlur = s.glow;
    } else {
        ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    if (s.smooth && points.length > 2) {
        // Catmull-Rom → cubic Bézier smoothing through every point.
        const pts = [points[0], ...points, points[points.length - 1]];
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < pts.length - 2; i++) {
            const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
            const c1x = p1.x + (p2.x - p0.x) / 6;
            const c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6;
            const c2y = p2.y - (p3.y - p1.y) / 6;
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
        }
    } else {
        points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (s.showNodes) {
        ctx.fillStyle = s.lineColor;
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, s.lineWidth * 1.1, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    if (s.showMarkers && points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        ctx.strokeStyle = s.lineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(first.x, first.y, s.lineWidth * 2.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(last.x - s.lineWidth * 2.8, last.y);
        ctx.lineTo(last.x + s.lineWidth * 2.8, last.y);
        ctx.stroke();
    }
}

/** Renders the export canvas at `scale`x with the chosen background treatment. */
export function renderGlyphExport(
    letters: string[],
    s: GlyphStyle,
    size: number,
    scale: number = 2
): HTMLCanvasElement | null {
    if (letters.length === 0) return null;
    const out = document.createElement('canvas');
    out.width = size * scale;
    out.height = size * scale;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.scale(scale, scale);
    renderGlyph(octx, size, letters, s, {
        includeRose: false,
        bg: s.transparentBg ? null : s.bgColor,
    });
    return out;
}
