import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    renderGlyph, renderGlyphExport, uniqueLetters,
    DEFAULT_GLYPH_STYLE,
} from '../lib/glyph';
import type { GlyphStyle } from '../lib/glyph';
import {
    SIGIL_DESIGN_SIZE, gridCoords, buildTextPath, buildDigitPath,
    imageToDigits, drawSigilFrame, exportSigilGif,
    DEFAULT_SIGIL_GEOM,
} from '../lib/sigil';
import type { Pt, SigilSourceMode, SigilGrid, SigilGeomState } from '../lib/sigil';
import { drawEntropy } from '../lib/entropy';
import { getPlanetaryHour, PLANET_GLYPHS } from '../lib/planetary';
import { moonPhase, MOON_GLYPHS } from '../lib/grimoire';
import { renderRitualCard } from '../lib/ritualCard';

interface SigilDrawerProps {
    onClose: () => void;
    /**
     * Called with a PNG data URL or a GIF blob URL when the user charges a
     * glyph as an overlay (animated sigils charge as GIFs).
     */
    onUseAsOverlay: (url: string) => void;
    /** Location for precise planetary-hour calculation, if the user granted it. */
    coords?: { lat: number; lng: number } | null;
    /** Persists the minted ritual card to the grimoire. */
    onSaveCard: (card: { dataUrl: string; seedHash: string; source: 'BEACON' | 'CSPRNG'; intent: string }) => void;
}

const CANVAS_SIZE = 320;
const EXPORT_SCALE = 2;

const SWATCHES = [
    '#ff2a2a', '#ff6600', '#ffee00', '#33ff44', '#00ffee', '#4477ff',
    '#bb44ff', '#ff44aa', '#ffffff',
];

const SOURCE_MODES: { value: SigilSourceMode; label: string }[] = [
    { value: 'rose', label: 'Rose' },
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Num' },
    { value: 'draw', label: 'Draw' },
    { value: 'image', label: 'Img' },
];

type AnimFlag = 'segmentDraw' | 'lineDash' | 'rotateCw' | 'rotateCcw' | 'pulse' | 'chroma';

const ANIMS: { key: AnimFlag; label: string }[] = [
    { key: 'segmentDraw', label: 'Segment Draw' },
    { key: 'lineDash', label: 'Line Flow' },
    { key: 'rotateCw', label: 'Rotate Clockwise' },
    { key: 'rotateCcw', label: 'Rotate Counter' },
    { key: 'pulse', label: 'Pulse / Breathe' },
    { key: 'chroma', label: 'Chroma Spectrum' },
];

/** Each animation's speed field; only Segment Draw drops its suffix. */
const SPEED_KEY: Record<AnimFlag, keyof SigilGeomState['anim']> = {
    segmentDraw: 'segmentSpeed',
    lineDash: 'lineDashSpeed',
    rotateCw: 'rotateCwSpeed',
    rotateCcw: 'rotateCcwSpeed',
    pulse: 'pulseSpeed',
    chroma: 'chromaSpeed',
};

/**
 * The Sigilarium — the Sigil Workshop, grown to its full form. Reduces a
 * statement of intent to a glyph through four source modes (plus the classic
 * rose wheel), anchors it on a grid system, then layers kaleidoscope,
 * symmetry, and the six Sigilarium animations. Exports PNG (optionally
 * transparent) and animated GIF; charges as an overlay; mints ritual cards.
 */
export const SigilDrawer: React.FC<SigilDrawerProps> = ({ onClose, onUseAsOverlay, coords, onSaveCard }) => {
    const [intent, setIntent] = useState('');
    const [style, setStyle] = useState<GlyphStyle>(DEFAULT_GLYPH_STYLE);
    const [mode, setMode] = useState<SigilSourceMode>('rose');
    const [geom, setGeom] = useState<SigilGeomState>(DEFAULT_SIGIL_GEOM);
    /** Scatter layout, re-rolled only when the user regenerates. */
    const [coordsMap, setCoordsMap] = useState<Record<number, Pt>>(() => gridCoords('saturn'));
    /** Path points in unit space; drives every render of every mode. */
    const [points, setPoints] = useState<Pt[] | null>(null);
    const [gifBusy, setGifBusy] = useState<string | null>(null);
    /** Charge-as-overlay progress while an animated GIF encodes. */
    const [chargeBusy, setChargeBusy] = useState<string | false>(false);
    const drawingRef = useRef(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);
    const [cardPreview, setCardPreview] = useState<{
        url: string; seedHash: string; source: 'BEACON' | 'CSPRNG'; saved: boolean;
    } | null>(null);
    const [cardBusy, setCardBusy] = useState(false);

    const update = <K extends keyof GlyphStyle>(key: K, value: GlyphStyle[K]) =>
        setStyle(prev => ({ ...prev, [key]: value }));

    /** Re-rolls the scatter grid (and any other grid) on demand. */
    const rerollCoords = useCallback((grid: SigilGrid) => setCoordsMap(gridCoords(grid)), []);

    /** The current path for text/number/image modes, derived from state. */
    const derivedPath = useCallback((): Pt[] | null => {
        if (mode === 'text' || mode === 'number') {
            const pts = buildTextPath(intent, mode, coordsMap);
            return pts.length >= 2 ? pts : null;
        }
        if (mode === 'image') {
            const digits = imageDigitsRef.current;
            if (!digits) return null;
            const pts = buildDigitPath(digits, coordsMap);
            return pts.length >= 2 ? pts : null;
        }
        return points;
    }, [mode, intent, coordsMap, points]);

    /** Rose-mode letters, or null when this mode doesn't use the rose. */
    const roseLetters = mode === 'rose' ? uniqueLetters(intent) : null;

    // ---------------- rendering loop ----------------
    const drawFrame = useCallback((ts: number) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        if (style.transparentBg) {
            // Live preview keeps the checkerboard hint via CSS background.
        } else {
            ctx.fillStyle = style.bgColor;
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        }

        const path = derivedPath();
        if (roseLetters && roseLetters.length > 0) {
            renderGlyph(ctx, CANVAS_SIZE, roseLetters, style, {
                includeRose: style.showRose,
                bg: null, // background already painted above
            });
        } else if (path && path.length >= 2) {
            const a = geom.anim;
            let rotation = 0;
            if (a.rotateCw) rotation = ts * (a.rotateCwSpeed * 0.002);
            else if (a.rotateCcw) rotation = -ts * (a.rotateCcwSpeed * 0.002);
            drawSigilFrame(ctx, CANVAS_SIZE, {
                points: path,
                color: style.lineColor,
                lineWidth: style.lineWidth,
                glow: style.glow,
                curves: geom.curves,
                symX: geom.symX,
                symY: geom.symY,
                kaleidoscope: geom.kaleidoscope,
                rotation,
                alpha: 1,
                anim: a,
            }, ts);
        }
        rafRef.current = requestAnimationFrame(drawFrame);
    }, [derivedPath, roseLetters, style, geom]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(drawFrame);
        return () => cancelAnimationFrame(rafRef.current);
    }, [drawFrame]);

    // ---------------- drawing input ----------------
    const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
        const rect = e.currentTarget.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        };
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (mode !== 'draw') return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        setPoints([canvasPoint(e)]);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current || mode !== 'draw') return;
        const p = canvasPoint(e);
        setPoints(prev => {
            if (!prev) return [p];
            const last = prev[prev.length - 1];
            if (Math.hypot(p.x - last.x, p.y - last.y) < 0.01) return prev;
            return [...prev, p];
        });
    };

    const onPointerUp = () => { drawingRef.current = false; };

    // ---------------- image mode ----------------
    const imageDigitsRef = useRef<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                imageDigitsRef.current = imageToDigits(img);
                rerollCoords(geom.grid);
            };
            img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    // ---------------- export ----------------
    /** Renders the export canvas at 2x with the chosen background treatment. */
    const renderExport = (): HTMLCanvasElement | null => {
        if (roseLetters && roseLetters.length > 0) {
            return renderGlyphExport(roseLetters, style, CANVAS_SIZE, EXPORT_SCALE);
        }
        const path = derivedPath();
        if (!path || path.length < 2) return null;
        const out = document.createElement('canvas');
        out.width = CANVAS_SIZE * EXPORT_SCALE;
        out.height = CANVAS_SIZE * EXPORT_SCALE;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
        if (!style.transparentBg) {
            ctx.fillStyle = style.bgColor;
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        }
        drawSigilFrame(ctx, CANVAS_SIZE, {
            points: path,
            color: style.lineColor,
            lineWidth: style.lineWidth,
            glow: style.glow,
            curves: geom.curves,
            symX: geom.symX,
            symY: geom.symY,
            kaleidoscope: geom.kaleidoscope,
            rotation: 0,
            alpha: 1,
            anim: geom.anim,
        });
        return out;
    };

    /** True when any of the six Sigilarium animations is running. */
    const hasActiveAnimation = (): boolean => {
        const a = geom.anim;
        return a.segmentDraw || a.lineDash || a.rotateCw || a.rotateCcw || a.pulse || a.chroma;
    };

    /**
     * Charges the current sigil as an overlay. Animated sigils charge as a
     * looping GIF (transparent unless a background color is set); still
     * sigils keep the crisp static PNG path. The busy flag keeps the button
     * honest while the GIF frames encode.
     */
    const handleCharge = async () => {
        if (chargeBusy) return;
        const animActive = hasActiveAnimation();
        if (animActive) {
            setChargeBusy('Charging…');
            try {
                const blob = await exportSigilGif({
                    points: derivedPath() ?? [],
                    color: style.lineColor,
                    lineWidth: style.lineWidth * EXPORT_SCALE,
                    glow: style.glow * EXPORT_SCALE,
                    curves: geom.curves,
                    symX: geom.symX,
                    symY: geom.symY,
                    kaleidoscope: geom.kaleidoscope,
                    bgColor: style.bgColor,
                    transparent: style.transparentBg,
                    anim: geom.anim,
                    size: SIGIL_DESIGN_SIZE,
                    onProgress: pct => setChargeBusy(`Charging ${pct}%`),
                });
                onUseAsOverlay(URL.createObjectURL(blob));
                onClose();
            } catch (err) {
                console.error('Charge render failed', err);
            } finally {
                setChargeBusy(false);
            }
            return;
        }
        const out = renderExport();
        if (!out) return;
        onUseAsOverlay(out.toDataURL('image/png'));
        onClose();
    };

    const handleDownload = () => {
        const out = renderExport();
        if (!out) return;
        const link = document.createElement('a');
        link.download = `sigil_${Date.now()}.png`;
        link.href = out.toDataURL('image/png');
        link.click();
    };

    const handleGifExport = async () => {
        const path = roseLetters && roseLetters.length > 0 ? null : derivedPath();
        if (!path || path.length < 2 || gifBusy) return;
        setGifBusy('Rendering…');
        try {
            const blob = await exportSigilGif({
                points: path,
                color: style.lineColor,
                lineWidth: style.lineWidth * EXPORT_SCALE,
                glow: style.glow * EXPORT_SCALE,
                curves: geom.curves,
                symX: geom.symX,
                symY: geom.symY,
                kaleidoscope: geom.kaleidoscope,
                bgColor: style.bgColor,
                transparent: style.transparentBg,
                anim: geom.anim,
                size: SIGIL_DESIGN_SIZE,
                onProgress: pct => setGifBusy(`Manifesting ${pct}%`),
            });
            const link = document.createElement('a');
            link.download = `sigil_${Date.now()}.gif`;
            link.href = URL.createObjectURL(blob);
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        } catch (err) {
            console.error('GIF render failed', err);
        } finally {
            setGifBusy(null);
        }
    };

    /** Mints the ritual card: fresh entropy seal, timing data, styled glyph. */
    const handleRitualCard = async () => {
        if (cardBusy) return;
        setCardBusy(true);
        try {
            const [{ hex, source }, hour] = await Promise.all([
                drawEntropy(),
                Promise.resolve(getPlanetaryHour(new Date(), coords ?? null)),
            ]);
            const mp = moonPhase();
            const sigilCanvas = renderExport();
            const cardCanvas = renderRitualCard({
                intent: intent.trim(),
                sigil: sigilCanvas,
                moonText: `${MOON_GLYPHS[mp.phase]} ${mp.phase} (${mp.illumination}%)`,
                hourText: `${PLANET_GLYPHS[hour.planet]} ${hour.planet} — hour ${hour.hourIndex} (${hour.isDay ? 'day' : 'night'})`,
                dateText: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
                seedHex: hex,
                entropySource: source,
            });
            setCardPreview({
                url: cardCanvas.toDataURL('image/png'),
                seedHash: hex,
                source,
                saved: false,
            });
        } finally {
            setCardBusy(false);
        }
    };

    const downloadCard = () => {
        if (!cardPreview) return;
        const link = document.createElement('a');
        link.download = `ritual_card_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = cardPreview.url;
        link.click();
    };

    const saveCardToGrimoire = () => {
        if (!cardPreview || cardPreview.saved) return;
        onSaveCard({
            dataUrl: cardPreview.url,
            seedHash: cardPreview.seedHash,
            source: cardPreview.source,
            intent: intent.trim(),
        });
        setCardPreview(prev => (prev ? { ...prev, saved: true } : prev));
    };

    /** Whether the current mode has a drawable sigil at all. */
    const hasSigil = (() => {
        if (mode === 'rose') return roseLetters !== null && roseLetters.length > 0;
        if (mode === 'image') return !!imageDigitsRef.current;
        if (mode === 'text' || mode === 'number') return intent.trim().length > 0;
        return points !== null && points.length >= 2;
    })();

    const setGeomKey = <K extends keyof SigilGeomState>(key: K, value: SigilGeomState[K]) =>
        setGeom(prev => ({ ...prev, [key]: value }));

    const toggleAnim = (key: keyof SigilGeomState['anim'], checked: boolean) => {
        setGeom(prev => {
            const anim = { ...prev.anim, [key]: checked };
            // Segment Draw excludes every other animation, as in the original.
            const boolKeys: (keyof SigilGeomState['anim'])[] = [
                'segmentDraw', 'lineDash', 'rotateCw', 'rotateCcw', 'pulse', 'chroma',
            ];
            if (key === 'segmentDraw' && checked) {
                boolKeys.forEach(k => {
                    if (k !== 'segmentDraw') (anim as Record<string, unknown>)[k] = false;
                });
            } else if (key !== 'segmentDraw' && checked) {
                anim.segmentDraw = false;
            }
            return { ...prev, anim };
        });
    };

    return (
        <>
        <div className="sigil-scribe-modal drawer-title" role="dialog" aria-modal="true">
            <div className="modal-content">
                <button className="close-button" onClick={onClose} aria-label="Close">&times;</button>
                <h2>The Sigilarium</h2>
                <p className="scribe-info">
                    Reduce your statement of intent to a glyph — through the rose
                    wheel, text, numbers, freehand drawing, or an image — then anchor
                    it on a grid and let it move.
                </p>

                <div className="control-group">
                    <div className="mode-selector" role="radiogroup" aria-label="Sigil source">
                        {SOURCE_MODES.map(m => (
                            <label key={m.value} className={mode === m.value ? 'active' : ''}>
                                <input
                                    type="radio"
                                    name="sigil-source-mode"
                                    checked={mode === m.value}
                                    onChange={() => {
                                        setMode(m.value);
                                        setPoints(null);
                                        if (m.value === 'image') imageDigitsRef.current = null;
                                        if (m.value === 'text' || m.value === 'number') rerollCoords(geom.grid);
                                    }}
                                />
                                {m.label}
                            </label>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder={
                            mode === 'rose' ? 'Enter Statement of Intent...'
                            : mode === 'text' ? 'Enter statement of intent...'
                            : mode === 'number' ? 'Enter sequence of numbers...'
                            : mode === 'draw' ? 'Draw on the canvas...'
                            : 'Upload an image to sample...'
                        }
                        value={intent}
                        disabled={mode === 'draw' || mode === 'image'}
                        onChange={(e) => setIntent(e.target.value)}
                    />
                    {mode === 'image' && (
                        <>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleImageUpload}
                            />
                            <button className="secondary" onClick={() => fileRef.current?.click()}>
                                Upload Image
                            </button>
                        </>
                    )}
                    <div className="button-grid">
                        <button onClick={handleCharge} disabled={!hasSigil || !!chargeBusy}>
                            {typeof chargeBusy === 'string' ? chargeBusy : 'Charge as Overlay'}
                        </button>
                        <button className="secondary" onClick={handleDownload} disabled={!hasSigil}>
                            Download PNG
                        </button>
                        <button className="secondary" onClick={handleGifExport} disabled={!hasSigil || !!gifBusy}>
                            {gifBusy ?? 'Download GIF'}
                        </button>
                        <button className="secondary" onClick={handleRitualCard} disabled={!hasSigil || cardBusy}>
                            {cardBusy ? 'Sealing…' : 'Ritual Card'}
                        </button>
                    </div>
                </div>

                <div className="sigil-drawer-canvas-wrap">
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_SIZE}
                        height={CANVAS_SIZE}
                        className={`sigil-drawer-canvas${style.transparentBg ? ' transparent' : ''}${mode === 'draw' ? ' draw-mode' : ''}`}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
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
                            {mode === 'rose' && (
                            <>
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
                            </>
                            )}
                        </div>
                    </div>

                    {mode !== 'rose' && (
                    <>
                    <div className="section-title">Geometric Matrix</div>
                    <div className="drawer-options-grid">
                        <div className="slider-group">
                            <label>Grid System</label>
                            <select
                                value={geom.grid}
                                onChange={(e) => {
                                    const g = e.target.value as SigilGrid;
                                    setGeomKey('grid', g);
                                    rerollCoords(g);
                                }}
                            >
                                <option value="saturn">Saturn (3×3)</option>
                                <option value="wheel">Witch Wheel</option>
                                <option value="scatter">Chaos Scatter</option>
                            </select>
                        </div>
                        <div className="slider-group">
                            <label>Segments: {geom.kaleidoscope}</label>
                            <input
                                type="range" min="1" max="16" step="1"
                                value={geom.kaleidoscope}
                                onChange={(e) => setGeomKey('kaleidoscope', parseInt(e.target.value, 10))}
                            />
                        </div>
                        <div className="drawer-toggles">
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={geom.curves}
                                    onChange={(e) => setGeomKey('curves', e.target.checked)}
                                />
                                Curves
                            </label>
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={geom.symX}
                                    onChange={(e) => setGeomKey('symX', e.target.checked)}
                                />
                                Symmetry X
                            </label>
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={geom.symY}
                                    onChange={(e) => setGeomKey('symY', e.target.checked)}
                                />
                                Symmetry Y
                            </label>
                        </div>
                    </div>

                    </>
                    )}

                    {mode !== 'rose' && (
                    <>
                    <div className="section-title">Temporal Ebb</div>
                    <div className="animation-grid">
                        {ANIMS.map(({ key, label }) => {
                            const sk = SPEED_KEY[key];
                            return (
                                <div className="animation-item" key={key}>
                                    <label className="anim-header">
                                        <input
                                            type="checkbox"
                                            checked={geom.anim[key] as boolean}
                                            onChange={(e) => toggleAnim(key, e.target.checked)}
                                        />
                                        {label}
                                    </label>
                                    <div className="anim-speed">
                                        <span>Speed</span>
                                        <input
                                            type="number"
                                            min="1" max="20"
                                            value={geom.anim[sk] as number}
                                            onChange={(e) =>
                                                setGeomKey('anim', {
                                                    ...geom.anim,
                                                    [sk]: Math.max(1, parseInt(e.target.value, 10) || 1),
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </>
                    )}

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

        {cardPreview && (
            <div className="ritual-card-overlay" role="dialog" aria-modal="true" onClick={() => setCardPreview(null)}>
                <div className="ritual-card-preview" onClick={(e) => e.stopPropagation()}>
                    <button className="close-button" onClick={() => setCardPreview(null)} aria-label="Close">&times;</button>
                    <h2>Ritual Card</h2>
                    <img src={cardPreview.url} alt="Ritual card" className="ritual-card-image" />
                    <div className="ritual-card-actions">
                        <button onClick={downloadCard}>Download PNG</button>
                        {cardPreview.saved
                            ? <button className="secondary" disabled>✓ Bound to the Grimoire</button>
                            : <button className="secondary" onClick={saveCardToGrimoire}>Save to Grimoire</button>}
                    </div>
                    <p className="scribe-info ritual-card-seal">
                        Sealed {cardPreview.source === 'BEACON' ? '◈ BEACON' : '◈ CSPRNG'} · seed {cardPreview.seedHash.slice(0, 12)}…
                    </p>
                </div>
            </div>
        )}
        </>
    );
};
