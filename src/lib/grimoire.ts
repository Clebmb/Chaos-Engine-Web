/**
 * The Grimoire — local persistence for the practitioner's records.
 *
 * Four record types:
 *  - Sigil:    a saved fractal ritual space (intent + renderer state + metadata)
 *  - Diary:    a ritual diary entry with a manifestation follow-up outcome
 *  - Servitor: a created entity with a home world (fractal state) and duties
 *  - Reading:  a divination draw (question + full draw + verified outcome)
 *
 * Records live in localStorage under a single namespaced key. JSON export/
 * import moves the whole grimoire between machines; File System Access
 * save/load stores it as grimoire.json in a folder the practitioner picks
 * (same API Digital Alchemy already uses).
 */

// ------- Types -------

/** Minimal snapshot of the renderer state needed to re-engage a world. */
export interface FractalSnapshot {
    type: number;
    center: [number, number];
    zoom: number;
    maxIterations: number;
    juliaC: [number, number];
    chaosFactor: number;
    /** Serialized effect values, matching App.tsx's URL format. */
    effects: number[];
}

export interface SigilRecord {
    kind: 'sigil';
    id: string;
    intent: string;
    createdAt: number;
    moonPhase: MoonPhase;
    /** The exact URL query string for this ritual space, ready to restore. */
    ritualLink: string;
    state: FractalSnapshot;
    /** Ritual card PNG (data URL) if one was minted for this working. */
    cardDataUrl?: string | null;
    /** Entropy hash sealed into the card, if present. */
    seedHash?: string | null;
}

export type DiaryOutcome = 'pending' | 'manifested' | 'partial' | 'failed';

export interface DiaryRecord {
    kind: 'diary';
    id: string;
    createdAt: number;
    title: string;
    body: string;
    moonPhase: MoonPhase;
    outcome: DiaryOutcome;
    outcomeAt: number | null;
    /** Optional link to the sigil this entry relates to. */
    sigilId: string | null;
}

export interface ServitorRecord {
    kind: 'servitor';
    id: string;
    createdAt: number;
    name: string;
    purpose: string;
    duties: string;
    moonPhase: MoonPhase;
    /** Home world: engaging restores this fractal state. */
    homeWorld: FractalSnapshot | null;
    ritualLink: string | null;
    /** Sigil PNG (data URL) drawn at creation — the entity's face. */
    sigilDataUrl: string | null;
    /** Binaural preset key that sounds when the servitor awakens. */
    tonePreset: string | null;
    /** Aural character: brainwave entrainment or Solfeggio purity. */
    toneFamily: 'brainwave' | 'solfeggio' | null;
    /** Overlay size in px for the awakened projection. */
    overlaySize: number;
    /** Lifespan and feeding schedule (free text, per the classical recipe). */
    lifespan: string;
    feeding: string;
}

/** Fields the Servitor wizard fills beyond the base record. */
export type ServitorDraft = Omit<ServitorRecord,
    'kind' | 'id' | 'createdAt' | 'moonPhase' | 'homeWorld' | 'ritualLink'>;

/** Outcome of a divination draw, judged when the question resolves. */
export type ReadingOutcome = 'pending' | 'hit' | 'miss' | 'unclear';

export type DivinationSystem = 'geomancy' | 'runes' | 'tarot' | 'iching';

export interface ReadingRecord {
    kind: 'reading';
    id: string;
    createdAt: number;
    moonPhase: MoonPhase;
    system: DivinationSystem;
    /** Spread used: 'shield' | 'single' | 'norns' | 'three' | 'coin'. */
    spread: string;
    /** The question asked, or '' for a blind cast. */
    question: string;
    /** Human-readable one-liner of the draw (judge / stones / cards / hexagrams). */
    summary: string;
    /** The full draw payload, faithful enough to re-display. */
    draw: import('./divination').GeoReading |
          import('./divination').RuneDraw |
          import('./divination').TarotDraw |
          import('./divination').IchingReading;
    /** Provenance of the entropy that produced the draw. */
    entropySource: 'BEACON' | 'CSPRNG';
    outcome: ReadingOutcome;
    outcomeAt: number | null;
    /** Optional link to the diary entry written about this reading. */
    diaryId: string | null;
}

export type GrimoireRecord = SigilRecord | DiaryRecord | ServitorRecord | ReadingRecord | CustomSequenceRecord;

/** A practitioner-authored ritual sequence, launched from the sequencer. */
export interface CustomSequenceRecord {
    kind: 'sequence';
    id: string;
    createdAt: number;
    name: string;
    note: string;
    /** Full phase definitions — the sequencer runs these verbatim. */
    phases: import('./ritualEngine').PhaseDefinition[];
}

/** Sentinel preset key meaning “no tone” — distinct from null (legacy rows). */
export const SERVITOR_SILENT = '__silent__';

export interface Grimoire {
    version: number;
    records: GrimoireRecord[];
}

// ------- Moon phase -------

/**
 * Approximate moon phase via the synodic-month method referenced to a known
 * new moon (2000-01-06 18:14 UTC). Good to within a day or so, which is
 * plenty for ritual timing. Names follow the eight traditional phases.
 */
export type MoonPhase =
    | 'New Moon'
    | 'Waxing Crescent'
    | 'First Quarter'
    | 'Waxing Gibbous'
    | 'Full Moon'
    | 'Waning Gibbous'
    | 'Last Quarter'
    | 'Waning Crescent';

export const MOON_GLYPHS: Record<MoonPhase, string> = {
    'New Moon': '●',
    'Waxing Crescent': '◐',
    'First Quarter': '◑',
    'Waxing Gibbous': '◒',
    'Full Moon': '○',
    'Waning Gibbous': '◓',
    'Last Quarter': '◔',
    'Waning Crescent': '◕',
};

export function moonPhase(date: Date = new Date()): { phase: MoonPhase; illumination: number } {
    const SYNODIC = 29.530588853;
    const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // days
    const days = date.getTime() / 86400000;
    const age = ((days - KNOWN_NEW_MOON) % SYNODIC + SYNODIC) % SYNODIC;

    const fraction = age / SYNODIC;
    const phases: MoonPhase[] = [
        'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
        'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
    ];
    // 8 bins, boundaries at 1/16 offsets so exact quarters land in their bin.
    const idx = Math.floor((fraction + 1 / 16) * 8) % 8;
    const illumination = Math.round((1 - Math.cos(2 * Math.PI * fraction)) / 2 * 100);
    return { phase: phases[idx], illumination };
}

export function formatMoon(date: number): string {
    const { phase, illumination } = moonPhase(new Date(date));
    return `${MOON_GLYPHS[phase]} ${phase} (${illumination}%)`;
}

// ------- Persistence -------

const STORAGE_KEY = 'chaos-engine-grimoire';

export function loadGrimoire(): Grimoire {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { version: 1, records: [] };
        const parsed = JSON.parse(raw) as Grimoire;
        if (!parsed || !Array.isArray(parsed.records)) throw new Error('bad shape');
        return parsed;
    } catch {
        return { version: 1, records: [] };
    }
}

export function saveGrimoire(g: Grimoire): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
    } catch (e) {
        console.error('Grimoire save failed', e);
    }
}

export function addRecord(record: GrimoireRecord): Grimoire {
    const g = loadGrimoire();
    g.records.unshift(record);
    saveGrimoire(g);
    return g;
}

export function updateRecord(id: string, patch: Partial<DiaryRecord> & { kind?: 'diary' } | Partial<ServitorRecord> | Partial<SigilRecord> | Partial<ReadingRecord> | Partial<CustomSequenceRecord>): Grimoire {
    const g = loadGrimoire();
    const idx = g.records.findIndex(r => r.id === id);
    if (idx >= 0) {
        g.records[idx] = { ...g.records[idx], ...patch } as GrimoireRecord;
        saveGrimoire(g);
    }
    return g;
}

export function deleteRecord(id: string): Grimoire {
    const g = loadGrimoire();
    g.records = g.records.filter(r => r.id !== id);
    saveGrimoire(g);
    return g;
}

export function newId(): string {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ------- JSON export / import -------

export function exportJson(): string {
    return JSON.stringify(loadGrimoire(), null, 2);
}

export function downloadJson(): void {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `grimoire_${new Date().toISOString().slice(0, 10)}.json`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Imports a grimoire JSON string. Incoming records are merged by id —
 * existing records keep their place; new ones are added at the top.
 * Returns the merged grimoire, or throws on malformed input.
 */
export function importJson(json: string): Grimoire {
    const incoming = JSON.parse(json) as Grimoire;
    if (!incoming || !Array.isArray(incoming.records)) {
        throw new Error('Not a grimoire file');
    }
    const merged = loadGrimoire();
    const known = new Set(merged.records.map(r => r.id));
    const fresh = incoming.records.filter(r => r && r.id && r.kind && !known.has(r.id));
    merged.records = [...fresh, ...merged.records];
    saveGrimoire(merged);
    return merged;
}

// ------- File System Access (optional enhancement) -------

/** True if the browser supports showSaveFilePicker (Chromium). */
export function fsaSupported(): boolean {
    return typeof (window as any).showSaveFilePicker === 'function';
}

/** Writes the grimoire to a grimoire.json file the user picks. */
export async function saveToFile(): Promise<boolean> {
    if (!fsaSupported()) return false;
    try {
        const handle = await (window as any).showSaveFilePicker({
            suggestedName: 'grimoire.json',
            types: [{ description: 'Grimoire (JSON)', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(exportJson());
        await writable.close();
        return true;
    } catch {
        return false; // user cancelled or write failed
    }
}

/** Reads a grimoire.json file the user picks and merges it. */
export async function loadFromFile(): Promise<Grimoire | null> {
    if (!fsaSupported()) return null;
    try {
        const [handle] = await (window as any).showOpenFilePicker({
            types: [{ description: 'Grimoire (JSON)', accept: { 'application/json': ['.json'] } }],
            multiple: false,
        });
        const file = await handle.getFile();
        return importJson(await file.text());
    } catch {
        return null; // user cancelled or invalid file
    }
}
