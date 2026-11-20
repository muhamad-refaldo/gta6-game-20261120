# Solara City — Open World Crime Game

[![make.fun](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/gta6-01)
[![competition](https://img.shields.io/badge/competition-gta6--01-orange)](https://make.fun/bounty/gta6-01)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Solara City** is an original open-world crime game that runs entirely in the
browser from static files — no build step, no network. It was built for the
[Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).

## The game

You are **Rian "Rex" Marlowe**, a driver fresh out of the Solara docks. Explore
a sun-soaked coastal city on foot and by car, work six story missions for
**Marco**, steal cars, dodge (or outrun) the **Solara PD**, and take the streets
back from the **Viper crew**.

- **A living city** — 3.2 km of roads, blocks, parks, a stadium, the Solara
  Tower, and a palm-lined beach; traffic cars follow the roads and pedestrians
  stroll the sidewalks (and flee when things get loud).
- **Cars to steal and drive** — walk up to any car, press E, and drive with
  arcade physics, handbrake slides and skid marks.
- **Wanted level** — 1 to 5 stars. Steal, hit, shoot, and the police chase you
  in cars and on foot. Lose them to cool the heat down.
- **Missions and story** — six jobs with dialogue, objectives, markers on the
  minimap and cash rewards, from a first meet at the Sunset Diner to a bank
  job and a getaway.
- **Combat** — punch, pistol with mouse aim, rival gang members who shoot back.
- **HUD and minimap** — wanted stars, health, money, mission objective, speed,
  and a circular minimap showing roads, police and the objective marker.
- **Start screen, pause, save** — progress saves to localStorage; continue
  where you left off.
- **Synthesized sound** — engine hum, two-tone sirens, gunshots and a sunny
  chord loop, all generated with WebAudio. No audio files are shipped.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| E | Enter / steal a car, exit a car |
| Mouse + click | Aim and shoot |
| F | Punch |
| R | Reload |
| Space | Handbrake |
| Shift | Run |
| P | Pause |
| M | Mute |

## Play

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

Screenshot staging: `index.html?scene=chase` (police chase),
`?scene=onfoot` (on foot downtown), `?scene=mission` (a mission in progress),
`?scene=city` (wide city view).

## Tech

Plain HTML, CSS and JavaScript (classic scripts, no modules, no imports), split
into one file per job: `city.js` (map), `player.js`, `vehicles.js` (physics,
traffic AI, police AI), `pedestrians.js`, `missions.js`, `combat.js`, `hud.js`
(HUD + minimap), `audio.js` (WebAudio synth), `save.js`, `input.js`, `main.js`
(boot + game loop). The entrypoint `main.ts` copies `game/` and `screenshots/`
to the output directory and writes the dossier with the kit's
`vendor/makefun-game.ts`.

## License

MIT — see [LICENSE](LICENSE).
