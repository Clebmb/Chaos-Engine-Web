/**
 * Binaural/isochronic beat engine.
 *
 * Binaural: two sine oscillators hard-panned L/R with a small frequency
 * offset — the brain perceives the difference as a pulsing beat.
 * Isochronic: a single tone amplitude-modulated by a square LFO (works on
 * speakers, not just headphones).
 */

export interface BinauralVoicePreset {
    /** Beat frequency in Hz (the perceived pulse / carrier offset). */
    beatHz: number;
    /** Base carrier in Hz (left ear; right = left + beat). */
    baseHz: number;
    name: string;
    note: string;
}

export const BRAINWAVES: Record<string, BinauralVoicePreset> = {
    delta: { beatHz: 2, baseHz: 100, name: 'Delta', note: 'Deep sleep, body release' },
    theta: { beatHz: 6, baseHz: 120, name: 'Theta', note: 'Deep meditation, gnosis gateway' },
    alpha: { beatHz: 10, baseHz: 140, name: 'Alpha', note: 'Relaxed focus, light trance' },
    beta: { beatHz: 20, baseHz: 160, name: 'Beta', note: 'Alert concentration' },
    gamma: { beatHz: 40, baseHz: 180, name: 'Gamma', note: 'Peak awareness' },
};

export const SOLFEGGIO: Record<string, BinauralVoicePreset> = {
    ut: { beatHz: 0, baseHz: 174, name: 'UT 174 Hz', note: 'Foundation, security' },
    re: { beatHz: 0, baseHz: 285, name: 'RE 285 Hz', note: 'Restoration, tissue' },
    mi: { beatHz: 0, baseHz: 396, name: 'MI 396 Hz', note: 'Liberation from fear' },
    fa: { beatHz: 0, baseHz: 417, name: 'FA 417 Hz', note: 'Facilitating change' },
    sol: { beatHz: 0, baseHz: 528, name: 'SOL 528 Hz', note: 'Transformation, DNA' },
    la: { beatHz: 0, baseHz: 639, name: 'LA 639 Hz', note: 'Connection, relationships' },
    si: { beatHz: 0, baseHz: 741, name: 'SI 741 Hz', note: 'Awakening intuition' },
    ti: { beatHz: 0, baseHz: 852, name: 'TI 852 Hz', note: 'Return to order' },
};

export type BeatMode = 'binaural' | 'isochronic' | 'mono';

export interface EngineConfig {
    mode: BeatMode;
    baseHz: number;
    beatHz: number;
    /** Isochronic modulation depth, 0..1. */
    depth: number;
    volume: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
    mode: 'binaural',
    baseHz: 120,
    beatHz: 6,
    depth: 0.7,
    volume: 0.15,
};

export class BinauralEngine {
    private ctx: AudioContext | null = null;
    private oscL: OscillatorNode | null = null;
    private oscR: OscillatorNode | null = null;
    private panL: StereoPannerNode | null = null;
    private panR: StereoPannerNode | null = null;
    private gainL: GainNode | null = null;
    private gainR: GainNode | null = null;
    private master: GainNode | null = null;
    private lfo: OscillatorNode | null = null;
    private tapDest: MediaStreamAudioDestinationNode | null = null;
    private running = false;
    private config: EngineConfig = { ...DEFAULT_CONFIG };

    get isRunning(): boolean {
        return this.running;
    }

    /** Reconfigures live; safe to call while running. */
    setConfig(patch: Partial<EngineConfig>): void {
        this.config = { ...this.config, ...patch };
        this.apply();
    }

    getConfig(): EngineConfig {
        return { ...this.config };
    }

    private ensureCtx(): AudioContext {
        if (!this.ctx) {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new Ctx();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0;
            this.master.connect(this.ctx.destination);
        }
        return this.ctx;
    }

    private teardown(): void {
        try { this.oscL?.stop(); } catch { /* already stopped */ }
        try { this.oscR?.stop(); } catch { /* already stopped */ }
        try { this.lfo?.stop(); } catch { /* already stopped */ }
        this.oscL = this.oscR = null;
        this.lfo = null;
        this.panL = this.panR = null;
        this.gainL = this.gainR = null;
    }

    private apply(): void {
        if (!this.ctx || !this.running) return;
        const { mode, baseHz, beatHz, depth, volume } = this.config;
        const t = this.ctx.currentTime;

        // Rebuild graph when mode changed the topology
        this.teardown();

        if (mode === 'binaural') {
            this.gainL = this.ctx.createGain();
            this.gainR = this.ctx.createGain();
            this.panL = this.ctx.createStereoPanner();
            this.panR = this.ctx.createStereoPanner();
            this.panL.pan.value = -1;
            this.panR.pan.value = 1;
            this.oscL = this.ctx.createOscillator();
            this.oscR = this.ctx.createOscillator();
            this.oscL.frequency.value = baseHz;
            this.oscR.frequency.value = baseHz + beatHz;
            this.oscL.connect(this.gainL).connect(this.panL).connect(this.master!);
            this.oscR.connect(this.gainR).connect(this.panR).connect(this.master!);
            this.oscL.start(); this.oscR.start();
        } else {
            // Single oscillator; mono = unmodulated, isochronic = square-LFO gain.
            const osc = this.oscL = this.ctx.createOscillator();
            osc.frequency.value = baseHz;
            const gain = this.gainL = this.ctx.createGain();
            gain.gain.value = 1;
            osc.connect(gain).connect(this.master!);
            if (mode === 'isochronic') {
                const lfo = this.lfo = this.ctx.createOscillator();
                lfo.type = 'square';
                lfo.frequency.value = beatHz;
                const lfoGain = this.ctx.createGain();
                lfoGain.gain.value = depth / 2;
                lfo.connect(lfoGain).connect(gain.gain);
                lfo.start();
            }
            osc.start();
        }

        this.master!.gain.setTargetAtTime(volume, t, 0.05);
    }

    /**
     * A MediaStream mirroring everything flowing into the master gain, for
     * external analysers (the Listening Bone's internal source). Creates the
     * context if needed but does NOT start the tone. Post-volume routing:
     * the analyser hears exactly what you hear.
     */
    ensureTapStream(): MediaStream | null {
        const ctx = this.ensureCtx();
        if (!this.tapDest) {
            this.tapDest = ctx.createMediaStreamDestination();
            this.master!.connect(this.tapDest);
        }
        return this.tapDest.stream;
    }

    start(): void {
        const ctx = this.ensureCtx();
        if (ctx.state === 'suspended') ctx.resume();
        this.running = true;
        this.apply();
    }

    stop(): void {
        if (!this.ctx || !this.running) return;
        const t = this.ctx.currentTime;
        this.master!.gain.setTargetAtTime(0, t, 0.08);
        setTimeout(() => {
            this.teardown();
        }, 300);
        this.running = false;
    }

    dispose(): void {
        this.stop();
        setTimeout(() => {
            this.ctx?.close();
            this.ctx = null;
            this.master = null;
            this.tapDest = null;
        }, 400);
    }
}

/** Singleton: one engine, shared by the UI panel and the ritual sequencer. */
let sharedEngine: BinauralEngine | null = null;

export function getBinauralEngine(): BinauralEngine {
    if (!sharedEngine) sharedEngine = new BinauralEngine();
    return sharedEngine;
}
