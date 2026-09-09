import { VERTEX_SHADER, FRACTAL_SHADER, BUDDHABROT_SHADER, EFFECTS_SHADER } from './Shaders';
import { getPalette } from './palettes';
import { BB_REGION_MIN, BB_REGION_SIZE } from './buddhabrot';

export interface RendererState {
    center: [number, number];
    zoom: number;
    maxIterations: number;
    type: number;
    juliaC: [number, number];
    time: number;
    effects: {
        strobe: number;
        psych: number;
        warp: number;
        scanlines: number;
        rgbShift: number;
        neon: number;
        emboss: number;
        crush: number;
        glitch: number;
        vignette: number;
    };
    accentColor: [number, number, number];
    chaosFactor: number;
    /** Palette key (from engine/palettes) — resolved to stops at render. */
    paletteKey: string;
    /** Static rotation of the palette, 0..1. */
    paletteShift: number;
    /**
     * Direct palette override — renders these exact stops instead of
     * resolving `paletteKey`. Used by the editor's live preview and for
     * custom palettes without touching app state on every keystroke.
     */
    paletteOverride?: { stops: [number, number, number][]; cycle: number };
    /** Orbit trap shape: 0 off, 1 circle, 2 cross, 3 line, 4 diamond, 5 flower. */
    trap: number;
    /** Orbit trap size in plane units (rides the view center). */
    trapSize: number;
    /** Julia morph mode — the seed c animates along a path (Julia family only). */
    juliaMorph: 'off' | 'orbit' | 'lissajous' | 'drift';
    /** Morph orbit/drift radius in plane units. */
    morphRadius: number;
    /** Morph angular speed in rad/s. */
    morphSpeed: number;
    /** Buddhabrot ghost mode: render the accumulated orbit-light field. */
    buddhabrot: boolean;
}

/** Per-render options beyond the state itself. */
export interface RenderOptions {
    /**
     * Progressive refinement: render the fractal pass at reduced resolution
     * (the effects pass upscales with bilinear filtering). Used while the
     * user is interacting; full-res renders when idle.
     */
    coarse?: boolean;
}

/** Linear size reduction while rendering coarse. */
const COARSE_DIVISOR = 4;

/** Zoom below which the fractal renders via perturbation theory. Float32
 *  coordinates collapse around 1e-4 (pixel spacing vs ULP); the PT path
 *  iterates small deltas against a double-precision reference orbit and
 *  holds structure past 1e-12. */
const PT_THRESHOLD = 1e-4;
/** Reference-orbit texture rows (max iterations covered). */
const REF_MAX_ROWS = 4096;

export class Renderer {
    private gl: WebGL2RenderingContext;
    private fractalProgram: WebGLProgram;
    private buddhabrotProgram: WebGLProgram;
    private effectsProgram: WebGLProgram;
    private quadVAO: WebGLVertexArrayObject;

    /** Buddhabrot accumulation texture (R8, normalized light 0..255). */
    private bbTexture: WebGLTexture | null = null;
    private bbWidth: number = 0;
    private bbHeight: number = 0;

    private sceneTexture: WebGLTexture;
    private sceneFB: WebGLFramebuffer;
    /** Half-res texture + framebuffer for progressive refinement. */
    private coarseTexture: WebGLTexture | null = null;
    private coarseFB: WebGLFramebuffer | null = null;
    private coarseWidth: number = 0;
    private coarseHeight: number = 0;

    private width: number = 0;
    private height: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!gl) throw new Error('WebGL2 not supported');
        this.gl = gl;

        this.fractalProgram = this.createProgram(VERTEX_SHADER, FRACTAL_SHADER);
        this.buddhabrotProgram = this.createProgram(VERTEX_SHADER, BUDDHABROT_SHADER);
        this.effectsProgram = this.createProgram(VERTEX_SHADER, EFFECTS_SHADER);

        this.quadVAO = this.createQuad();

        this.sceneTexture = this.gl.createTexture()!;
        this.sceneFB = this.gl.createFramebuffer()!;

        // 1×1 dummy the refTex sampler parks on when perturbation is off —
        // the sampler must never sit on unit 0, where the scene texture
        // (attached to the FBO the scene pass draws into) lives.
        this.dummyTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.dummyTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error('Shader compilation error: ' + info);
        }
        return shader;
    }

    private createProgram(vsSource: string, fsSource: string): WebGLProgram {
        const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Program linking error');
        }
        return program;
    }

    private createQuad(): WebGLVertexArrayObject {
        const vao = this.gl.createVertexArray()!;
        this.gl.bindVertexArray(vao);
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
        return vao;
    }

    /**
     * Reference orbit for perturbation rendering, in full double precision.
     * Row n = (zₙ.x, zₙ.y, wₙ.x, wₙ.y) where wₙ is the family's pre-abs
     * quadratic computed from zₙ (equal to zₙ for families without abs).
     * Rows stop when the orbit escapes past |z|² > 16 — the shader rebases
     * there — or maxIterations is reached (interior reference).
     */
    private computeReferenceOrbit(
        type: number, z0x: number, z0y: number, cx: number, cy: number, maxI: number,
    ): number[][] {
        const rows: number[][] = [];
        const P = 0.56667; // Phoenix constant (must match the shader)
        let zx = z0x, zy = z0y, px = 0, py = 0;
        for (let n = 0; n <= maxI && n < REF_MAX_ROWS; n++) {
            let w1 = zx, w2 = zy;
            if (type === 2) { w1 = zx * zx - zy * zy + cx; w2 = 2 * Math.abs(zx * zy) + cy; }
            else if (type === 4 || type === 5) { w1 = zx * zx - zy * zy; w2 = 2 * zx * zy; }
            rows.push([zx, zy, w1, w2]);
            if (zx * zx + zy * zy > 16) break;
            const xo = zx, yo = zy;
            let nx: number, ny: number;
            switch (type) {
                case 0: case 1:
                    nx = zx * zx - zy * zy + cx; ny = 2 * zx * zy + cy; break;
                case 2:
                    nx = Math.abs(w1); ny = Math.abs(w2); break;
                case 3:
                    nx = zx * zx - zy * zy + cx; ny = -2 * zx * zy + cy; break;
                case 4:
                    nx = Math.abs(w1) + cx; ny = w2 + cy; break;
                case 5:
                    nx = Math.abs(w1) + cx; ny = -Math.abs(w2) + cy; break;
                case 6:
                    nx = zx * zx - zy * zy + cx; ny = -2 * Math.abs(zx) * zy + cy; break;
                case 7:
                    nx = zx * zx - zy * zy + P * px + cx;
                    ny = 2 * zx * zy + P * py + cy; break;
                case 9:
                    nx = zx * zx * zx - 3 * zx * zy * zy + cx;
                    ny = 3 * zx * zx * zy - zy * zy * zy + cy; break;
                case 10: {
                    const a = zx * zx - zy * zy, b = 2 * zx * zy;
                    nx = a * a - b * b + cx; ny = 2 * a * b + cy; break;
                }
                default:
                    nx = zx * zx - zy * zy + cx; ny = 2 * zx * zy + cy;
            }
            zx = nx; zy = ny; px = xo; py = yo;
            if (!isFinite(zx) || !isFinite(zy)) break;
        }
        return rows;
    }

    /** RGBA32F texture holding the reference orbit, one row per n. */
    private refTexture: WebGLTexture | null = null;
    /** 1×1 stand-in for refTex when perturbation is inactive. */
    private dummyTexture: WebGLTexture;

    private uploadReferenceOrbit(rows: number[][]) {
        const gl = this.gl;
        const n = rows.length;
        if (!this.refTexture) {
            this.refTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.refTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, this.refTexture);
        }
        const data = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
            data[i * 4] = rows[i][0];
            data[i * 4 + 1] = rows[i][1];
            data[i * 4 + 2] = rows[i][2];
            data[i * 4 + 3] = rows[i][3];
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 1, 0, gl.RGBA, gl.FLOAT, data);
    }

    private makeTexture(width: number, height: number): WebGLTexture {
        const tex = this.gl.createTexture()!;
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        return tex;
    }

    /**
     * Upload the normalized Buddhabrot light field (0..255, row-major top to
     * bottom). Pass null to free the texture and disable the mode.
     */
    setBuddhabrotData(view: Uint8Array | null, width: number, height: number) {
        const gl = this.gl;
        if (!view || width <= 0 || height <= 0) {
            if (this.bbTexture) {
                gl.deleteTexture(this.bbTexture);
                this.bbTexture = null;
            }
            this.bbWidth = 0;
            this.bbHeight = 0;
            return;
        }
        if (!this.bbTexture || this.bbWidth !== width || this.bbHeight !== height) {
            if (this.bbTexture) gl.deleteTexture(this.bbTexture);
            this.bbTexture = gl.createTexture()!;
            this.bbWidth = width;
            this.bbHeight = height;
            gl.bindTexture(gl.TEXTURE_2D, this.bbTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        gl.bindTexture(gl.TEXTURE_2D, this.bbTexture);
        // Row 0 of the field is the top of the region (screen top).
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, view);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    setSize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.gl.viewport(0, 0, width, height);

        // Full-res scene target
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.sceneTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneFB);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.sceneTexture, 0);

        // Coarse target for progressive refinement (recreated on resize)
        this.coarseWidth = Math.max(1, Math.floor(width / COARSE_DIVISOR));
        this.coarseHeight = Math.max(1, Math.floor(height / COARSE_DIVISOR));
        if (this.coarseTexture) this.gl.deleteTexture(this.coarseTexture);
        if (this.coarseFB) this.gl.deleteFramebuffer(this.coarseFB);
        this.coarseTexture = this.makeTexture(this.coarseWidth, this.coarseHeight);
        this.coarseFB = this.gl.createFramebuffer()!;
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.coarseFB);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.coarseTexture, 0);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    render(state: RendererState, options: RenderOptions = {}) {
        const coarse = options.coarse === true && !!this.coarseFB;

        // Step 1: Render the scene (fractal escape-time field, or the
        // Buddhabrot ghost) to a framebuffer at full or coarse resolution.
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, coarse ? this.coarseFB : this.sceneFB);
        this.gl.viewport(0, 0, coarse ? this.coarseWidth : this.width, coarse ? this.coarseHeight : this.height);
        this.gl.bindVertexArray(this.quadVAO);

        // Palette: resolve the key to stops and flatten for the uniform arrays.
        const pal = state.paletteOverride ?? getPalette(state.paletteKey);
        const stops = new Float32Array(15);
        pal.stops.forEach((stop, idx) => {
            stops[idx * 3] = stop[0];
            stops[idx * 3 + 1] = stop[1];
            stops[idx * 3 + 2] = stop[2];
        });
        const offsets = new Float32Array([0, 0.2, 0.4, 0.6, 0.8]);

        const useBb = state.buddhabrot && !!this.bbTexture;
        const prog = useBb ? this.buddhabrotProgram : this.fractalProgram;
        this.gl.useProgram(prog);

        // Deep zoom: compute the reference orbit of the view center in full
        // double precision, upload as an RGBA32F texture, and let the shader
        // iterate only the small per-pixel deltas (perturbation theory with
        // Zhuoran rebasing). Coordinate precision stays at double level.
        const ptActive = !useBb && state.type !== 8 && state.zoom < PT_THRESHOLD;
        this.setUniform1i(prog, 'ptMode', ptActive ? 1 : 0);
        if (ptActive) {
            const julia = state.type === 1;
            // Julia: z₀ = view center, c = fixed seed.
            // c-space families: z₀ = 0, c = view center.
            const z0x = julia ? state.center[0] : 0;
            const z0y = julia ? state.center[1] : 0;
            const ccx = julia ? state.juliaC[0] : state.center[0];
            const ccy = julia ? state.juliaC[1] : state.center[1];
            const rows = this.computeReferenceOrbit(state.type, z0x, z0y, ccx, ccy, state.maxIterations);
            this.uploadReferenceOrbit(rows);
            this.setUniform1i(prog, 'refN', rows.length - 1);
            this.setUniform1f(prog, 'row0x', rows[0][0]);
            this.setUniform1f(prog, 'row0y', rows[0][1]);
        }

        const res: [number, number] = coarse
          ? [this.coarseWidth, this.coarseHeight]
          : [this.width, this.height];
        this.setUniform2f(prog, 'resolution', res);
        this.setUniform2f(prog, 'center', state.center);
        this.setUniform1f(prog, 'zoom', state.zoom);

        if (useBb) {
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.bbTexture!);
            this.setUniform1i(prog, 'accTex', 0);
            this.setUniform2f(prog, 'accRegionMin', BB_REGION_MIN);
            this.setUniform2f(prog, 'accRegionSize', BB_REGION_SIZE);
        } else {
            this.setUniform1i(prog, 'maxIterations', state.maxIterations);
            this.setUniform1i(prog, 'type', state.type);
            this.setUniform2f(prog, 'juliaC', state.juliaC);
            this.setUniform1f(prog, 'time', state.time);
            this.setUniform1f(prog, 'chaosFactor', state.chaosFactor);
            this.setUniform1i(prog, 'trap', state.trap);
            this.setUniform1i(prog, 'maxIterations', state.maxIterations);
            this.setUniform1i(prog, 'type', state.type);
            this.setUniform2f(prog, 'juliaC', state.juliaC);
            this.setUniform1f(prog, 'time', state.time);
            this.setUniform1f(prog, 'chaosFactor', state.chaosFactor);
            this.setUniform1i(prog, 'trap', state.trap);
            this.setUniform1f(prog, 'trapSize', state.trapSize);
        }

        // Park refTex on unit 1 unconditionally. Unit 0 holds the scene
        // texture from the effects pass; sampling it while drawing into the
        // FBO it attaches to is a feedback loop (GL 1282, draw discarded).
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, (ptActive && !useBb && this.refTexture) ? this.refTexture : this.dummyTexture);
        this.setUniform1i(prog, 'refTex', 1);

        this.gl.uniform3fv(this.gl.getUniformLocation(prog, 'palStops'), stops);
        this.gl.uniform1fv(this.gl.getUniformLocation(prog, 'palOffsets'), offsets);
        this.setUniform1f(prog, 'palCycle', pal.cycle);
        this.setUniform1f(prog, 'palShift', state.paletteShift);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

        // Step 2: Render Post-effects to Canvas (always full resolution —
        // the coarse scene texture simply gets bilinearly upscaled here).
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, this.width, this.height);
        this.gl.useProgram(this.effectsProgram);
        this.gl.bindVertexArray(this.quadVAO);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, coarse ? this.coarseTexture! : this.sceneTexture);
        this.setUniform1i(this.effectsProgram, 'scene', 0);
        this.setUniform2f(this.effectsProgram, 'resolution', [this.width, this.height]);
        this.setUniform1f(this.effectsProgram, 'time', state.time);
        this.setUniform1f(this.effectsProgram, 'strobe', state.effects.strobe);
        this.setUniform1f(this.effectsProgram, 'psych', state.effects.psych);
        this.setUniform1f(this.effectsProgram, 'warp', state.effects.warp);
        this.setUniform1f(this.effectsProgram, 'scanlines', state.effects.scanlines);
        this.setUniform1f(this.effectsProgram, 'rgbShift', state.effects.rgbShift);
        this.setUniform1f(this.effectsProgram, 'neon', state.effects.neon);
        this.setUniform1f(this.effectsProgram, 'emboss', state.effects.emboss);
        this.setUniform1f(this.effectsProgram, 'crush', state.effects.crush);
        this.setUniform1f(this.effectsProgram, 'glitch', state.effects.glitch);
        this.setUniform1f(this.effectsProgram, 'vignette', state.effects.vignette);
        this.setUniform3f(this.effectsProgram, 'accentColor', state.accentColor);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    private setUniform1f(prog: WebGLProgram, name: string, val: number) {
        this.gl.uniform1f(this.gl.getUniformLocation(prog, name), val);
    }

    /** Release GPU resources owned by the renderer. */
    dispose() {
        const gl = this.gl;
        if (this.refTexture) gl.deleteTexture(this.refTexture);
        this.refTexture = null;
        if (this.dummyTexture) gl.deleteTexture(this.dummyTexture);
        this.dummyTexture = null as unknown as WebGLTexture;
    }
    private setUniform1i(prog: WebGLProgram, name: string, val: number) {
        this.gl.uniform1i(this.gl.getUniformLocation(prog, name), val);
    }
    private setUniform2f(prog: WebGLProgram, name: string, val: [number, number]) {
        this.gl.uniform2fv(this.gl.getUniformLocation(prog, name), val);
    }
    private setUniform3f(prog: WebGLProgram, name: string, val: [number, number, number]) {
        this.gl.uniform3fv(this.gl.getUniformLocation(prog, name), val);
    }
}
