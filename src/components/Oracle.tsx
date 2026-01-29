import React, { useState, useEffect } from 'react';

const Oracle: React.FC = () => {
    const [seed, setSeed] = useState<number>(0);
    const [oracle, setOracle] = useState<string>('-------');

    useEffect(() => {
        // Mocking Quantum Seed fetch (ANU API often blocked by CORS or down)
        const fetchSeed = () => {
            const val = Math.floor(Math.random() * 65535);
            setSeed(val);
        };

        const interval = setInterval(() => {
            const now = Date.now();
            const hash = Math.abs(Math.sin(seed + now)).toString(16).substring(2, 10).toUpperCase();
            setOracle(hash);
        }, 1000);

        fetchSeed();
        const seedInterval = setInterval(fetchSeed, 30000);

        return () => {
            clearInterval(interval);
            clearInterval(seedInterval);
        };
    }, []);

    return (
        <div className="oracle-bar">
            <div className="oracle-links">
                <a href="https://ko-fi.com/clebmb" target="_blank" rel="noopener noreferrer" className="coffee-link">
                    <img src="/assets/coffee.webp" alt="Buy Me a Coffee" className="coffee-logo" />
                </a>
                <a href="https://github.com/Clebmb/Chaos-Engine-Web" target="_blank" rel="noopener noreferrer" className="source-link">
                    <img src="/assets/sourcecode.webp" alt="Source Code" className="source-logo" />
                </a>
            </div>

            <div className="oracle-data">
                <span className="oracle-label">Quantum Seed:</span>
                <span className="oracle-value">{seed}</span>
                <div className="info-box-container">
                    <span className="info-icon">?</span>
                    <div className="info-tooltip">
                        <h4>The First Gnosis</h4>
                        A randomized variable representing high-entropy quantum noise. In Chaos Magick, it bypasses the "Psychic Censor," providing a clean state for manifestation free from conscious bias.
                    </div>
                </div>

                <span className="oracle-label">Oracle:</span>
                <span className="oracle-value">{oracle}</span>
                <div className="info-box-container">
                    <span className="info-icon">?</span>
                    <div className="info-tooltip">
                        <h4>Synchronicity Stream</h4>
                        A real-time scrying mirror derived from quantum entropy and temporal data. It translates raw chaos into symbolic hexadecimal insights, used to detect synchronicities and ritual alignment.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Oracle;
