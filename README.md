# Chaos Engine

Chaos Engine is a web-based interactive fractal renderer and experimental workspace built with React and Vite. It serves as a tool for Chaos Magick practitioners to facilitate sigilization, reach states of gnosis through high-entropy visual stimuli, and anchor ritual intent into physical reality through data manipulation. By mapping statements of intent to complex fractal coordinates, users can create unique visual focal points for scrying and manifestation.

## Try it on the web: https://chaosengine.pages.dev

## Features

### Fractal Exploration
- **Multiple Fractal Types**: Supports Mandelbrot, Julia, Burning Ship, Tricorn, Celtic, Buffalo, and Perpendicular sets.
- **Dynamic Seeding**: Julia set constants and view coordinates can be derived from text input strings.
- **Adjustable Resolution**: Control the maximum iteration count (50-500) to balance visual detail with performance.
- **Navigation**:
    - **PC**: Click and drag to pan; use the mouse wheel to zoom.
    - **Mobile**: Single-touch to pan; pinch-to-zoom.

**Ritual Utility**: The infinite recursion of fractals serves as a visual focus for scrying. Mapping intent to specific coordinates creates a unique geometric signature for each ritual working, anchoring abstract desire into a complex mathematical structure.

### Visual Effects (Post-Processing)
Real-time filters and shaders applied to the render:
- **Strobe**: Rhythmic luminosity inversion.
- **Psychedelic**: Procedural color cycling.
- **Glitch**: Non-linear scanline and offset distortions.
- **Neon & RGB Shift**: Edge highlighting and chromatic aberration effects.
- **Vignette**: Radial darkening around the viewport edges.

**Ritual Utility**: These effects are designed to bypass the "psychic censor" by disrupting standard visual perception. Rapid changes in luminosity (strobe) and procedural distortion (glitch) facilitate the induction of trance states (gnosis) required for effective manifestation.

### Audio System
- **Audio Player**: Supports playback of pre-loaded tracks or user-uploaded audio files.
- **Frequency Generator**: A sine-wave oscillator with manual frequency (Hz) and volume control.

**Ritual Utility**: Audio serves as a sensory boundary for the ritual space. The frequency generator allows for brainwave entrainment using resonant frequencies (e.g., Solfeggio scales), helping the practitioner align their internal vibration with their external intent.

### Image Overlay System
- **Custom Overlays**: Upload PNG or GIF images to overlay onto the fractal canvas.
- **Motion Modes**:
    - **Manual**: Drag and drop the overlay to any position.
    - **Random Flash**: The overlay teleports to random coordinates at regular intervals.
    - **DVD Bounce**: The overlay moves in a continuous bouncing path within the viewport boundaries.

**Ritual Utility**: Overlays allow the practitioner to project specific symbols, sigils, or targets onto the generative fractal field. The varying motion modes provide different levels of kinetic energy for the symbol, from static focus to high-entropy movement.

### Sigil Scribe
The Sigil Scribe process converts text strings into specific Julia set coordinates. This allows users to map specific "statements of intent" to unique, reproducible fractal landscapes.

**Ritual Utility**: It automates the core chaos magick technique of reducing a complex desire into an abstract form. By immediately manifesting this form as a world, it provides a direct feedback loop between the statement of intent and the resulting visual gnosis.

### Digital Alchemy (File Management)
**WARNING: This feature performs physical file operations using the File System Access API. Use with caution.**

Digital Alchemy automates the reorganization of local folders:
1. **Archive**: Existing contents of the "Ritual Space" (target folder) are moved into a new subfolder with a generated unique ID.
2. **Transfer**: All files and folders from the "Source of Intent" (source folder) are moved into the "Ritual Space".
3. **Consuming Source**: The original files in the "Source of Intent" folder are removed.
4. **Void Marker**: A `VOID_MARKER` text file is created in the now-empty source folder to indicate the process is complete.

**Ritual Utility**: This feature provides physical "proof" of the ritual working. The psychological act of "consuming" source data and archiving the "old reality" anchors the practitioner's will in the tangible world, creating a permanent record of the paradigm shift.

### Oracle Data
Displays real-time entropy and temporal data:
- **Quantum Seed**: A high-entropy variable used for algorithmic randomization.
- **Oracle Stream**: A hexadecimal string derived from entropy and timing data.

**Ritual Utility**: High-entropy data sources provide a "clean" seed for randomization, free from the practitioner's conscious bias. The Oracle Stream is used to detect "synchronicities"—meaningful coincidences in the data that signal alignment with the intended goal.

## Development Setup

### Prerequisites
- Node.js (Latest LTS)
- npm

### Installation
```bash
npm install
```

### Running Locally
```bash
npm run dev
```
The application will be served at `http://localhost:5173`.

---

### *NOTHING IS TRUE. EVERYTHING IS PERMITTED.*