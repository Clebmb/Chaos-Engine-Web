import { VERTEX_SHADER, FRACTAL_SHADER, EFFECTS_SHADER } from './Shaders';

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
}

export class Renderer {
    private gl: WebGL2RenderingContext;
    private fractalProgram: WebGLProgram;
    private effectsProgram: WebGLProgram;
    private quadVAO: WebGLVertexArrayObject;

    private sceneTexture: WebGLTexture;
    private sceneFB: WebGLFramebuffer;

    private width: number = 0;
    private height: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!gl) throw new Error('WebGL2 not supported');
        this.gl = gl;

        this.fractalProgram = this.createProgram(VERTEX_SHADER, FRACTAL_SHADER);
        this.effectsProgram = this.createProgram(VERTEX_SHADER, EFFECTS_SHADER);

        this.quadVAO = this.createQuad();

        this.sceneTexture = this.gl.createTexture()!;
        this.sceneFB = this.gl.createFramebuffer()!;
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

    setSize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.gl.viewport(0, 0, width, height);

        // Re-init framebuffer texture
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.sceneTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneFB);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.sceneTexture, 0);
    }

    render(state: RendererState) {
        // Step 1: Render Fractal to Framebuffer
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneFB);
        this.gl.useProgram(this.fractalProgram);
        this.gl.bindVertexArray(this.quadVAO);

        this.setUniform2f(this.fractalProgram, 'resolution', [this.width, this.height]);
        this.setUniform2f(this.fractalProgram, 'center', state.center);
        this.setUniform1f(this.fractalProgram, 'zoom', state.zoom);
        this.setUniform1i(this.fractalProgram, 'maxIterations', state.maxIterations);
        this.setUniform1i(this.fractalProgram, 'type', state.type);
        this.setUniform2f(this.fractalProgram, 'juliaC', state.juliaC);
        this.setUniform1f(this.fractalProgram, 'time', state.time);
        this.setUniform1f(this.fractalProgram, 'chaosFactor', state.chaosFactor);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

        // Step 2: Render Post-effects to Canvas
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.useProgram(this.effectsProgram);
        this.gl.bindVertexArray(this.quadVAO);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.sceneTexture);
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
