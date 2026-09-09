import React, { useState, useRef, useEffect } from 'react';
import { getBinauralEngine, BRAINWAVES, SOLFEGGIO } from '../lib/binaural';
import type { BeatMode } from '../lib/binaural';
import { getAudioReactiveEngine } from '../lib/audioReactive';

const TRACKS = [
    { name: 'Track 1', url: '/assets/track1.mp3' },
    { name: 'Track 2', url: '/assets/track2.mp3' },
    { name: 'Track 3', url: '/assets/track3.mp3' },
];

const AudioPlayer: React.FC = () => {
    const [tracks, setTracks] = useState([...TRACKS]);
    const [currentTrack, setCurrentTrack] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.5);
    const [toneVolume, setToneVolume] = useState(0.1);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /** Monotonic key forcing a fresh <audio> element on rescue — a remount
     *  escapes the Listening Bone's MediaElementSource capture, which a
     *  suspended mobile context otherwise silences forever. */
    const [elemKey, setElemKey] = useState(0);
    /** True for one remount after a rescue: the fresh element must resume
     *  playback itself (the old element is permanently rerouted and mute). */
    const [autoResume, setAutoResume] = useState(false);
    /** Staged rescue: 0 = healthy, 1 = resume attempted, awaiting re-probe. */
    const rescueStageRef = useRef(0);
    /** Silence-watchdog handle: detects play()-but-no-sound on mobile. */
    const watchdogRef = useRef<number | null>(null);
    const reactive = getAudioReactiveEngine();
    const engine = getBinauralEngine();
    const [beatMode, setBeatMode] = useState<BeatMode>('binaural');
    const [presetKey, setPresetKey] = useState('theta');
    const [isTonePlaying, setIsTonePlaying] = useState(engine.isRunning);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    // On rescue remount: resume playback on the fresh element (the old one
    // is permanently rerouted and mute) and reset the one-shot flag.
    useEffect(() => {
        const el = audioRef.current;
        if (!autoResume || !el) return;
        setAutoResume(false);
        el.volume = volume;
        el.play()
            .then(() => {
                setIsPlaying(true);
                startWatchdog();
            })
            .catch(() => setIsPlaying(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoResume, elemKey]);

    // Offer the music element to the Listening Bone's internal source.
    // The element is remounted on track change (key=), so re-register then.
    useEffect(() => {
        getAudioReactiveEngine().registerMediaElement(audioRef.current);
    }, [currentTrack, tracks.length]);

    /** Disarm the silence watchdog if it is running. */
    const clearWatchdog = () => {
        if (watchdogRef.current !== null) {
            window.clearInterval(watchdogRef.current);
            watchdogRef.current = null;
        }
    };

    /** While playing, sample the element's real output level every 2s. If
     *  the pipeline is delivering samples but the analyser hears silence,
     *  a suspended captured context is eating the sound (mobile) — rescue
     *  by remounting a fresh, uncaptured element in place.
     *  NOTE: measured on the raw time-domain data, not the engine's
     *  smoothed 0..1 bands, so it cannot be fooled by the release smoothing. */
    const startWatchdog = () => {
        clearWatchdog();
        watchdogRef.current = window.setInterval(() => {
            const el = audioRef.current;
            if (!el || el.paused || el.muted || el.volume === 0) return;
            const data = reactive.getMediaSilenceProbe();
            if (!data) return; // not captured → plays through hardware, no watch needed
            let peak = 0;
            for (let i = 0; i < data.length; i += 4) peak = Math.max(peak, Math.abs(data[i]));
            if (peak >= 0.0005) {
                rescueStageRef.current = 0; // audible again
                return;
            }
            if (rescueStageRef.current === 0) {
                // Stage 1: the captured context is suspended — try waking it
                // (no gesture here, but mobile engines often allow resume
                // once playback started). Re-probe on the next tick.
                rescueStageRef.current = 1;
                reactive.unlockMediaForPlayback();
                return;
            }
            // Stage 2: still silent → the context is unrescuable. Unbind the
            // captured element and remount a fresh uncaptured one that plays
            // through the hardware path again.
            rescueStageRef.current = 0;
            reactive.releaseMediaBinding();
            clearWatchdog();
            setAutoResume(true);
            setElemKey(k => k + 1);
        }, 2000);
    };

    const togglePlay = () => {
        const el = audioRef.current;
        if (!el) return;
        if (isPlaying) {
            el.pause();
            clearWatchdog();
            setIsPlaying(false);
        } else {
            // INSIDE the gesture: wake a suspended captured context (screen
            // lock / interruption / lost gesture race leave it dead on
            // mobile) so play() becomes audible instead of silently flowing
            // into a dead graph.
            getAudioReactiveEngine().unlockMediaForPlayback();
            el.play().then(() => {
                setIsPlaying(true);
                startWatchdog();
            }).catch(() => {
                // Autoplay-policy rejection: keep the button honest ("Play
                // Music"), do not flip to Pause with nothing sounding.
                setIsPlaying(false);
                clearWatchdog();
            });
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            const newTrack = { name: file.name, url };
            setTracks(prev => [...prev, newTrack]);
            setCurrentTrack(tracks.length); // Select the new track
            setIsPlaying(false);
        }
    };

    const toggleTone = () => {
        if (isTonePlaying) {
            engine.stop();
            setIsTonePlaying(false);
        } else {
            applyPreset(presetKey);
            engine.start();
            setIsTonePlaying(true);
        }
    };

    /** Pushes the selected preset (and its mode) into the shared engine. */
    const applyPreset = (key: string, mode?: BeatMode) => {
        const preset = BRAINWAVES[key] || SOLFEGGIO[key];
        if (!preset) return;
        const isSolfeggio = !!SOLFEGGIO[key];
        const useMode: BeatMode = mode ?? beatMode;
        engine.setConfig({
            mode: isSolfeggio && useMode === 'binaural' ? 'mono' : useMode,
            baseHz: preset.baseHz,
            beatHz: isSolfeggio ? 0 : preset.beatHz,
            volume: toneVolume,
        });
    };

    // Live-update the engine when the user changes preset/mode/volume.
    useEffect(() => {
        applyPreset(presetKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presetKey, beatMode]);

    useEffect(() => {
        if (engine.isRunning) engine.setConfig({ volume: toneVolume });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toneVolume]);

    // Sync UI when the ritual sequencer drives the shared engine.
    useEffect(() => {
        const onPreset = (e: Event) => {
            const d = (e as CustomEvent).detail;
            if (d.preset) setPresetKey(d.preset);
            if (d.mode) setBeatMode(d.mode);
            setIsTonePlaying(!!d.playing);
        };
        window.addEventListener('chaos-audio-preset', onPreset);
        return () => window.removeEventListener('chaos-audio-preset', onPreset);
    }, []);

    // Banish mode: kill music and entrainment instantly when the space is cleared.
    useEffect(() => {
        const onBanish = () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            engine.stop();
            setIsPlaying(false);
            setIsTonePlaying(false);
            clearWatchdog();
        };
        window.addEventListener('chaos-banish', onBanish);
        return () => window.removeEventListener('chaos-banish', onBanish);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Never leak the watchdog across unmounts or track changes.
    useEffect(() => () => clearWatchdog(), []);

    return (
        <div className="audio-section">
            <div className="section-title">Aural Backdrop</div>
            <div className="control-group">
                <select
                    value={currentTrack}
                    onChange={(e) => {
                        const idx = parseInt(e.target.value);
                        setCurrentTrack(idx);
                        setIsPlaying(false);
                    }}
                >
                    {tracks.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
                </select>

                <div className="file-upload-group">
                    <button className="secondary mini" onClick={() => fileInputRef.current?.click()}>
                        Upload Ritual Music
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="audio/*"
                        onChange={handleFileUpload}
                    />
                </div>

                <div className="audio-controls">
                    <button onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play Music'}</button>
                    <div className="slider-group">
                        <label>Volume: {Math.round(volume * 100)}%</label>
                        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
                    </div>
                </div>
            </div>

            <div className="section-title">Frequency Generator</div>
            <div className="control-group">
                <select
                    value={presetKey}
                    onChange={(e) => setPresetKey(e.target.value)}
                    aria-label="Entrainment preset"
                >
                    <optgroup label="Brainwaves">
                        {Object.entries(BRAINWAVES).map(([key, p]) => (
                            <option key={key} value={key}>{p.name} — {p.beatHz} Hz · {p.note}</option>
                        ))}
                    </optgroup>
                    <optgroup label="Solfeggio">
                        {Object.entries(SOLFEGGIO).map(([key, p]) => (
                            <option key={key} value={key}>{p.name} · {p.note}</option>
                        ))}
                    </optgroup>
                </select>
                <select
                    value={beatMode}
                    onChange={(e) => setBeatMode(e.target.value as BeatMode)}
                    aria-label="Beat mode"
                >
                    <option value="binaural">Binaural (headphones)</option>
                    <option value="isochronic">Isochronic (speakers)</option>
                    <option value="mono">Pure Tone</option>
                </select>
                <button onClick={toggleTone}>{isTonePlaying ? 'Silence Tone' : 'Emit Frequency'}</button>
                <div className="slider-group">
                    <label>Tone Volume: {Math.round(toneVolume * 100)}%</label>
                    <input
                        type="range"
                        min="0"
                        max="0.5"
                        step="0.01"
                        value={toneVolume}
                        onChange={(e) => setToneVolume(parseFloat(e.target.value))}
                    />
                </div>
            </div>

            <audio
                key={elemKey + '-' + (tracks[currentTrack]?.url || '')}
                ref={audioRef}
                src={tracks[currentTrack]?.url}
                onEnded={() => { setIsPlaying(false); clearWatchdog(); }}
            />
        </div>
    );
};

export default AudioPlayer;
