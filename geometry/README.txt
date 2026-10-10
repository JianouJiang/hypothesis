NACA 0012 geometry and public physical conditions

Source: https://tmbwg.github.io/turbmodels/naca0012_val.html

All geometry files use chord units. Multiply coordinates by 0.10 for metres.
The DAT is unrotated and closed, running trailing edge -> upper surface -> leading edge -> lower surface -> trailing edge.
The CSV is rotated -20 degrees in the xy plane about (0.25,0): nose-up incidence to left-to-right flow.
The STL is an extruded closed surface of this tilted section, span 0.04 chords; it is a geometry convenience, not a 3D simulation.
The exact profile uses the NASA TMR sharp-trailing-edge rescaling (original polynomial x-limit 1.008930411365).

See parameters.json for physical conditions. The OpenFOAM solver setup, mesh and private replay bank are not included.
Using this widely studied geometry does not establish validation of this exploratory 2D low-Reynolds-number flow.
