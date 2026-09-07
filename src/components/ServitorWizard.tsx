import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    renderGlyph, uniqueLetters, DEFAULT_GLYPH_STYLE,
} from '../lib/glyph';
import type { GlyphStyle } from '../lib/glyph';
import type { ServitorDraft } from '../lib/grimoire';
import { BRAINWAVES, SOLFEGGIO } from '../lib/binaural';

interface ServitorWizardProps {
    onClose: () => void;
    /** Commits the draft; App snapshots the CURRENT live space as the home world. */
    onCreate: (draft: ServitorDraft) => void;
}

const CANVAS_SIZE = 260;

type Step = 0 | 1 | 2 | 3;
const STEP_NAMES = ['Identity', 'Sigil', 'World & Tone', 'Terms'];

const SERVITOR_SWATCHES = ['#ff2a2a', '#00ffee', '#33ff44', '#ffee00', '#bb44ff', '#ffffff'];

/**
 * Servitor creation wizard — four steps covering the classical recipe:
 * a name and purpose, a sigil drawn from the name, a home world (the live
 * fractal space at commit time) and an aural key, then the lifespan and
 * feeding terms that bind the entity.
 */
export const ServitorWizard: React.FC<ServitorWizardProps> = ({ onClose, onCreate }) => {
    const [step, setStep] = useState<Step>(0);
    const [name, setName] = useState('');
    const [purpose, setPurpose] = useState('');
    const [sigilStyle, setSigilStyle] = useState<GlyphStyle>({
        ...DEFAULT_GLYPH_STYLE,
        showRose: true,
    });
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [toneFamily, setToneFamily] = useState<'brainwave' | 'solfeggio'>('brainwave');
    const [tonePreset, setTonePreset] = useState('theta');
    const [overlaySize, setOverlaySize] = useState(220);
    const [lifespan, setLifespan] = useState('');
    const [feeding, setFeeding] = useState('');
    const [duties, setDuties] = useState('');

    const letters = useMemo(() => uniqueLetters(name), [name]);
    const canFinish = name.trim().length > 0 && purpose.trim().length > 0;

    // Live sigil preview on the Identity/Sigil steps.
    useEffect(() => {
        if (step !== 1) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        renderGlyph(ctx, CANVAS_SIZE, letters, sigilStyle, {
            includeRose: sigilStyle.showRose,
            bg: sigilStyle.transparentBg ? null : sigilStyle.bgColor,
        });
    }, [step, letters, sigilStyle]);

    const update = <K extends keyof GlyphStyle>(key: K, value: GlyphStyle[K]) =>
        setSigilStyle(prev => ({ ...prev, [key]: value }));

    /** Exports the servitor sigil (never with the rose) as a PNG data URL. */
    const exportSigil = (): string | null => {
        if (letters.length === 0) return null;
        const out = document.createElement('canvas');
        out.width = CANVAS_SIZE * 2;
        out.height = CANVAS_SIZE * 2;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.scale(2, 2);
        renderGlyph(ctx, CANVAS_SIZE, letters, { ...sigilStyle, showRose: false }, {
            includeRose: false,
            bg: null,
        });
        return out.toDataURL('image/png');
    };

    const commit = () => {
        const draft: ServitorDraft = {
            name: name.trim(),
            purpose: purpose.trim(),
            duties: duties.trim(),
            lifespan: lifespan.trim(),
            feeding: feeding.trim(),
            sigilDataUrl: exportSigil(),
            tonePreset: toneFamily === 'brainwave' || toneFamily === 'solfeggio' ? tonePreset : null,
            toneFamily,
            overlaySize,
        };
        onCreate(draft);
    };

    return (
        <div className="sigil-scribe-modal drawer-title servitor-wizard-window" role="dialog" aria-modal="true">
            <div className="modal-content servitor-wizard-content">
                <button className="close-button" onClick={onClose} aria-label="Close">&times;</button>
                <h2>Forge a Servitor</h2>
                <p className="scribe-info">
                    Name it, seal it, house it, and bind its terms. A servitor is a
                    thoughtform given a job — it is only as real as the structure you
                    give it.
                </p>

                <div className="wizard-steps" role="tablist">
                    {STEP_NAMES.map((label, i) => (
                        <button
                            key={label}
                            role="tab"
                            aria-selected={step === i}
                            className={`wizard-step${step === i ? ' active' : ''}${(step as number) > i ? ' done' : ''}`}
                            onClick={() => setStep(i as Step)}
                        >
                            {i + 1}. {label}
                        </button>
                    ))}
                </div>

                {/* ---------- Step 1: Identity ---------- */}
                {step === 0 && (
                    <div className="wizard-body">
                        <div className="control-group">
                            <label className="wizard-label">Name</label>
                            <input
                                type="text"
                                placeholder="e.g. ARGUS, the Watcher..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoFocus
                            />
                            <label className="wizard-label">Purpose (one line, present tense)</label>
                            <input
                                type="text"
                                placeholder="e.g. watches my focus and returns it when it drifts..."
                                value={purpose}
                                onChange={(e) => setPurpose(e.target.value)}
                            />
                            {name.trim() && (
                                <div className="wizard-letters">
                                    Unique letters: {letters.length ? letters.join(' · ') : '—'}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ---------- Step 2: Sigil ---------- */}
                {step === 1 && (
                    <div className="wizard-body">
                        {!name.trim() ? (
                            <p className="grimoire-empty">Name your servitor first — its sigil is drawn from the letters of its name.</p>
                        ) : letters.length === 0 ? (
                            <p className="grimoire-empty">The name has no A–Z letters to reduce. Give it a name in the latin alphabet.</p>
                        ) : (
                            <>
                                <div className="sigil-drawer-canvas-wrap">
                                    <canvas
                                        ref={canvasRef}
                                        width={CANVAS_SIZE}
                                        height={CANVAS_SIZE}
                                        className={`sigil-drawer-canvas${sigilStyle.transparentBg ? ' transparent' : ''}`}
                                    />
                                </div>
                                <div className="drawer-options-grid">
                                    <div className="slider-group">
                                        <label>Line Color</label>
                                        <div className="swatch-row">
                                            <input
                                                type="color"
                                                className="color-input"
                                                value={sigilStyle.lineColor}
                                                onChange={(e) => update('lineColor', e.target.value)}
                                                aria-label="Servitor sigil color"
                                            />
                                            {SERVITOR_SWATCHES.map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={`swatch${sigilStyle.lineColor.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
                                                    style={{ background: c }}
                                                    onClick={() => update('lineColor', c)}
                                                    aria-label={`Set color ${c}`}
                                                    title={c}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="slider-group">
                                        <label>Line Width: {sigilStyle.lineWidth.toFixed(1)}</label>
                                        <input
                                            type="range" min="0.5" max="6" step="0.5"
                                            value={sigilStyle.lineWidth}
                                            onChange={(e) => update('lineWidth', parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div className="slider-group">
                                        <label>Glow: {sigilStyle.glow}</label>
                                        <input
                                            type="range" min="0" max="20" step="1"
                                            value={sigilStyle.glow}
                                            onChange={(e) => update('glow', parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div className="drawer-toggles">
                                        <label className="checkbox-group">
                                            <input
                                                type="checkbox"
                                                checked={sigilStyle.smooth}
                                                onChange={(e) => update('smooth', e.target.checked)}
                                            />
                                            Smooth
                                        </label>
                                        <label className="checkbox-group">
                                            <input
                                                type="checkbox"
                                                checked={sigilStyle.showNodes}
                                                onChange={(e) => update('showNodes', e.target.checked)}
                                            />
                                            Nodes
                                        </label>
                                        <label className="checkbox-group">
                                            <input
                                                type="checkbox"
                                                checked={sigilStyle.showMarkers}
                                                onChange={(e) => update('showMarkers', e.target.checked)}
                                            />
                                            Marks
                                        </label>
                                        <label className="checkbox-group">
                                            <input
                                                type="checkbox"
                                                checked={sigilStyle.showRose}
                                                onChange={(e) => update('showRose', e.target.checked)}
                                            />
                                            Rose (preview only)
                                        </label>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ---------- Step 3: World & Tone ---------- */}
                {step === 2 && (
                    <div className="wizard-body">
                        <div className="wizard-notice">
                            The world you are standing in <em>right now</em> becomes the
                            servitor's home. Arrange the fractal before you press Forge.
                        </div>
                        <div className="control-group">
                            <label className="wizard-label">Projection Size: {overlaySize}px</label>
                            <input
                                type="range" min="60" max="480" step="10"
                                value={overlaySize}
                                onChange={(e) => setOverlaySize(parseInt(e.target.value, 10))}
                            />
                            <label className="wizard-label">Aural Key (sounds when it awakens)</label>
                            <div className="wizard-tone-row">
                                <select value={toneFamily} onChange={(e) => {
                                    const fam = e.target.value as 'brainwave' | 'solfeggio';
                                    setToneFamily(fam);
                                    setTonePreset(fam === 'brainwave' ? 'theta' : 'sol');
                                }}>
                                    <option value="brainwave">Brainwave (entrainment)</option>
                                    <option value="solfeggio">Solfeggio (purity)</option>
                                </select>
                                <select value={tonePreset} onChange={(e) => setTonePreset(e.target.value)}>
                                    {toneFamily === 'brainwave'
                                        ? Object.entries(BRAINWAVES).map(([k, p]) => (
                                            <option key={k} value={k}>{p.name} — {p.note}</option>
                                        ))
                                        : Object.entries(SOLFEGGIO).map(([k, p]) => (
                                            <option key={k} value={k}>{p.name} — {p.note}</option>
                                        ))}
                                </select>
                            </div>
                            <label className="checkbox-group">
                                <input
                                    type="checkbox"
                                    checked={tonePreset === '__silent__'}
                                    onChange={(e) => setTonePreset(e.target.checked ? '__silent__' : (toneFamily === 'brainwave' ? 'theta' : 'sol'))}
                                />
                                Silent awakening (no tone)
                            </label>
                        </div>
                    </div>
                )}

                {/* ---------- Step 4: Terms ---------- */}
                {step === 3 && (
                    <div className="wizard-body">
                        <div className="control-group">
                            <label className="wizard-label">Lifespan</label>
                            <input
                                type="text"
                                placeholder="e.g. one lunar month, then dissolved..."
                                value={lifespan}
                                onChange={(e) => setLifespan(e.target.value)}
                            />
                            <label className="wizard-label">Feeding Schedule</label>
                            <input
                                type="text"
                                placeholder="e.g. 5 minutes of focused attention each dusk..."
                                value={feeding}
                                onChange={(e) => setFeeding(e.target.value)}
                            />
                            <label className="wizard-label">Further Duties &amp; Dismissal Terms (optional)</label>
                            <textarea
                                className="grimoire-textarea"
                                rows={3}
                                placeholder="How it behaves, what it must never do, how it is put down..."
                                value={duties}
                                onChange={(e) => setDuties(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                <div className="wizard-nav">
                    <button className="secondary" onClick={() => setStep(s => (s - 1) as Step)} disabled={step === 0}>
                        &larr; Back
                    </button>
                    {step < 3 ? (
                        <button
                            onClick={() => setStep(s => (s + 1) as Step)}
                            disabled={step === 0 && !name.trim()}
                        >
                            Next &rarr;
                        </button>
                    ) : (
                        <button className="wizard-finish" onClick={commit} disabled={!canFinish}>
                            ⚡ FORGE SERVITOR
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
