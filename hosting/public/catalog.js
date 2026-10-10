/* Science catalog: only entries marked live have executable markets. */
(function () {
  "use strict";
  const subjects = [
    {
      id: "fluid",
      name: "Fluid Dynamics",
      color: "#4284e5",
      description: "Follow the flow. Predict the unexpected.",
    },
    {
      id: "solid",
      name: "Solid Mechanics",
      color: "#a87854",
      description: "Motion, collisions, and a little beautiful chaos.",
    },
    {
      id: "thermo",
      name: "Thermodynamics",
      color: "#e78c52",
      description: "Heat moves. What happens next?",
    },
    {
      id: "electro",
      name: "Electromagnetism",
      color: "#9a73c8",
      description: "Small charges. Surprising trajectories.",
    },
    {
      id: "optics",
      name: "Optics",
      color: "#5bacb1",
      description: "See where the light takes you.",
    },
    {
      id: "quantum",
      name: "Quantum Physics",
      color: "#807ed0",
      description: "A playground for probabilities.",
    },
    {
      id: "astro",
      name: "Astrophysics",
      color: "#62799d",
      description: "Big questions in small simulations.",
    },
    {
      id: "maths",
      name: "Maths & Statistics",
      color: "#c39b44",
      description: "Find the pattern. Test your intuition.",
    },
  ];
  const markets = [
    {
      id: "bitcoin",
      title: "Bitcoin Up or Down",
      short: "Bitcoin",
      subject: "maths",
      topic: "Bitcoin",
      art: "bitcoin",
      live: true,
      duration: "5 min",
      chance: 50,
      description:
        "The original five-minute Bitcoin market, with simulated prices and live gold trading.",
    },
    {
      id: "aerofoil",
      title: "Will the dust exit above the previous particle?",
      short: "Flow over an aerofoil",
      subject: "fluid",
      topic: "Aerofoils",
      art: "aerofoil",
      chance: 50,
      live: true,
      isNew: true,
      featured: true,
      duration: "~2 min",
      description:
        "A tilted NACA 0012. A separated wake. Follow real OpenFOAM flow and predict the dust particle’s exit height.",
      rule: "Above wins when the particle exits at or above the previous particle’s exit height. Below wins otherwise. Each round ends at the outlet, usually around two minutes.",
      outcomes: ["Above previous exit", "Below previous exit"],
    },
    {
      id: "galton",
      title: "Where will the ball land on the Galton board?",
      short: "The Galton board",
      subject: "solid",
      topic: "Galton board",
      art: "galton",
      featured: true,
      duration: "30 sec",
      description:
        "A ball meets a field of pegs. Predict its final bin before the first bounce.",
      rule: "The planned market settles on the group of bins containing the ball once it comes to rest. Bin boundaries and the release position will be visible before the round.",
      choices: [
        { label: "Left bins", chance: 24 },
        { label: "Center bins", chance: 52 },
        { label: "Right bins", chance: 24 },
      ],
    },
    {
      id: "convection",
      title: "Which way will the convection roll turn?",
      short: "2D convection",
      subject: "fluid",
      topic: "Convection",
      art: "convection",
      featured: true,
      isNew: true,
      duration: "~2 min",
      chance: 57,
      description:
        "Heat from below. Cooling from above. A tiny disturbance could decide which way the fluid starts to circulate.",
      rule: "The planned outcome is the direction of the dominant convection roll at the specified observation time. The geometry and temperature boundaries will be announced with the game.",
      outcomes: ["Clockwise", "Counterclockwise"],
    },
    {
      id: "magnetic-pendulum",
      title: "Which magnet will capture the pendulum?",
      short: "Magnetic pendulum",
      subject: "solid",
      topic: "Chaos",
      art: "magnets",
      featured: true,
      duration: "60 sec",
      description:
        "Three magnets. One pendulum. A tiny change in its starting point can lead to a very different ending.",
      rule: "The planned market resolves to the magnet nearest the pendulum bob after it comes to rest. The magnets, initial position, and release conditions will be visible.",
      choices: [
        { label: "Red magnet", chance: 38, color: "#df686e" },
        { label: "Blue magnet", chance: 35, color: "#5988da" },
        { label: "Green magnet", chance: 27, color: "#59a889" },
      ],
    },
    {
      id: "vortex",
      title: "Will a vortex shed above the cylinder first?",
      short: "Vortex shedding",
      subject: "fluid",
      topic: "Vortices",
      art: "vortex",
      chance: 54,
      duration: "45 sec",
      description:
        "Watch an incoming flow meet a cylinder and predict where the first detached vortex forms.",
      rule: "The planned Yes outcome is a first detected vortex above the cylinder centerline. The detection rule and flow parameters will be defined before launch.",
    },
    {
      id: "double-pendulum",
      title: "Will the double pendulum make a full turn?",
      short: "Double pendulum",
      subject: "solid",
      topic: "Chaos",
      art: "pendulum",
      chance: 43,
      isNew: true,
      duration: "30 sec",
      description:
        "Two linked pendulums turn a simple release into a difficult forecast. Will the lower arm complete a rotation?",
      rule: "The planned Yes outcome requires the lower arm to complete a full rotation during the observation window. Release angles will be visible before trading.",
    },
    {
      id: "heat",
      title: "Will the center reach 50°C before time runs out?",
      short: "Heat diffusion",
      subject: "thermo",
      topic: "Heat transfer",
      art: "heat",
      chance: 71,
      duration: "~2 min",
      description:
        "A warm boundary heats a cool plate. Predict whether its center crosses the target temperature in time.",
      rule: "The planned market compares the center temperature against the displayed target at the deadline. Plate properties, starting temperature, and boundary conditions will be public.",
    },
    {
      id: "prism",
      title: "Which color reaches the detector first?",
      short: "Through the prism",
      subject: "optics",
      topic: "Light",
      art: "prism",
      duration: "30 sec",
      description:
        "Send a pulse of light through a dispersive prism and predict the first color to arrive at the detector.",
      rule: "The planned market records the first detected wavelength band. Material and path-length assumptions will be specified before the game launches.",
      choices: [
        { label: "Red", chance: 41, color: "#df686e" },
        { label: "Green", chance: 34, color: "#59a889" },
        { label: "Blue", chance: 25, color: "#5988da" },
      ],
    },
    {
      id: "charge",
      title: "Will the charged particle hit the target?",
      short: "Charged particle",
      subject: "electro",
      topic: "Magnetism",
      art: "charge",
      chance: 64,
      duration: "30 sec",
      description:
        "Electric and magnetic fields bend a particle's path. Predict whether it will land inside the target.",
      rule: "The planned Yes outcome occurs when the particle intersects the target region. Field strengths, charge, and launch velocity will be shown for each round.",
    },
    {
      id: "orbit",
      title: "Will the three-body system stay bound?",
      short: "Three-body problem",
      subject: "astro",
      topic: "Orbits",
      art: "orbit",
      chance: 36,
      duration: "~2 min",
      description:
        "Three bodies tug on one another. Predict whether they stay together or one escapes.",
      rule: "The planned market uses a published escape criterion at a fixed simulation time. Initial positions, masses, and velocities will be visible before trading.",
    },
    {
      id: "beam",
      title: "Will the beam deflect more than 10 mm?",
      short: "Bending beam",
      subject: "solid",
      topic: "Elasticity",
      art: "beam",
      chance: 68,
      duration: "60 sec",
      description:
        "A flexible beam carries a changing load. Predict whether its tip passes the marked deflection threshold.",
      rule: "The planned market measures the largest tip displacement during the round against the displayed threshold. Material and loading parameters will be announced.",
    },
    {
      id: "tunneling",
      title: "Will the particle tunnel through the barrier?",
      short: "Quantum tunneling",
      subject: "quantum",
      topic: "Quantum",
      art: "quantum",
      chance: 28,
      isNew: true,
      duration: "30 sec",
      description:
        "A wave packet approaches a barrier. Predict the measured side after the interaction.",
      rule: "The planned market resolves from a sampled position measurement after the wave packet interacts with the barrier. The state and sampling rule will be published before play.",
    },
    {
      id: "piston",
      title: "Will the gas push the piston past the line?",
      short: "Gas and piston",
      subject: "thermo",
      topic: "Heat transfer",
      art: "piston",
      chance: 59,
      duration: "60 sec",
      description:
        "Heat a chamber of gas and predict how far its piston will move.",
      rule: "The planned Yes outcome requires the piston to cross the marked position before the deadline. Gas, mass, and temperature conditions will be visible.",
    },
    {
      id: "interference",
      title: "Will the detector sit on a bright fringe?",
      short: "Wave interference",
      subject: "optics",
      topic: "Light",
      art: "waves",
      chance: 52,
      duration: "30 sec",
      description:
        "Two sources create a pattern of peaks and cancellations. Predict the intensity at a chosen detector.",
      rule: "The planned Yes outcome means detector intensity exceeds a stated threshold. Source geometry, phase, and the threshold will be visible before the round.",
    },
    {
      id: "diffusion",
      title: "Will more particles finish on the left?",
      short: "Particle diffusion",
      subject: "fluid",
      topic: "Particles",
      art: "diffusion",
      chance: 49,
      duration: "60 sec",
      description:
        "Particles wander through a box. Will the final count favor the left half?",
      rule: "The planned market counts particle centers on each side at the deadline. Initial positions, boundaries, and tie handling will be announced before launch.",
    },
    {
      id: "random-walk",
      title: "Will the random walk return to the origin?",
      short: "Random walk",
      subject: "maths",
      topic: "Probability",
      art: "walk",
      chance: 32,
      duration: "30 sec",
      description:
        "A sequence of random steps draws a path. Predict whether it revisits its starting point.",
      rule: "The planned Yes outcome is at least one return after the first step within a fixed number of steps. The lattice and step distribution will be specified.",
    },
    {
      id: "induction",
      title: "Will the induced current reverse direction?",
      short: "Magnetic induction",
      subject: "electro",
      topic: "Magnetism",
      art: "induction",
      chance: 76,
      duration: "45 sec",
      description:
        "A magnet passes through a coil. Predict whether the measured current changes sign in the observation window.",
      rule: "The planned market detects a sign change beyond a stated tolerance. Magnet motion, coil geometry, and measurement timing will be provided.",
    },
    {
      id: "collision",
      title: "Will the red ball keep moving to the right?",
      short: "Elastic collision",
      subject: "solid",
      topic: "Collisions",
      art: "collision",
      chance: 45,
      duration: "30 sec",
      description:
        "Two balls collide. Predict the direction of the red ball after impact.",
      rule: "The planned Yes outcome is positive horizontal velocity for the red ball after the collision. Masses, velocities, and restitution will be displayed.",
    },
    {
      id: "monte-carlo",
      title: "Will the estimate of π land above 3.14?",
      short: "Estimating π",
      subject: "maths",
      topic: "Probability",
      art: "monte",
      chance: 53,
      duration: "60 sec",
      description:
        "Random points fill a square. Predict which side of 3.14 the final Monte Carlo estimate will land on.",
      rule: "The planned market compares the final estimate to 3.14 after a fixed sample count. The estimator, count, and tie handling will be visible.",
    },
  ];

  let artCounter = 0;
  const svg = (kind, large = false) => {
    const id = `science-art-${++artCounter}`;
    let content = "";
    const circle = (x, y, r, color, extra = "") =>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${extra}/>`;
    const line = (x1, y1, x2, y2, color, width = 1, extra = "") =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
    const path = (d, color, width = 2, extra = "") =>
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
    let bg = "#f5f8fc";
    if (kind === "aerofoil" || kind === "vortex") {
      bg = "#f1f7fd";
      for (let i = 0; i < 10; i++) {
        const y = 18 + i * 28;
        const bend =
          (y < 143 ? -1 : 1) * Math.max(0, 60 - Math.abs(y - 140) * 0.42);
        content += path(
          `M-20 ${y} C75 ${y},108 ${y + bend},170 ${y + bend} S335 ${y},460 ${y}`,
          i === 4 ? "#5596f5" : "#a9c9ef",
          i === 4 ? 2.4 : 1.1,
        );
      }
      if (kind === "aerofoil") {
        content += `<path d="M115 150 C139 102 227 112 350 147 C251 154 164 175 115 150Z" fill="#ffffff" stroke="#647991" stroke-width="2"/>`;
        content += path("M127 148Q213 126 335 147", "#c1cedd", 1);
        content +=
          circle(64, 129, 12, "#f2b56b", 'opacity=".18"') +
          circle(64, 129, 5, "#e8a244");
        content +=
          circle(313, 119, 3, "#83b0e7") + circle(380, 211, 3, "#83b0e7");
        if (large)
          content += `<text x="24" y="263" fill="#819bb8" font-family="Inter, sans-serif" font-size="10">PARTICLE TRAJECTORY</text><text x="354" y="263" fill="#a8b9cc" font-family="Inter, sans-serif" font-size="9">Flow →</text>`;
      } else {
        content += circle(140, 143, 30, "#879bb4");
        for (let i = 0; i < 4; i++)
          content += path(
            `M${190 + i * 57} ${120 + (i % 2) * 53} c-24 -28 40 -36 32 -5 c-5 20 -36 20 -32 2`,
            i % 2 ? "#e7a6a3" : "#70a2e0",
            2,
          );
      }
    } else if (kind === "galton") {
      bg = "#fcf8ef";
      content += `<path d="M196 10v25l-117 185h282L244 35V10" fill="#f7f0df" stroke="#c7b78d" stroke-width="2"/>`;
      for (let row = 0; row < 7; row++)
        for (let col = 0; col <= row; col++)
          content += circle(
            220 - row * 17 + col * 34,
            49 + row * 24,
            3.8,
            "#b7a583",
          );
      content += path(
        "M220 18v25l-17 24 17 24-17 24 17 24 17 24-17 24 17 24",
        "#de9e41",
        2.3,
        'stroke-dasharray="4 5"',
      );
      content += circle(220, 91, 7, "#e5a14b");
      const bars = [10, 22, 36, 53, 70, 53, 36, 22, 10];
      bars.forEach((h, i) => {
        content += `<rect x="${91 + i * 29}" y="${269 - h * 0.55}" width="23" height="${h * 0.55}" rx="3" fill="${i === 4 ? "#dba14e" : "#e9d7ad"}"/>`;
      });
    } else if (kind === "convection") {
      bg = "#f7f6f8";
      content += `<rect x="45" y="35" width="350" height="208" rx="5" fill="url(#${id}-thermal)" opacity=".45"/><path d="M45 35h350" stroke="#7babd5" stroke-width="8"/><path d="M45 243h350" stroke="#e19b87" stroke-width="8"/>`;
      for (let i = 0; i < 3; i++) {
        const x = 105 + i * 112;
        content += path(
          `M${x} 73c-72 0 -66 143 0 138s66-132 0-138`,
          i % 2 ? "#84afd1" : "#dba097",
          2.5,
        );
        content += `<path d="m${x - 5} 69 10 4-8 7" fill="none" stroke="${i % 2 ? "#84afd1" : "#dba097"}" stroke-width="2.5"/>`;
      }
      for (let i = 0; i < 28; i++)
        content += circle(
          60 + ((i * 73) % 320),
          57 + ((i * 37) % 165),
          2.1,
          i % 2 ? "#dca09e" : "#8bb2cf",
          'opacity=".6"',
        );
    } else if (kind === "magnets") {
      bg = "#f7f5fa";
      content += `<ellipse cx="220" cy="166" rx="169" ry="83" fill="#efedf5" stroke="#e0ddea"/>`;
      content += path(
        "M200 140C290 68 377 141 259 189S107 251 126 154S316 174 235 119",
        "#c4b8d7",
        1.5,
        'stroke-dasharray="4 5"',
      );
      [
        [139, 192, "#df8790"],
        [220, 126, "#76a0d7"],
        [306, 192, "#7db49e"],
      ].forEach(([x, y, c]) => {
        content += `<ellipse cx="${x}" cy="${y + 5}" rx="19" ry="11" fill="${c}"/><ellipse cx="${x}" cy="${y}" rx="19" ry="10" fill="${c}" stroke="#ffffff" stroke-width="2"/>`;
      });
      content +=
        line(220, 20, 254, 151, "#748299", 2.5) +
        circle(220, 20, 5, "#67758c") +
        circle(254, 151, 12, "#e8c578", 'stroke="#fff" stroke-width="3"');
    } else if (kind === "pendulum" || kind === "beam" || kind === "collision") {
      bg = "#f6f3f0";
      if (kind === "beam") {
        content += `<rect x="67" y="55" width="19" height="170" rx="3" fill="#a0a3a4"/><path d="M86 118Q254 114 373 179" fill="none" stroke="#bd956f" stroke-width="14"/>`;
        content +=
          path("M100 118h280", "#c8c9c7", 1.5, 'stroke-dasharray="5 5"') +
          path("M314 47v77m-8-8 8 8 8-8", "#b27f56", 3);
      } else if (kind === "collision") {
        content +=
          line(45, 209, 395, 209, "#ccc7c2", 2) +
          circle(167, 156, 51, "#d98987") +
          circle(293, 170, 37, "#7d9dbc");
        content +=
          path("M52 156h47m-10-8 10 8-10 8", "#d98987", 4) +
          path("M382 170h-35m10-8-10 8 10 8", "#7d9dbc", 4);
      } else {
        content += path(
          "M83 139C175 41 389 246 258 245S116 115 174 111",
          "#e6c2a4",
          1.5,
          'stroke-dasharray="4 5"',
        );
        content +=
          line(204, 32, 292, 133, "#8c827d", 5) +
          line(292, 133, 159, 205, "#8c827d", 5) +
          circle(204, 32, 7, "#6b737d") +
          circle(292, 133, 15, "#dbb38b") +
          circle(159, 205, 18, "#bf8e66");
      }
    } else if (kind === "heat" || kind === "piston") {
      bg = "#fcf5ef";
      if (kind === "heat") {
        for (let row = 0; row < 7; row++)
          for (let col = 0; col < 12; col++)
            content += `<rect x="${40 + col * 30}" y="${38 + row * 30}" width="27" height="27" rx="3" fill="${["#d77e62", "#df9474", "#e7aa84", "#ebbd98", "#edceaf", "#e7d7bf", "#d7d9cd", "#c5d6d6", "#b1ccd8", "#99bbd1", "#87accb", "#78a0c3"][col]}"/>`;
        content += circle(
          220,
          143,
          8,
          "none",
          'stroke="#fff" stroke-width="2"',
        );
      } else {
        content += `<rect x="78" y="54" width="285" height="173" rx="4" fill="#f8e5d5" stroke="#baae9f" stroke-width="3"/><rect x="258" y="55" width="16" height="171" fill="#aaa89e"/><path d="M275 142h110" stroke="#aaa89e" stroke-width="12"/>`;
        for (let i = 0; i < 25; i++)
          content += circle(
            97 + ((i * 29) % 144),
            76 + ((i * 53) % 128),
            4,
            "#d3976b",
          );
      }
    } else if (kind === "prism" || kind === "waves") {
      bg = "#f0f7f7";
      if (kind === "prism") {
        content += `<path d="M225 48 139 214h179Z" fill="#d7e7ea" stroke="#9bb9bf" stroke-width="2"/>`;
        content += path("M25 150h161", "#afcbd0", 4);
        [
          "#d58181",
          "#dda469",
          "#d4c56c",
          "#8cb38a",
          "#81afc3",
          "#9a93c4",
        ].forEach((c, i) => {
          content += path(`M187 150 272 157 421 ${125 + i * 18}`, c, 2.5);
        });
      } else {
        for (let i = 1; i < 9; i++)
          for (const x of [154, 273])
            content += circle(
              x,
              140,
              i * 20,
              "none",
              `stroke="${x === 154 ? "#74a6b9" : "#9ac6b9"}" stroke-width="1.4" opacity=".6"`,
            );
        content +=
          circle(154, 140, 6, "#528ca7") + circle(273, 140, 6, "#79ad99");
      }
    } else if (kind === "charge" || kind === "induction") {
      bg = "#f6f2fa";
      for (let x = 45; x < 410; x += 39)
        for (let y = 36; y < 260; y += 39)
          content += path(`M${x - 2} ${y - 2}l4 4m0-4-4 4`, "#ddd2e8", 1);
      if (kind === "charge") {
        content += path(
          "M21 202h134c147 0 136-149 17-124s-103 112-21 119",
          "#a28cc3",
          2.5,
          'stroke-dasharray="5 5"',
        );
        content +=
          circle(215, 183, 10, "#a88ac8") +
          circle(317, 79, 24, "none", 'stroke="#c4b0d8" stroke-width="2"') +
          circle(317, 79, 12, "none", 'stroke="#c4b0d8" stroke-width="2"');
      } else {
        for (let i = 0; i < 9; i++)
          content += `<ellipse cx="${123 + i * 24}" cy="146" rx="16" ry="64" fill="none" stroke="#ad97c4" stroke-width="3"/>`;
        content += `<rect x="70" y="128" width="64" height="34" rx="4" fill="#dc8d92"/><rect x="134" y="128" width="64" height="34" fill="#88a8cc"/>`;
      }
    } else if (kind === "quantum") {
      bg = "#f4f3fb";
      content += `<rect x="220" y="52" width="38" height="180" rx="3" fill="#dfd9ef"/>`;
      let d = "";
      for (let x = 15; x < 429; x += 2) {
        const amplitude =
          (x < 220 ? 1 : 0.33) *
          69 *
          Math.exp(-Math.pow((x < 220 ? x - 153 : x - 308) / 78, 2));
        d += `${x === 15 ? "M" : "L"}${x} ${142 + Math.sin(x / 8) * amplitude} `;
      }
      content += path(d, "#9991cf", 2.5) + line(20, 143, 426, 143, "#d7d2e9");
    } else if (kind === "orbit") {
      bg = "#edf1f8";
      content += `<ellipse cx="220" cy="142" rx="174" ry="60" transform="rotate(-22 220 142)" fill="none" stroke="#acb9ce"/><ellipse cx="220" cy="142" rx="112" ry="90" transform="rotate(28 220 142)" fill="none" stroke="#c0b4cb"/>`;
      content +=
        circle(216, 141, 31, "#e3bc82") +
        circle(361, 102, 13, "#839cbf") +
        circle(130, 179, 20, "#a59bbf");
      for (let i = 0; i < 24; i++)
        content += circle(
          20 + ((i * 61) % 410),
          20 + ((i * 43) % 242),
          1,
          "#b7c3d6",
        );
    } else if (kind === "walk") {
      bg = "#f8f6ee";
      for (let x = 28; x < 435; x += 26)
        content += line(x, 20, x, 265, "#e6e3d7");
      for (let y = 31; y < 265; y += 26)
        content += line(20, y, 427, y, "#e6e3d7");
      content +=
        path(
          "M184 161v-52h52v-26h26v52h26v52h-26v26h-78v-26h-52v-52h26",
          "#bea259",
          3,
        ) +
        circle(184, 161, 6, "#927b3c") +
        circle(158, 135, 6, "#d4b65f");
    } else if (kind === "diffusion" || kind === "monte") {
      bg = kind === "monte" ? "#f6f5ee" : "#eff6f9";
      content += `<rect x="84" y="22" width="250" height="238" rx="5" fill="none" stroke="#becdd2" stroke-width="1.5"/>`;
      if (kind === "monte")
        content += circle(
          209,
          141,
          116,
          "none",
          'stroke="#cbb87d" stroke-width="1.5"',
        );
      else
        content += line(
          209,
          24,
          209,
          257,
          "#c5d5de",
          1.5,
          'stroke-dasharray="4 5"',
        );
      for (let i = 0; i < 85; i++) {
        const x = 92 + ((i * 73) % 234),
          y = 30 + ((i * 61) % 220);
        content += circle(
          x,
          y,
          2.8,
          kind === "monte"
            ? Math.hypot(x - 209, y - 141) < 116
              ? "#b7a163"
              : "#bdc6c9"
            : x < 209
              ? "#7dacca"
              : "#91bfbe",
        );
      }
    } else if (kind === "bitcoin") {
      bg = "#f7931a";
      content += `<text x="220" y="198" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-weight="bold" font-size="180">₿</text>`;
    }
    return `<svg class="science-art${large ? " science-art-large" : ""}" viewBox="0 0 440 280" preserveAspectRatio="${large ? "xMidYMid meet" : "xMidYMid slice"}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="${id}-thermal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c0d8e9"/><stop offset=".5" stop-color="#f5f4f4"/><stop offset="1" stop-color="#efc5b1"/></linearGradient></defs><rect width="440" height="280" fill="${bg}"/>${content}</svg>`;
  };
  window.PhysicsCatalog = { subjects, markets, svg };
})();
