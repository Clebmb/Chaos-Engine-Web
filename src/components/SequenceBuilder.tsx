import React, { useState } from 'react';
import { RITUAL_PRESETS } from '../lib/ritualEngine';
import type { PhaseDefinition, EffectPreset, AudioPhaseConfig, BreathPattern, RitualPhase } from '../lib/ritualEngine';
import { BRAINWAVES, SOLFEGGIO } from '../lib/binaural';
import { addRecord, updateRecord, newId } from '../lib/grimoire';
import type { CustomSequenceRecord, Grimoire } from '../lib/grimoire';

/**
 * Custom ritual authoring — the practice builder.
 *
 * Opens seeded from the classical five-phase template (or an existing custom
 * sequence). Phases can be added, removed, reordered, and renamed; each
 * carries its own effects mix, audio tone, breath pattern, timer, and
 * immersion flags. Saves to the grimoire as a 'sequence' record and is
 * launchable from the sequencer dropdown exactly like the built-in liturgies.
 */

const PHASE_KEYS: Array<{ key: RitualPhase; label: string }> = [
    { key: 'banish', label: 'Banish' },
    { key: 'intent', label: 'Intent' },
    { key: 'gnosis', label: 'Gnosis' },
    { key: 'charge', label: 'Charge' },
    { key: 'closing', label: 'Closing Banish' },
];

const EFFECT_FIELDS: Array<{ key: keyof EffectPreset; label: string }> = [
    { key: 'strobe', label: 'Strobe' },
    { key: 'psych', label: 'Psych' },
    { key: 'warp', label: 'Warp' },
    { key: 'scanlines', label: 'Scan' },
    { key: 'rgbShift', label: 'RGB' },
    { key: 'neon', label: 'Neon' },
    { key: 'emboss', label: 'Emboss' },
    { key: 'crush', label: 'Crush' },
    { key: 'glitch', label: 'Glitch' },
    { key: 'vignette', label: 'Vig' },
];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface SequenceBuilderProps {
    /** Existing sequence to edit, or null to author a new one. */
    existing: CustomSequenceRecord | null;
    onClose: () => void;
    /** Called with the fresh grimoire after a save. */
    onSaved: (g: Grimoire) => void;
}

export const SequenceBuilder: React.FC<SequenceBuilderProps> = ({ existing, onClose, onSaved }) => {
    const [name, setName] = useState(existing?.name ?? '');
    const [note, setNote] = useState(existing?.note ?? '');
    const [phases, setPhases] = useState<PhaseDefinition[]>(() =>
        existing ? clone(existing.phases) : clone(RITUAL_PRESETS[0].phases)
    );
    const [openIdx, setOpenIdx] = useState<number | null>(existing ? null : 0);

    const setPhase = (i: number, patch: Partial<PhaseDefinition>) =>
        setPhases(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

    const setEffect = (i: number, key: keyof EffectPreset, value: number) =>
        setPhases(prev => prev.map((p, idx) => (idx === i ? { ...p, effects: { ...p.effects, [key]: value } } : p)));

    const setAudio = (i: number, patch: Partial<AudioPhaseConfig>) =>
        setPhases(prev => prev.map((p, idx) => (idx === i ? { ...p, audio: { ...p.audio, ...patch } } : p)));

    const move = (i: number, dir: -1 | 1) =>
        setPhases(prev => {
            const j = i + dir;
            if (j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    const removePhase = (i: number) => {
        setPhases(prev => prev.filter((_, idx) => idx !== i));
        setOpenIdx(null);
    };

    const addPhase = () => {
        setPhases(prev => [...prev, {
            key: 'gnosis',
            label: 'New Phase',
            duration: 120,
            instructions: '',
            effects: {},
            audio: { kind: 'off' },
            breath: 'off',
            hideSidebar: false,
            freezeMotion: false,
        }]);
        setOpenIdx(phases.length);
    };

    const totalSecs = phases.reduce((a, p) => a + p.duration, 0);
    const manualCount = phases.filter(p => p.duration === 0).length;
    const canSave = name.trim().length > 0 && phases.length > 0;

    const handleSave = () => {
        if (!canSave) return;
        const payload = { name: name.trim(), note: note.trim(), phases };
        const g = existing
            ? updateRecord(existing.id, payload as Partial<CustomSequenceRecord>)
            : addRecord({ kind: 'sequence', id: newId(), createdAt: Date.now(), ...payload });
        onSaved(g);
        onClose();
    };

    return (
        <div className="sigil-scribe-modal seq-builder" role="dialog" aria-modal="true">
            <div className="modal-content">
                <button className="close-button" onClick={onClose} aria-label="Close">&times;</button>
                <h2>Build a Ritual</h2>
                <p className="scribe-info">
                    Author your own working. Each phase carries its own effects, tone, breath,
                    timer, and immersion. Saved to the grimoire; launchable from the sequencer.
                </p>

                <div className="control-group seqb-header">
                    <label className="seqb-field">
                        Sequence Name
                        <input
                            type="text"
                            placeholder="Name this working..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>
                    <label className="seqb-field">
                        Description
                        <input
                            type="text"
                            placeholder="What is this working for?"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </label>
                </div>

                <div className="seqb-phase-list">
                    {phases.map((p, i) => (
                        <div className={`seqb-phase${openIdx === i ? ' open' : ''}`} key={i}>
                            <div className="seqb-phase-head">
                                <button
                                    className="mini secondary"
                                    disabled={i === 0}
                                    onClick={() => move(i, -1)}
                                    aria-label="Move phase up"
                                >↑</button>
                                <button
                                    className="mini secondary"
                                    disabled={i === phases.length - 1}
                                    onClick={() => move(i, 1)}
                                    aria-label="Move phase down"
                                >↓</button>
                                <button
                                    className="seqb-phase-toggle"
                                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                                    aria-expanded={openIdx === i}
                                >
                                    <span className="seqb-phase-num">{i + 1}.</span> {p.label || PHASE_KEYS.find(k => k.key === p.key)?.label}
                                    <span className="seqb-phase-tags">
                                        <span className="seqb-tag">{p.duration > 0 ? `${p.duration}s` : 'manual'}</span>
                                        {p.audio.kind === 'binaural' && <span className="seqb-tag">♪ {p.audio.preset}</span>}
                                        {p.breath !== 'off' && <span className="seqb-tag">breath</span>}
                                        {p.hideSidebar && <span className="seqb-tag">immersive</span>}
                                        {p.freezeMotion && <span className="seqb-tag">stasis</span>}
                                    </span>
                                </button>
                                <button
                                    className="mini secondary seqb-phase-remove"
                                    onClick={() => removePhase(i)}
                                    disabled={phases.length <= 1}
                                    aria-label="Remove phase"
                                >✕</button>
                            </div>

                            {openIdx === i && (
                                <div className="seqb-phase-body">
                                    <div className="seqb-row">
                                        <label className="seqb-field">
                                            Phase Label
                                            <input
                                                type="text"
                                                value={p.label}
                                                onChange={(e) => setPhase(i, { label: e.target.value })}
                                            />
                                        </label>
                                        <label className="seqb-field">
                                            Phase Type
                                            <select
                                                value={p.key}
                                                onChange={(e) => setPhase(i, { key: e.target.value as RitualPhase })}
                                            >
                                                {PHASE_KEYS.map(k => (
                                                    <option key={k.key} value={k.key}>{k.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="seqb-field">
                                            Timer (sec · 0 = manual)
                                            <input
                                                type="number"
                                                min={0}
                                                max={3600}
                                                value={p.duration}
                                                onChange={(e) => setPhase(i, {
                                                    duration: Math.min(3600, Math.max(0, Math.floor(parseInt(e.target.value) || 0))),
                                                })}
                                            />
                                        </label>
                                    </div>

                                    <label className="seqb-field">
                                        Instructions
                                        <textarea
                                            rows={2}
                                            placeholder="What does the practitioner do in this phase?"
                                            value={p.instructions}
                                            onChange={(e) => setPhase(i, { instructions: e.target.value })}
                                        />
                                    </label>

                                    <div className="seqb-row">
                                        <label className="seqb-field">
                                            Audio
                                            <select
                                                value={p.audio.kind}
                                                onChange={(e) => setAudio(i, { kind: e.target.value as 'off' | 'binaural' })}
                                            >
                                                <option value="off">Off</option>
                                                <option value="binaural">Frequency Tone</option>
                                            </select>
                                        </label>
                                        {p.audio.kind === 'binaural' && (
                                            <>
                                                <label className="seqb-field">
                                                    Preset
                                                    <select
                                                        value={p.audio.preset ?? 'theta'}
                                                        onChange={(e) => setAudio(i, { preset: e.target.value })}
                                                    >
                                                        <optgroup label="Brainwaves">
                                                            {Object.entries(BRAINWAVES).map(([k, v]) => (
                                                                <option key={k} value={k}>{v.name} — {v.beatHz} Hz</option>
                                                            ))}
                                                        </optgroup>
                                                        <optgroup label="Solfeggio">
                                                            {Object.entries(SOLFEGGIO).map(([k, v]) => (
                                                                <option key={k} value={k}>{v.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    </select>
                                                </label>
                                                <label className="seqb-field">
                                                    Mode
                                                    <select
                                                        value={p.audio.mode ?? 'binaural'}
                                                        onChange={(e) => setAudio(i, { mode: e.target.value as AudioPhaseConfig['mode'] })}
                                                    >
                                                        <option value="binaural">Binaural</option>
                                                        <option value="isochronic">Isochronic</option>
                                                        <option value="mono">Pure Tone</option>
                                                    </select>
                                                </label>
                                            </>
                                        )}
                                        <label className="seqb-field">
                                            Breath
                                            <select
                                                value={p.breath}
                                                onChange={(e) => setPhase(i, { breath: e.target.value as BreathPattern })}
                                            >
                                                <option value="off">Off</option>
                                                <option value="box">Box 4-4-4-4</option>
                                                <option value="478">4-7-8</option>
                                                <option value="resonance">Resonance</option>
                                            </select>
                                        </label>
                                    </div>

                                    <div className="seqb-toggles">
                                        <label className="checkbox-group">
                                            <input
                                                type="checkbox"
                                                checked={p.hideSidebar}
                                                onChange={(e) => setPhase(i, { hideSidebar: e.target.checked })}
                                            />
                                            Immersive (hide panel)
                                        </label>
                                        <label className="checkbox-group">
                                            <input
                                                type="checkbox"
                                                checked={p.freezeMotion}
                                                onChange={(e) => setPhase(i, { freezeMotion: e.target.checked })}
                                            />
                                            Freeze Motion
                                        </label>
                                    </div>

                                    <div className="seqb-effects">
                                        <span className="seqb-effects-label">Effects (0 = silent)</span>
                                        <div className="seqb-effects-grid">
                                            {EFFECT_FIELDS.map(f => (
                                                <label key={f.key} className="seqb-effect">
                                                    <span>{f.label} {(p.effects[f.key] ?? 0).toFixed(1)}</span>
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={1}
                                                        step={0.1}
                                                        value={p.effects[f.key] ?? 0}
                                                        onChange={(e) => setEffect(i, f.key, parseFloat(e.target.value))}
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="seqb-footer">
                    <button className="secondary" onClick={addPhase}>+ Add Phase</button>
                    <span className="seqb-total">
                        {phases.length} phases · {Math.floor(totalSecs / 60)}:{String(totalSecs % 60).padStart(2, '0')} timed
                        {manualCount > 0 && ` · ${manualCount} manual`}
                    </span>
                    <button onClick={handleSave} disabled={!canSave}>
                        {existing ? 'Save Changes' : 'Save to Grimoire'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SequenceBuilder;
