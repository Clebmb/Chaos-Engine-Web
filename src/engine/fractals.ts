/**
 * Fractal family registry — the shared truth between the shader's `type`
 * uniform and the app UI. Each family carries a classical name and a
 * ritual name used in the selector.
 */

export interface FractalType {
    /** Value passed to the shader's `type` uniform. */
    id: number;
    /** Classical name. */
    name: string;
    /** Ritual name shown in the selector. */
    ritualName: string;
    /**
     * True for families whose screen point is the initial guess (Newton) —
     * these want a centered default view.
     */
    guessBased?: boolean;
}

export const FRACTAL_TYPES: FractalType[] = [
    { id: 0, name: 'Mandelbrot', ritualName: 'The Root — Mandelbrot' },
    { id: 1, name: 'Julia', ritualName: 'The Echo — Julia' },
    { id: 2, name: 'Burning Ship', ritualName: 'The Sunken Fires — Burning Ship' },
    { id: 3, name: 'Tricorn', ritualName: 'The Threefold Horn — Tricorn' },
    { id: 4, name: 'Celtic', ritualName: 'The Knot — Celtic' },
    { id: 5, name: 'Buffalo', ritualName: 'The Horned One — Buffalo' },
    { id: 6, name: 'Perpendicular', ritualName: 'The Crossroads — Perpendicular' },
    { id: 7, name: 'Phoenix', ritualName: 'The Firebird — Phoenix' },
    { id: 8, name: 'Newton', ritualName: 'The Three Names — Newton Basins', guessBased: true },
    { id: 9, name: 'Cubic', ritualName: 'The Triple Tower — Cubic' },
    { id: 10, name: 'Quartic', ritualName: 'The Quaternary Tower — Quartic' },
];

/** Upper bound for clamping restored/randomized type values. */
export const MAX_FRACTAL_ID = FRACTAL_TYPES[FRACTAL_TYPES.length - 1].id;

export function fractalName(id: number): string {
    const t = FRACTAL_TYPES.find(f => f.id === id);
    return t ? t.name : FRACTAL_TYPES[0].name;
}

export function fractalRitualName(id: number): string {
    const t = FRACTAL_TYPES.find(f => f.id === id);
    return t ? t.ritualName : FRACTAL_TYPES[0].ritualName;
}
