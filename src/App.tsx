import React, { useEffect, useRef, useState, useCallback } from 'react';
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
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const update = useCallback(() => {
    const now = Date.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const currentTime = isAnimating ? elapsed : stateRef.current.time;

    if (rendererRef.current) {
      rendererRef.current.render({ ...stateRef.current, time: currentTime });
    }

    animationRef.current = requestAnimationFrame(update);
  }, [isAnimating]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationRef.current!);
  }, [update]);

  const handleIntentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIntent(e.target.value);
  };

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
      setOverlay(prev => ({ ...prev, url }));
    }
  };

  const saveFractal = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `chaos_fractal_${Date.now()}.png`;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    }
  };

  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

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

  return (
    <div className="app-container">
      <aside className="sidebar">
        <a href="https://clebmb.pages.dev" target="_blank" rel="noopener noreferrer" className="clebmb-link">
          <img src="/assets/clebmb.png" alt="Clebmb" className="clebmb-logo" />
        </a>
        <img src="/assets/logo.png" alt="Chaos Engine" className="app-logo" />

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
            <img src="/assets/sigilarium.png" alt="Sigilarium" className="sigilarium-logo" />
          </a>
          <button className="secondary" onClick={() => setShowScribe(true)}>Sigil Scribe</button>
          <button className="secondary" onClick={() => setIsAnimating(!isAnimating)}>
            {isAnimating ? 'Freeze Motion' : 'Resume Flow'}
          </button>
          <button className="secondary" onClick={saveFractal}>Save Fractal</button>
        </div>

        <AudioPlayer />
        <DigitalAlchemy />
      </aside>

      <main className="main-view">
        <Oracle />
        <div
          ref={containerRef}
          className="fractal-canvas-container"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} />
          <OverlaySystem
            {...overlay}
            isAnimating={isAnimating}
            containerRef={containerRef}
            onPosChange={(pos) => setOverlay(prev => ({ ...prev, pos }))} />
        </div>
      </main>

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
