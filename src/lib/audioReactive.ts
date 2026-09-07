/**
 * Audio-reactive engine — the Listening Bone.
 *
 * Two sources feed one FFT analyser:
 *  - 'mic':      microphone input (chant, drum, breath).
 *  - 'internal': the Chaos Engine's own sound — the binaural/frequency
 *                generator (via a MediaStream tap on its master gain) and
 *                the music player (via a MediaElementSource tap).
 *
 * Each frame the analyser is reduced to smoothed band levels (bass / mid /
 * high), an overall level, and a transient (onset) detector. The renderer
 * loop samples these to pulse warp, strobe, zoom, and chaos in real time.
 *
 * Nothing analysed is ever connected to a destination: the mic can never
 * feed back into the speakers, and internal taps are wired pre-destination.
 */

import { getBinauralEngine } from './binaural';

export type ReactiveSource = 'mic' | 'internal';

export interface ReactiveBands {
    /** 20–250 Hz smoothed 0..1 — drums, breath, low chant. */
    bass: number;
    /** 250–2000 Hz smoothed 0..1 — voice, mid chant. */
    mid: number;
    /** 2–16 kHz smoothed 0..1 — sibilance, bells, hiss. */
    high: number;
    /** Weighted overall level 0..1. */
    level: number;
    /** Rising edge detector: 1 on an onset frame, decays fast otherwise. */
    transient: number;
    /** True while the source is live. */
    active: boolean;
    /** True after a permission denial or unavailable device. */
    error: string | null;
    /** Per-bin spectrum (0..1), for the meter. Length = fftSize/2. */
    spectrum: Float32Array;
    /** Which source the current data came from. */
    source: ReactiveSource;
}

const DEFAULT_FFT = 1024;

export class AudioReactiveEngine {
    private ctx: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private freqData: Uint8Array = new Uint8Array(DEFAULT_FFT / 2);
    private spectrumNorm: Float32Array = new Float32Array(DEFAULT_FFT / 2);
    /** Zero-gain sink: gives the analyser a render path without output. */
    private sink: GainNode | null = null;

    // --- mic source graph ---
    private stream: MediaStream | null = null;
    private micSource: MediaStreamAudioSourceNode | null = null;

    // --- internal source graph ---
    /** The music player's <audio> element, registered by AudioPlayer. */
    private mediaEl: HTMLAudioElement | null = null;
    private mediaSrc: MediaElementAudioSourceNode | null = null;
    private toneSrc: MediaStreamAudioSourceNode | null = null;
    private toneTapStream: MediaStream | null = null;

    /** Which source is currently configured (last start() call). */
    source: ReactiveSource = 'mic';

    /** Last failure reason, surfaced by the UI. */
    error: string | null = null;

    private bass = 0;
    private mid = 0;
    private high = 0;
    private level = 0;
    private transient = 0;
    private prevFlux = 0;
    private lastLevel = 0;

    /** Multiplier on reactivity; the UI sensitivity slider drives this. */
    sensitivity = 1;
    /** Master gate: when false, bands read zero without tearing down sources. */
    enabled = false;

    get isActive(): boolean {
        return this.enabled && !!this.analyser && this.ctx?.state === 'running';
    }

    private ensureGraph(): void {
        if (!this.ctx) {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new Ctx();
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = DEFAULT_FFT;
            this.analyser.smoothingTimeConstant = 0.55;
            // The analyser MUST reach the destination to be processed at all
            // (a dead-end output never renders in Chrome) — but through a
            // zero gain, so nothing analysed is ever actually audible.
            this.sink = this.ctx.createGain();
            this.sink.gain.value = 0;
            this.analyser.connect(this.sink).connect(this.ctx.destination);
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
            this.spectrumNorm = new Float32Array(this.analyser.frequencyBinCount);
        }
    }

    /**
     * Starts listening on the given source. Resolves true on success;
     * resolves false (never throws) on failure with `error` set.
     */
    async start(source: ReactiveSource = 'mic'): Promise<boolean> {
        return source === 'mic' ? this.startMic() : this.startInternal();
    }

    /**
     * Requests the microphone and starts analysis. Resolves true on success;
     * resolves false (never throws) on denial/unavailability with `error` set.
     */
    private async startMic(): Promise<boolean> {
        try {
            this.error = null;
            // Switching from the engine's sound to the room: the internal
            // taps must leave the analyser (the music element keeps its
            // destination connection so playback continues unaffected).
            if (this.analyser) {
                if (this.toneSrc) { try { this.toneSrc.disconnect(this.analyser); } catch { /* stale */ } }
                if (this.mediaSrc) { try { this.mediaSrc.disconnect(this.analyser); } catch { /* stale */ } }
            }
            if (!this.stream) {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                    },
                });
            }
            this.ensureGraph();
            if (this.ctx!.state === 'suspended') await this.ctx!.resume();

            // THE CRITICAL WIRE: route the mic stream into the analyser.
            // (A fresh MediaStreamSourceNode per stream — sources cannot be
            // reused across streams, and stale ones must be disconnected.)
            if (this.micSource) {
                try { this.micSource.disconnect(); } catch { /* stale */ }
                this.micSource = null;
            }
            this.micSource = this.ctx!.createMediaStreamSource(this.stream);
            this.micSource.connect(this.analyser!);

            this.enabled = true;
            this.source = 'mic';
            return true;
        } catch (e: any) {
            this.enabled = false;
            this.error = e?.name === 'NotAllowedError'
                ? 'Mic permission denied. The Bone cannot listen.'
                : (e?.message || 'No microphone available.');
            return false;
        }
    }

    /**
     * Registers the music player's <audio> element so the internal source
     * can analyse it. Call again when the element is replaced (track change).
     * No graph side effects here — the MediaElementSourceNode is created
     * lazily on internal start, inside a user gesture.
     */
    registerMediaElement(el: HTMLAudioElement | null): void {
        if (this.mediaEl === el) return;
        this.mediaEl = el;
        this.mediaSrc = null; // force re-tap on next internal start
        // Live re-tap while internal listening is active.
        if (this.enabled && this.source === 'internal') this.connectInternalMedia();
    }

    /** Starts analysis of the Chaos Engine's own audio. Never prompts. */
    private startInternal(): boolean {
        try {
            this.error = null;
            this.ensureGraph();
            if (this.ctx!.state === 'suspended') void this.ctx!.resume();

            // The engine's own tone: bridge its master gain across contexts
            // via a MediaStream tap. The tap exists even when the tone is
            // silent (post-volume routing: the analyser hears what you hear).
            // Reconnect EVERY time — mic mode detaches these from the
            // analyser, and a reused stream must not stay orphaned.
            const tap = getBinauralEngine().ensureTapStream();
            if (tap) {
                if (this.toneSrc && this.toneTapStream !== tap) {
                    try { this.toneSrc.disconnect(); } catch { /* stale */ }
                    this.toneSrc = null;
                }
                if (!this.toneSrc) {
                    this.toneSrc = this.ctx!.createMediaStreamSource(tap);
                    this.toneTapStream = tap;
                }
                this.tapToAnalyser(this.toneSrc);
            }

            this.connectInternalMedia();

            this.enabled = true;
            this.source = 'internal';
            return true;
        } catch (e: any) {
            this.enabled = false;
            this.error = e?.message || 'The engine could not be heard.';
            return false;
        }
    }

    /** node → analyser; duplicate connections are ignored per spec, so this
     *  is an idempotent reconnect after mic-mode teardown. */
    private tapToAnalyser(node: AudioNode): void {
        if (!this.analyser) return;
        try { node.connect(this.analyser); } catch { /* already connected */ }
    }

    /** (Re)connects the registered music element into ctx → analyser + out. */
    private connectInternalMedia(): void {
        if (!this.ctx || !this.analyser || !this.mediaEl) return;
        if (!this.mediaSrc) {
            // Once tapped, the element's audio flows ONLY through this
            // context, so it must also reach the destination to stay audible.
            this.mediaSrc = this.ctx.createMediaElementSource(this.mediaEl);
            this.mediaSrc.connect(this.ctx.destination);
        }
        this.tapToAnalyser(this.mediaSrc);
    }

    /**
     * Stops listening. The mic hardware is released so the OS recording
     * indicator goes dark; internal taps are merely gated (the music element
     * stays bound to this context forever once tapped, so the context must
     * survive to keep it audible).
     */
    stop(): void {
        this.enabled = false;
        if (this.micSource) {
            try { this.micSource.disconnect(); } catch { /* stale */ }
            this.micSource = null;
        }
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;
    }

    /** Fully releases everything. Never closes the context if music is bound. */
    dispose(): void {
        this.stop();
        if (this.toneSrc) {
            try { this.toneSrc.disconnect(); } catch { /* stale */ }
            this.toneSrc = null;
        }
        if (this.ctx && !this.mediaSrc) {
            this.ctx.close().catch(() => { /* already closing */ });
            this.ctx = null;
        }
        this.analyser = null;
    }

    /** Samples the FFT and updates all smoothed values. Call once per frame. */
    update(dt: number): void {
        const fast = Math.min(1, dt * 12);   // attack smoothing
        const slow = Math.min(1, dt * 3);    // release smoothing
        const tDecay = Math.min(1, dt * 9);  // transient decay

        if (!this.isActive || !this.analyser) {
            // Fade everything toward zero so a toggle-off is graceful.
            this.bass += (0 - this.bass) * slow;
            this.mid += (0 - this.mid) * slow;
            this.high += (0 - this.high) * slow;
            this.level += (0 - this.level) * slow;
            this.transient += (0 - this.transient) * tDecay;
            for (let i = 0; i < this.spectrumNorm.length; i++) {
                this.spectrumNorm[i] *= 1 - slow;
            }
            return;
        }

        this.analyser.getByteFrequencyData(this.freqData);
        const bins = this.freqData.length;
        const nyquist = this.ctx!.sampleRate / 2;
        const hzPerBin = nyquist / bins;
        const binOf = (hz: number) => Math.min(bins - 1, Math.max(0, Math.round(hz / hzPerBin)));

        // Band averages (normalized 0..1), lightly compensated for the
        // spectrum's natural high-frequency rolloff.
        const avg = (loHz: number, hiHz: number, boost: number) => {
            const lo = binOf(loHz), hi = Math.max(lo + 1, binOf(hiHz));
            let sum = 0;
            for (let i = lo; i <= hi; i++) sum += this.freqData[i];
            return Math.min(1, (sum / (hi - lo + 1) / 255) * boost);
        };
        const rawBass = avg(20, 250, 1.35);
        const rawMid = avg(250, 2000, 2.2);
        const rawHigh = avg(2000, 16000, 3.2);

        const overall = Math.min(1, (rawBass * 0.5 + rawMid * 0.35 + rawHigh * 0.15) * 1.4);

        // Attack fast, release slow — the classic VU feel.
        this.bass += (rawBass - this.bass) * (rawBass > this.bass ? fast : slow);
        this.mid += (rawMid - this.mid) * (rawMid > this.mid ? fast : slow);
        this.high += (rawHigh - this.high) * (rawHigh > this.high ? fast : slow);
        this.level += (overall - this.level) * (overall > this.level ? fast : slow);

        // Spectral-flux transient detector: positive flux in the low+mid
        // bands against a slow moving average, i.e. "something just hit".
        let flux = 0;
        const fluxHi = binOf(4000);
        for (let i = 0; i <= fluxHi; i++) {
            const v = this.freqData[i] / 255;
            flux += Math.max(0, v - this.spectrumNorm[i]);
            this.spectrumNorm[i] = v;
        }
        flux /= (fluxHi + 1);
        const onset = Math.max(0, flux - this.prevFlux * 0.6);
        this.prevFlux = flux;
        if (onset > 0.012 && this.level > 0.04) {
            this.transient = Math.min(1, this.transient + onset * 6);
        }
        this.transient += (0 - this.transient) * tDecay;

        // Debug breadcrumbs for the meter.
        this.lastLevel = this.level;
    }

    /** Current smoothed snapshot. `spectrum` is a live reference, not a copy. */
    snapshot(): ReactiveBands {
        return {
            bass: this.bass * this.sensitivity,
            mid: this.mid * this.sensitivity,
            high: this.high * this.sensitivity,
            level: this.level * this.sensitivity,
            transient: this.transient * this.sensitivity,
            active: this.isActive,
            error: this.error,
            spectrum: this.spectrumNorm,
            source: this.source,
        };
    }

    /** Level value for external meters. */
    get currentLevel(): number {
        return this.lastLevel;
    }
}

/** Singleton — one analyser, shared by panel and render loop. */
let sharedEngine: AudioReactiveEngine | null = null;

export function getAudioReactiveEngine(): AudioReactiveEngine {
    if (!sharedEngine) sharedEngine = new AudioReactiveEngine();
    return sharedEngine;
}
