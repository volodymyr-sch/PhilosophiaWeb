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

  // ---- Home: he reads. Letters of the quote rise from his scroll to his eyes,
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

  rotateCaption();
  bringTheReaderToLife();
})();
