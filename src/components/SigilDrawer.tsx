import React, { useState, useRef, useEffect } from 'react';
import {
    renderGlyph, renderGlyphExport, uniqueLetters,
    DEFAULT_GLYPH_STYLE,
} from '../lib/glyph';
import type { GlyphStyle } from '../lib/glyph';

interface SigilDrawerProps {
    onClose: () => void;
    /** Called with a PNG data URL when the user charges a glyph as an overlay. */
    onUseAsOverlay: (dataUrl: string) => void;
}

const CANVAS_SIZE = 320;
const EXPORT_SCALE = 2;

const SWATCHES = [
    '#ff2a2a', '#ff6600', '#ffee00', '#33ff44', '#00ffee', '#4477ff',
    '#bb44ff', '#ff44aa', '#ffffff',
];

/**
 * Spare-style sigil workshop: reduces a statement of intent to its unique
 * letters, then connects their positions on a letter rose into a single
 * glyph. Visual options control the look; the charge/download export can be
 * transparent-backed so the glyph composites cleanly onto the fractal.
 */
export const SigilDrawer: React.FC<SigilDrawerProps> = ({ onClose, onUseAsOverlay }) => {
    const [intent, setIntent] = useState('');
    const [style, setStyle] = useState<GlyphStyle>(DEFAULT_GLYPH_STYLE);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const update = <K extends keyof GlyphStyle>(key: K, value: GlyphStyle[K]) =>
        setStyle(prev => ({ ...prev, [key]: value }));

    // Redraw whenever the intent or style changes.
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;
        // Live preview always shows the rose on black; the checkerboard behind
        // the canvas hints at the transparent export.
        renderGlyph(ctx, CANVAS_SIZE, uniqueLetters(intent), style, {
            includeRose: style.showRose,
            bg: style.transparentBg ? null : style.bgColor,
        });
    }, [intent, style]);

    /** Renders the export canvas at 2x with the chosen background treatment. */
    const renderExport = (): HTMLCanvasElement | null =>
        renderGlyphExport(uniqueLetters(intent), style, CANVAS_SIZE, EXPORT_SCALE);

    const handleCharge = () => {
        const out = renderExport();
        if (!out) return;
        onUseAsOverlay(out.toDataURL('image/png'));
        onClose();
    };

    const handleDownload = () => {
        const out = renderExport();
        if (!out) return;
        const link = document.createElement('a');
        link.download = `sigil_glyph_${Date.now()}.png`;
        link.href = out.toDataURL('image/png');
        link.click();
    };

    return (
        <div className="sigil-scribe-modal drawer-title" role="dialog" aria-modal="true">
            <div className="modal-content">
                <button className="close-button" onClick={onClose} aria-label="Close">&times;</button>
                <h2>Sigil Workshop</h2>
                <p className="scribe-info">
                    Reduce your statement of intent to its unique letters, then join them
                    on the rose wheel into a single Spare-style glyph.
                </p>

                <div className="control-group">
                    <input
                        type="text"
                        placeholder="Enter Statement of Intent..."
                        value={intent}
                        onChange={(e) => setIntent(e.target.value)}
                    />
                    <div className="button-grid">
                        <button onClick={handleCharge} disabled={!intent.trim()}>Charge as Overlay</button>
                        <button className="secondary" onClick={handleDownload} disabled={!intent.trim()}>
                            Download Glyph
                        </button>
                    </div>
                </div>

                <div className="sigil-drawer-canvas-wrap">
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_SIZE}
                        height={CANVAS_SIZE}
                        className={`sigil-drawer-canvas${style.transparentBg ? ' transparent' : ''}`}
                    />
                </div>

                <div className="drawer-options">
                    <div className="section-title">Appearance</div>
                    <div className="drawer-options-grid">
                        <div className="slider-group">
                            <label>Line Color</label>
                            <div className="swatch-row">
                                <input
                                    type="color"
                                    className="color-input"
                                    value={style.lineColor}
                                    onChange={(e) => update('lineColor', e.target.value)}
                                    aria-label="Sigil line color"
                                />
                                {SWATCHES.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        className={`swatch${style.lineColor.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
                                        style={{ background: c }}
                                        onClick={() => update('lineColor', c)}
                                        aria-label={`Set color ${c}`}
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="slider-group">
                            <label>Line Width: {style.lineWidth.toFixed(1)}</label>
                            <input
                                type="range" min="0.5" max="6" step="0.5"
                                value={style.lineWidth}
                                onChange={(e) => update('lineWidth', parseFloat(e.target.value))}
                            />
                        </div>

                        <div className="slider-group">
                            <label>Glow: {style.glow}</label>
                            <input
                                type="range" min="0" max="20" step="1"
                                value={style.glow}
                                onChange={(e) => update('glow', parseFloat(e.target.value))}
                            />
                        </div>

                        <div className="drawer-toggles">
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={style.smooth}
                                    onChange={(e) => update('smooth', e.target.checked)}
                                />
                                Smooth Strokes
                            </label>
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={style.showNodes}
                                    onChange={(e) => update('showNodes', e.target.checked)}
                                />
                                Letter Nodes
                            </label>
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={style.showMarkers}
                                    onChange={(e) => update('showMarkers', e.target.checked)}
                                />
                                Start/End Marks
                            </label>
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={style.showRose}
                                    onChange={(e) => update('showRose', e.target.checked)}
                                />
                                Show Rose Wheel
                            </label>
                        </div>
                    </div>

                    <div className="section-title">Export</div>
                    <div className="drawer-options-grid">
                        <label className="checkbox-group">
                            <input
                                type="checkbox"
                                checked={style.transparentBg}
                                onChange={(e) => update('transparentBg', e.target.checked)}
                            />
                            Transparent Background
                        </label>
                        <div className="slider-group">
                            <label>Background Color (when not transparent)</label>
                            <input
                                type="color"
                                className="color-input"
                                value={style.bgColor}
                                disabled={style.transparentBg}
                                onChange={(e) => update('bgColor', e.target.value)}
                                aria-label="Glyph background color"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
