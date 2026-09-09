import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SigilDrawer } from './components/SigilDrawer';
import { Grimoire } from './components/Grimoire';
import type { ServitorRecord } from './lib/grimoire';
import { addRecord, newId, moonPhase } from './lib/grimoire';
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
import { PALETTES, DEFAULT_PALETTE_KEY, getPalette, listCustomPalettes, paletteExists, customToPalette, upsertCustomPalette } from './engine/palettes';
import type { CustomPaletteDraft } from './engine/palettes';
import { FRACTAL_TYPES, MAX_FRACTAL_ID, fractalName } from './engine/fractals';
import { drawEntropy } from './lib/entropy';
import { startFilm, filmSupported } from './lib/filmRecorder';
import type { FilmSession } from './lib/filmRecorder';
import { createBuddhabrot } from './engine/buddhabrot';
import type { BuddhabrotAcc } from './engine/buddhabrot';
import PaletteEditor from './components/PaletteEditor';

/** Packs a stop as 6 hex chars for the pd= link param. */
function stopHexCompact(stop: [number, number, number]): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return h(stop[0]) + h(stop[1]) + h(stop[2]);
}
import Oracle from './components/Oracle';
import DigitalAlchemy from './components/DigitalAlchemy';
import OverlaySystem from './components/OverlaySystem';
import type { JuliaMorphMode } from './lib/ritualEngine';

/**
 * Julia morph path — animates the seed c so the set shapeshifts.
 *
 *   orbit:     circle around the base (the set undulates steadily)
 *   lissajous: figure-eight sweep (breathes between connected forms)
 *   drift:     sum of incommensurate sines — a smooth organic wander
 *
 * All three stay within `radius` of the base, so the Julia set remains
 * mostly connected and the working keeps its identity. Time is the same
 * `currentTime` that drives the fractal, so freezeMotion halts the morph.
 */
function morphJuliaC(
    base: [number, number],
    mode: JuliaMorphMode,
    radius: number,
    speed: number,
    t: number,
): [number, number] {
    const th = speed * t;
    switch (mode) {
        case 'orbit':
            return [base[0] + radius * Math.cos(th), base[1] + radius * Math.sin(th)];
        case 'lissajous':
            return [
                base[0] + radius * Math.sin(th),
                base[1] + radius * 0.6 * Math.sin(2 * th),
            ];
        case 'drift':
            // Incommensurate frequencies: never visibly repeats.
            return [
                base[0] + radius * (0.7 * Math.sin(th) + 0.3 * Math.sin(th * 2.71)),
                base[1] + radius * (0.7 * Math.cos(th * 1.41) + 0.3 * Math.cos(th * 0.37)),
            ];
        default:
            return base;
    }
}

/** Default fractal resolution: richer on desktop, cheaper on mobile. */
function defaultMaxIterations(): number {
  return window.innerWidth <= 768 ? 125 : 250;
}

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [state, setState] = useState<RendererState>({
    center: [-0.5, 0],
    zoom: 3.5,
    maxIterations: defaultMaxIterations(),
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
    juliaMorph: 'off' as const,
    morphRadius: 0.15,
    morphSpeed: 0.12,
    paletteKey: DEFAULT_PALETTE_KEY,
    paletteShift: 0,
    trap: 0,
    trapSize: 0.5,
    buddhabrot: false,
  });
  /** Buddhabrot accumulator — the ghost emerges while it's non-null. */
  const bbAccumRef = useRef<BuddhabrotAcc | null>(null);
  const bbLastUploadRef = useRef(0);
  const bbStatsRef = useRef(0);
  const [bbStats, setBbStats] = useState<{ orbits: number } | null>(null);
  /** Accumulation work per frame (iterations) — ~1ms of CPU on desktop. */
  const BB_STEP_BUDGET = 150000;

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

  /** Editor draft preview: renders these stops directly, bypassing state. */
  const [palettePreview, setPalettePreview] = useState<{ stops: [number, number, number][]; cycle: number } | null>(null);
  const [showPaletteEditor, setShowPaletteEditor] = useState(false);
  /** Version counter so custom-palette CRUD re-renders the selector. */
  const [, setCustomPalettesVersion] = useState(0);

  const [intent, setIntent] = useState('');
  const [showScribe, setShowScribe] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** Shrine mode: chrome stripped, fractal + intent only. Tap/key exits. */
  const [shrine, setShrine] = useState(false);
  /** Scrying descent: beacon-chosen target, endless slow zoom. */
  const [scrying, setScrying] = useState(false);
  /** RAF-loop mirror: the render loop is memoized on [effectiveAnimating],
   *  so it must never read live state — a stale closure here silently
   *  disabled the entire descent once (loop kept `scrying === false`). */
  const scryingRef = useRef(false);
  useEffect(() => { scryingRef.current = scrying; }, [scrying]);
  const [scryInfo, setScryInfo] = useState<{ depth: string; source: 'BEACON' | 'CSPRNG' } | null>(null);
  // ------- Ritual Film -------
  const [filming, setFilming] = useState(false);
  const [filmMode, setFilmMode] = useState<'dive' | 'morph'>('dive');
  const [filmLeft, setFilmLeft] = useState(0);
  const filmRef = useRef<FilmSession | null>(null);
  const filmLastTickRef = useRef(0);
  const filmStartRef = useRef({ center: [0, 0] as [number, number], zoom: 3.5, juliaC: [0, 0] as [number, number] });
  const FILM_SECONDS = 12;
  /**
   * Live flight state — the film owns center/zoom (dive) or juliaC (morph)
   * while active, exactly like the scrying descent. Motion rides the render
   * loop; the user's saved state is never mutated, and the view snaps back
   * when the reel ends.
   */
  const filmFlightRef = useRef<{
    mode: 'dive' | 'morph';
    elapsed: number;
  } | null>(null);
  /**
   * Live descent state. The descent owns center/zoom while active;
   * `startTime` freezes while motion is paused so freeze/resume is clean.
   */
  const scryRef = useRef<{
    target: [number, number];
    startCenter: [number, number];
    startZoom: number;
    elapsed: number;
    source: 'BEACON' | 'CSPRNG';
    /** Pre-fetched entropy for the next cycle, so restarts are instant. */
    nextHex: string | null;
  } | null>(null);
  const [shrineHintVisible, setShrineHintVisible] = useState(false);
  const shrineHintTimer = useRef<number | null>(null);

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

  /** Preview override mirrored into a ref so the RAF loop sees it fresh. */
  const palettePreviewRef = useRef(palettePreview);
  useEffect(() => {
    palettePreviewRef.current = palettePreview;
  }, [palettePreview]);

  // ------- Progressive refinement -------
  // While the user is interacting (pan/zoom/sliders/any state change) the
  // fractal renders at quarter resolution; after a short idle the render
  // returns to full resolution. Cheap on the GPU, decisive on deep zooms.
  const lastStateChangeRef = useRef(Date.now());
  useEffect(() => {
    lastStateChangeRef.current = Date.now();
  }, [state]);
  /** Idle time after which a coarse render refines to full resolution. */
  const REFINE_DELAY_MS = 350;

  const lastFrameRef = useRef<number>(Date.now());
  const lastScryInfoRef = useRef<number>(0);

  const update = useCallback(async () => {
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
      // Coarse while the view is in motion or controls are being dragged;
      // refine to full resolution once everything has been idle a moment.
      const idle = now - lastStateChangeRef.current;
      const coarse = idle < REFINE_DELAY_MS;

      // ------- Scrying descent -------
      // The descent owns center/zoom: glide onto the beacon-chosen target,
      // then halve zoom (visible height) every ~12s until float32 precision
      // collapses, at which point it restarts on a fresh pre-fetched point.
      let center = s.center;
      let zoom = s.zoom;
      const scry = scryingRef.current ? scryRef.current : null;
      // Read only the ref here — the `scrying` state variable is not in this
      // callback's deps, so reading it directly reintroduces the stale
      // closure that once disabled the entire descent.
      if (scry) {
        if (effectiveAnimating) scry.elapsed += dt;
        const t = Math.min(1, scry.elapsed / SCRY_FLYIN_SECONDS);
        // smoothstep the fly-in so the approach eases onto the target
        const f = t * t * (3 - 2 * t);
        center = [
          scry.startCenter[0] + (scry.target[0] - scry.startCenter[0]) * f,
          scry.startCenter[1] + (scry.target[1] - scry.startCenter[1]) * f,
        ];
        // zoom is the visible height in plane units, so the descent halves it.
        zoom = scry.startZoom * Math.pow(2, -scry.elapsed / SCRY_DOUBLE_SECONDS);

        if (zoom < SCRY_FLOOR && scry.nextHex) {
          // Precision exhausted — restart the descent on the next point.
          const { hex, source } = await drawEntropy();
          scryRef.current = {
            target: targetFromHex(scry.nextHex),
            startCenter: center,
            startZoom: SCRY_FLOOR * 8, // back up a few doublings for a fresh view
            elapsed: 0,
            source,
            nextHex: hex,
          };
          scry.elapsed = 0; // continue with the fresh cycle this frame
          center = scryRef.current.startCenter;
          zoom = scryRef.current.startZoom;
        }

        // Depth readout, throttled to ~4 updates/second.
        if (now - lastScryInfoRef.current > 250) {
          lastScryInfoRef.current = now;
          setScryInfo({
            depth: zoom.toExponential(2),
            source: scryRef.current?.source ?? 'CSPRNG',
          });
        }
      }

      // ------- Ritual Film flight -------
      // While a reel is rolling, the film owns the view: a smoothstep dive
      // of six decades for c-space families (ending far below the float32
      // wall, deep in perturbation territory). The user's state is untouched
      // and the view snaps back when the reel ends.
      const flight = filmFlightRef.current;
      if (flight) {
        if (effectiveAnimating) flight.elapsed += dt;
        if (flight.elapsed >= FILM_SECONDS) {
          // Reel complete — finalize the recording (async, fire-and-forget).
          const session = filmRef.current;
          filmRef.current = null;
          filmFlightRef.current = null;
          setFilming(false);
          void session?.stop();
        } else if (flight.mode === 'dive') {
          const t = Math.min(1, flight.elapsed / FILM_SECONDS);
          const e = t * t * (3 - 2 * t);
          zoom = filmStartRef.current.zoom * Math.pow(1e-6, e);
        }
        // Countdown readout, throttled to ~4/sec.
        if (now - filmLastTickRef.current > 250) {
          filmLastTickRef.current = now;
          setFilmLeft(Math.max(0, Math.ceil(FILM_SECONDS - flight.elapsed)));
        }
      }

      // Julia morph: when active, the seed c rides its path around the
      // base, so the set shapeshifts every frame (Julia family only).
      const juliaC = s.type === 1 && s.juliaMorph !== 'off'
        ? morphJuliaC(s.juliaC, s.juliaMorph, s.morphRadius, s.morphSpeed, currentTime)
        : s.juliaC;
      // Film morph mode: the seed traces one full lissajous figure per reel
      // around the saved base — the Echo shapeshifting for the camera.
      let juliaCOut = juliaC;
      if (flight && flight.mode === 'morph' && s.type === 1) {
        juliaCOut = morphJuliaC(filmStartRef.current.juliaC, 'lissajous', 0.15, 0.5, flight.elapsed);
      }

      // Buddhabrot ghost: a chunk of orbit-light accumulates every frame
      // (the shrine sits longest → the god-form deepens). Uploads are
      // throttled to ~4/sec so we don't re-upload 300KB per frame.
      const bbActive = !!bbAccumRef.current;
      if (bbActive) {
        const acc = bbAccumRef.current!;
        acc.step(BB_STEP_BUDGET, s.maxIterations);
        const nowUp = Date.now();
        if (acc.dirty && nowUp - bbLastUploadRef.current > 250) {
          bbLastUploadRef.current = nowUp;
          rendererRef.current?.setBuddhabrotData(acc.prepareView(), acc.width, acc.height);
          acc.dirty = false;
        }
        // Orbit-count readout, throttled to ~4/sec.
        if (nowUp - bbStatsRef.current > 250) {
          bbStatsRef.current = nowUp;
          setBbStats({ orbits: acc.orbitsPlotted });
        }
      }

      rendererRef.current.render({
        ...s,
        time: currentTime,
        chaosFactor: s.chaosFactor + bands.level * 0.9,
        // Transient zoom-punch: each onset breathes the view inward slightly.
        zoom: zoom * (1 - pulse * 0.05),
        center,
        juliaC: juliaCOut,
        paletteKey: s.paletteKey,
        paletteShift: s.paletteShift,
        paletteOverride: palettePreviewRef.current ?? undefined,
        effects: {
          ...s.effects,
          warp: Math.min(1, s.effects.warp + bands.bass * 0.45 + pulse * 0.25),
          strobe: Math.min(1, s.effects.strobe + bands.high * 0.5 + pulse * 0.3),
        },
      }, { coarse });
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
        // Fractal choreography: phases may drive the Julia morph.
        if (phase.juliaMorph !== undefined || phase.morphRadius !== undefined || phase.morphSpeed !== undefined) {
          setState(prev => ({
            ...prev,
            ...(phase.juliaMorph !== undefined ? { juliaMorph: phase.juliaMorph } : {}),
            ...(phase.morphRadius !== undefined ? { morphRadius: phase.morphRadius } : {}),
            ...(phase.morphSpeed !== undefined ? { morphSpeed: phase.morphSpeed } : {}),
          }));
        }

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
      type: Math.abs(hash) % (MAX_FRACTAL_ID + 1) // Randomize over all families
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
      setOverlay(prev => {
        // Animated GIFs ride the same path as statics (the <img> renders
        // them natively); just release any previous blob URL.
        if (prev.url?.startsWith('blob:')) URL.revokeObjectURL(prev.url);
        const isMobile = window.innerWidth <= 768;
        return { ...prev, url, size: isMobile ? 65 : 200 };
      });
    }
  };

  // Use a generated sigil as the active overlay without uploading a file.
  // Receives a PNG data URL (still sigils) or a GIF blob URL (animated).
  const handleUseGlyphAsOverlay = useCallback((url: string) => {
    const isMobile = window.innerWidth <= 768;
    setOverlay(prev => ({ ...prev, url, size: isMobile ? 65 : 200 }));
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
      tr: String(s.trap),
      ts: s.trapSize.toFixed(2),
      jm: s.juliaMorph,
      mr: s.morphRadius.toFixed(3),
      ms: s.morphSpeed.toFixed(3),
      bb: s.buddhabrot ? '1' : '0',
      p: s.paletteKey,
      pl: s.paletteShift.toFixed(3),
      // Shared custom palettes ride the link as compact hex stops so any
      // machine can render the exact gradient without the save.
      ...(getPalette(s.paletteKey).custom
        ? { pd: getPalette(s.paletteKey).stops.map(stopHexCompact).join('') + '|' + getPalette(s.paletteKey).cycle }
        : {}),
      e: s.effects.strobe.toFixed(1) + ',' + s.effects.psych.toFixed(1) + ',' + s.effects.warp.toFixed(1) + ',' + s.effects.scanlines.toFixed(1) + ',' + s.effects.rgbShift.toFixed(1) + ',' + s.effects.neon.toFixed(1) + ',' + s.effects.emboss.toFixed(1) + ',' + s.effects.crush.toFixed(1) + ',' + s.effects.glitch.toFixed(1) + ',' + s.effects.vignette.toFixed(1),
      v: '1',
    });
    return params.toString();
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // ------- Buddhabrot ghost -------
  const enableBuddhabrot = useCallback(async () => {
    if (bbAccumRef.current) return;
    const { hex } = await drawEntropy(); // seeded by the Quantum Seed stream
    const acc = createBuddhabrot(hex);
    acc.prepareView(); // seed an empty field so the first render is black
    bbAccumRef.current = acc;
    bbLastUploadRef.current = Date.now();
    rendererRef.current?.setBuddhabrotData(acc.view, acc.width, acc.height);
    setBbStats({ orbits: 0 });
    setState(prev => ({ ...prev, buddhabrot: true }));
  }, []);

  const disableBuddhabrot = useCallback(() => {
    bbAccumRef.current = null;
    rendererRef.current?.setBuddhabrotData(null, 0, 0);
    setBbStats(null);
    setState(prev => ({ ...prev, buddhabrot: false }));
  }, []);

  const clearGhost = useCallback(() => {
    const acc = bbAccumRef.current;
    if (!acc) return;
    acc.reset();
    rendererRef.current?.setBuddhabrotData(acc.view, acc.width, acc.height);
    setBbStats({ orbits: 0 });
  }, []);

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

      // A shared custom palette arrives as 30 hex chars + cycle (pd=).
      // Materialize it locally (idempotent) so the selector can address it.
      let paletteKey = PALETTES.some(pl => pl.key === q.get('p')) ? q.get('p')! : DEFAULT_PALETTE_KEY;
      const pd = q.get('pd');
      if (pd && /^[0-9a-f]{30}\|[0-9.]+$/i.test(pd)) {
        const hexes = [];
        for (let i = 0; i < 5; i++) hexes.push('#' + pd.slice(i * 6, i * 6 + 6));
        const cycle = parseFloat(pd.split('|')[1]) || 2.5;
        const draft: CustomPaletteDraft = { name: 'Shared Gradient', stops: hexes, cycle };
        const pal = customToPalette(draft, 'shared_' + pd.split('|')[0]);
        if (!paletteExists(pal.key)) upsertCustomPalette(pal);
        paletteKey = pal.key;
      }

      return {
        type: Math.max(0, Math.min(MAX_FRACTAL_ID, Math.round(num('t')))),
        center: [num('cx'), num('cy')],
        zoom,
        maxIterations: Math.max(50, Math.min(500, Math.round(num('i')))),
        juliaC: [num('jx'), num('jy')],
        chaosFactor: num('ch'),
        paletteKey,
        paletteShift: q.get('pl') ? Math.max(0, Math.min(1, parseFloat(q.get('pl')!) || 0)) : 0,
        trap: q.get('tr') ? Math.max(0, Math.min(5, Math.round(parseFloat(q.get('tr')!) || 0))) : 0,
        trapSize: q.get('ts') ? Math.max(0.05, Math.min(3, parseFloat(q.get('ts')!) || 0.5)) : 0.5,
        juliaMorph: (['off', 'orbit', 'lissajous', 'drift'].includes(q.get('jm') || '')
          ? q.get('jm') as JuliaMorphMode
          : 'off'),
        morphRadius: q.get('mr') ? Math.max(0.01, Math.min(0.5, parseFloat(q.get('mr')!) || 0.15)) : 0.15,
        morphSpeed: q.get('ms') ? Math.max(0.01, Math.min(0.5, parseFloat(q.get('ms')!) || 0.12)) : 0.12,
        buddhabrot: q.get('bb') === '1',
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

  /** Persists a minted ritual card as a sigil record carrying the PNG. */
  const handleSaveCardToGrimoire = useCallback((card: { dataUrl: string; seedHash: string; intent: string }) => {
    const { ritualLink, state } = captureRitualSpace();
    addRecord({
      kind: 'sigil',
      id: newId(),
      intent: card.intent,
      createdAt: Date.now(),
      moonPhase: moonPhase().phase,
      ritualLink,
      state,
      cardDataUrl: card.dataUrl,
      seedHash: card.seedHash,
    });
  }, [captureRitualSpace]);

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
      // A shared ghost rides the link: materialize a fresh accumulator.
      if (restored.buddhabrot) enableBuddhabrot();
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
    }      window.dispatchEvent(new CustomEvent('chaos-banish'));
    stopScrying();
    // A banished rite leaves no film: abandon any rolling reel.
    if (filmRef.current) {
      filmRef.current.abort();
      filmRef.current = null;
      filmFlightRef.current = null;
      setFilming(false);
    }
    setOverlay(prev => ({ ...prev, url: null }));
    setState({
      center: [-0.5, 0],
      zoom: 3.5,
      maxIterations: defaultMaxIterations(),
      type: 0,
      juliaC: [-0.7, 0.27],
      time: 0,
      effects: {
        strobe: 0, psych: 0, warp: 0, scanlines: 0, rgbShift: 0,
        neon: 0, emboss: 0, crush: 0, glitch: 0, vignette: 0.5,
      },
      accentColor: [1, 0, 0],
      chaosFactor: 0,
      juliaMorph: 'off' as const,
      morphRadius: 0.15,
      morphSpeed: 0.12,
      paletteKey: DEFAULT_PALETTE_KEY,
      paletteShift: 0,
      trap: 0,
      trapSize: 0.5,
      buddhabrot: false,
    });
    // Banish also exorcises the ghost: stop accumulating, clear the field.
    disableBuddhabrot();
    setIsAnimating(true);
    startTimeRef.current = Date.now();
    setTimeout(() => setIsBanishing(false), 1400);
  }, [isBanishing]);

  /** Zoom keeping the plane point under the cursor pinned to the cursor —
   *  full tactile navigation into deep zooms (paired with the ds shader). */
  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setState(prev => {
      const aspect = (canvas.width || 800) / (canvas.height || 600);
      // Cursor in uv space (0..1, y down like the shader's uv).
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      // Plane point currently under the cursor.
      const px = prev.center[0] + (u - 0.5) * aspect * prev.zoom;
      const py = prev.center[1] + (0.5 - v) * prev.zoom;
      // New zoom, then re-center so that point stays under the cursor.
      const zoom = prev.zoom * zoomFactor;
      const cx = px - (u - 0.5) * aspect * zoom;
      const cy = py + (v - 0.5) * zoom;
      return { ...prev, zoom, center: [cx, cy] };
    });
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
      // Pinch to the midpoint: the plane point between the fingers stays
      // between them while the view scales — tactile deep-zoom navigation.
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      if (lastTouchDist.current !== null) {
        const delta = lastTouchDist.current / dist;
        // Sensitivity control
        const zoomChange = Math.pow(delta, 0.5);

        setState(prev => {
          const canvas = canvasRef.current;
          if (!canvas) return { ...prev, zoom: prev.zoom * zoomChange };
          const rect = canvas.getBoundingClientRect();
          const aspect = (canvas.width || 800) / (canvas.height || 600);
          const u = (midX - rect.left) / rect.width;
          const v = (midY - rect.top) / rect.height;
          const px = prev.center[0] + (u - 0.5) * aspect * prev.zoom;
          const py = prev.center[1] + (0.5 - v) * prev.zoom;
          const zoom = prev.zoom * zoomChange;
          const cx = px - (u - 0.5) * aspect * zoom;
          const cy = py + (v - 0.5) * zoom;
          return { ...prev, zoom, center: [cx, cy] };
        });
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

  // ------- Scrying descent -------
  // A beacon-chosen point on the set's boundary; the engine descends into
  // it forever, restarting on a fresh random point when float32 precision
  // runs out. Every working is unrepeatable and verifiably random.

  /** gcd — coprime numerator guard for the bulb rotation number. */
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);

  /**
   * Derives a deep-zoom target from beacon entropy. The main cardioid's
   * boundary is c(θ) = ½e^iθ − ¼e^2iθ; choosing a rational angle θ = 2π·n/d
   * with coprime n/d lands exactly on the cusp where the period-d bulb
   * attaches — a point of guaranteed infinite fractal structure.
   */
  const targetFromHex = useCallback((hex: string): [number, number] => {
    const n1 = parseInt(hex.slice(0, 8), 16);
    const n2 = parseInt(hex.slice(8, 16), 16);
    // Denominator 2..40, coprime numerator in 1..d-1.
    const d = 2 + (n1 % 39);
    let n = (n2 % (d - 1)) + 1;
    let guard = 0;
    while (gcd(n, d) !== 1 && guard++ < 64) n = ((n + 1) % (d - 1)) + 1;
    const th = (2 * Math.PI * n) / d;
    const cRe = 0.5 * Math.cos(th) - 0.25 * Math.cos(2 * th);
    const cIm = 0.5 * Math.sin(th) - 0.25 * Math.sin(2 * th);
    return [cRe, cIm];
  }, [gcd]);

  /** Precision floor: below this, even perturbation rendering loses the
   *  plot. The PT path (double reference orbit + f32 deltas) was measured
   *  pixel-exact against double-precision truth at zoom 3.5e-8, 1e-10 and
   *  1e-12 (mean color error 0.16/255), so the descent now runs twelve
   *  orders deep — the old float32 wall was 1e-4. */
  const SCRY_FLOOR = 1e-12;
  /** Zoom doubling period in seconds — a slow, deliberate descent. */
  const SCRY_DOUBLE_SECONDS = 12;
  /** Seconds to glide from the current view onto the target. */
  const SCRY_FLYIN_SECONDS = 8;

  const startScrying = useCallback(async () => {
    const { hex, source } = await drawEntropy();
    // Pre-fetch the next cycle's entropy now so restarts are instant.
    const nxt = await drawEntropy();
    scryRef.current = {
      target: targetFromHex(hex),
      startCenter: [stateRef.current.center[0], stateRef.current.center[1]],
      startZoom: stateRef.current.zoom,
      elapsed: 0,
      source,
      nextHex: nxt.hex,
    };
    setScrying(true);
    setIsAnimating(true);
    setScryInfo({ depth: stateRef.current.zoom.toExponential(2), source });
  }, [targetFromHex]);

  const stopScrying = useCallback(() => {
    setScrying(false);
    scryRef.current = null;
    setScryInfo(null);
  }, []);

  // ------- Ritual Film -------
  const startRitualFilm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || filming) return;
    const session = startFilm(canvas, 60);
    if (!session) {
      console.warn('Ritual Film: MediaRecorder unavailable');
      return;
    }
    const s = stateRef.current;
    const mode: 'dive' | 'morph' = s.type === 1 ? 'morph' : 'dive';
    filmRef.current = session;
    filmStartRef.current = {
      center: [s.center[0], s.center[1]],
      zoom: s.zoom,
      juliaC: [s.juliaC[0], s.juliaC[1]],
    };
    filmFlightRef.current = { mode, elapsed: 0 };
    setFilmMode(mode);
    setFilming(true);
    setIsAnimating(true); // the flight needs a live clock
  }, [filming]);

  const stopRitualFilm = useCallback(() => {
    const session = filmRef.current;
    filmRef.current = null;
    filmFlightRef.current = null;
    setFilming(false);
    void session?.stop();
  }, []);

  const enterShrine = useCallback(() => {
    setShrine(true);
    setIsAnimating(true);
    setShrineHintVisible(true);
    if (shrineHintTimer.current) window.clearTimeout(shrineHintTimer.current);
    shrineHintTimer.current = window.setTimeout(() => setShrineHintVisible(false), 4000);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exitShrine = useCallback(() => {
    setShrine(false);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Shrine hotkey: S toggles, Escape exits. Ignored while typing in fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (shrine) exitShrine();
        return;
      }
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (shrine) exitShrine();
        else enterShrine();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shrine, enterShrine, exitShrine]);

  return (
    <div className={`app-container${collapsed ? ' sidebar-collapsed' : ''}${seqImmersive ? ' seq-immersive' : ''}${shrine ? ' shrine' : ''}`}>
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
          <div className="slider-group" style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '0.9em' }}>Fractal Family</label>
            <select
              value={state.type}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                setState(prev => ({
                  ...prev,
                  type: id,
                  // Newton's basins want a centered view: the screen point
                  // is the initial guess, not a plane offset.
                  ...(id === 8 ? { center: [0, 0] as [number, number], zoom: 3.0 } : {}),
                }));
              }}
            >
              {FRACTAL_TYPES.map(f => <option key={f.id} value={f.id}>{f.ritualName}</option>)}
            </select>
          </div>
          <div style={{ marginTop: '4px', fontSize: '0.85em' }}>
            Fractal Type: <span style={{ color: '#ff4444', fontWeight: 'bold' }}>
              {fractalName(state.type)}
            </span>
          </div>
          <div className="slider-group" style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '0.9em' }}>Orbit Trap</label>
            <select
              value={state.trap}
              onChange={(e) => setState(prev => ({ ...prev, trap: parseInt(e.target.value) }))}
              aria-label="Orbit trap shape"
            >
              <option value={0}>Off</option>
              <option value={1}>Circle</option>
              <option value={2}>Cross</option>
              <option value={3}>Line</option>
              <option value={4}>Diamond</option>
              <option value={5}>Flower</option>
            </select>
            {state.trap !== 0 && (
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.05"
                value={state.trapSize}
                onChange={(e) => setState(prev => ({ ...prev, trapSize: parseFloat(e.target.value) }))}
                aria-label="Orbit trap size"
              />
            )}
          </div>
          {state.type === 1 && (
            <div className="slider-group" style={{ marginTop: '10px' }}>
              <label style={{ fontSize: '0.9em' }}>Julia Morph</label>
              <select
                value={state.juliaMorph}
                onChange={(e) => setState(prev => ({ ...prev, juliaMorph: e.target.value as JuliaMorphMode }))}
                aria-label="Julia morph mode"
              >
                <option value="off">Off</option>
                <option value="orbit">Orbit</option>
                <option value="lissajous">Lissajous</option>
                <option value="drift">Drift</option>
              </select>
              {state.juliaMorph !== 'off' && (
                <>
                  <input
                    type="range"
                    min="0.02"
                    max="0.4"
                    step="0.01"
                    value={state.morphRadius}
                    onChange={(e) => setState(prev => ({ ...prev, morphRadius: parseFloat(e.target.value) }))}
                    aria-label="Morph radius"
                  />
                  <input
                    type="range"
                    min="0.02"
                    max="0.5"
                    step="0.01"
                    value={state.morphSpeed}
                    onChange={(e) => setState(prev => ({ ...prev, morphSpeed: parseFloat(e.target.value) }))}
                    aria-label="Morph speed"
                  />
                </>
              )}
            </div>
          )}
          <div className="slider-group" style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!bbAccumRef.current}
                onChange={() => (bbAccumRef.current ? disableBuddhabrot() : enableBuddhabrot())}
                aria-label="Buddhabrot ghost"
              />
              Buddhabrot Ghost
            </label>
            {bbAccumRef.current && (
              <div style={{ marginTop: '4px', fontSize: '0.78em', color: '#ff9a9a' }}>
                {bbStats ? `${bbStats.orbits.toLocaleString()} orbits · the ghost deepens` : 'summoning…'}
                <button className="mini secondary" onClick={clearGhost} style={{ marginLeft: '8px' }}>
                  Clear Ghost
                </button>
              </div>
            )}
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
          <div className="slider-group" style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.9em' }}>Escape Gradient</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={state.paletteKey}
                onChange={(e) => setState(prev => ({ ...prev, paletteKey: e.target.value }))}
                style={{ flex: 1, minWidth: 0 }}
              >
                <optgroup label="Gradients">
                  {PALETTES.filter(pl => !pl.group).map(pl => <option key={pl.key} value={pl.key}>{pl.name}</option>)}
                </optgroup>
                <optgroup label="Planetary">
                  {PALETTES.filter(pl => pl.group === 'planetary').map(pl => <option key={pl.key} value={pl.key}>{pl.name}</option>)}
                </optgroup>
                {listCustomPalettes().length > 0 && (
                  <optgroup label="Your Gradients">
                    {listCustomPalettes().map(pl => <option key={pl.key} value={pl.key}>{pl.name}</option>)}
                  </optgroup>
                )}
              </select>
              <button
                className="secondary"
                style={{ padding: '4px 8px' }}
                title="Forge a custom gradient"
                aria-label="Open palette editor"
                onClick={() => setShowPaletteEditor(v => !v)}
              >✎</button>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.paletteShift}
              onChange={(e) => setState(prev => ({ ...prev, paletteShift: parseFloat(e.target.value) }))}
              style={{ width: '100%', accentColor: '#ff4444' }}
              aria-label="Palette rotation"
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
            accept="image/png,image/gif,image/jpeg,image/webp,image/*"
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
          <button className="sigilarium-launch" onClick={() => setShowDrawer(true)} title="The Sigilarium">
            <img src="/assets/sigilarium.webp" alt="The Sigilarium" className="sigilarium-logo" />
          </button>
          <button className="secondary" onClick={() => setShowScribe(true)}>Sigil Scribe</button>
          <button className="secondary" onClick={() => setShowGrimoire(true)}>Grimoire</button>
          <button className="secondary" onClick={() => setShowDivination(true)}>Divination</button>
          <button className="secondary" onClick={() => setIsAnimating(!isAnimating)}>
            {isAnimating ? 'Freeze Motion' : 'Resume Flow'}
          </button>
          <button className="secondary" onClick={saveFractal}>Save Fractal</button>
          <button
            className="secondary"
            onClick={() => (filming ? stopRitualFilm() : startRitualFilm())}
            disabled={isBanishing}
            title={filmSupported()
              ? (state.type === 1
                ? 'Film a 12s Lissajous morph of the Echo (WebM/MP4)'
                : 'Film a 12s zoom dive into the set (WebM/MP4)')
              : 'Video recording not supported in this browser'}
          >
            {filming ? '■ Stop Film' : 'Ritual Film'}
          </button>
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
          <button className="secondary" onClick={enterShrine}>Shrine Mode</button>
          <button
            className="secondary"
            onClick={() => (scrying ? stopScrying() : startScrying())}
            disabled={isBanishing}
          >
            {scrying ? 'Ascend' : 'Scrying Descent'}
          </button>
          <button className="banish-button" onClick={() => setShowBanishConfirm(true)} disabled={isBanishing}>
            {isBanishing ? 'BANISHING...' : 'BANISH'}
          </button>
          {scrying && scryInfo && (
            <div style={{ fontSize: '0.75rem', color: '#ff6666', fontFamily: 'var(--font-mono)' }}>
              DESCENDING · depth {scryInfo.depth} · {scryInfo.source === 'BEACON' ? '◈ beacon' : 'CSPRNG'}
            </div>
          )}
          {filming && (
            <div style={{ fontSize: '0.75rem', color: '#ff6666', fontFamily: 'var(--font-mono)', animation: 'decay-pulse 1.4s ease-in-out infinite' }}>
              ● ROLLING · {filmMode === 'morph' ? 'lissajous morph' : 'zoom dive'} · {filmLeft}s left
            </div>
          )}
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
          style={{ touchAction: 'none', ['--crt-opacity' as string]: String(state.effects.scanlines) }}
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

      {showPaletteEditor && (
        <PaletteEditor
          onClose={() => { setShowPaletteEditor(false); setPalettePreview(null); }}
          onPreview={(o) => setPalettePreview(o)}
          onSaved={(key) => {
            setCustomPalettesVersion(v => v + 1);
            setPalettePreview(null);
            setState(prev => ({ ...prev, paletteKey: key }));
          }}
          onDeleted={(key) => {
            setCustomPalettesVersion(v => v + 1);
            setState(prev => (prev.paletteKey === key
              ? { ...prev, paletteKey: DEFAULT_PALETTE_KEY }
              : prev));
          }}
        />
      )}

      {showDrawer && (
        <SigilDrawer
          onClose={() => setShowDrawer(false)}
          onUseAsOverlay={handleUseGlyphAsOverlay}
          coords={coords}
          onSaveCard={handleSaveCardToGrimoire}
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

      {shrine && (
        <div
          className="shrine-overlay"
          onClick={exitShrine}
          onTouchStart={exitShrine}
          role="button"
          aria-label="Exit shrine mode"
        >
          <div className={`shrine-hint${shrineHintVisible ? ' visible' : ''}`}>
            TAP ANYWHERE TO RETURN
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
