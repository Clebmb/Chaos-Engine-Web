/**
 * Shared entropy source for the Quantum Seed stream.
 *
 * Prefers the drand League-of-Entropy beacon (collective verifiable
 * randomness); falls back to the browser's CSPRNG if the beacon is down or
 * CORS-blocked. Used by the Oracle bar and the Divination engine so every
 * draw in the app carries the same provenance.
 */

export type EntropySource = 'BEACON' | 'CSPRNG';

/** 32 random bytes from the browser's crypto module, as hex. */
function randomHex(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Provenance: the source of the most recent draw. */
let lastSource: EntropySource = 'CSPRNG';

export function lastEntropySource(): EntropySource {
    return lastSource;
}

/**
 * Draw fresh entropy: drand beacon when reachable, CSPRNG otherwise.
 * Never throws — always resolves to 64 hex chars.
 */
export async function drawEntropy(): Promise<{ hex: string; source: EntropySource }> {
    try {
        const res = await fetch('https://api.drand.sh/public/latest', { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const hex: string = data.randomness ?? '';
        if (!hex) throw new Error('no randomness field');
        lastSource = 'BEACON';
        return { hex, source: 'BEACON' };
    } catch {
        lastSource = 'CSPRNG';
        return { hex: randomHex(32), source: 'CSPRNG' };
    }
}

/** FNV-1a 32-bit hash over a string — the Oracle Stream primitive. */
export function fnv1a(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
