# 10433D

Futuristic police pursuit game for mobile browsers (police code 10-43, in 3D).

**Play:** https://sidmcfarland.github.io/10433D/

Plain static site: Three.js (vendored), no build step. Serve the repo root over HTTP(S) to run locally.

## Sprint log

- **Sprint 1 — Portal:** neon city from the helicopter; gyro 360° look camera (default) or off-axis "window" camera (`?portal=1`); touch/mouse fallback.
- **Sprint 2 — Spotlight:** AI suspect car on the street grid, view-aimed spotlight, visual-contact meter, off-screen arrow; helicopter auto-circles the suspect.
- **Sprint 3 — Pilot:** auto-follow helicopter with drag-to-orbit/altitude, building line-of-sight, civilian traffic, 90s round with win/lose and restart.
- **Sprint 4 — Ground Unit:** role select; patrol car with tilt steering, thumb pedals, drift physics and building collisions; AI helicopter spotlight as intel; ram the suspect to disable it.
