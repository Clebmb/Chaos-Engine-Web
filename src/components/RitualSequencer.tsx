import React, { useState } from 'react';
import { RITUAL_PRESETS } from '../lib/ritualEngine';
import type { SequencerApi } from '../lib/ritualEngine';

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
                </select>
                <div className="ritual-seq-note">{RITUAL_PRESETS[selected].note}</div>
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
                    onClick={() => seq.start(RITUAL_PRESETS[selected])}
                >
                    Begin Working
                </button>
            </div>
        </div>
    );
};
