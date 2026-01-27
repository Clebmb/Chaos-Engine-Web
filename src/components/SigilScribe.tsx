import React, { useState, useEffect, useRef } from 'react';

interface SigilScribeProps {
    onClose: () => void;
    onEngage: (juliaC: [number, number], chaosFactor: number) => void;
}

const SigilScribe: React.FC<SigilScribeProps> = ({ onClose, onEngage }) => {
    const [intent, setIntent] = useState('');
    const [steps, setSteps] = useState<string[]>(['', '', '', '', '']);
    const [params, setParams] = useState<[number, number][]>([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    const [chaosFactors, setChaosFactors] = useState<number[]>([0, 0, 0, 0, 0]);
    const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

    const stepLabels = [
        "Statement of Intent",
        "Unique Character Extraction",
        "Consonant Reduction",
        "Gematric Conversion",
        "Sigil Nucleus"
    ];

    const processIntent = () => {
        if (!intent) return;
        const upper = intent.toUpperCase();

        // Step 1: Unique Letters
        const s1 = Array.from(new Set(upper.split('').filter(c => /[A-Z]/.test(c)))).join('');
        // Step 2: Vowels Removed
        const s2 = s1.replace(/[AEIOU]/g, '');
        // Step 3: Numerological reduction (mock/simple)
        const s3 = s2.split('').map(c => (c.charCodeAt(0) - 64) % 9 || 9).join('');
        // Step 4: Final Sum
        const s4 = String(s3.split('').reduce((a, b) => a + parseInt(b), 0) % 9 || 9);

        const newSteps = [upper, s1, s2, s3, s4];
        setSteps(newSteps);

        const newParams: [number, number][] = [];
        const newChaosFactors: number[] = [];

        newSteps.forEach(s => {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);

            newParams.push([
                -0.8 + ((h & 0xFF) / 255) * 1.6,
                -0.8 + (((h >> 8) & 0xFF) / 255) * 1.6
            ]);

            newChaosFactors.push(((h >> 16) & 0xFF) / 255);
        });

        setParams(newParams);
        setChaosFactors(newChaosFactors);
    };

    useEffect(() => {
        params.forEach((p, i) => {
            const canvas = canvasRefs.current[i];
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const w = canvas.width;
            const h = canvas.height;
            const imageData = ctx.createImageData(w, h);
            const cf = chaosFactors[i];

            // Simple CPU-based Julia for small previews
            for (let x = 0; x < w; x++) {
                for (let y = 0; y < h; y++) {
                    let zx = 1.5 * (x - w / 2) / (0.5 * w);
                    let zy = (y - h / 2) / (0.5 * h);
                    let j = 0;
                    while (zx * zx + zy * zy < 4 && j < 40) {
                        // Base Julia
                        let xt = zx * zx - zy * zy + p[0];
                        zy = 2 * zx * zy + p[1];
                        zx = xt;

                        // Slight perturbation for preview consistency
                        if (cf > 0.0) {
                            zx += Math.sin(zy * (3.0 + cf * 5.0)) * 0.05 * cf;
                        }

                        j++;
                    }
                    const idx = (y * w + x) * 4;
                    const val = j === 40 ? 0 : (j / 40) * 255;
                    imageData.data[idx] = val;
                    imageData.data[idx + 1] = val;
                    imageData.data[idx + 2] = val;
                    imageData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0);
        });
    }, [params, chaosFactors]);

    return (
        <div className="sigil-scribe-modal">
            <div className="modal-content">
                <button className="close-button" onClick={onClose}>&times;</button>
                <h2>Sigil Scribe</h2>
                <p className="scribe-info">Transform your statement of intent into a geometric anchor.</p>

                <div className="control-group">
                    <input
                        type="text"
                        placeholder="Enter Statement of Intent..."
                        value={intent}
                        onChange={(e) => setIntent(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && processIntent()}
                    />
                    <button onClick={processIntent}>Extract Glyphs</button>
                </div>

                <div className="sigil-grid">
                    {steps.map((step, i) => (
                        <div className="sigil-item" key={i}>
                            <div className="sigil-header">
                                <span className="stage-index">Stage {i}</span>
                                <span className="stage-label">{stepLabels[i]}</span>
                            </div>
                            <div className="sigil-string-container">
                                <div className="sigil-string">{step || '---'}</div>
                                <button
                                    className="copy-button"
                                    onClick={(e) => {
                                        if (!step) return;
                                        navigator.clipboard.writeText(step);
                                        const btn = e.currentTarget;
                                        const original = btn.innerText;
                                        btn.innerText = 'COPIED!';
                                        btn.classList.add('copied');
                                        setTimeout(() => {
                                            btn.innerText = original;
                                            btn.classList.remove('copied');
                                        }, 1500);
                                    }}
                                    disabled={!step}
                                >
                                    COPY
                                </button>
                            </div>
                            <canvas
                                ref={el => { canvasRefs.current[i] = el; }}
                                width={200}
                                height={150}
                                className="sigil-canvas"
                            />
                            <button className="secondary" onClick={() => onEngage(params[i], chaosFactors[i])}>
                                Engage Sigil
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SigilScribe;
