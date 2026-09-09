import React, { useState } from 'react';
import {
    PALETTES, getPalette, listCustomPalettes, upsertCustomPalette,
    deleteCustomPalette, customToPalette, stopHex,
    type Palette, type CustomPaletteDraft,
} from '../engine/palettes';

interface PaletteEditorProps {
    onClose: () => void;
    /** Fired whenever the draft changes, for live preview on the fractal. */
    onPreview: (override: { stops: [number, number, number][]; cycle: number } | null) => void;
    /** Fired after a palette is saved, so the app can select it. */
    onSaved: (key: string) => void;
    /** Fired after a palette is deleted, so the app can fall back. */
    onDeleted: (key: string) => void;
}

const DEFAULT_DRAFT: CustomPaletteDraft = {
    name: '',
    stops: ['#0a0000', '#4a0000', '#ff2222', '#2a0006', '#993344'],
    cycle: 2.5,
};

/**
 * The Palette Forge — a small editor for the fractal's escape gradient.
 * Five color stops plus the cycle length; renders live on the fractal
 * while editing. Saves land in localStorage and appear in the app's
 * gradient selector under "Your Gradients".
 */
export const PaletteEditor: React.FC<PaletteEditorProps> = ({ onClose, onPreview, onSaved, onDeleted }) => {
    const [draft, setDraft] = useState<CustomPaletteDraft>(DEFAULT_DRAFT);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [customs, setCustoms] = useState<Palette[]>(() => listCustomPalettes());

    const refreshCustoms = () => setCustoms(listCustomPalettes());

    const update = (patch: Partial<CustomPaletteDraft>) => {
        const next = { ...draft, ...patch };
        setDraft(next);
        const pal = customToPalette(next, editingKey ?? undefined);
        onPreview({ stops: pal.stops, cycle: pal.cycle });
    };

    const handleLoad = (key: string) => {
        const p = getPalette(key);
        setDraft({
            name: p.custom ? p.name : p.name + ' (copy)',
            stops: p.stops.map(stopHex),
            cycle: p.cycle,
        });
        setEditingKey(p.custom ? p.key : null);
        const pal = customToPalette({ name: p.name, stops: p.stops.map(stopHex), cycle: p.cycle });
        onPreview({ stops: pal.stops, cycle: p.cycle });
    };

    const handleSave = () => {
        const pal = customToPalette(draft, editingKey ?? undefined);
        upsertCustomPalette(pal);
        refreshCustoms();
        setEditingKey(pal.key);
        onPreview(null);
        onSaved(pal.key);
    };

    const handleNew = () => {
        setDraft(DEFAULT_DRAFT);
        setEditingKey(null);
        onPreview(null);
    };

    const handleDelete = (key: string) => {
        deleteCustomPalette(key);
        refreshCustoms();
        if (editingKey === key) {
            setEditingKey(null);
            onPreview(null);
        }
        onDeleted(key);
    };

    const gradientCss = `linear-gradient(to right, ${draft.stops.join(', ')})`;

    return (
        <div className="palette-editor" role="dialog" aria-label="Palette editor">
            <div className="section-title">Palette Forge</div>

            <div className="palette-preview" style={{ background: gradientCss }} />

            <div className="slider-group">
                <label>Name</label>
                <input
                    type="text"
                    value={draft.name}
                    placeholder={editingKey ? 'Renaming…' : 'My Gradient'}
                    onChange={e => update({ name: e.target.value })}
                />
            </div>

            <div className="slider-group">
                <label>Stops</label>
                <div className="palette-stop-row">
                    {draft.stops.map((hex, i) => (
                        <input
                            key={i}
                            type="color"
                            className="color-input"
                            value={hex}
                            title={`Stop ${i + 1}`}
                            aria-label={`Palette stop ${i + 1}`}
                            onChange={e => {
                                const stops = [...draft.stops];
                                stops[i] = e.target.value;
                                update({ stops });
                            }}
                        />
                    ))}
                </div>
            </div>

            <div className="slider-group">
                <label>Cycle: {draft.cycle.toFixed(1)}</label>
                <input
                    type="range" min="0.5" max="8" step="0.5"
                    value={draft.cycle}
                    onChange={e => update({ cycle: parseFloat(e.target.value) })}
                    aria-label="Palette cycle"
                />
            </div>

            <div className="palette-editor-actions">
                <button onClick={handleSave}>{editingKey ? 'Update Gradient' : 'Save Gradient'}</button>
                <button className="secondary" onClick={handleNew}>New</button>
                <button className="secondary" onClick={() => { onPreview(null); onClose(); }}>Done</button>
            </div>

            {customs.length > 0 && (
                <div className="slider-group">
                    <label>Your Gradients</label>
                    <div className="palette-custom-list">
                        {customs.map(p => (
                            <div key={p.key} className="palette-custom-row">
                                <button
                                    className="palette-custom-load"
                                    title="Load into editor"
                                    onClick={() => handleLoad(p.key)}
                                >
                                    <span
                                        className="palette-custom-swatch"
                                        style={{ background: `linear-gradient(to right, ${p.stops.map(stopHex).join(', ')})` }}
                                    />
                                    <span className="palette-custom-name">{p.name}</span>
                                </button>
                                <button
                                    className="palette-custom-delete"
                                    title="Delete gradient"
                                    aria-label={`Delete ${p.name}`}
                                    onClick={() => handleDelete(p.key)}
                                >✕</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="slider-group">
                <label>Copy a built-in…</label>
                <select
                    value=""
                    onChange={e => { if (e.target.value) handleLoad(e.target.value); }}
                    aria-label="Copy a built-in palette"
                >
                    <option value="">Choose…</option>
                    {PALETTES.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
            </div>
        </div>
    );
};

export default PaletteEditor;
