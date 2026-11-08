// Dusk sky: a gradient, a perspective sea of clouds, cloud banks, a crescent moon and
// faint stars, drawn by one fragment shader. Everything moves slowly and smoothly.
// The cursor only shifts the depth layers a little (parallax). Nothing else follows it.
// Built by tools/build.mjs into website/assets/js/paint.js (Three.js is tree-shaken).
import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from "three";

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uLook;
  uniform float uDark;
  uniform float uHorizon;
  uniform float uScroll;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(11.7, 5.3);
      a *= 0.5;
    }
    return v;
  }

  // Sky colour. t = 0 at the horizon, 1 at the top.
  vec3 skyColor(float t) {
    vec3 c = mix(vec3(1.00, 0.74, 0.55), vec3(0.98, 0.60, 0.72), smoothstep(0.0, 0.14, t));
    c = mix(c, vec3(0.62, 0.56, 0.92), smoothstep(0.10, 0.34, t));
    c = mix(c, vec3(0.30, 0.48, 0.93), smoothstep(0.30, 0.62, t));
    c = mix(c, vec3(0.09, 0.20, 0.62), smoothstep(0.58, 1.0, t));
    return c;
  }

  float cloudDensity(vec2 q) {
    q += 0.32 * vec2(noise(q * 0.8 + 3.1), noise(q * 0.8 + 8.2));
    return fbm(q);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float asp = uRes.x / uRes.y;
    float hz = uHorizon;
    float t = uTime;
    vec2 p = vec2((uv.x - 0.5) * asp, uv.y + uScroll * 0.00012);

    // Sky
    float s = clamp((uv.y - hz) / (1.0 - hz), 0.0, 1.0);
    vec3 col = skyColor(s);
    col += vec3(1.0, 0.55, 0.32) * exp(-p.x * p.x / 0.28) * exp(-s * 4.5) * 0.32;
    float cirrus = fbm(vec2(p.x * 1.3 + t * 0.005 + uLook.x * 0.06, s * 8.0 + 3.0));
    cirrus = smoothstep(0.52, 0.86, cirrus) * smoothstep(0.75, 0.12, s);
    col += vec3(1.0, 0.78, 0.88) * cirrus * 0.3;

    // Distant cloud banks standing above the horizon
    float bx = p.x * 1.2 + t * 0.004 + uLook.x * 0.04;
    float bankTop = hz + 0.012 + 0.2 * pow(fbm(vec2(bx * 1.4, 4.0)), 1.8);
    float inBank = smoothstep(bankTop + 0.006, bankTop - 0.01, uv.y) * step(hz - 0.03, uv.y);
    vec3 bank = mix(vec3(0.46, 0.50, 0.90), vec3(0.80, 0.62, 0.90), fbm(vec2(bx * 3.0, uv.y * 18.0 + 1.0)));
    bank += vec3(1.0, 0.72, 0.70) * smoothstep(0.035, 0.0, bankTop - uv.y) * 0.45;
    bank = mix(bank, skyColor(0.02), 0.18);
    col = mix(col, bank, inBank * 0.85);

    // Sea of clouds below the horizon, seen in perspective
    if (uv.y < hz + 0.03) {
      float dist = max(hz - uv.y, 0.0005);
      float z = 0.12 / (dist + 0.02);
      vec2 q = vec2((p.x + uLook.x * 0.08) * z * 3.2 + t * 0.012, z * 2.2 - t * 0.03 + uLook.y * 0.15);
      float d = cloudDensity(q);
      float dl = cloudDensity(q + vec2(0.0, 0.3));
      float coverage = smoothstep(0.40, 0.62, d);
      float lit = clamp(0.5 + (dl - d) * 5.0, 0.0, 1.0);
      vec3 cloud = mix(vec3(0.24, 0.28, 0.74), vec3(0.66, 0.64, 0.97), smoothstep(0.35, 0.8, d));
      cloud = mix(cloud, vec3(1.0, 0.76, 0.82), lit * smoothstep(0.38, 0.62, d) * 0.85);
      float fog = exp(-dist * 9.0);
      cloud = mix(cloud, vec3(1.0, 0.72, 0.62), fog * 0.55);
      vec3 haze = mix(vec3(0.66, 0.60, 0.93), vec3(1.0, 0.70, 0.66), fog);
      vec3 sea = mix(haze, cloud, coverage);
      sea *= mix(1.0, 0.74, smoothstep(0.0, 0.4, dist));
      col = mix(col, sea, smoothstep(0.012, -0.012, uv.y - hz));
    }

    // Night version for reading pages
    col = mix(col, col * vec3(0.20, 0.25, 0.46) + vec3(0.006, 0.012, 0.045), uDark);

    // Stars show only where the sky is dark. They shimmer very slowly.
    float lum = dot(col, vec3(0.30, 0.59, 0.11));
    vec2 sg = vec2(uv.x * asp, uv.y) * 85.0;
    vec2 sid = floor(sg);
    float sh = hash(sid);
    vec2 sf = fract(sg) - 0.5 + (vec2(hash(sid + 1.7), hash(sid + 5.3)) - 0.5) * 0.5;
    float star = step(0.9955, sh) * smoothstep(0.22, 0.0, length(sf));
    star *= smoothstep(0.30, 0.12, lum) * smoothstep(hz + 0.12, hz + 0.4, uv.y);
    col += vec3(0.9, 0.93, 1.0) * star * (0.8 + 0.2 * sin(t * 0.5 + sh * 60.0)) * 0.9;

    // Crescent moon
    vec2 mc = vec2(-asp * 0.36 + uLook.x * 0.012, 0.64);
    vec2 pm = vec2(p.x, uv.y); // fixed on screen, it does not move with scrolling
    float md = length(pm - mc);
    float moon = smoothstep(0.034, 0.031, md) * smoothstep(0.031, 0.034, length(pm - mc - vec2(0.016, 0.008)));
    float moonShow = 1.0 - 0.65 * uDark;
    col = mix(col, vec3(1.0, 0.96, 0.88), moon * moonShow);
    col += vec3(1.0, 0.93, 0.82) * exp(-md * 16.0) * 0.1 * moonShow;

    // Painted surface: faint horizontal brush streaks and a still grain
    col *= 0.975 + 0.05 * noise(vec2(p.x * 8.0, uv.y * 260.0));
    col += (hash(gl_FragCoord.xy) - 0.5) * 0.03;
    col *= mix(0.64, 1.0, smoothstep(1.35, 0.35, length(vec2(p.x * 0.8, uv.y - 0.5))));

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, k) => a + (b - a) * k;

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {number} [options.dark] 0 = dusk (home), about 0.8 = night (reading pages)
 * @param {number | (() => number)} [options.horizon] horizon height, 0 bottom to 1 top
 * @param {boolean} [options.still] draw one frame and stay still
 * @param {() => void} [options.onFail] called when the canvas must be given up
 */
export default function startSky({ canvas, dark = 0, horizon = 0.46, still = false, onFail }) {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });

  const uniforms = {
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: still ? 40 : 0 },
    uLook: { value: new Vector2(0, 0) },
    uDark: { value: dark },
    uHorizon: { value: horizon },
    uScroll: { value: 0 },
  };

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(
    new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false }),
    ),
  );

  const dprBase = Math.min(window.devicePixelRatio || 1, 1.25);
  let quality = 0.75;
  let raf = 0;
  let stopped = false;

  const resize = () => {
    renderer.setPixelRatio(dprBase * quality);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.getDrawingBufferSize(uniforms.uRes.value);
    uniforms.uHorizon.value = typeof horizon === "function" ? horizon() : horizon;
    if (still) renderer.render(scene, camera);
  };

  // Pointer state. uv: x to the right, y up.
  const pointer = { x: 0.5, y: 0.5 };
  const look = { x: 0, y: 0 };
  let lastMove = -Infinity;

  const onPointer = (event) => {
    pointer.x = event.clientX / window.innerWidth;
    pointer.y = 1 - event.clientY / window.innerHeight;
    lastMove = performance.now();
  };

  let last = performance.now();
  let lastRender = 0;
  let frameGap = 0;
  let frames = 0;
  let accumulated = 0;
  const start = performance.now();

  const frame = (now) => {
    raf = window.requestAnimationFrame(frame);
    const idle = clamp01((now - lastMove - 3000) / 2500);
    const gap = Math.max(frameGap, idle > 0.99 ? 30 : 0); // 30 fps while only drifting
    if (gap && now - lastRender < gap) return;
    const elapsed = (now - last) / 1000;
    const dt = Math.min(elapsed, 0.1);
    last = now;
    lastRender = now;

    // Quality guard: measure the first seconds, then lower the resolution.
    // Frames that took over 120 ms mean the browser throttled the page (hidden or
    // covered window), not that the GPU is slow, so they do not count.
    if (frames < 300 && elapsed < 0.12) {
      frames += 1;
      accumulated += dt;
      if (frames % 60 === 0) {
        const average = accumulated / 60;
        accumulated = 0;
        if (average > 0.034 && quality <= 0.4) {
          frameGap = 66; // very slow GPU: keep the sky, draw it at about 15 fps
          frames = 300;
        } else if (average > 0.026 && quality > 0.4) {
          quality = quality > 0.6 ? 0.55 : 0.4;
          resize();
        }
      }
    }

    const seconds = (now - start) / 1000;
    // Without a pointer the depth layers breathe slowly on their own.
    const auto = { x: 0.35 * Math.sin(seconds * 0.11), y: 0.18 * Math.sin(seconds * 0.07 + 1) };
    const aim = { x: pointer.x * 2 - 1, y: pointer.y * 2 - 1 };
    const ease = 1 - Math.exp(-dt * 2.2);
    look.x += (mix(aim.x, auto.x, idle) - look.x) * ease;
    look.y += (mix(aim.y, auto.y, idle) - look.y) * ease;

    uniforms.uTime.value = seconds;
    uniforms.uLook.value.set(look.x, look.y);
    uniforms.uScroll.value = window.scrollY;
    renderer.render(scene, camera);
  };

  const run = () => {
    if (stopped || still || raf) return;
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  };

  const pause = () => {
    window.cancelAnimationFrame(raf);
    raf = 0;
  };

  function stop() {
    stopped = true;
    pause();
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("pointerdown", onPointer);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
    renderer.dispose();
  }

  function onVisibility() {
    if (document.hidden) pause();
    else run();
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    stop();
    onFail?.();
  });

  window.addEventListener("resize", resize, { passive: true });
  resize();

  if (still) {
    renderer.render(scene, camera);
  } else {
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    run();
  }

  return { stop };
}
