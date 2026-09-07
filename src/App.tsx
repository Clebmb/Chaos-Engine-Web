import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SigilDrawer } from './components/SigilDrawer';
import { Grimoire } from './components/Grimoire';
import type { ServitorRecord } from './lib/grimoire';
import Divination from './components/Divination';
import type { FractalSnapshot as GrimoireSnapshot } from './lib/grimoire';
import { RitualSequencer } from './components/RitualSequencer';
import { BreathPacer } from './components/BreathPacer';
import { PlanetaryHours } from './components/PlanetaryHours';
import { useRitualSequencer } from './lib/ritualEngine';
import type { PhaseDefinition } from './lib/ritualEngine';
import { getBinauralEngine } from './lib/binaural';
import { getAudioReactiveEngine } from './lib/audioReactive';
import { AudioReactive } from './components/AudioReactive';
import { Renderer } from './engine/Renderer';
import type { RendererState } from './engine/Renderer';
import SigilScribe from './components/SigilScribe';
import AudioPlayer from './components/AudioPlayer';
import Oracle from './components/Oracle';
import DigitalAlchemy from './components/DigitalAlchemy';
import OverlaySystem from './components/OverlaySystem';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [state, setState] = useState<RendererState>({
    center: [-0.5, 0],
    zoom: 3.5,
    maxIterations: 100,
    type: 0,
    juliaC: [-0.7, 0.27],
    time: 0,
    effects: {
      strobe: 0,
      psych: 0,
      warp: 0,
      scanlines: 0,
      rgbShift: 0,
      neon: 0,
      emboss: 0,
      crush: 0,
      glitch: 0,
      vignette: 0.5,
    },
    accentColor: [1, 0, 0],
    chaosFactor: 0,
  });

  const [overlay, setOverlay] = useState<{
    url: string | null;
    size: number;
    pos: { x: number; y: number };
    motion: 'none' | 'random' | 'bounce';
    speed: number;
  }>({
    url: null,
    size: 200,
    pos: { x: 50, y: 50 },
    motion: 'none',
    speed: 1,
  });

  const [intent, setIntent] = useState('');
  const [showScribe, setShowScribe] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [showDrawer, setShowDrawer] = useState(false);
  const [showGrimoire, setShowGrimoire] = useState(false);
  const [showDivination, setShowDivination] = useState(false);
  const [isBanishing, setIsBanishing] = useState(false);
  const [showBanishConfirm, setShowBanishConfirm] = useState(false);
  const [breathPattern, setBreathPattern] = useState<'off' | 'box' | '478' | 'resonance'>('off');
  /** Sequencer config mode: honor the user's current settings vs phase presets. */
  const [seqUseCurrent, setSeqUseCurrent] = useState(false);
  const [seqSidebarHidden, setSeqSidebarHidden] = useState(false);
  const [seqFreeze, setSeqFreeze] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Sequencer freeze takes precedence; user freeze is manual.
  const effectiveAnimating = isAnimating && !seqFreeze;

  const animationRef = useRef<number>(undefined);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (canvasRef.current) {
      const renderer = new Renderer(canvasRef.current);
      rendererRef.current = renderer;

      const handleResize = () => {
        const w = canvasRef.current!.parentElement?.clientWidth || 800;
        const h = canvasRef.current!.parentElement?.clientHeight || 600;
        canvasRef.current!.width = w;
        canvasRef.current!.height = h;
        renderer.setSize(w, h);
      };

      window.addEventListener('resize', handleResize);
      // Also re-render on container size changes (e.g. sidebar collapse) so
      // the fractal fills the freed space without a window resize event.
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(canvasRef.current!.parentElement!);
      handleResize();
      return () => {
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
      };
    }
  }, []);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const lastFrameRef = useRef<number>(Date.now());

  const update = useCallback(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
    lastFrameRef.current = now;
    const elapsed = (now - startTimeRef.current) / 1000;
    const currentTime = effectiveAnimating ? elapsed : stateRef.current.time;

    if (rendererRef.current) {
      // Audio-reactive modulation: sample the Listening Bone each frame and
      // lay transient-driven offsets over the saved effect values. This is a
      // per-frame overlay only — the user's state is never mutated, so no
      // React re-renders and no fights with sliders.
      const reactive = getAudioReactiveEngine();
      reactive.update(dt);
      const bands = reactive.snapshot();
      const s = stateRef.current;
      const pulse = bands.transient;
      rendererRef.current.render({
        ...s,
        time: currentTime,
        chaosFactor: s.chaosFactor + bands.level * 0.9,
        // Transient zoom-punch: each onset breathes the view inward slightly.
        zoom: s.zoom * (1 - pulse * 0.05),
        effects: {
          ...s.effects,
          warp: Math.min(1, s.effects.warp + bands.bass * 0.45 + pulse * 0.25),
          strobe: Math.min(1, s.effects.strobe + bands.high * 0.5 + pulse * 0.3),
        },
      });
    }

    animationRef.current = requestAnimationFrame(update);
  }, [effectiveAnimating]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationRef.current!);
  }, [update]);

  const handleIntentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIntent(e.target.value);
  };

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { timeout: 8000 }
    );
  }, []);

  // ------- Ritual sequencer -------
  // `seqUseCurrent` ref mirrors the mode for the hook callbacks, which are
  // only created once (the hook stores handlers in a ref internally).
  const seqUseCurrentRef = useRef(seqUseCurrent);
  useEffect(() => { seqUseCurrentRef.current = seqUseCurrent; }, [seqUseCurrent]);

  const seq = useRitualSequencer({
    onPhaseEnter: (phase: PhaseDefinition) => {
      if (seqUseCurrentRef.current) {
        // "Use Current Settings": the practitioner's space is already how
        // they want it. Don't touch effects, fractal, or audio — only drive
        // structure (timers, immersion, motion freeze). If no breath pacer
        // is running, offer the phase's rhythm; otherwise leave theirs.
        setBreathPattern(prev => (prev === 'off' ? phase.breath : prev));
      } else {
        // "Use Default Settings": apply the phase's designed atmosphere
        // (merge over defaults so unlisted effects reset).
        setState(prev => ({
          ...prev,
          effects: {
            strobe: 0, psych: 0, warp: 0, scanlines: 0, rgbShift: 0,
            neon: 0, emboss: 0, crush: 0, glitch: 0, vignette: 0.5,
            ...phase.effects,
          },
        }));
        setBreathPattern(phase.breath);

        const engine = getBinauralEngine();
        if (phase.audio.kind === 'binaural' && phase.audio.preset) {
          import('./lib/binaural').then(({ BRAINWAVES, SOLFEGGIO }) => {
            const p = BRAINWAVES[phase.audio.preset!] || SOLFEGGIO[phase.audio.preset!];
            if (p) {
              engine.setConfig({
                mode: phase.audio.mode ?? 'binaural',
                baseHz: p.baseHz,
                beatHz: p.beatHz,
                volume: phase.audio.volume ?? 0.2,
              });
              engine.start();
              // Keep the AudioPlayer UI in sync with sequencer-driven audio.
              window.dispatchEvent(new CustomEvent('chaos-audio-preset', {
                detail: { preset: phase.audio.preset, mode: phase.audio.mode ?? 'binaural', playing: true },
              }));
            }
          });
        } else {
          engine.stop();
          window.dispatchEvent(new CustomEvent('chaos-audio-preset', {
            detail: { playing: false },
          }));
        }
      }

      setSeqSidebarHidden(phase.hideSidebar);
      setSeqFreeze(phase.freezeMotion);

      if (phase.key === 'banish' || phase.key === 'closing') {
        // Mark the banishing visual without resetting the working's state
        setIsBanishing(true);
        setTimeout(() => setIsBanishing(false), 1200);
      }
    },
    onSequenceEnd: () => {
      setBreathPattern('off');
      setSeqSidebarHidden(false);
      setSeqFreeze(false);
      getBinauralEngine().stop();
      setIsAnimating(true);
    },
  });

  const applyIntent = () => {
    if (!intent) return;
    let hash = 0;
    for (let i = 0; i < intent.length; i++) {
      hash = ((hash << 5) - hash) + intent.charCodeAt(i);
      hash |= 0;
    }
    const h1 = Math.abs(hash % 1000) / 1000;
    const h2 = Math.abs((hash >> 8) % 1000) / 1000;
    const h3 = Math.abs((hash >> 16) % 1000) / 1000;

    setState(prev => ({
      ...prev,
      center: [-0.8 + h1 * 1.6, -0.8 + h2 * 1.6],
      zoom: 0.5 + h3 * 4.0,
      juliaC: [-0.8 + h2 * 1.6, -0.8 + h1 * 1.6],
      chaosFactor: h3,
      type: Math.abs(hash) % 7 // Randomize over more types
    }));
  };

  const toggleEffect = (key: keyof RendererState['effects'], value: any) => {
    setState(prev => ({
      ...prev,
      effects: {
        ...prev.effects,
        [key]: typeof value === 'boolean' ? !prev.effects[key] : value
      }
    }));
  };

  const handleOverlayFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const isMobile = window.innerWidth <= 768;
      setOverlay(prev => ({ ...prev, url, size: isMobile ? 65 : 200 }));
    }
  };

  // Use a generated Spare glyph as the active overlay without uploading a file.
  const handleUseGlyphAsOverlay = useCallback((dataUrl: string) => {
    const isMobile = window.innerWidth <= 768;
    setOverlay(prev => ({ ...prev, url: dataUrl, size: isMobile ? 65 : 200 }));
  }, []);

  const saveFractal = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `chaos_fractal_${Date.now()}.png`;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    }
  };

  // ------- Shareable ritual links -------
  // Encode the renderer state into the URL query string so a whole ritual
  // space (fractal type, view, effects) can be shared as a single link.
  const serializeState = useCallback((s: RendererState) => {
    // Full float precision: fixed decimals silently destroy deep-zoom states
    // (e.g. 0.00002 -> "0.0000"), which then restore as a degenerate zoom of 0.
    const p = (n: number) => String(n);
    const params = new URLSearchParams({
      t: String(s.type),
      cx: p(s.center[0]),
      cy: p(s.center[1]),
      z: p(s.zoom),
      i: String(s.maxIterations),
      jx: p(s.juliaC[0]),
      jy: p(s.juliaC[1]),
      ch: p(s.chaosFactor),
      e: s.effects.strobe.toFixed(1) + ',' + s.effects.psych.toFixed(1) + ',' + s.effects.warp.toFixed(1) + ',' + s.effects.scanlines.toFixed(1) + ',' + s.effects.rgbShift.toFixed(1) + ',' + s.effects.neon.toFixed(1) + ',' + s.effects.emboss.toFixed(1) + ',' + s.effects.crush.toFixed(1) + ',' + s.effects.glitch.toFixed(1) + ',' + s.effects.vignette.toFixed(1),
      v: '1',
    });
    return params.toString();
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const deserializeState = useCallback((str: string): Partial<RendererState> | null => {
    try {
      const q = new URLSearchParams(str);
      if (!q.get('v')) return null;
      const num = (key: string): number => {
        const v = parseFloat(q.get(key) || '');
        if (!Number.isFinite(v)) throw new Error(key);
        return v;
      };
      const [strobe, psych, warp, scanlines, rgbShift, neon, emboss, crush, glitch, vignette] = (q.get('e') || '')
        .split(',')
        .map(v => {
          const f = parseFloat(v);
          if (!Number.isFinite(f)) throw new Error('effects');
          return f;
        });
      const eff = {
        strobe, psych, warp, scanlines, rgbShift, neon, emboss, crush, glitch, vignette,
      } as RendererState['effects'];
      const zoom = num('z');
      if (zoom <= 0) throw new Error('bad zoom');
      return {
        type: Math.max(0, Math.min(6, Math.round(num('t')))),
        center: [num('cx'), num('cy')],
        zoom,
        maxIterations: Math.max(50, Math.min(500, Math.round(num('i')))),
        juliaC: [num('jx'), num('jy')],
        chaosFactor: num('ch'),
        effects: eff,
      };
    } catch {
      return null;
      }
  }, []);

  // ------- Grimoire -------
  // Snapshot the live ritual space for a grimoire record: the URL query
  // string (restorable via deserializeState) plus a plain-data fractal
  // snapshot for previews.
  const captureRitualSpace = useCallback((): { ritualLink: string; state: GrimoireSnapshot } => {
    const s = stateRef.current;
    return {
      ritualLink: serializeState(s),
      state: {
        type: s.type,
        center: [s.center[0], s.center[1]],
        zoom: s.zoom,
        maxIterations: s.maxIterations,
        juliaC: [s.juliaC[0], s.juliaC[1]],
        chaosFactor: s.chaosFactor,
        effects: [s.effects.strobe, s.effects.psych, s.effects.warp, s.effects.scanlines, s.effects.rgbShift, s.effects.neon, s.effects.emboss, s.effects.crush, s.effects.glitch, s.effects.vignette],
      },
    }; 
  }, [serializeState]);

  const engageRitualLink = useCallback((ritualLink: string) => {
    const restored = deserializeState(ritualLink);
    if (!restored) return;
    setState(prev => ({ ...prev, ...restored }));
    setShowGrimoire(false);
  }, [deserializeState]);

  // ------- Servitor awakening -------
  // Launches a servitor: restores its home world, projects its sigil onto
  // the fractal at its chosen size, and sounds its aural key.
  const awakenServitor = useCallback((rec: ServitorRecord) => {
    if (rec.ritualLink) {
      const restored = deserializeState(rec.ritualLink);
      if (restored) setState(prev => ({ ...prev, ...restored }));
    }
    if (rec.sigilDataUrl) {
      setOverlay(prev => ({
        ...prev,
        url: rec.sigilDataUrl,
        size: Math.max(60, Math.min(480, rec.overlaySize || 220)),
        pos: { x: 50, y: 50 },
        motion: 'none',
      }));
    }
    if (rec.tonePreset && rec.tonePreset !== '__silent__' && rec.toneFamily) {
      const presetKey: string = rec.tonePreset;
      const family = rec.toneFamily;
      import('./lib/binaural').then(({ BRAINWAVES, SOLFEGGIO }) => {
        const p = family === 'solfeggio' ? SOLFEGGIO[presetKey] : BRAINWAVES[presetKey];
        if (!p) return;
        const engine = getBinauralEngine();
        engine.setConfig({
          mode: family === 'solfeggio' ? 'mono' : 'binaural',
          baseHz: p.baseHz,
          beatHz: family === 'solfeggio' ? 0 : p.beatHz,
          volume: 0.18,
        });
        engine.start();
        // Keep the AudioPlayer UI in sync with servitor-driven audio.
        window.dispatchEvent(new CustomEvent('chaos-audio-preset', {
          detail: { preset: presetKey, mode: 'binaural', playing: true },
        }));
      });
    }
    setShowGrimoire(false);
  }, [deserializeState]);

  // Restore from ?t=...&cx=... on first mount. Note: motion stays running —
  // freezing it here used to silently kill overlay motion (DVD Bounce /
  // Random Flash) after every reload, since the synced URL always carries
  // ritual params.
  useEffect(() => {
    const restored = deserializeState(window.location.search.substring(1));
    if (restored) {
      setState(prev => ({ ...prev, ...restored }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync (debounced 500ms) as the state changes.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const qs = serializeState(stateRef.current);
      window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
    }, 500);
    return () => clearTimeout(id);
  });

  // ------- Banish mode -------
  // Clears the space: resets the fractal, effects, and overlay, stops the
  // ritual audio, and fires a decaying white-noise burst + white flash.
  const banish = useCallback(() => {
    if (isBanishing) return;
    setIsBanishing(true);

    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const dur = 1.2;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      src.onended = () => ctx.close();
    } catch {
      // Silent banish if audio is unavailable
    }

    window.dispatchEvent(new CustomEvent('chaos-banish'));
    setOverlay(prev => ({ ...prev, url: null }));
    setState({
      center: [-0.5, 0],
      zoom: 3.5,
      maxIterations: 100,
      type: 0,
      juliaC: [-0.7, 0.27],
      time: 0,
      effects: {
        strobe: 0, psych: 0, warp: 0, scanlines: 0, rgbShift: 0,
        neon: 0, emboss: 0, crush: 0, glitch: 0, vignette: 0.5,
      },
      accentColor: [1, 0, 0],
      chaosFactor: 0,
    });
    setIsAnimating(true);
    startTimeRef.current = Date.now();
    setTimeout(() => setIsBanishing(false), 1400);
  }, [isBanishing]);

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    setState(prev => ({
      ...prev,
      zoom: prev.zoom * zoomFactor
    }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setState(prev => {
      const aspect = (canvasRef.current?.width || 800) / (canvasRef.current?.height || 600);
      const moveX = (dx / (canvasRef.current?.width || 800)) * prev.zoom * aspect;
      const moveY = (dy / (canvasRef.current?.height || 600)) * prev.zoom;
      return {
        ...prev,
        center: [prev.center[0] - moveX, prev.center[1] + moveY]
      };
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const lastTouchDist = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouchDist.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDist.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - lastMousePos.current.x;
      const dy = e.touches[0].clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      setState(prev => {
        const aspect = (canvasRef.current?.width || 800) / (canvasRef.current?.height || 600);
        const moveX = (dx / (canvasRef.current?.width || 800)) * prev.zoom * aspect;
        const moveY = (dy / (canvasRef.current?.height || 600)) * prev.zoom;
        return {
          ...prev,
          center: [prev.center[0] - moveX, prev.center[1] + moveY]
        };
      });
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );

      if (lastTouchDist.current !== null) {
        const delta = lastTouchDist.current / dist;
        // Sensitivity control
        const zoomChange = Math.pow(delta, 0.5);

        setState(prev => ({
          ...prev,
          zoom: prev.zoom * zoomChange
        }));
      }
      lastTouchDist.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchDist.current = null;
  };

  // Sequencer immersion counts as collapsed: the fractal takes the whole
  // viewport (no 50vh split, no dead void), and the oracle bar hides too.
  const seqImmersive = seqSidebarHidden;
  const collapsed = !sidebarOpen || seqImmersive;

  return (
    <div className={`app-container${collapsed ? ' sidebar-collapsed' : ''}${seqImmersive ? ' seq-immersive' : ''}`}>
      <aside
        className={`sidebar${(sidebarOpen && !seqSidebarHidden) ? '' : ' sidebar-hidden'}`}
        aria-hidden={!sidebarOpen || seqSidebarHidden}
      >
        <a href="https://caleb.website" target="_blank" rel="noopener noreferrer" className="clebmb-link">
          <img src="/assets/clebmb.webp" alt="Clebmb" className="clebmb-logo" />
        </a>
        <img src="/assets/logo.webp" alt="Chaos Engine" className="app-logo" />

        <div className="section-title">Master Control</div>
        <div className="control-group">
          <input
            type="text"
            placeholder="Statement of Intent..."
            value={intent}
            onChange={handleIntentChange}
            onKeyDown={(e) => e.key === 'Enter' && applyIntent()}
          />
          <button onClick={applyIntent}>Seed Engine</button>
        </div>

        <div className="control-group">
          <div style={{ marginTop: '10px', fontSize: '0.9em' }}>
            Fractal Type: <span style={{ color: '#ff4444', fontWeight: 'bold' }}>
              {['Mandelbrot', 'Julia', 'Burning Ship', 'Tricorn', 'Celtic', 'Buffalo', 'Perpendicular'][state.type]}
            </span>
          </div>
          <div className="slider-group" style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.9em' }}>Fractal Resolution: {state.maxIterations}</label>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={state.maxIterations}
              onChange={(e) => setState(prev => ({ ...prev, maxIterations: parseInt(e.target.value) }))}
              style={{ width: '100%', accentColor: '#ff4444' }}
            />
          </div>
        </div>

        <div className="section-title">Visual Effects</div>
        <div className="control-group">
          <div className="slider-group">
            <label>Strobe: {state.effects.strobe.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.strobe} onChange={(e) => toggleEffect('strobe', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>Psychedelic: {state.effects.psych.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.psych} onChange={(e) => toggleEffect('psych', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>Warp: {state.effects.warp.toFixed(1)}</label>
            <input type="range" min="0" max="2" step="0.1" value={state.effects.warp} onChange={(e) => toggleEffect('warp', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>Neon: {state.effects.neon.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.neon} onChange={(e) => toggleEffect('neon', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>RGB Shift: {state.effects.rgbShift.toFixed(1)}</label>
            <input type="range" min="0" max="2" step="0.1" value={state.effects.rgbShift} onChange={(e) => toggleEffect('rgbShift', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>Scanlines: {state.effects.scanlines.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.scanlines} onChange={(e) => toggleEffect('scanlines', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>Color Crush: {state.effects.crush.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.crush} onChange={(e) => toggleEffect('crush', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>Reality Tear: {state.effects.glitch.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.glitch} onChange={(e) => toggleEffect('glitch', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>Emboss: {state.effects.emboss.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.emboss} onChange={(e) => toggleEffect('emboss', parseFloat(e.target.value))} />
          </div>
          <div className="slider-group">
            <label>The Void: {state.effects.vignette.toFixed(1)}</label>
            <input type="range" min="0" max="1" step="0.1" value={state.effects.vignette} onChange={(e) => toggleEffect('vignette', parseFloat(e.target.value))} />
          </div>
          <div className="button-grid">
            <button className="secondary mini" onClick={() => setState(prev => ({ ...prev, effects: { ...prev.effects, strobe: 0, psych: 0, warp: 0, scanlines: 0, rgbShift: 0, neon: 0, crush: 0, glitch: 0, vignette: 0.5, emboss: 0 } }))}>
              Reset Effects
            </button>
          </div>
        </div>

        <div className="section-title">Image Overlay</div>
        <div className="control-group">
          <input
            type="file"
            id="overlay-upload"
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleOverlayFileUpload}
          />
          <button className="secondary" onClick={() => document.getElementById('overlay-upload')?.click()}>
            {overlay.url ? 'Change Overlay' : 'Upload Overlay (PNG/GIF)'}
          </button>

          {overlay.url && (
            <>
              <div className="slider-group">
                <label>Size: {overlay.size}px</label>
                <input
                  type="range"
                  min="50"
                  max="800"
                  value={overlay.size}
                  onChange={(e) => setOverlay(prev => ({ ...prev, size: parseInt(e.target.value) }))}
                />
              </div>
              <div className="control-group">
                <label>Motion Type</label>
                <select
                  value={overlay.motion}
                  onChange={(e) => setOverlay(prev => ({ ...prev, motion: e.target.value as any }))}
                >
                  <option value="none">Manual (Drag)</option>
                  <option value="random">Random Flash</option>
                  <option value="bounce">DVD Bounce</option>
                </select>
              </div>
              {overlay.motion !== 'none' && (
                <div className="slider-group">
                  <label>Motion Speed: {overlay.speed.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={overlay.speed}
                    onChange={(e) => setOverlay(prev => ({ ...prev, speed: parseFloat(e.target.value) }))}
                  />
                </div>
              )}
              <button className="secondary mini" onClick={() => setOverlay(prev => ({ ...prev, url: null }))}>
                Remove Overlay
              </button>
            </>
          )}
        </div>

        <div className="section-title">Ritual Tools</div>
        <div className="control-group">
          <a href="https://sigilarium.pages.dev" target="_blank" rel="noopener noreferrer" className="sigilarium-link">
            <img src="/assets/sigilarium.webp" alt="Sigilarium" className="sigilarium-logo" />
          </a>
          <button className="secondary" onClick={() => setShowScribe(true)}>Sigil Scribe</button>
          <button className="secondary" onClick={() => setShowDrawer(true)}>Sigil Workshop</button>
          <button className="secondary" onClick={() => setShowGrimoire(true)}>Grimoire</button>
          <button className="secondary" onClick={() => setShowDivination(true)}>Divination</button>
          <button className="secondary" onClick={() => setIsAnimating(!isAnimating)}>
            {isAnimating ? 'Freeze Motion' : 'Resume Flow'}
          </button>
          <button className="secondary" onClick={saveFractal}>Save Fractal</button>
          <button className="secondary" onClick={() => {
            const qs = serializeState(stateRef.current);
            const url = `${window.location.origin}${window.location.pathname}?${qs}`;
            const apply = (ok: boolean) => {
              const btn = document.activeElement as HTMLButtonElement | null;
              if (btn) {
                const orig = btn.textContent;
                btn.textContent = ok ? 'Link Copied!' : 'Copy Failed';
                setTimeout(() => { btn.textContent = orig; }, 1500);
              }
            };
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(url).then(() => apply(true), () => apply(false));
            } else {
              apply(false);
            }
          }}>
            Copy Ritual Link
          </button>
          <button className="banish-button" onClick={() => setShowBanishConfirm(true)} disabled={isBanishing}>
            {isBanishing ? 'BANISHING...' : 'BANISH'}
          </button>
        </div>

        <div className="section-title">Ritual Sequencer</div>
        <RitualSequencer
          seq={seq}
          audioActive={getBinauralEngine().isRunning}
          useCurrent={seqUseCurrent}
          onUseCurrentChange={setSeqUseCurrent}
        />

        <div className="section-title">Breathwork</div>
        <div className="control-group breath-pattern-group">
          <div className="button-grid">
            {(['box', '478', 'resonance'] as const).map(p => (
              <button
                key={p}
                className={`mini secondary${breathPattern === p ? ' active' : ''}`}
                onClick={() => setBreathPattern(prev => (prev === p ? 'off' : p))}
              >
                {p === 'box' ? 'Box 4-4-4-4' : p === '478' ? '4-7-8' : 'Resonance'}
              </button>
            ))}
          </div>
          <div className="breath-note">
            {breathPattern === 'off'
              ? 'Overlays a paced breathing disc on the fractal. Pick a rhythm — tap again to end.'
              : breathPattern === 'box'
                ? 'Square breathing: inhale 4, hold 4, exhale 4, hold 4. Calm and steady.'
                : breathPattern === '478'
                  ? 'Inhale 4, hold 7, exhale 8. The classic sedative breath.'
                  : '~5.5 breaths/min coherent breathing. Heart-rate harmony.'}
          </div>
        </div>

        <AudioPlayer />
        <AudioReactive />
        <DigitalAlchemy />
      </aside>

      <main className="main-view">
        <Oracle
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          planetary={<PlanetaryHours onRequestLocation={requestLocation} hasLocation={!!coords} />}
          coords={coords}
          hidden={seqImmersive}
        />
        <div
          ref={containerRef}
          className="fractal-canvas-container"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
        >
          <canvas ref={canvasRef} />
          <BreathPacer pattern={breathPattern} onAbort={() => setBreathPattern('off')} />
          <OverlaySystem
            {...overlay}
            isAnimating={isAnimating}
            containerRef={containerRef}
            onPosChange={(pos) => setOverlay(prev => ({ ...prev, pos }))} />
          {seqImmersive && seq.phase && (
            <>
              <div className="ritual-hud">
                <span className="ritual-hud-phase">
                  {seq.phase.label.toUpperCase()} {seq.preset ? `${seq.phaseIndex + 1}/${seq.preset.phases.length}` : ''}
                </span>
                {seq.secondsLeft !== null && (
                  <span className="ritual-hud-timer">
                    {Math.floor(seq.secondsLeft / 60)}:{String(seq.secondsLeft % 60).padStart(2, '0')}
                  </span>
                )}
                <button className="secondary" onClick={seq.advance}>Skip &rarr;</button>
                <button className="secondary" onClick={seq.abort}>Abort</button>
              </div>
              <div className="ritual-hud-instructions">{seq.phase.instructions}</div>
            </>
          )}
        </div>
      </main>

      {isBanishing && <div className="banish-flash" />}

      {showBanishConfirm && (
        <div className="banish-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="banish-confirm-title">
          <div className="banish-confirm-box">
            <button className="close-button" onClick={() => setShowBanishConfirm(false)} aria-label="Cancel">&times;</button>
            <h3 className="banish-confirm-title" id="banish-confirm-title">ARE YOU SURE?</h3>
            <p className="banish-confirm-text">
              This will clear the space: fractal, effects, overlay, and sound.
              What was raised must be properly dismissed.
            </p>
            <div className="banish-confirm-buttons">
              <button
                className="banish-confirm-yes"
                onClick={() => { setShowBanishConfirm(false); banish(); }}
              >
                YES
              </button>
              <button onClick={() => setShowBanishConfirm(false)}>NO</button>
            </div>
          </div>
        </div>
      )}

      {showDrawer && (
        <SigilDrawer
          onClose={() => setShowDrawer(false)}
          onUseAsOverlay={handleUseGlyphAsOverlay}
        />
      )}

      {showGrimoire && (
        <Grimoire
          onClose={() => setShowGrimoire(false)}
          captureCurrent={captureRitualSpace}
          onEngage={engageRitualLink}
          onAwaken={awakenServitor}
        />
      )}

      {showDivination && (
        <Divination
          onClose={() => setShowDivination(false)}
        />
      )}

      {showScribe && (
        <SigilScribe
          onClose={() => setShowScribe(false)}
          onEngage={(juliaC, chaosFactor) => {
            setState(prev => ({
              ...prev,
              type: 1, // Force to Julia set
              juliaC: juliaC,
              chaosFactor: chaosFactor,
              zoom: 1.5, // Standard view for a new sigil
              center: [0, 0]
            }));
            setShowScribe(false); // Close after engaging
          }}
        />
      )}
    </div>
  );
};

export default App;
