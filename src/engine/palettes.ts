/**
 * Escape-gradient palettes for the fractal engine.
 *
 * Each palette is 5 RGB stops (0..1) sampled cyclically over the smooth
 * escape gradient in the fragment shader. Offsets are fixed at even
 * fifths; the shader interpolates stop-to-stop with smoothstep and wraps
 * the last segment back to the first, so every palette tiles seamlessly.
 *
 * Two sources feed the selector: the built-in set (the twelve general
 * gradients, then the seven planetary correspondences) and the user's own
 * palettes, persisted in localStorage under the same namespaced convention
 * as the rest of the app's local data.
 */

export interface Palette {
    key: string;
    name: string;
    /** 5 stops of RGB 0..1. */
    stops: [number, number, number][];
    /** Gradient units per palette cycle: higher = more repeats. */
    cycle: number;
    /** Optional provenance for grouping in the selector. */
    group?: 'planetary';
    /** Only user palettes carry this. */
    custom?: boolean;
}

const s = (...v: [number, number, number][]) => v;

export const PALETTES: Palette[] = [
    {
        key: 'crimson',
        name: 'Crimson Rite',
        stops: s([0.02, 0, 0], [0.35, 0, 0], [0.8, 0.05, 0.05], [0.25, 0.02, 0.02], [0.55, 0, 0.1]),
        cycle: 2.5,
    },
    {
        key: 'ember',
        name: 'Ember Wake',
        stops: s([0.05, 0.01, 0], [0.55, 0.1, 0], [1, 0.65, 0.1], [0.35, 0.03, 0.02], [0.9, 0.3, 0.05]),
        cycle: 3,
    },
    {
        key: 'abyss',
        name: 'Abyssal Current',
        stops: s([0, 0.01, 0.03], [0, 0.15, 0.3], [0.1, 0.45, 0.7], [0.02, 0.08, 0.2], [0.3, 0.7, 0.9]),
        cycle: 2.5,
    },
    {
        key: 'bone',
        name: 'Bone Oracle',
        stops: s([0.04, 0.04, 0.05], [0.4, 0.4, 0.42], [0.95, 0.93, 0.88], [0.2, 0.2, 0.24], [0.65, 0.63, 0.6]),
        cycle: 2,
    },
    {
        key: 'verdant',
        name: 'Verdant Sigil',
        stops: s([0, 0.03, 0.01], [0.05, 0.3, 0.12], [0.4, 0.9, 0.5], [0.02, 0.15, 0.08], [0.7, 1, 0.75]),
        cycle: 3,
    },
    {
        key: 'voidbloom',
        name: 'Void Bloom',
        stops: s([0.03, 0, 0.05], [0.25, 0, 0.4], [0.75, 0.2, 0.95], [0.1, 0.02, 0.2], [0.95, 0.55, 1]),
        cycle: 3,
    },
    {
        key: 'solar',
        name: 'Solar Anthem',
        stops: s([0.08, 0.02, 0], [0.6, 0.35, 0], [1, 0.95, 0.6], [0.35, 0.1, 0.02], [1, 0.7, 0.2]),
        cycle: 2.5,
    },
    {
        key: 'sanguine',
        name: 'Sanguine Moon',
        stops: s([0.04, 0, 0.01], [0.3, 0.02, 0.08], [0.85, 0.15, 0.3], [0.15, 0.01, 0.05], [0.5, 0.05, 0.15]),
        cycle: 2,
    },
    {
        key: 'spectral',
        name: 'Spectral Wheel',
        // Full hue wheel — the old psychedelic vibe, as pure palette data.
        stops: s([0.5, 0, 0.5], [0, 0.5, 1], [0, 1, 0.5], [1, 0.9, 0], [1, 0, 0]),
        cycle: 1.5,
    },
    {
        key: 'iron',
        name: 'Iron Meridian',
        stops: s([0.02, 0.02, 0.03], [0.2, 0.22, 0.25], [0.55, 0.6, 0.68], [0.1, 0.1, 0.12], [0.8, 0.85, 0.95]),
        cycle: 3.5,
    },
    {
        key: 'aurora',
        name: 'Aurora Veil',
        stops: s([0, 0.02, 0.02], [0, 0.3, 0.25], [0.2, 0.95, 0.8], [0, 0.12, 0.15], [0.5, 1, 0.9]),
        cycle: 2.5,
    },
    {
        key: 'gold',
        name: 'Gold Serpent',
        stops: s([0.03, 0.02, 0], [0.35, 0.25, 0], [0.95, 0.8, 0.3], [0.15, 0.1, 0], [0.75, 0.55, 0.1]),
        cycle: 3,
    },
    // ------- Planetary correspondences -------
    // Classical colors of the seven wanderers, tuned so the *escaping*
    // energy carries the planet's hue and the interior stays a void.
    {
        key: 'saturn',
        name: '♄ Saturn — Indigo Binding',
        group: 'planetary',
        stops: s([0.02, 0.02, 0.05], [0.1, 0.08, 0.2], [0.3, 0.25, 0.5], [0.05, 0.05, 0.12], [0.45, 0.4, 0.65]),
        cycle: 1.5,
    },
    {
        key: 'jupiter',
        name: '♃ Jupiter — Royal Expansion',
        group: 'planetary',
        stops: s([0.03, 0.02, 0.04], [0.2, 0.12, 0.25], [0.55, 0.4, 0.75], [0.1, 0.05, 0.12], [0.75, 0.6, 0.9]),
        cycle: 2,
    },
    {
        key: 'mars',
        name: '♂ Mars — Iron Force',
        group: 'planetary',
        stops: s([0.04, 0, 0], [0.25, 0.02, 0], [0.75, 0.08, 0.05], [0.12, 0.01, 0.01], [0.95, 0.2, 0.1]),
        cycle: 2.5,
    },
    {
        key: 'sun',
        name: '☉ Sun — Solar Glory',
        group: 'planetary',
        stops: s([0.06, 0.04, 0], [0.4, 0.28, 0.05], [1, 0.85, 0.35], [0.25, 0.15, 0.02], [1, 0.95, 0.7]),
        cycle: 2,
    },
    {
        key: 'venus',
        name: '♀ Venus — Green Growth',
        group: 'planetary',
        stops: s([0.01, 0.04, 0.02], [0.05, 0.22, 0.12], [0.35, 0.8, 0.55], [0.03, 0.1, 0.06], [0.6, 1, 0.8]),
        cycle: 2,
    },
    {
        key: 'mercury',
        name: '☿ Mercury — Quick Silver',
        group: 'planetary',
        stops: s([0.02, 0.03, 0.03], [0.15, 0.2, 0.22], [0.6, 0.75, 0.8], [0.08, 0.1, 0.12], [0.9, 0.95, 1]),
        cycle: 3.5,
    },
    {
        key: 'moon',
        name: '☾ Moon — Silver Tide',
        group: 'planetary',
        stops: s([0.02, 0.02, 0.04], [0.12, 0.14, 0.2], [0.55, 0.6, 0.75], [0.06, 0.07, 0.1], [0.85, 0.9, 1]),
        cycle: 2.5,
    },
];

export const DEFAULT_PALETTE_KEY = 'crimson';

// ------- User (custom) palettes -------

const LS_KEY = 'chaos-engine.custom-palettes';

export interface CustomPaletteDraft {
    name: string;
    /** 5 stops as hex strings, straight from color inputs. */
    stops: string[];
    cycle: number;
}

function loadCustom(): Palette[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.filter((p: Palette) => p && typeof p.key === 'string' && p.custom === true);
    } catch {
        return [];
    }
}

function saveCustom(list: Palette[]): void {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch {
        // Storage full or blocked: custom palettes silently stay session-only.
    }
}

/** All user-created palettes (persisted). */
export function listCustomPalettes(): Palette[] {
    return loadCustom();
}

/** A palette key is addressable if built-in or user-created. */
export function paletteExists(key: string): boolean {
    return PALETTES.some(p => p.key === key) || loadCustom().some(p => p.key === key);
}

function hexToRgb(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function customToPalette(draft: CustomPaletteDraft, existingKey?: string): Palette {
    return {
        key: existingKey ?? ('user_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        name: draft.name.trim() || 'Unnamed Gradient',
        stops: draft.stops.map(hexToRgb) as [number, number, number][],
        cycle: Math.max(0.5, Math.min(8, draft.cycle)),
        custom: true,
    };
}

export function upsertCustomPalette(palette: Palette): void {
    const list = loadCustom();
    const idx = list.findIndex(p => p.key === palette.key);
    if (idx >= 0) list[idx] = palette;
    else list.push(palette);
    saveCustom(list);
}

export function deleteCustomPalette(key: string): void {
    saveCustom(loadCustom().filter(p => p.key !== key));
}

/**
 * Resolve any addressable palette key (built-in, planetary, or custom) to a
 * full Palette. Unknown keys fall back to the default.
 */
export function getPalette(key: string): Palette {
    const custom = loadCustom().find(p => p.key === key);
    if (custom) return custom;
    return PALETTES.find(p => p.key === key) ?? PALETTES[0];
}

/** Hex string for a stop, for swatch rendering. */
export function stopHex(stop: [number, number, number]): string {
    const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return `#${h(stop[0])}${h(stop[1])}${h(stop[2])}`;
}
