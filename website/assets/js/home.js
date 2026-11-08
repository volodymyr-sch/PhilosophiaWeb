(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lightWeight = document.documentElement.classList.contains("light-weight"); // main.js: save-data or 2g
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const loaded = (image) => (image.complete && image.naturalWidth ? Promise.resolve() : image.decode());

  // One shared pointer for the painting and the stars.
  const pointer = { x: -1000, y: -1000, last: -Infinity };
  const listeners = [];
  const isActive = (now = performance.now()) => now - pointer.last < 3000;
  const onPointer = (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.last = performance.now();
    listeners.forEach((listener) => listener());
  };
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.last = -Infinity;
  });

  // ---- Caption: one real quote at the bottom, swapped slowly ----
  const rotateCaption = () => {
    const caption = document.querySelector("[data-caption]");
    const text = document.querySelector("[data-caption-text]");
    const by = document.querySelector("[data-caption-by]");
    if (!caption || !text || !by || reduced) return;
    let voices = [];
    try {
      voices = JSON.parse(document.getElementById("voices")?.textContent || "[]");
    } catch {
      return;
    }
    if (voices.length < 2) return;

    let index = 0;
    window.setInterval(() => {
      if (document.hidden) return;
      caption.classList.add("is-out");
      window.setTimeout(() => {
        index = (index + 1) % voices.length;
        text.textContent = voices[index].text;
        by.textContent = voices[index].by;
        caption.classList.remove("is-out");
      }, 1700);
    }, 14000);
  };

  // ---- Painting: it moves a little with the pointer, so it has depth (styles.css eases it) ----
  const moveThePainting = () => {
    const painting = document.querySelector(".painting");
    if (!painting || reduced) return;
    let queued = false;
    listeners.push(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        painting.style.setProperty("--px", ((pointer.x / window.innerWidth) * 2 - 1).toFixed(3));
        painting.style.setProperty("--py", ((pointer.y / window.innerHeight) * 2 - 1).toFixed(3));
      });
    });
  };

  // ---- Painting comes alive (WebGL): clouds drift, flowers sway, wind in his hair and robe ----
  // A small mask picture says what may move (made by tools/make_live_mask.swift):
  // red = clouds, green = flowers, blue = hair and robe end. If anything fails, the still picture stays.
  const VERTEX = `
    attribute vec2 corner;
    varying vec2 uv;
    void main() {
      uv = vec2(corner.x, -corner.y) * 0.5 + 0.5;
      gl_Position = vec4(corner, 0.0, 1.0);
    }`;
  const FRAGMENT = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D painting;
    uniform sampler2D mask;
    uniform vec2 size;
    uniform float time;
    varying vec2 uv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    void main() {
      vec3 m = texture2D(mask, uv).rgb;
      vec2 px = 1.0 / size;
      // Gusts of wind run over the hill from left to right.
      float gust = 0.6 + 0.4 * sin(time * 0.7 - uv.x * 4.0) * sin(time * 0.23 + 1.0);
      // Flowers sway sideways.
      float sway = noise(vec2(uv.x * 9.0 - time * 0.8, uv.y * 5.0)) - 0.5;
      vec2 move = vec2(sway * 10.0, 0.0) * px * m.g * gust;
      // Hair and robe end: quick small ripples.
      vec2 ripple = vec2(noise(uv * 60.0 + vec2(-time * 2.2, 0.0)), noise(uv * 60.0 + vec2(7.0, -time * 1.8))) - 0.5;
      move += ripple * 9.0 * px * m.b * gust;
      // Clouds: they slowly change shape and drift to the left. Two copies take turns, so there is no jump.
      vec2 boil = (vec2(noise(uv * vec2(7.0, 18.0) + time * 0.05), noise(uv * vec2(7.0, 18.0) - time * 0.06 + 9.0)) - 0.5) * 10.0 * px;
      float phase = fract(time / 12.0);
      vec2 drift = vec2(16.0, 0.0) * px;
      vec3 a = texture2D(painting, uv + move + (boil + drift * phase) * m.r).rgb;
      vec3 b = texture2D(painting, uv + move + (boil + drift * fract(phase + 0.5)) * m.r).rgb;
      vec3 color = mix(a, b, abs(2.0 * phase - 1.0));
      // The glow over the horizon brightens and fades slowly.
      float glow = smoothstep(0.38, 0.52, uv.y) * (1.0 - smoothstep(0.56, 0.68, uv.y));
      color *= 1.0 + glow * 0.06 * sin(time * 0.26);
      // The painted star twinkles.
      vec2 d = (uv - vec2(0.6394, 0.0701)) * size;
      color += exp(-dot(d, d) / 14.0) * 0.4 * (0.5 + 0.5 * sin(time * 2.1) * sin(time * 0.77));
      gl_FragColor = vec4(color, 1.0);
    }`;

  const bringThePaintingToLife = () => {
    const painting = document.querySelector(".painting");
    const still = painting?.querySelector("img[data-live-mask]");
    if (!still || reduced || lightWeight) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
    if (!gl) return;

    let raf = 0;
    const giveUp = (error) => {
      if (error) console.warn("Live painting not started; the still picture stays.", error);
      window.cancelAnimationFrame(raf);
      canvas.remove();
    };
    canvas.addEventListener("webglcontextlost", () => giveUp());

    const mask = new Image();
    mask.src = still.dataset.liveMask;

    Promise.all([loaded(still), loaded(mask)])
      .then(() => {
        const shader = (type, source) => {
          const result = gl.createShader(type);
          gl.shaderSource(result, source);
          gl.compileShader(result);
          if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
          return result;
        };
        const program = gl.createProgram();
        gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);

        // One triangle that covers the whole canvas.
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const corner = gl.getAttribLocation(program, "corner");
        gl.enableVertexAttribArray(corner);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

        // Pages opened from disk (file://) cannot use pictures in WebGL: texImage2D throws, and the still stays.
        [still, mask].forEach((image, unit) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        });
        gl.uniform1i(gl.getUniformLocation(program, "painting"), 0);
        gl.uniform1i(gl.getUniformLocation(program, "mask"), 1);

        // The canvas has the picture's own size; styles.css fits it to the screen like the picture.
        canvas.width = still.naturalWidth;
        canvas.height = still.naturalHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(gl.getUniformLocation(program, "size"), canvas.width, canvas.height);
        const time = gl.getUniformLocation(program, "time");

        const start = performance.now();
        let last = -Infinity;
        const frame = (now) => {
          raf = window.requestAnimationFrame(frame);
          if (now - last < 30) return; // about 30 frames a second is enough for slow motion
          last = now;
          gl.uniform1f(time, (now - start) / 1000);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        frame(start);
        still.after(canvas);
        window.requestAnimationFrame(() => canvas.classList.add("is-live"));
      })
      .catch(giveUp);
  };

  // ---- Home B (prototype, reader.html): he reads. Letters of the quote rise from his scroll to his eyes,
  // and his thoughts blow away from the back of his head as letters and strokes. ----
  // Places in reader.webp (1052 x 940 px, he faces left), in picture pixels.
  const READER = {
    width: 1052,
    eye: [455, 176],
    head: [535, 115], // the middle of his head; the thoughts leave behind and above it
    headRadius: 110,
    scroll: [20, 455, 370, 630], // a box around the open scroll: left, top, right, bottom
  };
  const THOUGHT_GLYPHS = "αβγδεζηθικλμνξοπρστυφχψωΣΦΩabcdefghilmnoprstuvw";
  // The night behind him: a sea of clouds below the horizon, a slowly turning star map above it.
  const NIGHT = {
    horizon: 0.64, // share of the screen height
    haze: 0.3, // the light along the horizon
    rows: 9, // rows of clouds from the horizon to the bottom
    pole: [0.72, -0.2], // the sky turns around this point (shares of the screen width and height)
    rings: [0.55, 0.95], // star-map circles around the pole (shares of the screen height)
    turn: 0.01, // radians a second: a full turn in about 10 minutes
    names: "αβγδεζηθικλμνξοπρστυφχψω", // some bright stars carry Greek letters, like on old star maps
  };

  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(0, 1, x - ix);
    const fy = smooth(0, 1, y - iy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };

  const bringTheReaderToLife = () => {
    const figure = document.querySelector(".reader-figure");
    const still = figure?.querySelector("img");
    if (!still) return;
    const canvas = document.createElement("canvas");
    canvas.className = "reader-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const calm = reduced || lightWeight; // one still frame, no motion
    const font = getComputedStyle(document.body).fontFamily;
    const quote = document.querySelector("[data-caption-text]");
    const random = Math.random;
    let box = null;
    let scale = 1;
    let dpr = 1;
    let dots = null;
    let thoughtFrom = []; // x, y pairs in picture pixels
    let readFrom = [];
    let particles = [];
    let night = null; // the scene behind him (a canvas) and its stars
    // Grain: strong in the middle tones, weak in the light and the dark. He and the night share it.
    const grain = (tone, amount = 0.7) => clamp(tone + (random() - 0.5) * amount * (1 - Math.abs(2 * tone - 1)), 0, 1);

    // A row of round billows: half circles of different sizes side by side, like the top of a cloud.
    const billows = (x, size, seed) => {
      const u = x / size + seed;
      const cell = Math.floor(u);
      const t = 2 * (u - cell) - 1;
      return (0.55 + 0.45 * hash(cell, seed)) * Math.sqrt(1 - t * t);
    };

    // The night is drawn once for each screen size: a dark sky with a glow along the horizon, and a sea
    // of clouds in rows of billows. Far rows are small and pale, near rows are large and dark.
    const paintTheNight = (width, height) => {
      const horizon = Math.round(height * NIGHT.horizon);
      const deep = height - horizon;
      const rows = [];
      for (let r = 0; r < NIGHT.rows; r += 1) {
        const near = r / (NIGHT.rows - 1); // 0 at the horizon, 1 at the bottom
        const size = height * (0.025 + 0.26 * near ** 1.6);
        const base = horizon + deep * 0.92 * near ** 1.5;
        const top = new Float32Array(width);
        const shine = new Float32Array(width);
        for (let x = 0; x < width; x += 1) {
          // Long, slow swells with billows of two sizes (and different widths) on top.
          const wavy = x + size * 0.8 * noise(x / (size * 2.3), r * 2.7);
          const lift = 0.7 * noise(x / (size * 3), r * 5.1) + 0.22 * billows(wavy, size, r * 7.3) + 0.08 * billows(wavy, size * 0.3, r * 3.1 + 50);
          top[x] = base - size * 0.7 * lift;
          shine[x] = 0.5 + 0.5 * lift; // the high billows catch more light
        }
        rows.push({ top, shine, light: 0.75 - 0.3 * near, dark: 0.12 - 0.1 * near, fall: size * 0.28 });
      }

      const scene = document.createElement("canvas");
      scene.width = width;
      scene.height = height;
      const sceneCtx = scene.getContext("2d");
      const image = sceneCtx.createImageData(width, height);
      const pixels = image.data;
      for (let y = 0; y < height; y += 1) {
        const skyTone = 0.035 + (NIGHT.haze - 0.035) * Math.exp((y - horizon) / (height * 0.09));
        for (let x = 0; x < width; x += 1) {
          let tone = skyTone;
          // The nearest row of clouds in front of this pixel: bright at its top edge, dark below.
          for (let r = rows.length - 1; r >= 0; r -= 1) {
            const row = rows[r];
            const edge = row.top[x];
            if (y >= edge) {
              tone = row.dark + (row.light * row.shine[x] - row.dark) * Math.exp((edge - y) / row.fall);
              break;
            }
          }
          const k = (y * width + x) * 4;
          pixels[k] = pixels[k + 1] = pixels[k + 2] = 255 * grain(tone, 0.5); // a little finer than his grain, so he stands out
          pixels[k + 3] = 255;
        }
      }
      sceneCtx.putImageData(image, 0, 0);

      // Stars on a disc around the pole, so the sky stays full while it turns.
      const poleX = width * NIGHT.pole[0];
      const poleY = height * NIGHT.pole[1];
      const far = Math.max(Math.hypot(poleX, horizon - poleY), Math.hypot(width - poleX, horizon - poleY));
      const stars = [];
      let named = 0;
      for (let i = Math.round((Math.PI * far * far) / 2200); i > 0; i -= 1) {
        const r = far * Math.sqrt(random());
        const a = random() * Math.PI * 2;
        const size = 0.8 + random() ** 3 * 2.4;
        const name = size > 2 && random() < 0.4 ? NIGHT.names[named++ % NIGHT.names.length] : "";
        stars.push({ x: r * Math.cos(a), y: r * Math.sin(a), size, light: 0.35 + 0.65 * random() ** 1.5, phase: random() * 6.28, name });
      }
      // The star map fades out before the haze.
      const fade = ctx.createLinearGradient(0, 0, 0, horizon);
      fade.addColorStop(0, "rgba(255,255,255,0.24)");
      fade.addColorStop(0.7, "rgba(255,255,255,0.12)");
      fade.addColorStop(1, "rgba(255,255,255,0)");
      night = { scene, horizon, poleX, poleY, stars, fade, rings: NIGHT.rings.map((ring) => ring * height) };
    };

    // The star map turns slowly around the pole: its circles, the marks on the inner circle, and the stars.
    const drawTheSky = (seconds) => {
      const turn = seconds * NIGHT.turn;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const { poleX, poleY, horizon, rings } = night;
      ctx.strokeStyle = night.fade;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (const ring of rings) {
        ctx.moveTo(poleX + ring, poleY);
        ctx.arc(poleX, poleY, ring, 0, Math.PI * 2);
      }
      for (let mark = 0; mark < 72; mark += 1) {
        const angle = turn + (mark * Math.PI) / 36; // every 5 degrees, a long mark every 30
        const inner = rings[0] - (mark % 6 === 0 ? 11 : 5);
        ctx.moveTo(poleX + Math.cos(angle) * rings[0], poleY + Math.sin(angle) * rings[0]);
        ctx.lineTo(poleX + Math.cos(angle) * inner, poleY + Math.sin(angle) * inner);
      }
      ctx.stroke();

      const width = window.innerWidth;
      const fadeFrom = horizon * 0.62;
      ctx.fillStyle = "#fff";
      for (const star of night.stars) {
        const x = poleX + star.x * cos - star.y * sin;
        const y = poleY + star.x * sin + star.y * cos;
        if (x < -20 || x > width + 20 || y < -20 || y > horizon) continue;
        const alpha = star.light * (1 - smooth(fadeFrom, horizon, y)) * (0.8 + 0.2 * Math.sin(seconds * 1.3 + star.phase));
        if (alpha < 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, star.size / 2, 0, Math.PI * 2);
        ctx.fill();
        if (star.name) {
          ctx.globalAlpha = alpha * 0.65;
          ctx.drawImage(glyph(star.name), x + 2, y - 17, 15, 15);
        }
      }
      ctx.globalAlpha = 1;
    };

    // He is drawn as fine grain over the scene.
    // Behind and above his head the grain thins out: his thoughts leave from there.
    const layout = () => {
      box = still.getBoundingClientRect();
      scale = box.width / READER.width;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      paintTheNight(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      const width = Math.max(1, Math.round(box.width));
      const height = Math.max(1, Math.round(box.height));
      dots = document.createElement("canvas");
      dots.width = width;
      dots.height = height;
      const dotsCtx = dots.getContext("2d", { willReadFrequently: true });
      dotsCtx.drawImage(still, 0, 0, width, height);
      const image = dotsCtx.getImageData(0, 0, width, height); // throws for pages opened from disk (file://)
      const pixels = image.data;
      const [headX, headY] = READER.head;
      const radius = READER.headRadius;
      const [left, top, right, bottom] = READER.scroll;
      thoughtFrom = [];
      readFrom = [];
      for (let y = 0; y < height; y += 1) {
        const py = y / scale;
        const fade = 1 - smooth(0.82, 1, y / height); // the robe fades into the dark at the bottom
        for (let x = 0; x < width; x += 1) {
          const k = (y * width + x) * 4;
          const alpha = pixels[k + 3] / 255;
          if (alpha < 0.02) {
            pixels[k + 3] = 0;
            continue;
          }
          const px = x / scale;
          const light = pixels[k] / 255; // the picture is grey and dark: most of it is below 0.5
          const tone = clamp((light - 0.1) / 0.45, 0, 1) ** 0.85;
          let gone = 0;
          const dx = px - headX;
          const dy = py - headY;
          if (dx * dx + dy * dy < radius * radius * 2.4 && dy < radius * 0.55) {
            const behind = (dx * 0.8 - dy * 0.6) / radius;
            gone = smooth(0.15, 1.05, behind + (noise(px / 16, py / 16) - 0.5) * 0.7);
          }
          const value = grain(tone) * (1 - 0.4 * gone);
          // He hides the scene behind him. Where his head breaks up, only his light dots stay on the sky.
          const keep = random() < gone ? 0 : 1 - gone * (1 - value);
          pixels[k] = pixels[k + 1] = pixels[k + 2] = (255 * value) / Math.max(keep, 0.01);
          pixels[k + 3] = 255 * alpha * fade * keep;
          if (gone > 0.2 && alpha > 0.5 && random() < 0.3) thoughtFrom.push(px, py);
          if (light > 0.6 && px > left && px < right && py > top && py < bottom && random() < 0.2) readFrom.push(px, py);
        }
      }
      dotsCtx.putImageData(image, 0, 0);
    };

    // Each letter is drawn once on a small canvas and reused.
    const glyphs = new Map();
    const glyph = (char) => {
      let picture = glyphs.get(char);
      if (!picture) {
        picture = document.createElement("canvas");
        picture.width = picture.height = 48;
        const g = picture.getContext("2d");
        g.fillStyle = "#fff";
        g.font = `36px ${font}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(char, 24, 26);
        glyphs.set(char, picture);
      }
      return picture;
    };

    const pick = (points) => {
      const i = Math.floor(random() * (points.length / 2)) * 2;
      return [points[i], points[i + 1]];
    };

    // A thought leaves the back of his head slowly, then the wind takes it up and away.
    const think = () => {
      const [x, y] = pick(thoughtFrom);
      particles.push({
        read: false,
        x,
        y,
        vx: 0,
        vy: 0,
        age: 0,
        life: 2.5 + random() * 3,
        speed: 45 + random() * 75,
        turn: (random() - 0.5) * 1.1,
        char: random() < 0.3 ? THOUGHT_GLYPHS[Math.floor(random() * THOUGHT_GLYPHS.length)] : "",
        size: 6 + random() * 7,
        spin: (random() - 0.5) * 1.6,
      });
    };

    // The letters of the quote at the bottom, in order: each lifts off the scroll and flies in an arc into his eye.
    let letterIndex = 0;
    const read = () => {
      const [x, y] = pick(readFrom);
      const toX = READER.eye[0] + (random() - 0.5) * 14;
      const toY = READER.eye[1] + (random() - 0.5) * 10;
      const letters = (quote?.textContent || "").replace(/[^\p{L}]/gu, "") || "philosophia";
      particles.push({
        read: true,
        x0: x,
        y0: y,
        cx: x + (toX - x) * 0.15,
        cy: y - (y - toY) * 0.85 - random() * 40,
        toX,
        toY,
        x,
        y,
        age: 0,
        life: 2.4 + random() * 1.2,
        char: letters[letterIndex++ % letters.length],
        size: 13 + random() * 5,
        phase: random() * 6.28,
      });
    };

    let thoughtsDue = 0;
    let lettersDue = 0;
    const spawn = (dt, warm) => {
      thoughtsDue += dt * 600 * clamp(scale, 0.45, 1.2) * warm;
      for (; thoughtsDue >= 1 && thoughtFrom.length; thoughtsDue -= 1) think();
      lettersDue += dt * 12;
      for (; lettersDue >= 1 && readFrom.length; lettersDue -= 1) read();
    };

    const step = (dt, seconds) => {
      for (const p of particles) {
        p.age += dt;
        if (p.read) {
          const t = smooth(0, 1, p.age / p.life);
          const u = 1 - t;
          p.x = u * u * p.x0 + 2 * u * t * p.cx + t * t * p.toX + Math.sin(p.age * 2.2 + p.phase) * 5 * u;
          p.y = u * u * p.y0 + 2 * u * t * p.cy + t * t * p.toY;
        } else {
          // A slow, changing wind: up and to the right, turning a little from place to place.
          const flow = Math.sin(p.x * 0.012 + seconds * 0.55) + Math.sin(p.y * 0.016 - seconds * 0.4);
          const angle = -0.62 + p.turn + flow * 0.32;
          const speed = p.speed * (0.04 + (1.4 * p.age) / p.life); // slow at first: a dense cloud stays at his head
          const pull = Math.min(1, dt * 2.5);
          p.vx += (Math.cos(angle) * speed - p.vx) * pull;
          p.vy += (Math.sin(angle) * speed - p.vy) * pull;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      particles = particles.filter((p) => p.age < p.life);
    };

    const draw = (seconds) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false; // sharp grain
      ctx.drawImage(night.scene, 0, 0);
      ctx.imageSmoothingEnabled = true;
      drawTheSky(seconds);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(dots, box.left, box.top, dots.width, dots.height);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = "#fff";
      const grow = clamp(scale * 1.3, 0.7, 1.3); // letters stay readable on small screens
      for (const p of particles) {
        const f = p.age / p.life;
        let alpha;
        let angle;
        let size = p.size * grow;
        if (p.read) {
          alpha = 0.95 * smooth(0, 0.12, f) * (1 - smooth(0.78, 1, f));
          angle = Math.sin(p.age * 1.7 + p.phase) * 0.25;
          size *= 1 - 0.6 * smooth(0, 1, f);
        } else {
          alpha = smooth(0, 0.05, f) * (1 - f) ** 0.8;
          angle = p.char ? p.spin * (1 + p.age) : Math.atan2(p.vy, p.vx);
        }
        if (alpha < 0.01) continue;
        const cos = Math.cos(angle) * dpr;
        const sin = Math.sin(angle) * dpr;
        ctx.globalAlpha = alpha;
        ctx.setTransform(cos, sin, -sin, cos, (box.left + p.x * scale) * dpr, (box.top + p.y * scale) * dpr);
        if (p.char) {
          const side = (size * 48) / 36;
          ctx.drawImage(glyph(p.char), -side / 2, -side / 2, side, side);
        } else {
          const length = (4 + Math.hypot(p.vx, p.vy) * 0.1) * grow;
          ctx.fillRect(-length / 2, -0.7, length, 1.4);
        }
      }
      ctx.globalAlpha = 1;
    };

    const begin = () => {
      try {
        layout();
      } catch (error) {
        console.warn("Live reader not started; the still picture stays.", error);
        return;
      }
      if (calm) {
        // No motion: let the letters fly for a few seconds out of sight, then show one still frame.
        for (let i = 0; i < 240; i += 1) {
          spawn(1 / 30, 1);
          step(1 / 30, i / 30);
        }
        draw(0);
      } else {
        const start = performance.now();
        let last = start;
        const frame = (now) => {
          window.requestAnimationFrame(frame);
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          spawn(dt, smooth(0, 5000, now - start)); // the thoughts start slowly after the page opens
          step(dt, now / 1000);
          draw(now / 1000);
        };
        window.requestAnimationFrame(frame);
      }
      figure.after(canvas);
      window.requestAnimationFrame(() => {
        canvas.classList.add("is-live");
        figure.classList.add("is-live");
      });

      let resizeTimer = 0;
      window.addEventListener(
        "resize",
        () => {
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            layout();
            if (calm) draw(0);
          }, 150);
        },
        { passive: true },
      );
    };

    loaded(still)
      .then(begin)
      .catch((error) => console.warn("Live reader not started; the still picture stays.", error));
  };

  // ---- Stars: they come out around the pointer and join into a constellation ----
  const fillSkyWithStars = () => {
    const painting = document.querySelector(".painting");
    if (!painting || reduced) return;
    const canvas = document.createElement("canvas");
    canvas.className = "star-sky";
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    document.body.prepend(canvas);

    // A soft glow with a bright core, drawn once and reused for every star.
    const halo = document.createElement("canvas");
    halo.width = halo.height = 64;
    const haloCtx = halo.getContext("2d");
    const gradient = haloCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,250,238,1)");
    gradient.addColorStop(0.2, "rgba(255,244,222,0.95)");
    gradient.addColorStop(0.45, "rgba(255,236,205,0.3)");
    gradient.addColorStop(1, "rgba(255,236,205,0)");
    haloCtx.fillStyle = gradient;
    haloCtx.fillRect(0, 0, 64, 64);

    const REST = 0.42; // brightness of a star nobody is looking at (only high in the sky)
    let stars = [];
    let edges = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;

    const seeded = (seed) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // The glow over the clouds starts at 48% of the painting's height. Stars stay above it.
    const skyBottom = () => {
      const box = painting.getBoundingClientRect();
      // object-fit: cover with object-position y 60% (styles.css): a cut picture loses 60% of the cut at the top.
      const shown = Math.max(box.height, box.width / (1672 / 941));
      return box.top + (box.height - shown) * 0.6 + shown * 0.48;
    };

    const layout = () => {
      width = window.innerWidth;
      height = Math.max(120, Math.round(skyBottom() - 20));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = `${height}px`;

      // Stars at fixed, evenly spread places (the same every time).
      const random = seeded(7);
      const gap = clamp(width / 22, 46, 76);
      stars = [];
      for (let tries = 0; tries < 1600 && stars.length < 170; tries += 1) {
        const x = 10 + random() * (width - 20);
        const y = 64 + random() * (height - 74);
        const size = 0.9 + random() ** 2 * 2.2;
        const phase = random() * 6.28;
        if (stars.some((star) => Math.hypot(star.x - x, star.y - y) < gap)) continue;
        stars.push({ x, y, size, phase, vis: 0 });
      }

      // The lines: a minimum spanning tree, so the net looks like drawn constellations.
      edges = [];
      const joined = new Array(stars.length).fill(false);
      const best = new Array(stars.length).fill(Infinity);
      const from = new Array(stars.length).fill(-1);
      best[0] = 0;
      for (let step = 0; step < stars.length; step += 1) {
        let u = -1;
        for (let i = 0; i < stars.length; i += 1) {
          if (!joined[i] && (u < 0 || best[i] < best[u])) u = i;
        }
        joined[u] = true;
        if (from[u] >= 0 && best[u] < gap * 2.4) edges.push([from[u], u]);
        for (let v = 0; v < stars.length; v += 1) {
          const d = Math.hypot(stars[u].x - stars[v].x, stars[u].y - stars[v].y);
          if (!joined[v] && d < best[v]) {
            best[v] = d;
            from[v] = u;
          }
        }
      }
    };

    const draw = (seconds) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.lineWidth = 1.3;
      for (const [i, j] of edges) {
        const strength = Math.min(stars[i].vis, stars[j].vis);
        if (strength < 0.03) continue;
        ctx.strokeStyle = `rgba(255,244,226,${(strength * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(stars[i].x, stars[i].y);
        ctx.lineTo(stars[j].x, stars[j].y);
        ctx.stroke();
      }

      for (const star of stars) {
        const rest = REST * Math.max(0, 1 - star.y / height) ** 1.5;
        const shimmer = 1 - 0.2 * star.vis * (0.5 + 0.5 * Math.sin(seconds * 1.7 + star.phase));
        const alpha = (rest + (1 - rest) * star.vis) * shimmer;
        if (alpha < 0.01) continue;
        const radius = star.size * (1 + 1.1 * star.vis);
        ctx.globalAlpha = alpha;
        ctx.drawImage(halo, star.x - radius * 3.6, star.y - radius * 3.6, radius * 7.2, radius * 7.2);
        if (star.size > 1.5 && star.vis > 0.3) {
          // A little cross on the brightest stars.
          const arm = radius * 3.2 * star.vis;
          ctx.strokeStyle = "rgba(255,246,230,0.8)";
          ctx.beginPath();
          ctx.moveTo(star.x - arm, star.y);
          ctx.lineTo(star.x + arm, star.y);
          ctx.moveTo(star.x, star.y - arm);
          ctx.lineTo(star.x, star.y + arm);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const active = isActive(now);
      const reach = clamp(width * 0.13, 150, 250);
      const rise = 1 - Math.exp(-dt / 0.14);
      const fall = 1 - Math.exp(-dt / 1.5); // stars fade slowly, so your path stays in the sky for a moment
      let busy = active;
      for (const star of stars) {
        const near = active ? 1 - Math.hypot(pointer.x - star.x, pointer.y - star.y) / reach : 0;
        const target = near > 0 ? near * near * (3 - 2 * near) : 0;
        star.vis += (target - star.vis) * (target > star.vis ? rise : fall);
        if (star.vis > 0.004) busy = true;
      }
      draw(now / 1000);
      raf = busy ? window.requestAnimationFrame(frame) : 0;
    };

    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = window.requestAnimationFrame(frame);
    };

    layout();
    draw(0);
    listeners.push(wake);

    let resizeTimer = 0;
    window.addEventListener(
      "resize",
      () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          layout();
          draw(performance.now() / 1000);
        }, 120);
      },
      { passive: true },
    );
  };

  rotateCaption();
  moveThePainting();
  bringThePaintingToLife();
  bringTheReaderToLife();
  fillSkyWithStars();
})();
