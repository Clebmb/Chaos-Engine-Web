import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { RITUAL_PRESETS } from '../lib/ritualEngine';
import type { SequencerApi, SequencerPreset } from '../lib/ritualEngine';
import { loadGrimoire, deleteRecord } from '../lib/grimoire';
import type { CustomSequenceRecord, Grimoire } from '../lib/grimoire';
import { SequenceBuilder } from './SequenceBuilder';

interface RitualSequencerProps {
    seq: SequencerApi;
    /** Binaural audio state from the shared engine, for display. */
    audioActive: boolean;
    /** True = phases keep the practitioner's current settings. */
    useCurrent: boolean;
    onUseCurrentChange: (v: boolean) => void;
}

/** Sidebar control panel for the ritual sequencer. */
export const RitualSequencer: React.FC<RitualSequencerProps> = ({ seq, audioActive, useCurrent, onUseCurrentChange }) => {
    const [selected, setSelected] = useState(0);
    const [customSeqs, setCustomSeqs] = useState<CustomSequenceRecord[]>(
        () => loadGrimoire().records.filter((r): r is CustomSequenceRecord => r.kind === 'sequence')
    );
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editing, setEditing] = useState<CustomSequenceRecord | null>(null);

    const presets: SequencerPreset[] = [
        ...RITUAL_PRESETS,
        ...customSeqs.map(r => ({ name: r.name, note: r.note, phases: r.phases })),
    ];
    const selectedIsCustom = selected >= RITUAL_PRESETS.length;
    const selectedCustom = selectedIsCustom ? customSeqs[selected - RITUAL_PRESETS.length] : null;

    const refresh = (g: Grimoire) =>
        setCustomSeqs(g.records.filter((r): r is CustomSequenceRecord => r.kind === 'sequence'));

    const deleteCustom = () => {
        if (!selectedCustom) return;
        refresh(deleteRecord(selectedCustom.id));
        setSelected(0);
    };

    if (seq.active && seq.phase) {
        const phase = seq.phase;
        const total = seq.preset!.phases.length;
        return (
            <div className="ritual-seq-active">
                <div className="ritual-seq-phase-label">
                    PHASE {seq.phaseIndex + 1}/{total}: {phase.label.toUpperCase()}
                </div>
                <div className="ritual-seq-instructions">{phase.instructions}</div>
                {seq.secondsLeft !== null && (
                    <>
                        <div className="ritual-seq-timer">
                            {Math.floor(seq.secondsLeft / 60)}:{String(seq.secondsLeft % 60).padStart(2, '0')}
                        </div>
                        <button className="mini secondary" onClick={seq.advance}>Skip →</button>
                    </>
                )}
                {seq.secondsLeft === null && (
                    <button className="mini" onClick={seq.advance}>Next Phase →</button>
                )}
                <div className="ritual-seq-progress">
                    <div
                        className="ritual-seq-progress-fill"
                        style={{ width: `${seq.overallProgress * 100}%` }}
                    />
                </div>
                <div className="ritual-seq-meta">
                    {phase.audio.kind === 'binaural' ? `♪ ${phase.audio.preset?.toUpperCase()}` : '♪ audio off'}
                    {phase.breath !== 'off' && ` · breath: ${phase.breath}`}
                    {audioActive ? ' · playing' : ''}
                </div>
                <button className="banish-button mini" onClick={seq.abort}>Abort Working</button>
            </div>
        );
    }

    return (
        <div className="ritual-seq-panel">
            <div className="control-group">
                <select
                    value={selected}
                    onChange={(e) => setSelected(parseInt(e.target.value))}
                    aria-label="Ritual preset"
                >
                    {RITUAL_PRESETS.map((p, i) => (
                        <option key={p.name} value={i}>{p.name}</option>
                    ))}
                    {customSeqs.length > 0 && (
                        <optgroup label="Your Rituals">
                            {customSeqs.map((r, i) => (
                                <option key={r.id} value={RITUAL_PRESETS.length + i}>{r.name}</option>
                            ))}
                        </optgroup>
                    )}
                </select>
                <div className="ritual-seq-note">
                    {presets[selected].note}
                    {selectedIsCustom && <span className="seq-custom-badge"> · YOURS</span>}
                </div>
                {selectedIsCustom && (
                    <div className="seq-custom-actions">
                        <button
                            className="mini secondary"
                            onClick={() => { setEditing(selectedCustom); setBuilderOpen(true); }}
                        >
                            ✎ Edit
                        </button>
                        <button className="mini secondary" onClick={deleteCustom}>
                            ✕ Delete
                        </button>
                    </div>
                )}
                <button className="mini secondary seq-build-button" onClick={() => { setEditing(null); setBuilderOpen(true); }}>
                    ✎ Build Your Own Ritual…
                </button>
                <div className="seq-mode-group" role="radiogroup" aria-label="Settings source">
                    <label className="checkbox-group">
                        <input
                            type="radio"
                            name="seq-mode"
                            checked={!useCurrent}
                            onChange={() => onUseCurrentChange(false)}
                        />
                        Use Default Settings
                    </label>
                    <label className="checkbox-group">
                        <input
                            type="radio"
                            name="seq-mode"
                            checked={useCurrent}
                            onChange={() => onUseCurrentChange(true)}
                        />
                        Use Current Settings
                    </label>
                </div>
                <button
                    onClick={() => seq.start(presets[selected])}
                >
                    Begin Working
                </button>
            </div>

            {builderOpen && createPortal(
                /* Portal to body: the sidebar is position:relative, which would
                   otherwise become the modal's containing block and trap the
                   window inside the toolbar. */
                <SequenceBuilder
                    existing={editing}
                    onClose={() => setBuilderOpen(false)}
                    onSaved={refresh}
                />,
                document.body
            )}
        </div>
    );
};

export default RitualSequencer;
