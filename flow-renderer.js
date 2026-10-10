/* Experimental dust photography: particles advect in the observed CFD field.
   Inspired by particle-field techniques in mapbox/webgl-wind (ISC); original renderer. */
(function () {
  "use strict";
  class FlowRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.trails = document.createElement("canvas");
      this.ink = this.trails.getContext("2d");
      this.dust = true;
      this.exposure = true;
      this.particles = [];
      this.last = 0;
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
    resize() {
      const b = this.canvas.getBoundingClientRect();
      this.w = b.width;
      this.h = b.height;
      this.dpr = Math.min(2, devicePixelRatio || 1);
      for (const c of [this.canvas, this.trails]) {
        c.width = Math.round(this.w * this.dpr);
        c.height = Math.round(this.h * this.dpr);
        c.getContext("2d").setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      this.particles = [];
    }
    xy(x, y) {
      return [
        24 + ((x + 3) / 9) * (this.w - 58),
        this.h / 2 - (y * (this.h - 100)) / 3.9,
      ];
    }
    update(snapshot, params) {
      this.params = params;
      if (!snapshot) return;
      if (this.snapshot?.round.id !== snapshot.round.id) {
        this.particles = [];
        this.ink.clearRect(0, 0, this.w, this.h);
        this.previous = snapshot.flow.particle;
      } else this.previous = this.shown || snapshot.flow.particle;
      this.snapshot = snapshot;
      this.received = performance.now();
    }
    inside(x, y) {
      if (
        x < -0.05 ||
        x > 1.05 ||
        y < -0.4 ||
        y > 0.25 ||
        !this.params?.geometry
      )
        return false;
      let inside = false;
      const p = this.params.geometry;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++)
        if (
          p[i][1] > y !== p[j][1] > y &&
          x <
            ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) +
              p[i][0]
        )
          inside = !inside;
      return inside;
    }
    velocity(x, y) {
      const f = this.snapshot.flow,
        g = f.grid,
        a = ((x - g.xmin) / (g.xmax - g.xmin)) * (g.nx - 1),
        b = ((y - g.ymin) / (g.ymax - g.ymin)) * (g.ny - 1);
      if (a < 0 || b < 0 || a >= g.nx - 1 || b >= g.ny - 1) return null;
      const i = Math.floor(a),
        j = Math.floor(b),
        u = a - i,
        v = b - j,
        k = (j * g.nx + i) * 2,
        uv = [0, 0];
      for (let c = 0; c < 2; c++)
        uv[c] =
          (f.field[k + c] * (1 - u) * (1 - v) +
            f.field[k + 2 + c] * u * (1 - v) +
            f.field[k + g.nx * 2 + c] * (1 - u) * v +
            f.field[k + g.nx * 2 + 2 + c] * u * v) /
          g.scale;
      return uv;
    }
    spawn(fill) {
      let x, y;
      do {
        x = fill ? -3 + Math.random() * 9 : -2.98;
        y = (Math.random() - 0.5) * 3.75;
      } while (this.inside(x, y));
      return {
        x,
        y,
        age: Math.random() * 20,
        life: 35 + Math.random() * 60,
        alpha: 0.18 + Math.random() * 0.57,
        r: 0.35 + Math.random() * 0.5,
      };
    }
    render(now) {
      const c = this.ctx,
        w = this.w,
        h = this.h,
        dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      c.clearRect(0, 0, w, h);
      c.fillStyle = "#05090d";
      c.fillRect(0, 0, w, h);
      const light = c.createRadialGradient(
        w * 0.44,
        h * 0.5,
        1,
        w * 0.5,
        h * 0.5,
        w * 0.6,
      );
      light.addColorStop(0, "#112128");
      light.addColorStop(0.5, "#0b151b");
      light.addColorStop(1, "#05090d");
      c.fillStyle = light;
      c.fillRect(0, 0, w, h);
      // A grazing light sheet, as in a seeded wind-tunnel photograph.
      const sheet = c.createLinearGradient(0, 0, 0, h);
      sheet.addColorStop(0, "#96e5ee00");
      sheet.addColorStop(0.33, "#96e5ee03");
      sheet.addColorStop(0.5, "#c3f8f509");
      sheet.addColorStop(0.68, "#96e5ee03");
      sheet.addColorStop(1, "#96e5ee00");
      c.fillStyle = sheet;
      c.fillRect(0, 0, w, h);
      if (!this.snapshot) return;
      const s = this.snapshot,
        f = s.flow,
        k = this.ink;
      if (this.dust) {
        const count = w < 500 ? 1100 : 2600;
        while (this.particles.length < count)
          this.particles.push(this.spawn(true));
        k.globalCompositeOperation = "destination-out";
        k.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / (this.exposure ? 2.5 : 0.26))})`;
        k.fillRect(0, 0, w, h);
        k.globalCompositeOperation = "source-over";
        const step =
          now - this.received < 10000
            ? dt / (f.model.timeScale * f.model.replaySecondsPerPhysicalSecond)
            : 0;
        for (let i = 0; i < this.particles.length; i++) {
          let p = this.particles[i];
          p.age += dt;
          const v = this.velocity(p.x, p.y);
          if (
            !v ||
            p.x > 5.99 ||
            Math.abs(p.y) > 1.94 ||
            p.age > p.life ||
            this.inside(p.x, p.y)
          ) {
            this.particles[i] = this.spawn(p.age > p.life);
            continue;
          }
          const mid =
            this.velocity(p.x + v[0] * step * 0.5, p.y + v[1] * step * 0.5) ||
            v;
          const x = p.x + mid[0] * step,
            y = p.y + mid[1] * step;
          if (this.inside(x, y)) {
            this.particles[i] = this.spawn(false);
            continue;
          }
          const a = this.xy(p.x, p.y),
            b = this.xy(x, y),
            brightness = p.alpha * (0.7 + 0.3 * Math.cos(p.y * 0.8));
          k.strokeStyle = `rgba(183,224,224,${brightness})`;
          k.lineWidth = p.r;
          k.beginPath();
          k.moveTo(...a);
          k.lineTo(...b);
          k.stroke();
          c.fillStyle = `rgba(214,241,235,${brightness})`;
          c.fillRect(b[0], b[1], p.r + 0.3, p.r + 0.3);
          p.x = x;
          p.y = y;
        }
        c.drawImage(this.trails, 0, 0, w, h);
      }
      if (this.params?.geometry) {
        const geometry = this.params.geometry;
        c.save();
        c.shadowColor = "#000";
        c.shadowBlur = 14;
        c.shadowOffsetY = 5;
        c.beginPath();
        geometry.forEach((p, i) =>
          i ? c.lineTo(...this.xy(...p)) : c.moveTo(...this.xy(...p)),
        );
        c.closePath();
        const metal = c.createLinearGradient(
          ...this.xy(0, 0.18),
          ...this.xy(0, -0.4),
        );
        metal.addColorStop(0, "#fbfffa");
        metal.addColorStop(0.15, "#b5c6c9");
        metal.addColorStop(0.4, "#536975");
        metal.addColorStop(0.52, "#d0d9d5");
        metal.addColorStop(0.59, "#7b8b8d");
        metal.addColorStop(1, "#233c49");
        c.fillStyle = metal;
        c.fill();
        c.shadowBlur = 0;
        c.shadowOffsetY = 0;
        c.lineWidth = 0.8;
        c.strokeStyle = "#d2e6e7a0";
        c.stroke();
        c.restore();
      }
      const outlet = this.xy(6, 0)[0],
        target = this.xy(6, s.round.opening);
      c.lineWidth = 0.7;
      c.strokeStyle = "#91a8b13d";
      c.beginPath();
      c.moveTo(outlet, 45);
      c.lineTo(outlet, h - 42);
      c.stroke();
      c.setLineDash([4, 6]);
      c.strokeStyle = "#b7c5cc9c";
      c.beginPath();
      c.moveTo(24, target[1]);
      c.lineTo(outlet, target[1]);
      c.stroke();
      c.setLineDash([]);
      c.font = "9px system-ui";
      c.textAlign = "right";
      c.fillStyle = "#b9c6ce";
      c.fillText("PREVIOUS EXIT", outlet - 8, target[1] - 9);
      c.fillStyle = "#c5d9df";
      c.beginPath();
      c.arc(...target, 2.3, 0, Math.PI * 2);
      c.fill();
      const t = Math.min(1, (now - this.received) / 950);
      this.shown = f.particle.map((v, i) => this.previous[i] * (1 - t) + v * t);
      const p = this.xy(...this.shown);
      const history = f.points.slice(-17);
      c.beginPath();
      history.forEach((q, i) =>
        i ? c.lineTo(...this.xy(...q)) : c.moveTo(...this.xy(...q)),
      );
      c.lineTo(...p);
      c.lineWidth = 1.25;
      c.strokeStyle = "#eecb8980";
      c.stroke();
      c.strokeStyle = "#ffd39070";
      c.lineWidth = 0.65;
      c.beginPath();
      c.moveTo(24, p[1]);
      c.lineTo(outlet, p[1]);
      c.stroke();
      const aura = c.createRadialGradient(...p, 0, ...p, 19);
      aura.addColorStop(0, "#ffe7a2a0");
      aura.addColorStop(0.3, "#ffd47e25");
      aura.addColorStop(1, "#ffd47e00");
      c.fillStyle = aura;
      c.fillRect(p[0] - 19, p[1] - 19, 38, 38);
      c.fillStyle = "#fff2c9";
      c.beginPath();
      c.arc(...p, 3, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#ffe0a180";
      c.beginPath();
      c.arc(...p, 6, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#82979e";
      c.font = "8px system-ui";
      c.textAlign = "left";
      c.fillText("AIRFLOW  →", 24, h - 42);
      c.textAlign = "right";
      c.fillText("EXIT PLANE", outlet, h - 42);
    }
  }
  window.FlowRenderer = FlowRenderer;
})();
