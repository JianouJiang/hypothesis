/* Public experiment specifications. Simulation seeds and future states stay on the server. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HypothesisExperiments = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const definitions = {
    convection: {
      title: "Which way will the convection roll turn?",
      short: "Convection modes",
      subject: "fluid",
      model: "Lorenz-63 · three-mode convection",
      outcomes: ["Clockwise", "Counterclockwise"],
      metric: "Circulation amplitude X",
      unit: "",
      threshold: 0,
      rule: "At dimensionless time 30, X ≥ 0 resolves Clockwise; X < 0 resolves Counterclockwise. The roll drawing reconstructs a single circulation mode, not a resolved CFD velocity field.",
      equations: "dX/dt = σ(Y−X); dY/dt = X(ρ−Z)−Y; dZ/dt = XY−βZ.",
      assumptions:
        "Three-mode truncation of buoyant convection; dimensionless time and amplitudes. It demonstrates sensitive dependence, not a fully resolved 2D fluid simulation.",
      source:
        "https://docs.dart.ucar.edu/en/v11.7.1/guide/lorenz-63-model.html",
    },
    "magnetic-pendulum": {
      title: "Which magnet will the pendulum finish nearest?",
      short: "Magnetic pendulum",
      subject: "solid",
      model: "Damped planar pendulum · three softened attractors",
      outcomes: ["Red magnet", "Blue magnet", "Green magnet"],
      metric: "Speed",
      unit: "m/s",
      rule: "At 60 physical seconds, the magnet nearest the bob resolves Yes; the other two resolve No. This is a finite-time proximity test, not a claim that the bob has fully stopped. An exact distance tie uses Red, then Blue, then Green.",
      equations: "r″ = −γr′ − κr + Σ μᵢ(aᵢ−r) / (|aᵢ−r|²+h²)^(3/2).",
      assumptions:
        "Mass-normalized point-attractor approximation with linear gravity/restoring force and viscous damping; not a full magnetic dipole model.",
      source: "https://math.hmc.edu/jacobsen/demolab/magnetic-pendulum-2/",
    },
    "double-pendulum": {
      title: "Will the lower arm finish a full turn from its release?",
      short: "Double pendulum",
      subject: "solid",
      model: "Nonlinear two-link mechanics · RK4",
      outcomes: ["Yes", "No"],
      metric: "Net lower-arm rotation",
      unit: "turns",
      threshold: 1,
      rule: "At 12 physical seconds, Yes wins if the absolute unwrapped lower-arm angle change from release is at least 2π. A turn that is later unwound does not count at the deadline. Equality resolves Yes.",
      equations:
        "M(θ) θ″ = f(θ,θ′); exact coupled point-mass equations, integrated at Δt ≤ 0.002 s.",
      assumptions:
        "Massless rigid rods, point masses, uniform gravity, no friction. Angles are measured from downward vertical and remain unwrapped.",
      source: "https://rotations.berkeley.edu/the-double-pendulum/",
    },
    heat: {
      title: "Will the plate centre reach 50°C?",
      short: "Heat diffusion",
      subject: "thermo",
      model: "2D heat equation · separated Fourier solution",
      outcomes: ["Yes", "No"],
      metric: "Centre temperature",
      unit: "°C",
      threshold: 50,
      rule: "At 180 physical seconds, centre temperature ≥ 50°C resolves Yes. Lower temperatures resolve No.",
      equations:
        "∂T/∂t = α∇²T. T = Tb + (T₀−Tb)F(x,t)F(y,t), with a sine-series Dirichlet solution.",
      assumptions:
        "Homogeneous square plate, fixed temperature on all four edges, constant diffusivity, no internal heat source. The displayed field uses 39 odd Fourier modes per axis.",
      source:
        "https://mude.citg.tudelft.nl/book/2025/numerical_methods_for_PDEs/diffusion_equation.html",
    },
    charge: {
      title: "Will the charged particle finish inside the target?",
      short: "Charged particle",
      subject: "electro",
      model: "Uniform-field Lorentz force · exact propagation",
      outcomes: ["Yes", "No"],
      metric: "Distance to target centre",
      unit: "m",
      threshold: 1.4,
      comparison: "below",
      rule: "At 6 physical seconds, the particle centre must be within 1.4 m of (5 m, 0 m). The circular boundary counts as a hit. Earlier passes through the target do not count.",
      equations:
        "r′ = v; v′ = (q/m)(E + v × B). Uniform fields allow an exact analytic solution.",
      assumptions:
        "Nonrelativistic motion in the xy plane; E points along y, B along z. No radiation, collisions, or field feedback.",
      source:
        "https://openstax.org/books/university-physics-volume-2/pages/11-3-motion-of-a-charged-particle-in-a-magnetic-field",
    },
    orbit: {
      title: "Will the three-body system avoid an escape?",
      short: "Three-body problem",
      subject: "astro",
      model: "Softened Newtonian gravity · velocity Verlet",
      outcomes: ["Yes", "No"],
      metric: "Largest distance from centre of mass",
      unit: "",
      threshold: 6,
      comparison: "below",
      rule: "At dimensionless time 12, No wins if a body is over 6 length units from the total centre of mass, moving outwards relative to the other two, and has positive specific escape energy relative to them. Otherwise Yes wins. This is a finite-time diagnostic, not proof of permanent binding.",
      equations: "rᵢ″ = Σⱼ mⱼ(rⱼ−rᵢ)/(|rⱼ−rᵢ|²+ε²)^(3/2), with G = 1.",
      assumptions:
        "Three equal point masses, dimensionless units, Plummer softening ε = 0.04 to regularize close encounters; perturbed figure-eight initial conditions.",
      source: "https://arxiv.org/abs/math/0011268",
    },
    beam: {
      title: "Will the beam tip finish beyond 10 mm?",
      short: "Bending beam",
      subject: "solid",
      model: "Euler–Bernoulli first-mode approximation",
      outcomes: ["Yes", "No"],
      metric: "Tip deflection",
      unit: "mm",
      threshold: 10,
      rule: "At 8 physical seconds, downward tip deflection ≥ 10 mm resolves Yes. Transient earlier crossings do not determine settlement.",
      equations:
        "m_eff q″ + c q′ + (3EI/L³)q = F(t); m_eff = 0.236ρAL; I = bh³/12; F(t) = F₀(1−e^(−3t))[1+0.5sin(Ωt)].",
      assumptions:
        "Small-deflection slender cantilever with one bending degree of freedom. Mode shape follows the static tip-load shape; this is not a full finite-element model.",
      source:
        "https://engcourses-uofa.ca/books/introduction-to-solid-mechanics/plane-beam-approximations/visualization-tools/",
    },
    piston: {
      title: "Will the piston finish beyond the marked line?",
      short: "Gas and piston",
      subject: "thermo",
      model: "Ideal gas + spring-loaded piston · coupled ODE",
      outcomes: ["Yes", "No"],
      metric: "Piston position",
      unit: "m",
      threshold: 0.12,
      rule: "At 10 physical seconds, piston position ≥ 0.12 m resolves Yes. Lower positions resolve No.",
      equations: "p=nRT/(Ax); Mx″=A(p−pext)−k(x−x₀)−bx′; nCvT′=Q−pAx′−H(T−T₀).",
      assumptions:
        "Uniform ideal gas, horizontal piston, external spring/damper and a constant-power heater. Frictional heat leaves the gas; moving dots are a temperature illustration, not molecular dynamics.",
      source:
        "https://openstax.org/books/university-physics-volume-2/pages/3-3-first-law-of-thermodynamics",
    },
    interference: {
      title: "Will the detector finish on a bright fringe?",
      short: "Wave interference",
      subject: "optics",
      model: "Coherent double-source interference",
      outcomes: ["Yes", "No"],
      metric: "Normalized detector intensity",
      unit: "",
      threshold: 0.6,
      rule: "At 6 physical seconds, normalized intensity ≥ 0.6 resolves Yes. Both paths and the time-varying relative source phase enter the calculation.",
      equations: "I/Imax = [1 + cos(2π(r₁−r₂)/λ + φ₀ + Ωt)]/2.",
      assumptions:
        "Equal coherent scalar sources, equal amplitudes at the screen, no polarization or finite-aperture diffraction envelope. Source spacing is exaggerated in the schematic.",
      source:
        "https://openstax.org/books/university-physics-volume-3/pages/3-2-mathematics-of-interference",
    },
    diffusion: {
      title: "Will more particles finish on the left?",
      short: "Particle diffusion",
      subject: "fluid",
      model: "Reflecting Brownian particles · Euler–Maruyama",
      outcomes: ["Yes", "No"],
      metric: "Particles in the left half",
      unit: " / 120",
      threshold: 60,
      rule: "At 20 physical seconds, Yes wins only if more than 60 of 120 particle centres have x < 0. A 60–60 tie resolves No. Walls reflect; particles do not interact.",
      equations:
        "dr = √(2D) dW, reflected at x,y = ±1 m. Integration step: 0.04 s.",
      assumptions:
        "Independent overdamped tracers in a square box; no fluid advection or inter-particle forces. Future noise is generated privately; only initial conditions and elapsed samples are public.",
      source: "https://webhomes.maths.ed.ac.uk/~dhigham/algfiles.html",
    },
    "random-walk": {
      title: "Will the walk finish inside the target circle?",
      short: "Random walk",
      subject: "maths",
      model: "Unbiased 2D square-lattice random walk",
      outcomes: ["Yes", "No"],
      metric: "Distance from origin",
      unit: "steps",
      threshold: 10,
      comparison: "below",
      rule: "After exactly 120 steps, Yes wins if the endpoint is within 10 lattice units of the origin, including the circular boundary. Earlier visits do not count. Each independent step chooses one of the four cardinal directions with probability 1/4.",
      equations:
        "rₙ₊₁ = rₙ + eₙ; eₙ ∈ {(1,0),(−1,0),(0,1),(0,−1)} with equal probability.",
      assumptions:
        "An unbounded integer lattice with independent server-generated steps. Coordinates and all elapsed steps are public; future draws remain private.",
      source: "https://mathworld.wolfram.com/RandomWalk2-Dimensional.html",
    },
    induction: {
      title: "Will the induced current finish positive?",
      short: "Magnetic induction",
      subject: "electro",
      model: "Axial point dipole + RL coil",
      outcomes: ["Yes", "No"],
      metric: "Coil current",
      unit: "A",
      threshold: 0.005,
      rule: "At 6 physical seconds, current greater than +0.005 A resolves Yes; values at or below the tolerance resolve No. The sign convention is the arrow on the coil.",
      equations:
        "Λ = NC/(a²+z²)^(3/2); emf = −dΛ/dt; L I′ + RI = emf. Prescribed magnet motion: z = z₀ + vt.",
      assumptions:
        "Point-dipole flux approximation for a circular coil. An external driver prescribes magnet motion; circuit inductance delays current relative to emf.",
      source:
        "https://openstax.org/books/university-physics-volume-2/pages/13-1-faradays-law",
    },
    collision: {
      title: "Will the red ball move right after impact?",
      short: "Elastic collision",
      subject: "solid",
      model: "1D hard-sphere collision · momentum + restitution",
      outcomes: ["Yes", "No"],
      metric: "Red-ball horizontal velocity",
      unit: "m/s",
      threshold: 0,
      rule: "After the single collision, strictly positive red-ball velocity resolves Yes. Zero or negative velocity resolves No. No walls or second impacts occur.",
      equations:
        "v₁ = [m₁u₁+m₂u₂−m₂e(u₁−u₂)]/(m₁+m₂); v₂ = [m₁u₁+m₂u₂+m₁e(u₁−u₂)]/(m₁+m₂).",
      assumptions:
        "Two rigid spheres constrained to one dimension. The round uses the displayed masses, velocities, radii, and restitution; no spin or friction.",
      source:
        "https://openstax.org/books/university-physics-volume-1/pages/9-4-types-of-collisions",
    },
    "monte-carlo": {
      title: "Will the estimate of π finish above 3.14?",
      short: "Estimating π",
      subject: "maths",
      model: "Monte Carlo integration · 1,600 uniform points",
      outcomes: ["Yes", "No"],
      metric: "Estimate of π",
      unit: "",
      threshold: 3.14,
      rule: "After 1,600 points, π̂ = 4×(points with x²+y² ≤ 1)/1600. Strictly above 3.14 resolves Yes; equality or lower resolves No.",
      equations:
        "π̂ₙ = 4Ninside/n, with (x,y) independent uniform draws in [−1,1]².",
      assumptions:
        "Independent private random draws; points on the unit circle count inside. The current estimate is an observation, not the final result.",
      source:
        "https://ocw.mit.edu/courses/2-086-numerical-computation-for-mechanical-engineers-fall-2014/30d8b5da0c8e6ad44987b3563bc32dab_MIT2_086F14_Monte_Carlo.pdf",
    },
  };
  Object.assign(definitions, {
    vortex: {
      title: "Will the cylinder’s lift finish upwards?",
      short: "Cylinder wake",
      subject: "fluid",
      model: "D2Q9 lattice Boltzmann · resolved 2D wake",
      outcomes: ["Yes", "No"],
      metric: "Lift coefficient",
      unit: "",
      threshold: 0,
      rule: "At the two-minute deadline (3,600 lattice steps), the mean vertical cylinder force over the last 15 lattice steps determines settlement. Positive lift resolves Yes; zero or negative resolves No. Positive y is upwards.",
      equations:
        "fᵢ(x+cᵢ,t+1) = fᵢ − (fᵢ−fᵢᵉᵠ)/τ; ν=(τ−½)/3. Lift is the momentum transferred by half-way bounce-back links.",
      assumptions:
        "Coarse 96×48 D2Q9 BGK fluid model, 8-cell cylinder diameter, periodic top/bottom, equilibrium inlet and zero-gradient outlet. A published initial transverse perturbation breaks symmetry. This is an educational low-Mach lattice simulation, not an OpenFOAM or mesh-converged engineering prediction.",
      source: "https://www.openlb.net/cylinder/",
    },
    prism: {
      title: "Which colour pulse will reach its detector first?",
      short: "Prism dispersion",
      subject: "optics",
      model: "N-BK7 prism · Snell refraction + group delay",
      outcomes: ["Red pulse", "Green pulse", "Blue pulse"],
      metric: "Leading pulse progress",
      unit: "%",
      rule: "Three pulses follow their refracted paths to separate detectors. The pulse with the earliest arrival, including its published launch delay and air/glass travel times, resolves Yes. Other colours resolve No. Exact ties use Red, then Green, then Blue. Settlement is at the round deadline.",
      equations:
        "n²(λ)=1+Σ Bᵢλ²/(λ²−Cᵢ); n₁sinθ₁=n₂sinθ₂; n_g=n−λdn/dλ; transit time = Σ n_gℓ/c.",
      assumptions:
        "Equilateral N-BK7 prism using SCHOTT Sellmeier coefficients. Narrowband pulse envelopes follow geometric rays with group velocity c/n_g inside glass and c in air. No reflections, absorption, diffraction, or pulse spreading. Different public launch delays make all three outcomes possible. Geometry uses metres; the experiment clock and delays use picoseconds.",
      source:
        "https://media.schott.com/api/public/content/41e799d0bf874807a0bb8e702fbb75b5?v=54856406",
    },
    tunneling: {
      title: "Will the wave packet be detected beyond the barrier?",
      short: "Quantum tunnelling",
      subject: "quantum",
      model: "1D Schrödinger equation · Crank–Nicolson",
      outcomes: ["Yes", "No"],
      metric: "Probability beyond barrier",
      unit: "%",
      rule: "At dimensionless time 16, one position-region measurement is sampled using the integrated Born probability to the right of the barrier. Yes wins if that measurement is beyond the barrier; No includes the left side and barrier. The density curve is a probability distribution, not a hidden classical particle path.",
      equations:
        "i∂ψ/∂t = [−½∂²/∂x² + V(x)]ψ, with ħ=m=1. ψ₀ ∝ exp[−(x−x₀)²/(4σ²)+ik₀x]. Crank–Nicolson uses a complex tridiagonal solve.",
      assumptions:
        "Finite 1,024-point grid on [−40,40], zero-value end boundaries, cell-averaged square barrier and Δt ≤ 0.01. The initial packet is normalized and evolves unitarily; finite grid/time errors remain. The final measurement draw stays private. All lengths, energies, and times are dimensionless.",
      source:
        "https://roesner.pages.ub.uni-bielefeld.de/lectures/computational-physics/semester/sose2026/lecture/08_pde/04_operator_splitting.html",
    },
  });
  const stateVariables = {
    vortex: [
      "uniform ux (lattice units)",
      "Gaussian uy perturbation amplitude (lattice units)",
    ],
    prism: [
      "launch delay red (ps)",
      "launch delay green (ps)",
      "launch delay blue (ps)",
    ],
    tunneling: [
      "packet centre x₀",
      "position standard deviation σ",
      "central wave number k₀",
    ],
    convection: ["X", "Y", "Z"],
    "magnetic-pendulum": ["x (m)", "y (m)", "vx (m/s)", "vy (m/s)"],
    "double-pendulum": [
      "theta1 (rad from downward vertical)",
      "theta2 (rad from downward vertical)",
      "omega1 (rad/s)",
      "omega2 (rad/s)",
    ],
    heat: ["centre temperature (°C)"],
    charge: ["x (m)", "y (m)", "vx (m/s)", "vy (m/s)"],
    orbit: [
      "x1",
      "y1",
      "vx1",
      "vy1",
      "x2",
      "y2",
      "vx2",
      "vy2",
      "x3",
      "y3",
      "vx3",
      "vy3",
    ],
    beam: ["tip displacement (m, positive down)", "tip velocity (m/s)"],
    piston: ["position (m)", "velocity (m/s)", "gas temperature (K)"],
    interference: ["relative phase (rad)"],
    diffusion: ["x1 (m)", "y1 (m)", "x2 (m)", "y2 (m)", "… through x120,y120"],
    "random-walk": ["x (steps)", "y (steps)"],
    induction: ["coil current (A)"],
    collision: ["x1 (m)", "x2 (m)", "v1 (m/s)", "v2 (m/s)"],
    "monte-carlo": ["points inside circle", "total points"],
  };
  for (const [id, def] of Object.entries(definitions)) {
    def.stateVariables = stateVariables[id];
    def.units =
      "SI units unless labelled otherwise; angles in radians. Lorenz, gravity, and quantum experiments use dimensionless units. Cylinder-wake parameters use lattice units and its observation clock uses D/U.";
  }
  const ids = Object.keys(definitions);
  const parse = (id) => {
    const [game, index] = String(id || "").split(":");
    return definitions[game]
      ? { game, index: Number(index) || 0, definition: definitions[game] }
      : null;
  };
  const contractIds = ids.flatMap((id) =>
    definitions[id].outcomes.length > 2
      ? definitions[id].outcomes.map((_, i) => `${id}:${i}`)
      : [id],
  );
  const label = (id, side) => {
    const item = parse(id);
    if (!item) return null;
    return item.definition.outcomes.length > 2
      ? `${item.definition.outcomes[item.index]} · ${side === "up" ? "Yes" : "No"}`
      : item.definition.outcomes[side === "up" ? 0 : 1];
  };
  const link = (id, side) => {
    const p = parse(id);
    return p
      ? `experiment.html?game=${p.game}${p.definition.outcomes.length > 2 ? "&outcome=" + p.index : ""}${side ? "&side=" + side : ""}`
      : null;
  };
  return { definitions, ids, parse, contractIds, label, link };
});
