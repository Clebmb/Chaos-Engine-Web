export const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

export const FRACTAL_SHADER = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 fragColor;

uniform vec2 resolution;
uniform vec2 center;
uniform float zoom;
uniform int maxIterations;
uniform int type; // 0: Mandelbrot, 1: Julia, 2: Burning Ship, 3: Tricorn, 4: Celtic, 5: Buffalo, 6: Perpendicular
uniform vec2 juliaC;
uniform float time;
uniform float chaosFactor;

vec2 qsq(vec2 z) {
    return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
}

vec2 conj(vec2 z) {
    return vec2(z.x, -z.y);
}

void main() {
    vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
    vec2 c = (uv - 0.5) * aspect * zoom + center;
    vec2 z = vec2(0.0);
    
    if (type == 1) { // Julia
        z = c;
        c = juliaC;
    }

    int i;
    for (i = 0; i < maxIterations; i++) {
        vec2 z_old = z;
        
        // Fractal Archetype Selection
        switch(type) {
            case 0: // Mandelbrot
                z = qsq(z) + c;
                break;
            case 1: // Julia
                z = qsq(z) + c;
                break;
            case 2: // Burning Ship
                z = vec2(z.x*z.x - z.y*z.y, 2.0*abs(z.x*z.y)) + c;
                z = vec2(abs(z.x), abs(z.y));
                break;
            case 3: // Tricorn (Mandelbar)
                z = qsq(conj(z)) + c;
                break;
            case 4: // Celtic
                z = vec2(abs(z.x*z.x - z.y*z.y), 2.0*z.x*z.y) + c;
                break;
            case 5: // Buffalo
                z = vec2(abs(z.x*z.x - z.y*z.y), -2.0*abs(z.x*z.y)) + c;
                break;
            case 6: // Perpendicular
                z = vec2(z.x*z.x - z.y*z.y, -2.0*abs(z.x)*z.y) + c;
                break;
            default:
                z = qsq(z) + c;
                break;
        }
        
        // Chaos Perturbation (Dramatic geometric shift)
        if (chaosFactor > 0.0) {
            float angle = chaosFactor * 6.28;
            vec2 rot = vec2(cos(angle), sin(angle));
            z += sin(z.yx * (3.0 + chaosFactor * 5.0)) * 0.1 * chaosFactor * rot;
        }

        if (length(z) > 4.0) break;
    }

    float t = float(i) / float(maxIterations);
    if (i == maxIterations) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // Smooth coloring
        fragColor = vec4(vec3(t), 1.0);
    }
}`;

export const EFFECTS_SHADER = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 fragColor;

uniform sampler2D scene;
uniform vec2 resolution;
uniform float time;
uniform float strobe;
uniform float psych;
uniform float warp;
uniform float scanlines;
uniform float rgbShift;
uniform float neon;
uniform float emboss;
uniform float crush;
uniform float glitch;
uniform float vignette;
uniform vec3 accentColor;

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    float gSeed = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 p = uv;
    
    // Dynamic Colors based on Psychedelic state
    vec3 psychNeonColor = hsv2rgb(vec3(fract(time * 0.3 + 0.33), 0.8, 1.0));
    vec3 psychTearColor = hsv2rgb(vec3(fract(time * 0.3 + 0.66), 0.8, 1.0));
    vec3 currentNeonColor = mix(accentColor, psychNeonColor, psych);
    vec3 currentTearColor = mix(vec3(1.0, 0.2, 0.2), psychTearColor, psych);

    // Warp (Balanced Intensity)
    if (warp > 0.0) {
        p.x += sin(p.y * 30.0 + time * 5.0) * 0.05 * warp;
        p.y += cos(p.x * 30.0 + time * 5.0) * 0.05 * warp;
    }
    
    // RGB Shift
    vec4 color;
    if (rgbShift > 0.0) {
        float offset = 0.05 * rgbShift;
        color.r = texture(scene, p + vec2(offset, 0.0)).r;
        color.g = texture(scene, p).g;
        color.b = texture(scene, p - vec2(offset, 0.0)).b;
        color.a = 1.0;
    } else {
        color = texture(scene, p);
    }
    
    // Psychedelic Base (Scene-wide)
    if (psych > 0.0) {
        vec3 hsv = rgb2hsv(color.rgb);
        hsv.x = fract(hsv.x + time * 0.3);
        hsv.y = mix(hsv.y, 1.0, psych);
        color.rgb = hsv2rgb(hsv);
    }
    
    // Reality Tear (Uses dynamic color)
    if (glitch > 0.0) {
        float sliceY = floor(p.y * 20.0);
        float sliceNoise = fract(sin(sliceY + time * 5.0) * 43758.5453);
        if (sliceNoise < glitch * 0.4) {
            float dist = (sliceNoise - 0.5) * 0.5 * glitch;
            color.rgb = texture(scene, p + vec2(dist, 0.0)).rgb;
            color.rgb += currentTearColor * glitch * 0.5;
        }
    }

    // Neon (Uses dynamic color)
    if (neon > 0.0) {
        vec2 off = 2.0 / resolution;
        float gx = texture(scene, p + vec2(-off.x, -off.y)).r - texture(scene, p + vec2(off.x, off.y)).r;
        float gy = texture(scene, p + vec2(-off.x, off.y)).r - texture(scene, p + vec2(off.x, -off.y)).r;
        float edge = sqrt(gx*gx + gy*gy);
        vec3 neonColor = currentNeonColor * edge * 75.0;
        color.rgb = mix(color.rgb, neonColor, neon * 0.5);
    }

    // Color Crush
    if (crush > 0.0) {
        float levels = mix(255.0, 2.0, pow(crush, 0.3));
        color.rgb = floor(color.rgb * levels + 0.5) / levels;
    }

    // Emboss (Balanced Intensity)
    if (emboss > 0.0) {
        vec2 off = 1.0 / resolution;
        vec3 c1 = texture(scene, p - off).rgb;
        vec3 c2 = texture(scene, p + off).rgb;
        float diff = (c2.r - c1.r + c2.g - c1.g + c2.b - c1.b) / 3.0;
        vec3 emb = vec3(0.5 + diff * 15.0 * emboss);
        color.rgb = mix(color.rgb, emb, emboss);
    }

    // Scanlines
    if (scanlines > 0.0) {
        float s = sin(uv.y * resolution.y * 3.0);
        color.rgb *= mix(1.0, step(0.0, s), scanlines * 0.95);
    }

    // Strobe (SLOWER)
    if (strobe > 0.0) {
        if (fract(time * 8.0) > 0.5) {
            color.rgb = mix(color.rgb, 1.0 - color.rgb, strobe);
        }
    }

    // Vignette
    float d = distance(uv, vec2(0.5));
    float v = smoothstep(0.8, 0.0, d);
    color.rgb = mix(color.rgb, color.rgb * v, vignette);

    fragColor = color;
} `;
