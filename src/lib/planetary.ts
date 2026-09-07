/**
 * Planetary hours — the classical Chaldean order timing system.
 *
 * The day is divided from sunrise to sunset into 12 unequal "planetary
 * hours", and likewise night. Each hour is ruled by a planet in the
 * Chaldean sequence; the day's ruler is the planet of the first hour.
 */

export type Planet =
    | 'Saturn' | 'Jupiter' | 'Mars' | 'Sun' | 'Venus' | 'Mercury' | 'Moon';

export const PLANET_GLYPHS: Record<Planet, string> = {
    Saturn: '♄',
    Jupiter: '♃',
    Mars: '♂',
    Sun: '☉',
    Venus: '♀',
    Mercury: '☿',
    Moon: '☾',
};

/** Chaldean descending sequence: Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon. */
const CHALDEAN: Planet[] = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];

/** Traditional day rulers (planet of the first hour of each weekday). */
const DAY_RULERS: Planet[] = [
    'Sun',       // Sunday
    'Moon',      // Monday
    'Mars',      // Tuesday
    'Mercury',   // Wednesday
    'Jupiter',   // Thursday
    'Venus',     // Friday
    'Saturn',    // Saturday
];

export interface PlanetaryHourInfo {
    /** Ruling planet of the current hour. */
    planet: Planet;
    /** Ruling planet of the day. */
    dayRuler: Planet;
    /** 1-based index of the planetary hour within day (1-12) or night (13-24). */
    hourIndex: number;
    /** True when the sun is up. */
    isDay: boolean;
    /** When the current planetary hour ends (ms epoch). */
    endsAt: number;
    /** Next sunrise/sunset times in ms epoch. */
    sunrise: number;
    sunset: number;
    /** Location label if geolocation succeeded. */
    locationLabel: string | null;
    /** 'calculated' from real coordinates, 'approx' for the equinox fallback. */
    quality: 'calculated' | 'approx';
}

interface SunTimes {
    sunrise: number;
    sunset: number;
}

/** NOAA solar calculation for sunrise/sunset on a given day. Returns null in polar day/night. */
function sunTimes(date: Date, lat: number, lng: number): SunTimes | null {
    const rad = Math.PI / 180;
    const dayOfYear = Math.floor(
        (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
            Date.UTC(date.getFullYear(), 0, 0)) / 86400000
    );

    // Simpler NOAA-style approximation:
    const B = (dayOfYear - 81) * 0.017202; // ~2pi/365.24
    const eqTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
    const decl2 = 23.45 * Math.sin((360 / 365.24) * (dayOfYear - 81) * rad) * rad;

    const hourAngle = Math.acos(
        Math.max(-1, Math.min(1, -Math.tan(lat * rad) * Math.tan(decl2)))
    );
    const halfDayMinutes = (hourAngle / rad) * 4; // 15deg/hour -> 4 min/deg

    const solarNoonLocalMinutes = 720 - 4 * lng - eqTime; // minutes from local midnight
    const sunriseMinutes = solarNoonLocalMinutes - halfDayMinutes;
    const sunsetMinutes = solarNoonLocalMinutes + halfDayMinutes;

    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const sunrise = base + sunriseMinutes * 60000;
    const sunset = base + sunsetMinutes * 60000;

    if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunrise >= sunset) {
        return null;
    }
    return { sunrise, sunset };
}

/** Fallback: 6:00 / 18:00 equal day-night (equinox assumption). */
function approxTimes(date: Date): SunTimes {
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return { sunrise: base + 6 * 3600000, sunset: base + 18 * 3600000 };
}

/**
 * Computes the current planetary hour. If lat/lng are omitted, tries
 * navigator.geolocation; on failure or denial, falls back to equal day/night.
 */
export function getPlanetaryHour(
    now: Date = new Date(),
    coords?: { lat: number; lng: number } | null
): PlanetaryHourInfo {
    let times: SunTimes | null = null;
    let quality: 'calculated' | 'approx' = 'approx';
    let locationLabel: string | null = null;

    if (coords) {
        times = sunTimes(now, coords.lat, coords.lng);
        if (times) {
            quality = 'calculated';
            locationLabel = `${Math.abs(coords.lat).toFixed(1)}°${coords.lat >= 0 ? 'N' : 'S'} ${Math.abs(coords.lng).toFixed(1)}°${coords.lng >= 0 ? 'E' : 'W'}`;
        }
    }
    if (!times) {
        times = approxTimes(now);
    }

    const t = now.getTime();
    // Roll back a day if we're before this morning's sunrise (night of yesterday).
    let sunrise = times.sunrise;
    let sunset = times.sunset;
    if (t < sunrise) {
        const yesterday = new Date(t - 86400000);
        const yTimes = quality === 'calculated' ? sunTimes(yesterday, coords!.lat, coords!.lng) : approxTimes(yesterday);
        sunrise = yTimes ? yTimes.sunrise : sunrise - 86400000;
        sunset = yTimes ? yTimes.sunset : sunset - 86400000;
    }

    const isDay = t >= sunrise && t < sunset;

    let hourIndex: number;
    let hourLength: number;
    let hourStart: number;
    let hourEnd: number;

    if (isDay) {
        hourLength = (sunset - sunrise) / 12;
        hourIndex = Math.floor((t - sunrise) / hourLength); // 0..11
        hourStart = sunrise + hourIndex * hourLength;
        hourEnd = hourStart + hourLength;
    } else {
        // Night: from sunset to next sunrise
        hourLength = (sunrise + 86400000 - sunset) / 12;
        hourIndex = Math.floor((t - sunset) / hourLength); // 0..11
        hourStart = sunset + hourIndex * hourLength;
        hourEnd = hourStart + hourLength;
    }

    // Day ruler = planet of first hour of the weekday at sunrise.
    const sunriseDate = new Date(sunrise);
    const dayRuler = DAY_RULERS[sunriseDate.getDay()];

    // Sequence: starts at day ruler, then follows the Chaldean descending order.
    const startIndex = CHALDEAN.indexOf(dayRuler);
    const absoluteHour = (isDay ? hourIndex : 12 + hourIndex);
    const planet = CHALDEAN[(startIndex + absoluteHour) % 7];

    return {
        planet,
        dayRuler,
        hourIndex: absoluteHour + 1,
        isDay,
        endsAt: hourEnd,
        sunrise,
        sunset,
        locationLabel,
        quality,
    };
}

export function planetColor(p: Planet): string {
    switch (p) {
        case 'Saturn': return '#8899aa';
        case 'Jupiter': return '#ffaa44';
        case 'Mars': return '#ff4444';
        case 'Sun': return '#ffdd44';
        case 'Venus': return '#66ddaa';
        case 'Mercury': return '#dd88ff';
        case 'Moon': return '#ccccdd';
    }
}
