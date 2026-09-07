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
    const engine = getBinauralEngine();
    const [beatMode, setBeatMode] = useState<BeatMode>('binaural');
    const [presetKey, setPresetKey] = useState('theta');
    const [isTonePlaying, setIsTonePlaying] = useState(engine.isRunning);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    // Offer the music element to the Listening Bone's internal source.
    // The element is remounted on track change (key=), so re-register then.
    useEffect(() => {
        getAudioReactiveEngine().registerMediaElement(audioRef.current);
    }, [currentTrack, tracks.length]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(console.error);
        }
        setIsPlaying(!isPlaying);
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
        };
        window.addEventListener('chaos-banish', onBanish);
        return () => window.removeEventListener('chaos-banish', onBanish);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                key={tracks[currentTrack]?.url}
                ref={audioRef}
                src={tracks[currentTrack]?.url}
                onEnded={() => setIsPlaying(false)}
            />
        </div>
    );
};

export default AudioPlayer;
