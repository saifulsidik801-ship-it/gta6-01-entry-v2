# gta6-01-entry-v2

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/saifulsidik801-ship-it/gta6-01-entry-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/saifulsidik801-ship-it/gta6-01-entry-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**MARISOL BAY** is an original sun-soaked coastal open-world crime game that runs in a desktop browser with nothing but static files. You play Milo Kade, a driver-for-hire working the waterfront, and you take the city one district at a time. Six districts make up the TURF spine — Beachfront, Marina, Downtown, Hillside, Portside and the Old Quarter — and every district you claim raises your HEAT, which brings out the police. Heat feeds the chase loop, chase payouts buy faster cars, and the finale unlocks once the whole bay answers to you.

Cars are drivable and stealable, from beat-up sedans to marina coupes. A five-step wanted level (0–5) escalates from a single patrol car to roadblocks and foot units. Six story missions carry the plot, with side work — taxi fares, time trials, collectibles — filling the gaps between them. Combat is melee and ranged, the HUD carries a live minimap, wanted stars, cash, turf progress and the current objective, and the whole thing is lit by a moving coastal sun.

## Run it

Serve the game locally and play it in Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

Package the entry (copies `game/` and `screenshots/` and writes `dossier.json`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

WASD moves Milo on foot and drives the car; E enters or exits a car; J starts the next job; H opens the jobs list; P pauses; M mutes audio.

## How to play the turf map

Start outside the Beachfront, walk up to any parked car and press E to take it, then press J to run the current job. Each completed district job plants your flag on that district and raises HEAT by one, so the police come looking harder after every takeover. The TURF row in the top-right of the HUD shows six pips plus one finale pip — each takeover lights the next pip, and the minimap in the bottom-right outlines every district block. Claim Beachfront, Marina, Old Quarter, Downtown, Hillside and Portside to unlock the finale and take the whole bay.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mxhczr02&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
