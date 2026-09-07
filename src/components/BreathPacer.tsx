import React, { useEffect, useRef, useState } from 'react';
import type { BreathPattern } from '../lib/ritualEngine';

interface BreathPacerProps {
    pattern: BreathPattern;
    /** Dismisses the pacer immediately without touching the ritual sequence. */
    onAbort?: () => void;
}

interface BreathStep {
    label: string;
    seconds: number;
    /** scale of the visual: 0 = shrunk, 1 = full */
    target: number;
}

interface DisplayState {
    label: string;
    secondsLeft: number;
    scale: number;
}

const PATTERNS: Record<Exclude<BreathPattern, 'off'>, BreathStep[]> = {
    box: [
        { label: 'INHALE', seconds: 4, target: 1 },
        { label: 'HOLD', seconds: 4, target: 1 },
        { label: 'EXHALE', seconds: 4, target: 0.3 },
        { label: 'HOLD', seconds: 4, target: 0.3 },
    ],
    '478': [
        { label: 'INHALE', seconds: 4, target: 1 },
        { label: 'HOLD', seconds: 7, target: 1 },
        { label: 'EXHALE', seconds: 8, target: 0.3 },
    ],
    resonance: [
        { label: 'INHALE', seconds: 5.5, target: 1 },
        { label: 'EXHALE', seconds: 5.5, target: 0.3 },
    ],
};

/**
 * Breath pacer overlay. Draws an expanding/contracting disc plus phase text
 * over the fractal for physiological gnosis. Patterns:
 *  - box: 4-4-4-4 (square breathing)
 *  - 478: 4-7-8 (inhale-hold-exhale)
 *  - resonance: 5.5-5.5 (coherent breathing at ~5.5 breaths/min)
 *
 * The whole engine runs on refs inside ONE rAF effect keyed to [pattern]:
 * step advancement must never happen inside a setState updater (React
 * StrictMode double-invokes updaters, which skipped/duplicated steps and
 * snapped the rhythm back to INHALE). State is mirrored out for render only.
 */
export const BreathPacer: React.FC<BreathPacerProps> = ({ pattern, onAbort }) => {
    const [display, setDisplay] = useState<DisplayState | null>(null);
    const rafRef = useRef<number>(0);
    const lastTsRef = useRef<number | null>(null);
    const engineRef = useRef({ stepIndex: 0, secondsLeft: 0, scale: 0.3 });

    useEffect(() => {
        if (pattern === 'off') {
            setDisplay(null);
            return;
        }
        const steps = PATTERNS[pattern];
        engineRef.current = { stepIndex: 0, secondsLeft: steps[0].seconds, scale: 0.3 };
        lastTsRef.current = null;
        setDisplay({ label: steps[0].label, secondsLeft: steps[0].seconds, scale: 0.3 });

        const tick = (ts: number) => {
            if (lastTsRef.current === null) lastTsRef.current = ts;
            const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1);
            lastTsRef.current = ts;
            const st = engineRef.current;

            st.secondsLeft -= dt;
            if (st.secondsLeft <= 0) {
                st.stepIndex = (st.stepIndex + 1) % steps.length;
                // Carry the overshoot so cycle lengths stay exact.
                st.secondsLeft += steps[st.stepIndex].seconds;
            }
            const step = steps[st.stepIndex];

            // Ease the disc toward the current step's target scale.
            const delta = step.target - st.scale;
            st.scale += Math.sign(delta) * Math.min(Math.abs(delta), 1.2 * dt);

            setDisplay({ label: step.label, secondsLeft: st.secondsLeft, scale: st.scale });
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [pattern]);

    if (pattern === 'off' || !display) return null;

    const size = 30 + display.scale * 34; // vmin units

    return (
        <div className="breath-pacer">
            <div
                className="breath-disc"
                style={{ width: `${size}vmin`, height: `${size}vmin`, opacity: 0.25 + display.scale * 0.4 }}
            />
            <div className="breath-text">
                <div className="breath-label">{display.label}</div>
                <div className="breath-count">{Math.ceil(display.secondsLeft)}</div>
            </div>
            {onAbort && (
                <button
                    type="button"
                    className="breath-abort"
                    onClick={onAbort}
                    aria-label="End breathing exercise"
                >
                    ✕ END BREATH
                </button>
            )}
        </div>
    );
};
