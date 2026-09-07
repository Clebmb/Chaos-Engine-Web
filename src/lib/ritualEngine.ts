/**
 * Ritual sequencer — a phase engine that walks the practitioner through a
 * classical chaos-magick structure, reconfiguring the app at each phase.
 *
 *   BANISH → INTENT → GNOSIS → CHARGE → BANISH (closing)
 *
 * Each phase declares: duration (or manual advance), fractal effects preset,
 * audio mode (off / binaural preset / keep), breath pacer pattern, and
 * display state. `useRitualSequencer` drives it as a React hook.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export type RitualPhase = 'banish' | 'intent' | 'gnosis' | 'charge' | 'closing';

export interface EffectPreset {
    strobe: number;
    psych: number;
    warp: number;
    scanlines: number;
    rgbShift: number;
    neon: number;
    emboss: number;
    crush: number;
    glitch: number;
    vignette: number;
}

export interface AudioPhaseConfig {
    kind: 'off' | 'binaural';
    /** Binaural preset key (brainwave or Solfeggio) when kind = 'binaural'. */
    preset?: string;
    mode?: 'binaural' | 'isochronic' | 'mono';
    volume?: number;
}

export type BreathPattern = 'off' | 'box' | '478' | 'resonance';

export interface PhaseDefinition {
    key: RitualPhase;
    label: string;
    /** Duration in seconds; 0 = manual advance (button). */
    duration: number;
    instructions: string;
    effects: Partial<EffectPreset>;
    audio: AudioPhaseConfig;
    breath: BreathPattern;
    /** Dim the sidebar to reduce distraction during this phase. */
    hideSidebar: boolean;
    /** Freeze fractal time (stasis). */
    freezeMotion: boolean;
}

export interface SequencerPreset {
    name: string;
    note: string;
    phases: PhaseDefinition[];
}

// ------- Phase presets -------

const BASE_EFFECTS: EffectPreset = {
    strobe: 0, psych: 0, warp: 0, scanlines: 0, rgbShift: 0,
    neon: 0, emboss: 0, crush: 0, glitch: 0, vignette: 0.5,
};

const STANDARD: SequencerPreset = {
    name: 'Standard Working',
    note: 'Classical five-phase structure. Suitable for a complete sigil charging.',
    phases: [
        {
            key: 'banish', label: 'Banish', duration: 60,
            instructions: 'Clear the space and the mind. Laugh, breathe, or watch the noise burst fade.',
            effects: { glitch: 0.8, strobe: 0.3, scanlines: 0.5 },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: false,
        },
        {
            key: 'intent', label: 'Intent', duration: 0,
            instructions: 'State and refine the statement of intent. Use the Sigil Workshop if needed.',
            effects: { ...BASE_EFFECTS },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: true,
        },
        {
            key: 'gnosis', label: 'Gnosis', duration: 180,
            instructions: 'Follow the breath pacer. Empty the mind; dissolve into the field.',
            effects: { psych: 0.7, warp: 0.8, scanlines: 0.3, vignette: 0.8 },
            audio: { kind: 'binaural', preset: 'theta', mode: 'binaural', volume: 0.18 },
            breath: 'box', hideSidebar: true, freezeMotion: false,
        },
        {
            key: 'charge', label: 'Charge', duration: 120,
            instructions: 'Pour the will into the sigil. Hold the image; let the effects burn it in.',
            effects: { strobe: 0.7, psych: 0.5, neon: 0.8, rgbShift: 0.8, vignette: 0.7 },
            audio: { kind: 'binaural', preset: 'gamma', mode: 'binaural', volume: 0.2 },
            breath: '478', hideSidebar: true, freezeMotion: false,
        },
        {
            key: 'closing', label: 'Closing Banish', duration: 60,
            instructions: 'Banish again to ground. Forget the working; release attachment to results.',
            effects: { glitch: 0.8, strobe: 0.3, scanlines: 0.5 },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: false,
        },
    ],
};

const DEEP_TRANCE: SequencerPreset = {
    name: 'Deep Trance Scrying',
    note: 'Long slow descent. For scrying and entity contact rather than sigil charging.',
    phases: [
        {
            key: 'banish', label: 'Banish', duration: 90,
            instructions: 'Long banish. Let the noise strip the day away.',
            effects: { glitch: 0.6, scanlines: 0.6, crush: 0.3 },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: false,
        },
        {
            key: 'intent', label: 'Intent', duration: 0,
            instructions: 'Frame the question or charge silently.',
            effects: { ...BASE_EFFECTS },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: true,
        },
        {
            key: 'gnosis', label: 'Gnosis', duration: 420,
            instructions: 'Seven minutes of theta. Follow the pacer; let the world dissolve.',
            effects: { warp: 1.4, psych: 0.9, scanlines: 0.2, vignette: 0.9 },
            audio: { kind: 'binaural', preset: 'theta', mode: 'binaural', volume: 0.22 },
            breath: 'resonance', hideSidebar: true, freezeMotion: false,
        },
        {
            key: 'charge', label: 'Charge', duration: 180,
            instructions: 'Gaze into the field. Receive; do not grasp.',
            effects: { psych: 0.6, neon: 0.6, vignette: 0.8 },
            audio: { kind: 'binaural', preset: 'delta', mode: 'binaural', volume: 0.22 },
            breath: 'resonance', hideSidebar: true, freezeMotion: true,
        },
        {
            key: 'closing', label: 'Closing Banish', duration: 90,
            instructions: 'Return fully. Banish, stretch, note what came.',
            effects: { glitch: 0.7, scanlines: 0.5 },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: false,
        },
    ],
};

const QUICK_CHARGE: SequencerPreset = {
    name: 'Quick Charge',
    note: 'A five-minute working for when time is short.',
    phases: [
        {
            key: 'banish', label: 'Banish', duration: 30,
            instructions: 'Sharp banish. One big laugh or exhale.',
            effects: { glitch: 0.9, strobe: 0.4 },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: false,
        },
        {
            key: 'intent', label: 'Intent', duration: 0,
            instructions: 'Speak the intent once, plainly.',
            effects: { ...BASE_EFFECTS },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: true,
        },
        {
            key: 'gnosis', label: 'Gnosis', duration: 90,
            instructions: 'Short, fast descent. Breath held at the top.',
            effects: { warp: 1.0, psych: 0.8, strobe: 0.4 },
            audio: { kind: 'binaural', preset: 'alpha', mode: 'binaural', volume: 0.18 },
            breath: 'box', hideSidebar: true, freezeMotion: false,
        },
        {
            key: 'charge', label: 'Charge', duration: 60,
            instructions: 'Burn it in bright.',
            effects: { strobe: 0.9, neon: 1.0, rgbShift: 1.0 },
            audio: { kind: 'binaural', preset: 'gamma', mode: 'binaural', volume: 0.22 },
            breath: 'off', hideSidebar: true, freezeMotion: false,
        },
        {
            key: 'closing', label: 'Closing Banish', duration: 30,
            instructions: 'Cut it. Done. Walk away.',
            effects: { glitch: 0.9, strobe: 0.4 },
            audio: { kind: 'off' },
            breath: 'off', hideSidebar: false, freezeMotion: false,
        },
    ],
};

export const RITUAL_PRESETS: SequencerPreset[] = [STANDARD, DEEP_TRANCE, QUICK_CHARGE];

// ------- Hook -------

export interface SequencerState {
    active: boolean;
    phaseIndex: number;
    phase: PhaseDefinition | null;
    /** Seconds remaining in the current phase; null when manual. */
    secondsLeft: number | null;
    preset: SequencerPreset | null;
    /** Grows 0→1 across the whole sequence. */
    overallProgress: number;
}

export interface SequencerApi extends SequencerState {
    start: (preset: SequencerPreset) => void;
    advance: () => void;
    abort: () => void;
}

export function useRitualSequencer(handlers: {
    onPhaseEnter: (phase: PhaseDefinition) => void;
    onSequenceEnd: () => void;
}): SequencerApi {
    const [state, setState] = useState<SequencerState>({
        active: false, phaseIndex: -1, phase: null,
        secondsLeft: null, preset: null, overallProgress: 0,
    });
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;
    const timerRef = useRef<number | null>(null);

    const clearTimer = () => {
        if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // Refs mirror the state so the interval callback and phase transitions
    // never run inside setState updaters (React StrictMode double-invokes
    // updaters, which would fire phase side effects twice / skip phases).
    const presetRef = useRef<SequencerPreset | null>(null);
    const indexRef = useRef(-1);
    const secondsRef = useRef(0);

    const enterPhase = useCallback((preset: SequencerPreset, index: number) => {
        clearTimer();
        presetRef.current = preset;
        indexRef.current = index;

        if (index >= preset.phases.length) {
            secondsRef.current = 0;
            setState({
                active: false, phase: null, phaseIndex: -1, secondsLeft: null,
                preset, overallProgress: 1,
            });
            handlersRef.current.onSequenceEnd();
            return;
        }

        const phase = preset.phases[index];
        secondsRef.current = phase.duration;
        setState({
            active: true,
            preset,
            phaseIndex: index,
            phase,
            secondsLeft: phase.duration > 0 ? phase.duration : null,
            overallProgress: index / preset.phases.length,
        });
        handlersRef.current.onPhaseEnter(phase);

        if (phase.duration > 0) {
            timerRef.current = window.setInterval(() => {
                secondsRef.current -= 1;
                const left = secondsRef.current;
                if (left <= 0) {
                    enterPhase(preset, indexRef.current + 1);
                } else {
                    setState(s => ({
                        ...s,
                        secondsLeft: left,
                        overallProgress: (indexRef.current + (1 - left / phase.duration)) / preset.phases.length,
                    }));
                }
            }, 1000);
        }
    }, []);

    const start = useCallback((preset: SequencerPreset) => {
        enterPhase(preset, 0);
    }, [enterPhase]);

    const advance = useCallback(() => {
        const preset = presetRef.current;
        if (preset && indexRef.current >= 0) {
            enterPhase(preset, indexRef.current + 1);
        }
    }, [enterPhase]);

    const abort = useCallback(() => {
        clearTimer();
        setState({
            active: false, phaseIndex: -1, phase: null,
            secondsLeft: null, preset: null, overallProgress: 0,
        });
        // Aborting must run the same teardown as a natural end: restore the
        // sidebar, kill the breath pacer, unfreeze motion, stop the tone.
        handlersRef.current.onSequenceEnd();
    }, []);

    // Cleanup on unmount
    useEffect(() => () => clearTimer(), []);

    return { ...state, start, advance, abort };
}
