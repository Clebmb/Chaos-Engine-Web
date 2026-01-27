import React, { useState, useRef, useEffect } from 'react';

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
    const [toneFreq, setToneFreq] = useState(432);
    const [toneVolume, setToneVolume] = useState(0.1);
    const [isTonePlaying, setIsTonePlaying] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

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
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (isTonePlaying) {
            oscRef.current?.stop();
            setIsTonePlaying(false);
        } else {
            const osc = audioCtxRef.current.createOscillator();
            const gain = audioCtxRef.current.createGain();

            osc.frequency.setValueAtTime(toneFreq, audioCtxRef.current.currentTime);
            osc.type = 'sine';

            gain.gain.setValueAtTime(toneVolume, audioCtxRef.current.currentTime);

            osc.connect(gain);
            gain.connect(audioCtxRef.current.destination);

            osc.start();
            oscRef.current = osc;
            gainRef.current = gain;
            setIsTonePlaying(true);
        }
    };

    useEffect(() => {
        if (oscRef.current && audioCtxRef.current) {
            oscRef.current.frequency.setValueAtTime(toneFreq, audioCtxRef.current.currentTime);
        }
    }, [toneFreq]);

    useEffect(() => {
        if (gainRef.current && audioCtxRef.current) {
            gainRef.current.gain.setTargetAtTime(toneVolume, audioCtxRef.current.currentTime, 0.05);
        }
    }, [toneVolume]);

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
                <div className="frequency-input-group">
                    <input
                        type="text"
                        value={toneFreq}
                        onChange={(e) => setToneFreq(parseInt(e.target.value) || 0)}
                        placeholder="Freq (Hz)..."
                    />
                    <button onClick={toggleTone}>{isTonePlaying ? 'Silence Tone' : 'Emit Frequency'}</button>
                </div>
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
