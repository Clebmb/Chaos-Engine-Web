import React, { useState, useEffect } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import { drawEntropy, fnv1a } from '../lib/entropy';

interface OracleProps {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    /** Planetary hour + moon nodes rendered in the bar. */
    planetary: React.ReactNode;
    coords: { lat: number; lng: number } | null;
    /** Ritual immersion: the whole bar yields the stage to the fractal. */
    hidden?: boolean;
}

const Oracle: React.FC<OracleProps> = ({ sidebarOpen, onToggleSidebar, planetary, hidden }) => {
    // Track the CSS mobile breakpoint so the collapse arrow points the right
    // way in both layouts: ◀/▶ on desktop (horizontal slide), ▲/▼ on mobile
    // (vertical stack). Re-evaluated live if the viewport crosses 768px.
    const [isMobile, setIsMobile] = useState(
        () => window.matchMedia('(max-width: 768px)').matches
    );
    void isMobile; // (used in the toggle button below)

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handleChange);
        return () => mq.removeEventListener('change', handleChange);
    }, []);
    const [seed, setSeed] = useState<number>(0);
    const [oracle, setOracle] = useState<string>('-------');

    useEffect(() => {
        let currentHex = '';

        drawEntropy().then(({ hex }) => { currentHex = hex; setSeed(parseInt(hex.slice(0, 4), 16)); });
        const seedInterval = setInterval(async () => {
            const { hex } = await drawEntropy();
            currentHex = hex;
            setSeed(parseInt(hex.slice(0, 4), 16));
        }, 30000);

        // Oracle Stream: FNV-1a over (entropy + current time), so each value
        // is genuinely derived from high entropy + temporal data.
        const interval = setInterval(() => {
            const input = currentHex + ':' + Date.now().toString(36);
            setOracle(fnv1a(input).toString(16).toUpperCase().padStart(8, '0'));
        }, 1000);

        return () => {
            clearInterval(interval);
            clearInterval(seedInterval);
        };
    }, []);

    if (hidden) return null;

    return (
        <div className="oracle-bar">
            <div className="oracle-links">
                <button
                    type="button"
                    className="oracle-toggle"
                    onClick={onToggleSidebar}
                    title={sidebarOpen ? 'Collapse control panel' : 'Expand control panel'}
                    aria-label={sidebarOpen ? 'Collapse control panel' : 'Expand control panel'}
                    aria-expanded={sidebarOpen}
                >
                    {isMobile
                        ? (sidebarOpen ? '▲' : '▼')
                        : (sidebarOpen ? '◀' : '▶')}
                </button>
                <a href="https://ko-fi.com/clebmb" target="_blank" rel="noopener noreferrer" className="coffee-link">
                    <img src="/assets/coffee.webp" alt="Buy Me a Coffee" className="coffee-logo" />
                </a>
                <a href="https://github.com/Clebmb/Chaos-Engine-Web" target="_blank" rel="noopener noreferrer" className="source-link">
                    <img src="/assets/sourcecode.webp" alt="Source Code" className="source-logo" />
                </a>
                <ThemeSwitcher />
            </div>

            <div className="oracle-data">
                <span className="oracle-feature">
                    <span className="oracle-label">Quantum Seed:</span>
                    <span className="oracle-value">{seed}</span>
                    <div className="info-box-container">
                        <span className="info-icon">?</span>
                        <div className="info-tooltip">
                            <h4>The First Gnosis</h4>
                            A randomized variable representing high-entropy quantum noise. In Chaos Magick, it bypasses the "Psychic Censor," providing a clean state for manifestation free from conscious bias.
                        </div>
                    </div>
                </span>

                <span className="oracle-feature">
                    <span className="oracle-label">Oracle:</span>
                    <span className="oracle-value">{oracle}</span>
                    <div className="info-box-container">
                        <span className="info-icon">?</span>
                        <div className="info-tooltip">
                            <h4>Synchronicity Stream</h4>
                            A real-time scrying mirror derived from quantum entropy and temporal data. It translates raw chaos into symbolic hexadecimal insights, used to detect synchronicities and ritual alignment.
                        </div>
                    </div>
                </span>

                {planetary}
            </div>
        </div>
    );
};

export default Oracle;
