import React, { useState, useEffect } from 'react';
import { getPlanetaryHour, PLANET_GLYPHS, planetColor } from '../lib/planetary';
import type { PlanetaryHourInfo } from '../lib/planetary';
import { moonPhase, MOON_GLYPHS } from '../lib/grimoire';

interface PlanetaryHoursProps {
    onRequestLocation: () => void;
    hasLocation: boolean;
}

/**
 * Compact planetary-hour + moon readout for the Oracle bar, with the
 * standard info-tooltip pattern. Polls each minute (planetary hours change
 * slowly) and geolocates once on mount.
 */
export const PlanetaryHours: React.FC<PlanetaryHoursProps> = ({ onRequestLocation, hasLocation }) => {
    const [info, setInfo] = useState<PlanetaryHourInfo | null>(null);

    useEffect(() => {
        const update = () => setInfo(getPlanetaryHour(new Date()));
        update();
        const id = setInterval(update, 30000);
        return () => clearInterval(id);
    }, []);

    if (!info) return null;

    const moon = moonPhase();

    return (
        <>
            <span className="oracle-feature">
                <span className="oracle-label">Hour:</span>
                <span
                    className="oracle-value"
                    style={{ color: planetColor(info.planet) }}
                >
                    {PLANET_GLYPHS[info.planet]} {info.planet}
                </span>
                <span
                    className="oracle-value oracle-pin"
                    title={hasLocation ? 'Location set' : 'Click to set location for accurate hours'}
                    onClick={onRequestLocation}
                    style={{ cursor: 'pointer' }}
                >
                    {hasLocation ? '📍' : '📍?'}
                </span>
                <div className="info-box-container">
                    <span className="info-icon">?</span>
                    <div className="info-tooltip">
                        <h4>Planetary Hour {info.hourIndex}/24</h4>
                        Day of {info.dayRuler}, hour of <strong>{info.planet}</strong> ({info.isDay ? 'day' : 'night'} count).
                        Chaldean order counted from sunrise. Each planet colors its hour — time workings to the ruler.
                        {info.quality === 'approx'
                            ? <><br /><em>Approximate: enable location for real sunrise/sunset.</em></>
                            : <><br />Sunrise {new Date(info.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Sunset {new Date(info.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
                    </div>
                </div>
            </span>

            <span className="oracle-feature">
                <span className="oracle-label">Moon:</span>
                <span className="oracle-value">
                    {MOON_GLYPHS[moon.phase]} {moon.illumination}%
                </span>
                <div className="info-box-container">
                    <span className="info-icon">?</span>
                    <div className="info-tooltip">
                        <h4>{moon.phase}</h4>
                        {moon.illumination}% illuminated. Waxing for growth workings, waning for banishing;
                        full for peak power, new for seeding intent.
                    </div>
                </div>
            </span>
        </>
    );
};
