/* Draw only observations supplied by the server. This file never chooses outcomes. */
(function () {
  "use strict";
  const palette = ["#f28e9b", "#79befe", "#79dcbd", "#e8c78f"];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  class HypothesisRenderer {
    constructor(canvas, chart) {
      this.canvas = canvas;
      this.chart = chart;
      this.ctx = canvas.getContext("2d");
      this.g = chart.getContext("2d");
      this.resize = () => {
        for (const el of [canvas, chart]) {
          const b = el.getBoundingClientRect(),
            dpr = Math.min(devicePixelRatio || 1, 2);
          el.width = Math.round(b.width * dpr);
          el.height = Math.round(b.height * dpr);
        }
        this.draw();
        this.graph();
      };
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(canvas);
      this.observer.observe(chart);
      let last = 0;
      const animate = (now) => {
        if (now - last > 32 && !document.hidden) {
          this.draw();
          last = now;
        }
        this.animation = requestAnimationFrame(animate);
      };
      this.animation = requestAnimationFrame(animate);
      window.addEventListener(
        "pagehide",
        () => {
          cancelAnimationFrame(this.animation);
          this.observer.disconnect();
        },
        { once: true },
      );
    }
    update(lab, def) {
      this.lab = lab;
      this.def = def;
      this.arrived = performance.now();
      this.graph();
    }
    text(text, x, y, color = "#91a9bd", size = 11, align = "left") {
      const c = this.ctx;
      c.save();
      c.font = `${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
      c.textAlign = align;
      c.fillStyle = color;
      c.fillText(text, x, y);
      c.restore();
    }
    line(points, color = "#91a9bd", width = 1, dash = []) {
      if (points.length < 2) return;
      const c = this.ctx;
      c.beginPath();
      c.setLineDash(dash);
      points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
      c.setLineDash([]);
    }
    dot(x, y, r, color, glow = false) {
      const c = this.ctx;
      c.save();
      if (glow) {
        c.shadowBlur = r * 3;
        c.shadowColor = color;
      }
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
      c.restore();
    }
    ring(x, y, r, color, width = 1) {
      const c = this.ctx;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    }
    arrow(x, y, dx, dy, color) {
      const a = Math.atan2(dy, dx),
        length = Math.hypot(dx, dy);
      if (length < 0.01) return;
      this.line(
        [
          [x, y],
          [x + dx, y + dy],
        ],
        color,
        2,
      );
      this.line(
        [
          [x + dx - 8 * Math.cos(a - 0.4), y + dy - 8 * Math.sin(a - 0.4)],
          [x + dx, y + dy],
          [x + dx - 8 * Math.cos(a + 0.4), y + dy - 8 * Math.sin(a + 0.4)],
        ],
        color,
        2,
      );
    }
    grid() {
      for (let x = 35; x < 700; x += 35)
        this.line(
          [
            [x, 55],
            [x, 350],
          ],
          "#ffffff06",
        );
      for (let y = 70; y <= 350; y += 35)
        this.line(
          [
            [28, y],
            [672, y],
          ],
          "#ffffff06",
        );
    }
    draw() {
      const c = this.ctx;
      c.setTransform(
        this.canvas.width / 700,
        0,
        0,
        this.canvas.height / 410,
        0,
        0,
      );
      const bg = c.createRadialGradient(350, 185, 10, 350, 185, 420);
      bg.addColorStop(0, "#192c3d");
      bg.addColorStop(1, "#0a131f");
      c.fillStyle = bg;
      c.fillRect(0, 0, 700, 410);
      this.grid();
      if (!this.lab) return;
      const l = this.lab,
        p = l.parameters,
        f = l.frame,
        prev = l.previous,
        blend = clamp((performance.now() - this.arrived) / 500, 0, 1);
      const discrete = [
        "diffusion",
        "random-walk",
        "monte-carlo",
        "heat",
        "collision",
      ].includes(l.kind);
      const s = discrete
          ? f.state
          : f.state.map((v, i) => prev.state[i] + (v - prev.state[i]) * blend),
        t = f.t,
        trail = l.trail;
      if (l.kind === "vortex") {
        const x0 = 55,
          y0 = 82,
          w = 590,
          h = 266,
          dx = w / p.fieldNx,
          dy = h / p.fieldNy;
        const texture = (this.wakeTexture ||= document.createElement("canvas"));
        texture.width = p.fieldNx;
        texture.height = p.fieldNy;
        const tc = texture.getContext("2d"),
          pixels = tc.createImageData(p.fieldNx, p.fieldNy);
        for (let j = 0; j < f.field.length; j++) {
          const v = clamp(f.field[j] / 1.2, -1, 1),
            strength = Math.abs(v),
            k =
              ((p.fieldNy - 1 - Math.floor(j / p.fieldNx)) * p.fieldNx +
                (j % p.fieldNx)) *
              4;
          pixels.data[k] = 23 + strength * (v >= 0 ? 219 : 58);
          pixels.data[k + 1] = 41 + strength * (v >= 0 ? 83 : 118);
          pixels.data[k + 2] = 56 + strength * (v >= 0 ? 66 : 180);
          pixels.data[k + 3] = 255;
        }
        tc.putImageData(pixels, 0, 0);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = "high";
        c.drawImage(texture, x0, y0, w, h);
        const x = x0 + (p.centre[0] / p.nx) * w,
          y = y0 + h - (p.centre[1] / p.ny) * h;
        this.dot(x, y, (p.radius / p.nx) * w, "#e0e8ed");
        this.ring(x, y, (p.radius / p.nx) * w + 2, "#b8c8d280");
        this.arrow(x, y, 0, -clamp(f.value * 100, -60, 60), "#ffffff");
        this.text(
          `Re ${p.reynolds.toFixed(1)} · τ ${p.relaxationTime.toFixed(5)}`,
          57,
          70,
          "#a6c6d5",
          11,
        );
        this.text(
          "Vorticity: blue − / coral +",
          641,
          70,
          "#a6c6d5",
          10,
          "right",
        );
        this.text(
          "Interpolated lattice field · 96 × 48 cells",
          57,
          364,
          "#809bac",
          10,
        );
        this.text(
          `Cᴸ ${f.value.toFixed(4)}   Cᴰ ${s[1].toFixed(4)}`,
          641,
          364,
          "#a6c6d5",
          11,
          "right",
        );
      } else if (l.kind === "tunneling") {
        const x0 = 50,
          w = 600,
          baseline = 297,
          map = (x) => x0 + ((x - p.xmin) / (p.xmax - p.xmin)) * w;
        c.fillStyle = "#e0bd8530";
        c.fillRect(
          map(-p.barrierWidth / 2),
          105,
          (p.barrierWidth / (p.xmax - p.xmin)) * w,
          baseline - 105,
        );
        this.line(
          [
            [map(-p.barrierWidth / 2), baseline],
            [map(-p.barrierWidth / 2), 105],
            [map(p.barrierWidth / 2), 105],
            [map(p.barrierWidth / 2), baseline],
          ],
          "#d1b484",
          1.5,
        );
        const pts = f.field.map((v, i) => [
          map(p.xmin + (i + 1) * p.dx),
          baseline - v * 690,
        ]);
        c.beginPath();
        c.moveTo(x0, baseline);
        pts.forEach((a) => c.lineTo(...a));
        c.lineTo(x0 + w, baseline);
        c.closePath();
        const gradient = c.createLinearGradient(50, 0, 650, 0);
        gradient.addColorStop(0, "#74b7ef25");
        gradient.addColorStop(0.49, "#74b7ef60");
        gradient.addColorStop(0.51, "#83d4bc60");
        gradient.addColorStop(1, "#83d4bc25");
        c.fillStyle = gradient;
        c.fill();
        this.line(pts, "#b1dbed", 2);
        this.line(
          [
            [50, baseline],
            [650, baseline],
          ],
          "#7290a677",
        );
        this.text(
          `LEFT ${(f.state[0] * 100).toFixed(1)}%`,
          180,
          328,
          "#85b9e3",
          12,
          "center",
        );
        this.text(
          `BEYOND ${(f.state[2] * 100).toFixed(1)}%`,
          520,
          328,
          "#86d8bc",
          12,
          "center",
        );
        this.text("|ψ|² · Position probability density", 40, 78, "#bdcfdc", 11);
        this.text(
          `V₀ ${p.barrierHeight.toFixed(3)} · E₀ ${(p.momentum ** 2 / 2).toFixed(3)}`,
          640,
          78,
          "#b8a78b",
          11,
          "right",
        );
        this.text(
          "One measurement at the deadline",
          350,
          357,
          "#8499ad",
          10,
          "center",
        );
      } else if (l.kind === "prism") {
        const map = (x, y) => [354 + x * 4200, 252 - y * 4200],
          colors = ["#f494a2", "#86e0b8", "#89bfff"];
        const vertices = p.vertices.map((a) => map(...a));
        c.beginPath();
        vertices.forEach((a, i) => (i ? c.lineTo(...a) : c.moveTo(...a)));
        c.closePath();
        c.fillStyle = "#a6cbef12";
        c.fill();
        c.strokeStyle = "#a8c8d399";
        c.lineWidth = 1.5;
        c.stroke();
        p.rays.forEach((ray, i) => {
          this.line(
            ray.points.map((a) => map(...a)),
            colors[i] + "60",
            1,
          );
          const at = map(s[i * 2], s[i * 2 + 1]);
          this.dot(...at, 3.5, colors[i], true);
          const end = map(...ray.points.at(-1));
          this.dot(...end, 2, colors[i]);
          this.text(
            `${["R", "G", "B"][i]} ${p.launchDelays[i].toFixed(2)} ps delay`,
            42,
            85 + i * 20,
            colors[i],
            10,
          );
          this.text(
            `${Math.round(s[6 + i] * 100)}%`,
            631,
            315 + i * 15,
            colors[i],
            10,
            "right",
          );
        });
        this.text("N-BK7", 354, 240, "#8caabd", 12, "center");
        this.text("650 / 530 / 450 nm", 354, 355, "#8caabd", 10, "center");
      } else if (l.kind === "convection") {
        const map = (a) => [80 + (a[1] + 25) * 5, 330 - a[3] * 5];
        this.line(trail.map(map), "#76dcca", 1.8);
        const q = map([t, ...s]);
        this.dot(...q, 5, "#b2fff1", true);
        this.text("LORENZ PHASE PORTRAIT", 60, 72);
        this.text("X →", 270, 350);
        this.text("Z ↑", 46, 98);
        const cx = 526,
          cy = 215,
          phase =
            trail.reduce(
              (sum, a, i) => sum + (i ? (a[0] - trail[i - 1][0]) * a[1] : 0),
              0,
            ) * 0.12;
        c.strokeStyle = "#3d7080";
        c.lineWidth = 2;
        c.strokeRect(425, 113, 202, 204);
        const hot = c.createLinearGradient(0, 115, 0, 315);
        hot.addColorStop(0, "#4e8bc020");
        hot.addColorStop(1, "#e9906625");
        c.fillStyle = hot;
        c.fillRect(426, 114, 200, 202);
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2 + phase;
          this.dot(
            cx + 76 * Math.cos(a),
            cy + 73 * Math.sin(a),
            2.3,
            i % 2 ? "#f6b79a" : "#80c9f8",
          );
        }
        this.text(
          s[0] >= 0 ? "CLOCKWISE" : "COUNTERCLOCKWISE",
          cx,
          216,
          "#cfebe9",
          12,
          "center",
        );
        this.text("Single-mode illustration", cx, 339, "#728a9e", 10, "center");
      } else if (l.kind === "magnetic-pendulum") {
        const map = (x, y) => [350 + x * 87, 220 - y * 87];
        p.magnets.forEach(([x, y], i) => {
          const a = map(x, y);
          this.ring(...a, 33, palette[i] + "30", 1);
          this.ring(...a, 20, palette[i] + "55", 2);
          this.dot(...a, 11, palette[i], true);
          this.text(
            ["RED", "BLUE", "GREEN"][i],
            a[0],
            a[1] + 42,
            palette[i],
            10,
            "center",
          );
        });
        this.line(
          trail.map((a) => map(a[1], a[2])),
          "#d0dff977",
          1.4,
        );
        this.line([[350, 220], map(...s)], "#bcd2e34d", 1, [4, 5]);
        this.dot(...map(...s), 8, "#ffffff", true);
        this.text(`x ${s[0].toFixed(3)} m`, 42, 85);
        this.text(`y ${s[1].toFixed(3)} m`, 42, 104);
        this.text("TOP VIEW", 558, 85);
      } else if (l.kind === "double-pendulum") {
        const scale = 142 / (p.l1 + p.l2),
          ox = 350,
          oy = 207;
        const points = (a) => {
          const x = ox + scale * p.l1 * Math.sin(a[0]),
            y = oy + scale * p.l1 * Math.cos(a[0]);
          return [
            [ox, oy],
            [x, y],
            [
              x + scale * p.l2 * Math.sin(a[1]),
              y + scale * p.l2 * Math.cos(a[1]),
            ],
          ];
        };
        this.line(
          trail.slice(-100).map((a) => points(a.slice(1))[2]),
          "#eaaa9966",
          1.7,
        );
        const pos = points(s);
        this.line(pos, "#a2b7c8", 4);
        this.dot(ox, oy, 5, "#72859a");
        this.dot(...pos[1], 9, "#80c9f8", true);
        this.dot(...pos[2], 11, "#f8ac97", true);
        this.text(`θ₁ ${s[0].toFixed(3)} rad`, 42, 82);
        this.text(`θ₂ ${s[1].toFixed(3)} rad`, 42, 102);
        this.text("Unwrapped angles", 42, 124, "#657d92", 10);
      } else if (l.kind === "heat") {
        const n = p.grid,
          size = 260 / n,
          x0 = 220,
          y0 = 78;
        for (let j = 0; j < n * n; j++) {
          const v =
            (f.field[j] - p.initialTemperature) /
            (p.boundary - p.initialTemperature);
          c.fillStyle = `hsl(${215 - v * 195} 74% ${35 + v * 25}%)`;
          c.fillRect(
            x0 + (j % n) * size,
            y0 + Math.floor(j / n) * size,
            size + 0.5,
            size + 0.5,
          );
        }
        const middle = [x0 + 130, y0 + 130];
        this.ring(...middle, 9, "#ffffffb0", 1.5);
        this.line(
          [
            [middle[0] - 15, middle[1]],
            [middle[0] + 15, middle[1]],
          ],
          "white",
        );
        this.line(
          [
            [middle[0], middle[1] - 15],
            [middle[0], middle[1] + 15],
          ],
          "white",
        );
        this.text(
          `${p.boundary.toFixed(1)}°C edges`,
          350,
          68,
          "#f4c293",
          11,
          "center",
        );
        this.text("0.10 m × 0.10 m", 350, 358, "#a2b8c9", 11, "center");
        for (let i = 0; i < 100; i++) {
          c.fillStyle = `hsl(${215 - i * 1.95} 74% ${35 + i * 0.25}%)`;
          c.fillRect(540, 327 - i * 2.4, 12, 3);
        }
        this.text(`${p.boundary.toFixed(0)}°C`, 563, 91);
        this.text("20°C", 563, 330);
      } else if (l.kind === "charge") {
        const scale = Math.min(
            65,
            125 / Math.max(1.8, ...trail.map((a) => Math.abs(a[2]))),
          ),
          map = (x, y) => [350 + (x - 2.7) * scale, 220 - y * scale],
          target = map(...p.target);
        for (let x = 90; x < 660; x += 46)
          for (let y = 90; y < 335; y += 46) {
            if (p.magneticField >= 0) this.dot(x, y, 1.3, "#7fa1bd38");
            else {
              this.line(
                [
                  [x - 2, y - 2],
                  [x + 2, y + 2],
                ],
                "#7fa1bd38",
              );
              this.line(
                [
                  [x - 2, y + 2],
                  [x + 2, y - 2],
                ],
                "#7fa1bd38",
              );
            }
          }
        this.ring(...target, p.targetRadius * scale, "#76dcc18c", 2);
        this.text("TARGET", ...target, "#79d3bc", 11, "center");
        this.line(
          trail.map((a) => map(a[1], a[2])),
          "#85c9ff",
          2,
        );
        this.dot(...map(s[0], s[1]), 6, "#c7ecff", true);
        this.arrow(...map(s[0], s[1]), s[2] * 24, -s[3] * 24, "#f3cc8b");
        this.text(`Bz ${p.magneticField.toFixed(4)} T`, 38, 72);
        this.text(`Ey ${p.electricField.toFixed(4)} V/m`, 38, 90);
        this.text("x → · y ↑", 546, 343);
      } else if (l.kind === "orbit") {
        const cx = (s[0] + s[4] + s[8]) / 3,
          cy = (s[1] + s[5] + s[9]) / 3,
          r = Math.max(
            2,
            ...[0, 1, 2].map((i) =>
              Math.hypot(s[i * 4] - cx, s[i * 4 + 1] - cy),
            ),
          ),
          scale = 135 / r,
          map = (x, y) => [350 + (x - cx) * scale, 214 - (y - cy) * scale];
        [0, 1, 2].forEach((i) => {
          this.line(
            trail.slice(-160).map((a) => map(a[i * 4 + 1], a[i * 4 + 2])),
            palette[i] + "80",
            1.5,
          );
          this.dot(...map(s[i * 4], s[i * 4 + 1]), 7, palette[i], true);
        });
        this.line(
          [
            [343, 214],
            [357, 214],
          ],
          "#96adc75a",
        );
        this.line(
          [
            [350, 207],
            [350, 221],
          ],
          "#96adc75a",
        );
        this.text(`Scale: ${r.toFixed(2)} units / radius`, 40, 78);
        this.text("Centre-of-mass view", 40, 98, "#768fa6", 10);
      } else if (l.kind === "beam") {
        const base = 165,
          tip = 350,
          mag = 5,
          scale = 530 / p.length;
        c.fillStyle = "#6c7e92";
        c.fillRect(79, 135, 17, 125);
        for (let y = 137; y < 260; y += 12)
          this.line(
            [
              [64, y + 10],
              [78, y],
            ],
            "#7c8e9e",
            2,
          );
        const shape = [];
        for (let i = 0; i <= 80; i++) {
          const u = i / 80;
          shape.push([
            96 + u * 530,
            base + (s[0] * scale * mag * u * u * (3 - u)) / 2,
          ]);
        }
        this.line(shape, "#9ac3cf", 8);
        this.line(shape, "#d5edf0", 2);
        const end = shape.at(-1);
        this.arrow(end[0], end[1] - 55, 0, 40, "#e8bd82");
        this.line(
          [
            [96, base + 0.01 * scale * mag],
            [648, base + 0.01 * scale * mag],
          ],
          "#c5cddd55",
          1,
          [6, 5],
        );
        this.text(
          "10 mm threshold",
          632,
          base + 0.01 * scale * mag - 9,
          "#91a9bd",
          10,
          "right",
        );
        this.text(`Tip ${(s[0] * 1000).toFixed(3)} mm`, 40, 82, "#c4e4e7", 12);
        this.text("Deflection displayed ×5", 40, 103, "#71899e", 10);
        this.text(
          `${p.force.toFixed(3)} N force scale`,
          525,
          333,
          "#b5cddd",
          10,
          "right",
        );
      } else if (l.kind === "piston") {
        const left = 100,
          right = left + s[0] * 3100,
          top = 124,
          h = 162;
        c.fillStyle = "#567e9824";
        c.fillRect(left, top, right - left, h);
        this.line(
          [
            [635, top],
            [left, top],
            [left, top + h],
            [635, top + h],
          ],
          "#829eb2",
          3,
        );
        for (let i = 0; i < 46; i++) {
          const u = 0.5 + 0.47 * Math.sin(i * 26.718 + t * (1 + (i % 3)) * 0.6),
            v = 0.5 + 0.44 * Math.cos(i * 7.351 + t * (0.5 + (i % 4)) * 0.45);
          this.dot(
            left + 8 + u * (right - left - 16),
            top + 8 + v * (h - 16),
            2.4,
            "#efb38c",
          );
        }
        c.fillStyle = "#bdcbd7";
        c.fillRect(right - 5, top - 5, 13, h + 10);
        this.line(
          [
            [right + 8, 205],
            [663, 205],
          ],
          "#8b9aab",
          4,
        );
        this.line(
          [
            [472, 104],
            [472, 307],
          ],
          "#b6dbc7",
          1,
          [5, 5],
        );
        this.text("0.120 m", 472, 330, "#a5c8b5", 11, "center");
        this.text(`${s[2].toFixed(2)} K`, 130, 107, "#f0c49e", 13);
        this.text(`Heater ${p.heaterPower.toFixed(2)} W`, 130, 314);
        this.text("Dots illustrate temperature", 41, 354, "#637e94", 10);
      } else if (l.kind === "interference") {
        const y = 268,
          left = 76,
          width = 548;
        for (let i = 0; i < width; i += 2) {
          const x = (i / width - 0.5) * 0.014,
            r1 = Math.hypot(x + p.sourceSeparation / 2, p.screenDistance),
            r2 = Math.hypot(x - p.sourceSeparation / 2, p.screenDistance),
            intensity =
              (1 + Math.cos((2 * Math.PI * (r1 - r2)) / p.wavelength + s[0])) /
              2;
          c.fillStyle = `rgba(118,203,247,${0.06 + 0.94 * intensity})`;
          c.fillRect(left + i, y, 2, 44);
        }
        [256, 444].forEach((x, k) => {
          this.dot(x, 100, 5, palette[k ? 2 : 1], true);
          c.save();
          c.beginPath();
          c.rect(45, 105, 610, 148);
          c.clip();
          for (let j = 0; j < 8; j++) {
            c.beginPath();
            c.arc(
              x,
              100,
              (((j * 32 + t * 22 + (k ? s[0] * 9 : 0)) % 256) + 256) % 256,
              0,
              Math.PI,
            );
            c.strokeStyle = "#91d3ee35";
            c.lineWidth = 1;
            c.stroke();
          }
          c.restore();
        });
        const detector = left + (p.detectorX / 0.014 + 0.5) * width;
        this.line(
          [
            [detector, y - 10],
            [detector, y + 53],
          ],
          "#ffd39a",
          2,
        );
        this.text("DETECTOR", detector, y + 73, "#eecda3", 10, "center");
        this.text(
          `${(p.wavelength * 1e9).toFixed(1)} nm · phase ${s[0].toFixed(2)} rad`,
          350,
          75,
          "#93bdd6",
          11,
          "center",
        );
        this.text(
          "Source schematic · Calculated screen intensity",
          350,
          365,
          "#6e8b9f",
          10,
          "center",
        );
      } else if (l.kind === "diffusion") {
        const size = 250,
          x0 = 225,
          y0 = 84;
        c.fillStyle = "#304c6428";
        c.fillRect(x0, y0, size / 2, size);
        c.strokeStyle = "#6d94aa";
        c.lineWidth = 1.5;
        c.strokeRect(x0, y0, size, size);
        this.line(
          [
            [350, y0],
            [350, y0 + size],
          ],
          "#a5bed35a",
          1,
          [5, 5],
        );
        for (let i = 0; i < s.length; i += 2)
          this.dot(
            x0 + ((s[i] + 1) * size) / 2,
            y0 + ((1 - s[i + 1]) * size) / 2,
            2.6,
            s[i] < 0 ? "#94dcdd" : "#f0c394",
          );
        this.text(`${f.value} LEFT`, 287, 360, "#99d7d8", 12, "center");
        this.text(
          `${p.count - f.value} RIGHT`,
          413,
          360,
          "#ddbd9b",
          12,
          "center",
        );
        this.text(`D ${p.diffusivity.toFixed(4)} m²/s`, 38, 78);
      } else if (l.kind === "random-walk") {
        const range =
            Math.max(
              p.targetRadius,
              ...trail.flatMap((a) => [Math.abs(a[1]), Math.abs(a[2])]),
            ) + 2,
          scale = Math.min(130 / range, 18),
          map = (x, y) => [350 + x * scale, 216 - y * scale];
        for (let x = -range; x <= range; x++)
          for (let y = -range; y <= range; y++)
            this.dot(...map(x, y), 0.7, "#bad6ed26");
        this.ring(350, 216, p.targetRadius * scale, "#edc48380", 1.5);
        this.dot(350, 216, 3, "#edc483");
        this.line(
          trail.map((a) => map(a[1], a[2])),
          "#76c6cc",
          2,
        );
        this.dot(...map(...s), 5, "#cafff9", true);
        this.text(`STEP ${f.t} / ${p.steps}`, 38, 78);
        this.text(`(x, y) = (${s[0]}, ${s[1]})`, 38, 98, "#bce2e1", 12);
        this.text("Finish within the gold target", 38, 348, "#7d91a4", 10);
      } else if (l.kind === "induction") {
        const cx = 380,
          cy = 220,
          z = s[1],
          mx = cx + z * 240;
        this.line(
          [
            [75, cy],
            [642, cy],
          ],
          "#506e83",
          1,
          [5, 6],
        );
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.ellipse(cx + i * 8, cy, 26, 78, 0, 0, Math.PI * 2);
          c.strokeStyle = "#d8ad7b";
          c.lineWidth = 2;
          c.stroke();
        }
        c.fillStyle = "#bd7889";
        c.fillRect(mx - 38, cy - 17, 38, 34);
        c.fillStyle = "#628fb7";
        c.fillRect(mx, cy - 17, 38, 34);
        this.text("N", mx - 19, cy + 4, "#fff", 12, "center");
        this.text("S", mx + 19, cy + 4, "#fff", 12, "center");
        this.arrow(mx - 24, cy - 45, 48, 0, "#a6c5d8");
        this.arrow(
          cx + 74,
          cy + 24,
          0,
          -48 * Math.sign(s[0] || 1),
          s[0] > 0.005 ? "#8de3bf" : "#d5b598",
        );
        this.text("+ I ↑", cx + 113, cy + 5, "#8de3bf", 11, "center");
        this.text(`EMF ${s[2].toFixed(4)} V`, 40, 80);
        this.text(
          `Coil ${(s[0] * 1000).toFixed(3)} mA`,
          40,
          100,
          "#c4e4df",
          12,
        );
        this.text(`z = ${z.toFixed(4)} m`, 350, 338, "#a8bbcc", 11, "center");
      } else if (l.kind === "collision") {
        const map = (x) => 350 + x * 105;
        this.line(
          [
            [70, 260],
            [630, 260],
          ],
          "#6d8599",
          2,
        );
        this.line(
          [
            [350, 112],
            [350, 269],
          ],
          "#c5d4e421",
          1,
          [5, 5],
        );
        [0, 1].forEach((i) => {
          const x = map(s[i]),
            radius = 19;
          this.dot(x, 239, radius, palette[i], true);
          this.arrow(x, 200, clamp(s[i + 2] * 50, -70, 70), 0, palette[i]);
          this.text(
            `${(i ? p.m2 : p.m1).toFixed(3)} kg`,
            x,
            297,
            palette[i],
            11,
            "center",
          );
          this.text(
            `${s[i + 2].toFixed(3)} m/s`,
            x,
            318,
            "#a2b8c9",
            11,
            "center",
          );
        });
        this.text(
          f.collided ? "POST-IMPACT" : "APPROACHING IMPACT",
          350,
          83,
          "#c7d8e9",
          12,
          "center",
        );
        this.text(
          `Restitution ${p.restitution.toFixed(4)}`,
          350,
          357,
          "#6e8c9f",
          11,
          "center",
        );
      } else if (l.kind === "monte-carlo") {
        const size = 258,
          x0 = 221,
          y0 = 83;
        c.strokeStyle = "#658da8";
        c.lineWidth = 1;
        c.strokeRect(x0, y0, size, size);
        this.ring(350, 212, 129, "#91c3c899", 1.5);
        for (const [x, y] of l.points || [])
          this.dot(
            350 + x * 129,
            212 - y * 129,
            1.7,
            x * x + y * y <= 1 ? "#85d7c7aa" : "#dda59daa",
          );
        this.text(`${f.state[1]} / 1600`, 38, 79);
        this.text(`${f.state[0]} inside`, 38, 100, "#a3d5cb", 11);
        this.text("4 × inside / total", 350, 363, "#96b9c2", 11, "center");
      }
    }
    graph() {
      if (!this.lab) return;
      const c = this.g,
        el = this.chart,
        w = el.getBoundingClientRect().width,
        h = 112;
      if (!w) return;
      c.setTransform(el.width / w, 0, 0, el.height / h, 0, 0);
      c.clearRect(0, 0, w, h);
      const history = this.lab.history.filter(
        (a) =>
          Number.isFinite(a[1]) &&
          !(this.lab.kind === "monte-carlo" && a[0] === 0),
      );
      const values = history.map((a) => a[1]),
        threshold = this.def.threshold;
      if (Number.isFinite(threshold)) values.push(threshold);
      let lo = Math.min(...values),
        hi = Math.max(...values);
      if (!values.length) {
        lo = 0;
        hi = 1;
      }
      const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.03, 0.01);
      lo -= pad;
      hi += pad;
      const x = (t) =>
          45 + (t / this.lab.parameters.physicalDuration) * (w - 57),
        y = (v) => 12 + ((hi - v) / (hi - lo)) * 76;
      c.font = "10px ui-monospace,monospace";
      c.fillStyle = "#7e91a0";
      c.fillText(hi.toFixed(Math.abs(hi) < 0.1 ? 3 : 1), 0, 15);
      c.fillText(lo.toFixed(Math.abs(lo) < 0.1 ? 3 : 1), 0, 89);
      c.fillText("0", 45, 106);
      c.textAlign = "right";
      c.fillText(
        `${this.lab.parameters.physicalDuration.toFixed(1)} ${this.lab.parameters.timeUnit || "s"}`,
        w - 6,
        106,
      );
      c.textAlign = "left";
      if (Number.isFinite(threshold)) {
        c.beginPath();
        c.setLineDash([5, 4]);
        c.moveTo(45, y(threshold));
        c.lineTo(w - 10, y(threshold));
        c.strokeStyle = "#bca680";
        c.lineWidth = 1;
        c.stroke();
        c.setLineDash([]);
      }
      c.beginPath();
      history.forEach(([t, v], i) =>
        i ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)),
      );
      c.strokeStyle = "#3c9c97";
      c.lineWidth = 2;
      c.stroke();
      if (history.length) {
        const [t, v] = history.at(-1);
        c.beginPath();
        c.arc(x(t), y(v), 3, 0, Math.PI * 2);
        c.fillStyle = "#3c9c97";
        c.fill();
      }
    }
  }
  window.HypothesisRenderer = HypothesisRenderer;
})();
