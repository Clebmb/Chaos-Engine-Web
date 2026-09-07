/**
 * Theme registry — each entry maps to a `[data-theme="..."]` block in
 * themes.css. The current theme is stamped on <html> as a data attribute and
 * persisted in localStorage, so a restore happens before first paint (see
 * index.html) and there is never a flash of the wrong theme.
 */

export interface ThemeDef {
    /** data-theme value; must match the CSS selector in themes.css */
    id: string;
    /** Display name in the switcher menu */
    label: string;
    /** Three preview chips: chrome, accent, text */
    swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
    {
        id: 'crimson95',
        label: 'Crimson 95',
        swatch: ['#050505', '#ff2a2a', '#ff3131'],
    },
    {
        id: 'bluewin',
        label: 'Bluewin 95',
        swatch: ['#008080', '#000080', '#000000'],
    },
    {
        id: 'phosphor',
        label: 'Phosphor Terminal',
        swatch: ['#000000', '#33ff33', '#00ff41'],
    },
    {
        id: 'amber',
        label: 'Amber Fog',
        swatch: ['#0a0600', '#ffb000', '#ffcc66'],
    },
    {
        id: 'amiga',
        label: 'Boing Ball',
        swatch: ['#a0a0a0', '#0055aa', '#000000'],
    },
    {
        id: 'midnight',
        label: 'Deep Abyss',
        swatch: ['#02040a', '#4d7cff', '#9db8ff'],
    },
    {
        id: 'sepia',
        label: 'DeadLanguages',
        swatch: ['#1a1204', '#c9a227', '#e8d9b0'],
    },
    {
        id: 'toxic',
        label: 'Toxic Midnight',
        swatch: ['#030a03', '#39ff14', '#aaffaa'],
    },
    {
        id: 'vaporwave',
        label: 'Vapor Grid',
        swatch: ['#12001f', '#ff71ce', '#01cdfe'],
    },
    {
        id: 'gameboy',
        label: 'DMG Ghost',
        swatch: ['#0f380f', '#8bac0f', '#9bbc0f'],
    },
    {
        id: 'bloodmoon',
        label: 'Blood Moon',
        swatch: ['#0a0a0a', '#c41e3a', '#e6c9cb'],
    },
    {
        id: 'cmyk',
        label: 'Hot Type',
        swatch: ['#0a0a0a', '#00e5ff', '#f0f0f0'],
    },
];

export const DEFAULT_THEME = 'crimson95';

const STORAGE_KEY = 'chaos-engine-theme';

export function getStoredTheme(): string {
    try {
        const t = localStorage.getItem(STORAGE_KEY);
        return t && THEMES.some(x => x.id === t) ? t : DEFAULT_THEME;
    } catch {
        return DEFAULT_THEME;
    }
}

export function setTheme(id: string): void {
    if (!THEMES.some(t => t.id === id)) id = DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', id);
    try {
        localStorage.setItem(STORAGE_KEY, id);
    } catch {
        // private mode etc. — theme simply won't persist
    }
}

/** Inline script for index.html: applies the stored theme before first paint. */
export const THEME_BOOT_SNIPPET = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(!t)return;document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
