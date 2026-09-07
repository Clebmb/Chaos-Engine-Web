import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAudioReactiveEngine } from '../lib/audioReactive';
import type { ReactiveSource } from '../lib/audioReactive';

const METER_W = 240;
const METER_H = 48;

/**
 * The Listening Bone — audio-reactive fractal control.
 *
 * Two sources feed one FFT analyser: the microphone (chant, drum, breath)
 * and the Chaos Engine itself (binaural tone + music). The render loop
 * pulses warp/strobe/zoom/chaos from the analyser's bands. The meter canvas
 * shows the live spectrum plus bass/mid/high rails so the practitioner can
 * see the space hear — or hear itself.
 */
export const AudioReactive: React.FC = () => {
    const [listening, setListening] = useState(false);
    const [source, setSource] = useState<ReactiveSource>('mic');
    const [sensitivity, setSensitivity] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const meterRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);

    const engine = getAudioReactiveEngine();

    // Sync engine sensitivity live.
    useEffect(() => {
        engine.sensitivity = sensitivity;
    }, [sensitivity, engine]);

    // Debug/testing hook: expose the singleton to the console.
    useEffect(() => {
        (window as any).__listeningBone = engine;
        return () => { delete (window as any).__listeningBone; };
    }, [engine]);

    const toggleListen = useCallback(async () => {
        if (listening) {
            engine.stop();
            setListening(false);
            setError(null);
            return;
        }
        const ok = await engine.start(source);
        setListening(ok);
        setError(ok ? null : engine.error);
    }, [listening, source, engine]);

    /** Switches source; re-starts transparently if already listening. */
    const changeSource = useCallback(async (next: ReactiveSource) => {
        if (next === source) return;
        setSource(next);
        if (!listening) return;
        engine.stop();
        const ok = await engine.start(next);
        setListening(ok);
        setError(ok ? null : engine.error);
    }, [listening, source, engine]);

    // Meter loop: spectrum bars + band rails + transient flash.
    useEffect(() => {
        const canvas = meterRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        let transientGlow = 0;
        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            const bands = engine.snapshot();
            const w = canvas.width, h = canvas.height;

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, w, h);

            if (transientGlow > 0.02) {
                ctx.fillStyle = `rgba(255, 42, 42, ${transientGlow * 0.28})`;
                ctx.fillRect(0, 0, w, h);
                transientGlow *= 0.86;
            }
            if (bands.transient > 0.25) transientGlow = 1;

            // Spectrum bars from the engine's normalized spectrum.
            const spec = bands.spectrum;
            if (spec.length > 1) {
                const barCount = 48;
                const per = Math.floor(spec.length * 0.75 / barCount); // usable band only
                const bw = w / barCount;
                for (let b = 0; b < barCount; b++) {
                    let peak = 0;
                    for (let i = b * per; i < (b + 1) * per && i < spec.length; i++) {
                        if (spec[i] > peak) peak = spec[i];
                    }
                    const bh = Math.min(1, peak) * (h - 10);
                    // Red → white heat scale.
                    const heat = Math.min(1, peak * 1.4);
                    ctx.fillStyle = `rgb(${180 + heat * 75}, ${30 + heat * 160}, ${30 + heat * 60})`;
                    ctx.fillRect(b * bw + 1, h - 2 - bh, bw - 2, bh);
                }
            }

            // Band rails
            const rail = (y: number, v: number, color: string, label: string) => {
                ctx.strokeStyle = 'rgba(139, 0, 0, 0.6)';
                ctx.beginPath();
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(w, y + 0.5);
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.fillRect(0, y - 2, Math.max(2, Math.min(1, v) * w), 5);
                ctx.fillStyle = 'rgba(255, 170, 170, 0.75)';
                ctx.font = '8px "Courier New", monospace';
                ctx.fillText(label, 3, y - 4);
            };
            rail(12, bands.bass, '#ff2a2a', 'BASS');
            rail(26, bands.mid, '#ff6644', 'MID');
            rail(40, bands.high, '#ffaa66', 'HIGH');
        };
        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    }, [engine, listening]);

    // Cleanup on unmount: keep the engine alive (singleton) but stop drawing.
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    return (
        <div className="audio-reactive-section">
            <div className="section-title">Listening Bone</div>
            <div className="control-group">
                <div className="reactive-source-row" role="group" aria-label="Listening source">
                    <button
                        className={`reactive-source-btn${source === 'mic' ? ' active' : ''}`}
                        onClick={() => changeSource('mic')}
                        title="The microphone: chant, drum, breathe"
                    >MIC</button>
                    <button
                        className={`reactive-source-btn${source === 'internal' ? ' active' : ''}`}
                        onClick={() => changeSource('internal')}
                        title="The Chaos Engine's own tone and music"
                    >ENGINE</button>
                </div>
                <button
                    className={`reactive-toggle${listening ? ' listening' : ''}`}
                    onClick={toggleListen}
                >
                    {listening ? '◉ LISTENING' : '◎ LISTEN'}
                </button>
                {listening && (
                    <canvas
                        ref={meterRef}
                        width={METER_W}
                        height={METER_H}
                        className="reactive-meter"
                        aria-label={source === 'mic' ? 'Live microphone spectrum' : 'Live engine audio spectrum'}
                    />
                )}
                {error && <div className="reactive-error">{error}</div>}
                <div className="slider-group">
                    <label>Sensitivity: {sensitivity.toFixed(1)}×</label>
                    <input
                        type="range" min="0.2" max="3" step="0.1"
                        value={sensitivity}
                        onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    />
                </div>
                {listening && (
                    <div className="reactive-hint">
                        {source === 'mic'
                            ? 'The fractal hears you: bass bends the warp, hiss drives the strobe, and each onset pulses the whole space.'
                            : 'The fractal feeds on its own sound — the frequency generator and the music. For rhythm from the tone alone, use isochronic mode.'}
                    </div>
                )}
            </div>
        </div>
    );
};
