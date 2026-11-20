[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/muhamad-refaldo/gta6-game-20261120/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/muhamad-refaldo/gta6-game-20261120/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solara City — 3D Open-World Crime Game

An original third-person 3D open-world crime game built for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).
Explore a golden-hour coastal metropolis across seven named districts, steal
cars, outrun the police, and climb from small-time runner to King of Solara.

## Play

Open `game/index.html` in desktop Chrome (no server, no internet needed), or
serve the `game/` folder with any static file server. Click **NEW GAME**.

- **WASD** move / drive · **Mouse** look · **F** enter / exit car
- **E** interact (missions, races, taxi, shops) · **R** respray & repair ($300)
- **Q** cycle radio · **Tab** weapon wheel · **1–7** switch weapon
- **M** map (missions, stats, weapon shop) · **Esc** pause · **C** camera
- **Shift** sprint · **Space** jump / handbrake

## Features

- **Living city** — seven districts with their own look and reputation,
  traffic that obeys traffic lights, pedestrians who flee gunfire, palms,
  beach, sea and a bridge to Isla Verde.
- **Day / night cycle + rain** — sunrise, day, golden sunset and neon night
  with street lamps and lit windows; rain makes the roads wet and dark.
- **10 story missions** — Marco, Lena and Rico send you from a first meeting
  in Marina Bay to a final assault on Isla Verde. Payouts $800–$50,000.
- **Five-star wanted system** — police chase, ram and bust; helicopters join
  at 3 stars, roadblocks at 4.
- **Seven weapons** on a wheel (fists, bat, pistol, SMG, shotgun, rifle,
  RPG), rival gang enemies who shoot back.
- **Side life** — 3 street races, taxi fares, chop shop, store robbery,
  garage respray, 20 golden shells, respect ranks and a crew member.
- **Three radio stations** of synthesized music, full WebAudio sound, and
  3 save slots with autosave after every mission.
- **Quality settings** — Low / Medium / High (pause menu).

## Tech

Plain JavaScript ES modules + HTML + CSS, three.js r160 vendored locally
(`game/vendor/three.module.min.js`). No build step, no network, no external
assets — everything is generated in code. The repo root `main.ts` (Node 22
stdlib) copies `game/` and `screenshots/` into the output and writes the
dossier.

## License

MIT — see [LICENSE](LICENSE).
