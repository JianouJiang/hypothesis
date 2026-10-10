"use strict";
// Gaussian wave packet on a finite 1D grid. Complex tridiagonal Crank–Nicolson.
function wavePacket(p, frameCount = 240) {
  const n = p.grid,
    dx = (p.xmax - p.xmin) / (n + 1),
    steps = Math.ceil(p.physicalDuration / p.maxStep / frameCount),
    dt = p.physicalDuration / frameCount / steps;
  const x = Array.from({ length: n }, (_, i) => p.xmin + (i + 1) * dx),
    re = new Float64Array(n),
    im = new Float64Array(n),
    invR = new Float64Array(n),
    invI = new Float64Array(n),
    cpR = new Float64Array(n),
    cpI = new Float64Array(n),
    diag = new Float64Array(n),
    dr = new Float64Array(n),
    di = new Float64Array(n);
  const k = dt / (4 * dx * dx);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.exp(-((x[i] - p.centre) ** 2) / (4 * p.sigma ** 2));
    re[i] = a * Math.cos(p.momentum * x[i]);
    im[i] = a * Math.sin(p.momentum * x[i]);
    norm += a * a * dx;
    diag[i] =
      (dt / 2) *
      (1 / (dx * dx) +
        (p.barrierHeight *
          Math.max(
            0,
            Math.min(x[i] + dx / 2, p.barrierWidth / 2) -
              Math.max(x[i] - dx / 2, -p.barrierWidth / 2),
          )) /
          dx);
    const aR = 1 - (i ? k * cpI[i - 1] : 0),
      aI = diag[i] + (i ? k * cpR[i - 1] : 0),
      den = aR * aR + aI * aI;
    invR[i] = aR / den;
    invI[i] = -aI / den;
    cpR[i] = k * invI[i];
    cpI[i] = -k * invR[i];
  }
  for (let i = 0; i < n; i++) {
    re[i] /= Math.sqrt(norm);
    im[i] /= Math.sqrt(norm);
  }
  const observe = (t) => {
    const field = Array.from(re, (r, i) => r * r + im[i] * im[i]);
    let left = 0,
      right = 0,
      inside = 0;
    field.forEach((v, i) => {
      const rightWidth = Math.max(
        0,
        Math.min(dx, x[i] + dx / 2 - p.barrierWidth / 2),
      );
      const leftWidth = Math.max(
        0,
        Math.min(dx, -p.barrierWidth / 2 - (x[i] - dx / 2)),
      );
      right += v * rightWidth;
      left += v * leftWidth;
      inside += v * (dx - rightWidth - leftWidth);
    });
    return { t, state: [left, inside, right], value: right * 100, field };
  };
  const frames = [observe(0)];
  for (let f = 1; f <= frameCount; f++) {
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < n; i++) {
        const br =
          re[i] +
          diag[i] * im[i] -
          k * ((i ? im[i - 1] : 0) + (i + 1 < n ? im[i + 1] : 0)) -
          (i ? k * di[i - 1] : 0);
        const bi =
          im[i] -
          diag[i] * re[i] +
          k * ((i ? re[i - 1] : 0) + (i + 1 < n ? re[i + 1] : 0)) +
          (i ? k * dr[i - 1] : 0);
        dr[i] = invR[i] * br - invI[i] * bi;
        di[i] = invR[i] * bi + invI[i] * br;
      }
      for (let i = n - 1; i >= 0; i--) {
        re[i] =
          dr[i] - (i + 1 < n ? cpR[i] * re[i + 1] - cpI[i] * im[i + 1] : 0);
        im[i] =
          di[i] - (i + 1 < n ? cpR[i] * im[i + 1] + cpI[i] * re[i + 1] : 0);
      }
    }
    frames.push(observe((f * p.physicalDuration) / frameCount));
  }
  return { frames, dx, x };
}
function glassIndex(wavelength) {
  const b = [1.03961212, 0.231792344, 1.01046945],
    c = [0.00600069867, 0.0200179144, 103.560653],
    u = wavelength * 1e6;
  let n2 = 1,
    derivative = 0;
  for (let i = 0; i < 3; i++) {
    n2 += (b[i] * u * u) / (u * u - c[i]);
    derivative -= (2 * b[i] * u * c[i]) / (u * u - c[i]) ** 2;
  }
  const phase = Math.sqrt(n2),
    group = phase - (u * derivative) / (2 * phase);
  return { phase, group };
}
function prismRay(wavelength, angle) {
  const indices = glassIndex(wavelength),
    entry = [-0.02, 0],
    normal = -Math.PI / 6,
    inside = normal + Math.asin(Math.sin(angle - normal) / indices.phase),
    direction = [Math.cos(inside), Math.sin(inside)];
  // Right face is x + y/sqrt(3) = .02. All configured rays transmit at this face.
  const length = 0.04 / (direction[0] + direction[1] / Math.sqrt(3)),
    exit = [entry[0] + length * direction[0], length * direction[1]],
    sin = indices.phase * Math.sin(inside - Math.PI / 6);
  if (Math.abs(sin) >= 1)
    throw new Error("Prism ray has total internal reflection.");
  const out = Math.PI / 6 + Math.asin(sin),
    start = [
      entry[0] - 0.05 * Math.cos(angle),
      entry[1] - 0.05 * Math.sin(angle),
    ],
    detector = [
      exit[0] + 0.045 * Math.cos(out),
      exit[1] + 0.045 * Math.sin(out),
    ];
  return {
    points: [start, entry, exit, detector],
    lengths: [0.05, length, 0.045],
    indices,
    insideAngle: inside,
    exitAngle: out,
  };
}
module.exports = { wavePacket, glassIndex, prismRay };
