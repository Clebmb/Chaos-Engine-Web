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
uniform int type; // See FRACTAL_TYPES in engine/fractals.ts — 0..10
uniform vec2 juliaC;
uniform float time;
uniform float chaosFactor;
// Palette: 5 stops (rgb + offset each) sampled cyclically over the escape
// gradient. Stops are plain uniforms so every palette is data, not code.
uniform vec3 palStops[5];
uniform float palOffsets[5];
uniform float palCycle;
uniform float palShift;
// Orbit traps: color by how close each orbit passes to a chosen shape.
// 0 = off, 1 = circle, 2 = cross, 3 = line, 4 = diamond, 5 = flower.
uniform int trap;
uniform float trapSize; // in plane units, rides the view center
// Deep zoom: perturbation theory. The CPU computes the reference orbit of
// the view center in full double precision and uploads it as a float texture
// (row n: zₙ.xy = orbit value, wₙ.zw = the family's pre-abs quadratic).
// Each pixel iterates only the small delta z̃ against that reference — in
// plain float32 (error-free transforms get folded by ANGLE/D3D, but plain
// arithmetic survives) — with Zhuoran rebasing (|z̃|² > |Zₙ|² → absorb the
// reference and restart at n = 0) so deltas stay small forever. Coordinate
// precision stays at double level to zooms ~10⁶× past the float32 wall.
uniform int ptMode;
uniform sampler2D refTex;   // (rows) × 1 RGBA32F: (zₙ.x, zₙ.y, wₙ.x, wₙ.y)
uniform int refN;           // last valid row index (reference escape point)
uniform float row0x;        // Z₀ components for Julia rebasing
uniform float row0y;

// |q+d| − |q| without cancellation (d tiny): sign identity while |d| < |q|,
// else |q+d| = |d| ± |q| decomposed by sign (no catastrophic subtraction).
float strick(float q, float d) {
    float aq = abs(q), ad = abs(d);
    if (ad < aq) return sign(q) * d;
    float mag = (sign(d) == sign(q)) ? ad + aq : ad - aq;
    return mag - aq;
}

vec2 qsq(vec2 z) {
    return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
}

vec2 conj(vec2 z) {
    return vec2(z.x, -z.y);
}

// Cyclic interpolation across the 5 palette stops. t is unbounded (any
// float); the palette wraps smoothly from stop 4 back to stop 0.
vec3 palette(float t) {
    t = fract(t);
    // Map t onto the piecewise segment chain, with the last segment
    // wrapping back to stop 0 so the cycle is seamless.
    float scaled = t * 5.0;
    float seg = floor(scaled);
    float f = fract(scaled);
    int i0 = int(seg);
    int i1 = (i0 + 1) % 5;
    // Offsets allow non-uniform stop placement along the cycle.
    float o0 = palOffsets[i0];
    float o1 = (i1 == 0) ? palOffsets[0] + 1.0 : palOffsets[i1];
    float span = max(o1 - o0, 1e-4);
    float local = clamp((t - o0) / span, 0.0, 1.0);
    // Smoothstep the interpolation to avoid banding at the stops.
    local = local * local * (3.0 - 2.0 * local);
    return mix(palStops[i0], palStops[i1], local);
}

void main() {
    vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
    vec2 c = (uv - 0.5) * aspect * zoom + center;
    vec2 z = vec2(0.0);

    if (type == 1) { // Julia
        z = c;
        c = juliaC;
    }
    if (type == 8) { // Newton: the screen point is the initial guess
        z = c;
    }

    vec2 phoenixY = vec2(0.0); // Phoenix: the previous iterate

    int i;
    float smoothI = 0.0;
    // Orbit trap: closest approach of the orbit to the chosen shape.
    float trapDist = 1e20;
    float ts = max(trapSize, 1e-4); // trap size in plane units

    // ================= Deep zoom: double-single path =================
    // Only for escape-time families (not Newton 8, which converges) and
    // only when the renderer flags the view as deep. The screen offset is
    // computed in float32 — exact at these magnitudes — then added to the
    // split center in ds, giving every pixel a distinct ~47-bit coordinate.
    if (ptMode == 1 && type != 8) {
        vec2 off = (uv - 0.5) * aspect * zoom;
        float dcx = off.x, dcy = off.y;
        // Per-pixel delta z̃; Julia starts at the screen offset (z₀ = point,
        // c fixed → no per-step δc).
        float zx = (type == 1) ? dcx : 0.0;
        float zy = (type == 1) ? dcy : 0.0;
        float dpx = 0.0, dpy = 0.0; // Phoenix delta-prev
        int n = 0;
        bool escaped = false;
        float m2 = 0.0;
        for (i = 0; i < maxIterations; i++) {
            vec4 row = texelFetch(refTex, ivec2(min(n, refN), 0), 0);
            float X = row.x, Y = row.y, W1 = row.z, W2 = row.w;
            // Zhuoran rebase: |z̃|² > |Zₙ|² (or reference exhausted) →
            // absorb the reference and restart at n = 0.
            float z2 = zx * zx + zy * zy;
            float Z2 = X * X + Y * Y;
            if (z2 > Z2 || n >= refN) {
                if (type == 7 && n > 0) {
                    vec4 prow = texelFetch(refTex, ivec2(min(n - 1, refN), 0), 0);
                    dpx += prow.x; dpy += prow.y;
                }
                if (type == 1) {
                    // autonomous map: absorb Zₙ, subtract its start value Z₀
                    zx = zx + X - row0x;
                    zy = zy + Y - row0y;
                } else {
                    zx += X; zy += Y;
                }
                n = 0;
                vec4 r0 = texelFetch(refTex, ivec2(0, 0), 0);
                X = r0.x; Y = r0.y; W1 = r0.z; W2 = r0.w;
            }
            if (type == 2) { // Burning Ship: c sits INSIDE the abs
                float aD = 2.0 * (X * zx - Y * zy) + (zx * zx - zy * zy) + dcx;
                float bD = 2.0 * (Y * zx + X * zy) + 2.0 * zx * zy + dcy;
                zx = strick(W1, aD);
                zy = strick(W2, bD);
            } else if (type == 3) { // Tricorn: conj on the products, δc NOT conjugated
                float t1 = X * zx - Y * zy;
                float t2 = X * zy + Y * zx;
                float nx = 2.0 * t1 + (zx * zx - zy * zy) + dcx;
                float ny = -(2.0 * t2 + 2.0 * zx * zy) + dcy;
                zx = nx; zy = ny;
            } else if (type == 4) { // Celtic: |a| + c → strick then add δc
                float aD = 2.0 * (X * zx - Y * zy) + (zx * zx - zy * zy);
                float bD = 2.0 * (Y * zx + X * zy) + 2.0 * zx * zy;
                zx = strick(W1, aD) + dcx;
                zy = bD + dcy;
            } else if (type == 5) { // Buffalo: |a| + c, −|b| + c
                float aD = 2.0 * (X * zx - Y * zy) + (zx * zx - zy * zy);
                float bD = 2.0 * (Y * zx + X * zy) + 2.0 * zx * zy;
                zx = strick(W1, aD) + dcx;
                zy = -strick(W2, bD) + dcy;
            } else if (type == 6) { // Perpendicular: y' = −2|x|·y
                float aD = 2.0 * (X * zx - Y * zy) + (zx * zx - zy * zy) + dcx;
                float aX = abs(X), azx = abs(zx);
                float dAbs = (azx < aX) ? sign(X) * zx : abs(X + zx) - aX;
                zx = aD;
                zy = -2.0 * (aX * zy + dAbs * (Y + zy)) + dcy;
            } else if (type == 7) { // Phoenix: carries the delta-prev
                float t1 = X * zx - Y * zy;
                float t2 = X * zy + Y * zx;
                float nx = 2.0 * t1 + (zx * zx - zy * zy) + 0.56667 * dpx + dcx;
                float ny = 2.0 * t2 + 2.0 * zx * zy + 0.56667 * dpy + dcy;
                dpx = zx; dpy = zy;
                zx = nx; zy = ny;
            } else if (type == 9) { // Cubic: 3Z²z̃ + 3Z z̃² + z̃³ + δc
                float Z2r = X * X - Y * Y, Z2i = 2.0 * X * Y;
                float w1 = Z2r * zx - Z2i * zy, w2 = Z2r * zy + Z2i * zx;
                float z2r = zx * zx - zy * zy, z2i = 2.0 * zx * zy;
                float v1 = X * z2r - Y * z2i, v2 = X * z2i + Y * z2r;
                float z3r = z2r * zx - z2i * zy, z3i = z2r * zy + z2i * zx;
                zx = 3.0 * w1 + 3.0 * v1 + z3r + dcx;
                zy = 3.0 * w2 + 3.0 * v2 + z3i + dcy;
            } else if (type == 10) { // Quartic: 4Z³z̃ + 6Z²z̃² + 4Z z̃³ + z̃⁴ + δc
                float Z2r = X * X - Y * Y, Z2i = 2.0 * X * Y;
                float Z3r = Z2r * X - Z2i * Y, Z3i = Z2r * Y + Z2i * X;
                float z2r = zx * zx - zy * zy, z2i = 2.0 * zx * zy;
                float w1 = Z3r * zx - Z3i * zy, w2 = Z3r * zy + Z3i * zx;
                float v1 = Z2r * z2r - Z2i * z2i, v2 = Z2r * z2i + Z2i * z2r;
                float z3r = z2r * zx - z2i * zy, z3i = z2r * zy + z2i * zx;
                float u1 = X * z3r - Y * z3i, u2 = X * z3i + Y * z3r;
                float z4r = z2r * z2r - z2i * z2i, z4i = 2.0 * z2r * z2i;
                zx = 4.0 * w1 + 6.0 * v1 + 4.0 * u1 + z4r + dcx;
                zy = 4.0 * w2 + 6.0 * v2 + 4.0 * u2 + z4i + dcy;
            } else if (type == 1) { // Julia: c is fixed — δc only seeds z̃₀
                float t1 = X * zx - Y * zy;
                float t2 = X * zy + Y * zx;
                float nx = 2.0 * t1 + (zx * zx - zy * zy);
                float ny = 2.0 * t2 + 2.0 * zx * zy;
                zx = nx; zy = ny;
            } else { // Mandelbrot (0): δc enters every step
                float t1 = X * zx - Y * zy;
                float t2 = X * zy + Y * zx;
                float nx = 2.0 * t1 + (zx * zx - zy * zy) + dcx;
                float ny = 2.0 * t2 + 2.0 * zx * zy + dcy;
                zx = nx; zy = ny;
            }
            n++;
            vec4 wn = texelFetch(refTex, ivec2(min(n, refN), 0), 0);
            float wx = wn.x + zx, wy = wn.y + zy;
            m2 = wx * wx + wy * wy;
            if (m2 > 4.0) { escaped = true; break; }
        }
        if (!escaped) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0); // the void
        } else {
            // Smooth coloring from the full-orbit magnitude — same formula
            // as the float path, so the modes blend seamlessly.
            float nu = float(i) + 1.0 - log2(log(m2) / 2.0);
            float t = nu / float(maxIterations);
            t = t * palCycle + palShift;
            fragColor = vec4(palette(t), 1.0);
        }
        return;
    }


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
            case 7: // Phoenix — z² + c + p·(previous iterate), p = 0.56667
                z = qsq(z) + c + 0.56667 * phoenixY;
                phoenixY = z_old;
                break;
            case 8: { // Newton's method on z³−1 — three spirit basins
                // z' = z − (z³−1)/(3z²), all in complex arithmetic.
                vec2 z2 = qsq(z);
                vec2 z3 = vec2(z2.x*z.x - z2.y*z.y, z2.x*z.y + z2.y*z.x);
                vec2 num = vec2(z3.x - 1.0, z3.y);      // z³ − 1
                vec2 den = 3.0 * z2;                     // 3z²
                float dd = dot(den, den);                // |3z²|²
                if (dd < 1e-12) break;                   // singular at 0
                vec2 q = vec2(num.x*den.x + num.y*den.y,
                              num.y*den.x - num.x*den.y) / dd;
                z -= q;
                break;
            }
            case 9: { // Cubic tower: z³ + c
                z = vec2(z.x*z.x*z.x - 3.0*z.x*z.y*z.y + c.x,
                         3.0*z.x*z.x*z.y - z.y*z.y*z.y + c.y);
                break;
            }
            case 10: { // Quartic tower: z⁴ + c
                z = qsq(qsq(z)) + c;
                break;
            }
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

        // Orbit trap: track the closest approach to the shape. The trap
        // rides the view center so panning and zooming keep it framed.
        if (trap > 0) {
            vec2 d = z - center;
            float dd;
            if (trap == 1) {
                dd = abs(length(d) - ts);
            } else if (trap == 2) {
                dd = min(abs(d.x), abs(d.y));
            } else if (trap == 3) {
                // a line through the center at 45°
                dd = abs(d.x * 0.70710678 - d.y * 0.70710678);
            } else if (trap == 4) {
                dd = abs(abs(d.x) + abs(d.y) - ts);
            } else {
                // flower: five small circles on a ring of radius ts
                dd = 1e20;
                for (int k = 0; k < 5; k++) {
                    float ang = float(k) * 1.25663706; // 2π/5
                    vec2 pc = vec2(cos(ang), sin(ang)) * ts;
                    dd = min(dd, abs(length(d - pc) - ts * 0.35));
                }
            }
            trapDist = min(trapDist, dd);
        }

        if (length(z) > 4.0) break;

        // Newton basins don't escape — they converge. Break when the
        // iterate lands close enough to one of the three cube roots of 1.
        if (type == 8) {
            float d1 = dot(z - vec2(1.0, 0.0), z - vec2(1.0, 0.0));
            float d2 = dot(z - vec2(-0.5, 0.8660254), z - vec2(-0.5, 0.8660254));
            float d3 = dot(z - vec2(-0.5, -0.8660254), z - vec2(-0.5, -0.8660254));
            if (min(d1, min(d2, d3)) < 1e-6) break;
        }
    }

    if (trap > 0) {
        // Orbit-trap coloring: proximity drives both hue and glow. The
        // closest the orbit grazes the shape, the brighter and more toward
        // the palette's mid-cycle (bright) stops it lands; orbits that never
        // come near fade to the dark first stop.
        float d = clamp(trapDist / ts, 0.0, 1.0);
        float t = palShift + (1.0 - d) * palCycle * 0.4;
        float glow = 1.0 - 0.85 * d;
        fragColor = vec4(palette(t) * glow, 1.0);
    } else if (type == 8 && i < maxIterations) {
        // Newton basin coloring: each root claims a third of the palette
        // cycle (binding each spirit to its name), shaded by how many
        // iterations convergence took.
        float arg = atan(z.y, z.x); // final z sits at its root's angle
        float sector = mod(floor((arg / 6.2831853) * 3.0 + 3.5), 3.0);
        float t = (float(i) / float(maxIterations)) * palCycle + sector / 3.0 + palShift;
        fragColor = vec4(palette(t), 1.0);
    } else if (i == maxIterations) {
        // Interior: keep the void black.
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // Continuous (smooth) escape-time coloring: fractional iteration
        // count from the final radius, then normalized over the gradient.
        float mag2 = dot(z, z);
        float nu = float(i) + 1.0 - log2(log(mag2) / 2.0);
        float t = nu / float(maxIterations);
        t = t * palCycle + palShift;
        fragColor = vec4(palette(t), 1.0);
    }
}`;

export const BUDDHABROT_SHADER = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 fragColor;

uniform vec2 resolution;
uniform vec2 center;
uniform float zoom;
// The accumulated light field (normalized 0..1, R8) and the plane-space
// region it covers. Screen rays map into it; outside is the void.
uniform sampler2D accTex;
uniform vec2 accRegionMin;
uniform vec2 accRegionSize;
uniform vec3 palStops[5];
uniform float palOffsets[5];
uniform float palCycle;
uniform float palShift;

vec3 palette(float t) {
    t = fract(t);
    float scaled = t * 5.0;
    float seg = floor(scaled);
    float f = fract(scaled);
    int i0 = int(seg);
    int i1 = (i0 + 1) % 5;
    float o0 = palOffsets[i0];
    float o1 = (i1 == 0) ? palOffsets[0] + 1.0 : palOffsets[i1];
    float span = max(o1 - o0, 1e-4);
    float local = clamp((t - o0) / span, 0.0, 1.0);
    local = local * local * (3.0 - 2.0 * local);
    return mix(palStops[i0], palStops[i1], local);
}

void main() {
    vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
    vec2 plane = (uv - 0.5) * aspect * zoom + center;
    vec2 accUv = (plane - accRegionMin) / accRegionSize;
    if (accUv.x < 0.0 || accUv.y < 0.0 || accUv.x > 1.0 || accUv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    float v = texture(accTex, accUv).r;
    if (v < 0.004) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    // Gamma-lift so faint structures are visible while the ghost is young.
    v = pow(v, 0.55);
    float t = v * palCycle + palShift;
    fragColor = vec4(palette(t), 1.0);
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
