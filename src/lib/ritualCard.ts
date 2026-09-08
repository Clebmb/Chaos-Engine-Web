/**
 * Ritual card — a shareable PNG artifact documenting a sigil working.
 *
 * Layout (900×1200, postable portrait):
 *   ┌────────────────────────┐
 *   │      CHAOS ENGINE      │  header
 *   │     · RITUAL CARD ·    │
 *   │  ┌──────────────────┐  │
 *   │  │                  │  │
 *   │  │      SIGIL       │  │  the glyph, fit and centered
 *   │  │                  │  │
 *   │  └──────────────────┘  │
 *   │   "statement of        │  wrapped, quoted intent
 *   │      intent..."        │
 *   │  ────────────────────  │
 *   │ MOON  ◕ Waning Cr…     │
 *   │ HOUR  ♂ Mars — hour 7  │  planetary hour (Chaldean)
 *   │ DATE  September 7, 2026│
 *   │ SEED  a7039684f21c…    │  entropy hash + provenance seal
 *   └────────────────────────┘
 */

export interface RitualCardData {
    /** Statement of intent — the working's purpose. */
    intent: string;
    /** The glyph export canvas (transparent); drawn centered on the panel. */
    sigil: HTMLCanvasElement | null;
    /** Ready-to-print moon line, e.g. "◕ Waning Crescent (17%)". */
    moonText: string;
    /** Ready-to-print hour line, e.g. "♂ Mars — hour 7 (day)". */
    hourText: string;
    /** Ready-to-print date line. */
    dateText: string;
    /** Full entropy hex; the card prints a prefix and seals the provenance. */
    seedHex: string;
    entropySource: 'BEACON' | 'CSPRNG';
}

const W = 900;
const H = 1200;
const FONT = '"Courier New", monospace';

const RED = '#ff2a2a';
const DIM_RED = '#8b0000';
const PAPER = '#050000';
const PANEL = '#0a0002';
const VALUE = '#d8d0c8';

/** Greedy word-wrap. Returns up to maxLines, ellipsizing the last if needed. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width <= maxWidth) {
            line = next;
        } else {
            if (line) lines.push(line);
            line = word;
            if (lines.length === maxLines) break;
        }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && (line || words.length > lines.join(' ').split(/\s+/).length)) {
        // Ellipsize the final line if content remains.
        const consumed = lines.join(' ').split(/\s+/).length;
        if (consumed < words.length || line) {
            let last = lines[maxLines - 1];
            while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
                last = last.slice(0, -1);
            }
            lines[maxLines - 1] = last + '…';
        }
    }
    return lines;
}

export function renderRitualCard(card: RitualCardData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Backdrop
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = DIM_RED;
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.strokeStyle = 'rgba(255, 42, 42, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(26, 26, W - 52, H - 52);

    // Header
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = RED;
    ctx.font = `bold 36px ${FONT}`;
    ctx.fillText('CHAOS ENGINE', W / 2, 88);
    ctx.fillStyle = DIM_RED;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('· R I T U A L   C A R D ·', W / 2, 120);

    // Sigil panel
    const panel = { x: 90, y: 150, w: W - 180, h: 600 };
    ctx.fillStyle = PANEL;
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.strokeStyle = 'rgba(255, 42, 42, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);

    if (card.sigil && card.sigil.width > 0 && card.sigil.height > 0) {
        const scale = Math.min(
            (panel.w * 0.88) / card.sigil.width,
            (panel.h * 0.88) / card.sigil.height
        );
        const sw = card.sigil.width * scale;
        const sh = card.sigil.height * scale;
        ctx.drawImage(card.sigil, panel.x + (panel.w - sw) / 2, panel.y + (panel.h - sh) / 2, sw, sh);
    } else {
        ctx.fillStyle = DIM_RED;
        ctx.font = `20px ${FONT}`;
        ctx.fillText('( no glyph )', panel.x + panel.w / 2, panel.y + panel.h / 2);
    }

    // Statement of intent — quoted, wrapped
    ctx.fillStyle = RED;
    ctx.font = `italic 30px ${FONT}`;
    const intentLines = wrapText(ctx, card.intent ? `"${card.intent}"` : '"( unnamed working )"', W - 200, 4);
    let ty = panel.y + panel.h + 76;
    for (const line of intentLines) {
        ctx.fillText(line, W / 2, ty);
        ty += 40;
    }

    // Meta block
    const metaTop = H - 240;
    ctx.strokeStyle = 'rgba(255, 42, 42, 0.35)';
    ctx.beginPath();
    ctx.moveTo(90, metaTop);
    ctx.lineTo(W - 90, metaTop);
    ctx.stroke();

    const rows: Array<[string, string]> = [
        ['MOON', card.moonText],
        ['HOUR', card.hourText],
        ['DATE', card.dateText],
        ['SEED', `${card.seedHex.slice(0, 16)}…  ${card.entropySource === 'BEACON' ? '◈ BEACON-SEALED' : '◈ CSPRNG-SEALED'}`],
    ];
    let my = metaTop + 44;
    for (const [label, value] of rows) {
        ctx.textAlign = 'left';
        ctx.fillStyle = DIM_RED;
        ctx.font = `bold 20px ${FONT}`;
        ctx.fillText(label, 100, my);
        ctx.fillStyle = VALUE;
        ctx.font = `21px ${FONT}`;
        ctx.fillText(value, 210, my);
        my += 44;
    }
    ctx.textAlign = 'center';

    return canvas;
}
