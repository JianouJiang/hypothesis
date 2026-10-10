"use strict";
// Original D2Q9 BGK solver. Half-way link bounce-back on the cylinder,
// periodic transverse boundaries, equilibrium inlet and zero-gradient outlet.
const cx = [0, 1, 0, -1, 0, 1, -1, -1, 1],
  cy = [0, 0, 1, 0, -1, 1, 1, -1, -1],
  opp = [0, 3, 4, 1, 2, 7, 8, 5, 6],
  weights = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
function cylinderWake(p, frameCount = 240) {
  const { nx, ny, speed, radius, centre, steps } = p,
    N = nx * ny,
    nu = (speed * 2 * radius) / p.reynolds,
    omega = 1 / (0.5 + 3 * nu),
    solid = new Uint8Array(N),
    ux = new Float64Array(N),
    uy = new Float64Array(N);
  let f = new Float64Array(N * 9),
    next = new Float64Array(N * 9);
  const neighbours = new Int32Array(N * 9);
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const j = x + y * nx;
      solid[j] =
        radius > 0 && Math.hypot(x - centre[0], y - centre[1]) <= radius;
      const v =
        p.perturbation *
        Math.exp(
          -(((x - centre[0] - 8) / 10) ** 2) - ((y - centre[1]) / 8) ** 2,
        );
      ux[j] = solid[j] ? 0 : speed;
      uy[j] = solid[j] ? 0 : v;
      for (let q = 0; q < 9; q++) {
        const k = j * 9 + q,
          u = cx[q] * ux[j] + cy[q] * uy[j];
        f[k] =
          weights[q] *
          (1 + 3 * u + 4.5 * u * u - 1.5 * (ux[j] ** 2 + uy[j] ** 2));
        const xx = x + cx[q],
          yy = (y + cy[q] + ny) % ny;
        neighbours[k] = xx < 0 || xx >= nx ? -1 : xx + yy * nx;
      }
    }
  let forceX = 0,
    forceY = 0,
    count = 0,
    totalMass = 0,
    maxSpeed = 0;
  const observe = (t) => {
    const field = [];
    totalMass = 0;
    maxSpeed = 0;
    for (let j = 0; j < N; j++) {
      if (solid[j]) {
        ux[j] = uy[j] = 0;
        continue;
      }
      let rho = 0,
        x = 0,
        y = 0;
      for (let q = 0; q < 9; q++) {
        const v = f[j * 9 + q];
        rho += v;
        x += cx[q] * v;
        y += cy[q] * v;
      }
      ux[j] = x / rho;
      uy[j] = y / rho;
      totalMass += rho;
      maxSpeed = Math.max(maxSpeed, Math.hypot(ux[j], uy[j]));
      if (!Number.isFinite(rho) || rho < 0.5 || rho > 1.5)
        throw new Error("Cylinder wake numerical stability check failed.");
    }
    for (let y = 0; y < ny; y += 2)
      for (let x = 0; x < nx; x += 2) {
        const j = x + y * nx,
          dx =
            (uy[Math.min(nx - 1, x + 1) + y * nx] -
              uy[Math.max(0, x - 1) + y * nx]) /
            2,
          dy =
            (ux[x + ((y + 1) % ny) * nx] - ux[x + ((y + ny - 1) % ny) * nx]) /
            2;
        field.push(solid[j] ? 0 : ((dx - dy) * (2 * radius)) / speed);
      }
    const factor = 0.5 * speed * speed * 2 * radius * Math.max(1, count),
      lift = radius ? forceY / factor : 0,
      drag = radius ? forceX / factor : 0;
    forceX = forceY = count = 0;
    return {
      t: (t * speed) / (2 * radius || 1),
      state: [lift, drag],
      value: lift,
      field,
      mass: totalMass,
      maxSpeed,
    };
  };
  const frames = [observe(0)];
  let step = 0;
  for (let frame = 1; frame <= frameCount; frame++) {
    const end = Math.round((frame * steps) / frameCount);
    while (step < end) {
      next.fill(0);
      for (let j = 0; j < N; j++) {
        if (solid[j]) continue;
        const base = j * 9;
        let rho = 0,
          x = 0,
          y = 0;
        for (let q = 0; q < 9; q++) {
          const v = f[base + q];
          rho += v;
          x += cx[q] * v;
          y += cy[q] * v;
        }
        x /= rho;
        y /= rho;
        const u2 = x * x + y * y;
        for (let q = 0; q < 9; q++) {
          const u = cx[q] * x + cy[q] * y,
            k = base + q,
            post =
              f[k] +
              omega *
                (weights[q] * rho * (1 + 3 * u + 4.5 * u * u - 1.5 * u2) -
                  f[k]),
            dest = neighbours[k];
          if (dest < 0) continue;
          if (solid[dest]) {
            next[base + opp[q]] = post;
            forceX += 2 * post * cx[q];
            forceY += 2 * post * cy[q];
          } else next[dest * 9 + q] = post;
        }
      }
      for (let y = 0; y < ny; y++)
        for (let q = 0; q < 9; q++) {
          const u = cx[q] * speed;
          next[y * nx * 9 + q] =
            weights[q] * (1 + 3 * u + 4.5 * u * u - 1.5 * speed * speed);
          next[(y * nx + nx - 1) * 9 + q] = next[(y * nx + nx - 2) * 9 + q];
        }
      const temp = f;
      f = next;
      next = temp;
      count++;
      step++;
    }
    frames.push(observe(step));
  }
  return {
    frames,
    viscosity: nu,
    tau: 1 / omega,
    fluidNodes: N - solid.reduce((a, b) => a + b, 0),
  };
}
module.exports = { cylinderWake };
