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

WASD moves Milo on foot and drives the car; E enters or exits a car; J starts the next job; H opens the jobs list; P pauses; M mutes audio; C sounds the horn; Tab flashes the district map.

## How to play the turf map

Start outside the Beachfront, walk up to any parked car and press E to take it, then press J to run the current job. Each completed district job plants your flag on that district and raises HEAT by one, so the police come looking harder after every takeover. The TURF row in the top-right of the HUD shows six pips plus one finale pip — each takeover lights the next pip, and the minimap in the bottom-right outlines every district block. Claim Beachfront, Marina, Old Quarter, Downtown, Hillside and Portside to unlock the finale and take the whole bay.

## Turf, heat and income

Every district you hold pays out on a timer — the HUD's turf income ticker above the minimap shows what the bay currently kicks back, and the money lands in your cash without you lifting a finger. The catch is HEAT: each takeover adds a star's worth of pressure, and the more turf you own the faster the police escalate from a single cruiser to roadblocks and foot units. A hot chase cools down only if you break line of sight and stay out of trouble, so the practical loop is take a district, let the heat die, spend the income on a faster car, then take the next one. Old Quarter's Plaza del Sol is the landmark square where the turf marker sits — a good place to meet a job contact before you go loud.

Sprinting on foot now costs stamina: holding Shift drains it until Milo has to slow to a jog and catch his breath, so long foot chases down the promenade are a real decision rather than a free run. Press C for the horn while driving and Tab to flash the district map.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mxhczr02&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
