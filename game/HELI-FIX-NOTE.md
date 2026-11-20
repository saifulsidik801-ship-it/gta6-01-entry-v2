# HELI FIX NOTE — cover shot framing (written BEFORE any code change)

Date: 2026-11-20. Repo: gta6-01-entry-v2, HEAD 445c779.
Defect: in our cover the helicopter BODY is barely / out of frame — only the
spotlight cone reads. In top-1 the heli is BIG, fully in frame, clearly visible
with its spotlight. This note is the visual record the fix is judged against.

## OUR cover — screenshots/01-cover-police-chase-day.png (viewed 2026-11-20)

- Helicopter: CLIPPED AT THE TOP EDGE. Only the dark underside/belly of the
  fuselage is visible, straddling the very top edge around x ~38–62%, y 0–8%
  of frame height. No rotor disc, no tail, no skids, no side profile — the
  body is effectively out of frame. What DOES read is the wide pale spotlight
  cone fanning down from the top-center to the street, plus two soft grey
  circular bokeh discs inside the cone.
- What still reads well: hero red wedge coupe dead-center (rear 3/4, ~y 55–72%),
  flanking white police cruisers, tower blocks both sides with lit windows,
  purple/pink dusk sky band in the middle distance, full HUD (police-response
  panel left, crew/weapon panels right, $18,450 top-right, minimap bottom-right,
  dialogue box bottom-center). Dusk mood is bright enough; the street, car and
  sky all read.
- Verdict: the ONE framing defect is the heli — it is positioned too high /
  the camera is too tight / angled too low, so the aircraft that the HUD
  ("HELI 1 · SPOTLIGHT 21 m", "AIR UNIT · HELI 1 — TRACKING") talks about is
  not actually visible as an aircraft. A viewer sees a light cone from nowhere.

## TOP-1 cover — top-shots/top1-karimbu-cover.webp (Karimbu)

- Helicopter: BIG and FULLY IN FRAME, upper-center (~x 42–58%, y ~12–26%).
  Dark blue/white fuselage with windows, landing skids, tail boom and a WIDE
  rotor disc (rotor spans roughly x 38–62%) all clearly visible against a
  bright blue sky with clouds. Body alone is ~8–10% of frame height; with the
  rotor disc the aircraft reads as a large, unmistakable focal object.
- Scene: bright daytime beachfront (Kumala Strand), orange hero sports car
  lower-center-right on a coastal road, white police cars ahead, palms lining
  the road, sea + sand on the right. Full HUD, same density as ours.
- Lesson: the heli sits LOW ENOUGH in the sky band that the whole aircraft +
  rotor fits with clear sky margin above it, and HIGH ENOUGH above the street
  that it does not collide with the HUD panels. The heli is the second focal
  point after the hero car.

## TOP-2 cover — top-shots/top2-tangerine-cover.webp (Tangerine)

- Helicopter: SMALL but FULLY IN FRAME, distant center (~x 48–54%, y ~25–30%).
  White body + rotor visible, with a clear spotlight cone dropping straight
  down onto the road and the red hero car below. Nothing clipped; the aircraft
  is small because it is far, but it is unambiguously a helicopter.
- Lesson: even a distant heli must be whole — body, rotor and cone all inside
  the frame. Top-2 proves the fix does not need the heli to be huge, only whole.

## TOP-3 cover — top-shots/top3-brisa-cover.webp (Brisa)

- Helicopter: FULLY IN FRAME, upper-center (~x 38–48%, y ~15–25%). Black
  fuselage + wide rotor disc, with a WIDE spotlight cone fanning down onto the
  red hero car on the bridge below. Body + rotor + cone all readable; the cone
  lands on the hero car, tying heli and car together.
- Lesson: the winning pattern is heli top-center + wide cone landing ON the
  hero car. Our cover already has the cone; it is missing the aircraft at the
  top of it.

## FIX TARGET (cover only)

- Pull the camera back and/or re-angle (and/or lower the heli / raise the
  camera pitch) so the helicopter is FULLY in frame: fuselage + tail + skids +
  full rotor disc, with sky margin above the rotor.
- Body ~12–15% of frame height, top-center (roughly x 40–60%, y ~8–25%),
  larger than top-1's ~8–10% so it reads even bigger than the reference.
- KEEP: the wide spotlight cone (it should still land on/near the hero car),
  the siren light pools on the asphalt, the hero wedge car + street + dusk sky
  still reading, all HUD unchanged.
- Do NOT change gameplay, HUD, or the other 3 shots' composition — but
  re-render all 4 and view each side-by-side with the matching top-1 shot;
  fix any OTHER framing defect found (key subject cut off / unreadable).

## FIX APPLIED (2026-11-20, game/src/shots.js only — cover shot)

- Heli height 20 m → **13 m**, radius 26 m, angle ~π/2 (due north, over the
  road centre), body scale stays 1.7×. Camera distance stays 7.5 m, pitch
  −0.34 (already at the max up-tilt; pitch was not the lever).
- Orbit speed **0 + re-pin every tick** (heli, car, camera all pinned to the
  car each tick, same pattern as the held cruisers/peds): the 0.12 rad/s
  orbit + the ~8 m chase lag behind the driving car made the cone swing
  side-on into a pale triangle that washed out the hero car, and made the
  framing vary run to run. Pinned, the cover audit is IDENTICAL across
  runs (heliHeightFrac 0.0958, rotorNearNdc (−0.04, 0.718), tailNdc
  (−0.324, 0.476), all in frame).
- Cover audit extended: it now also projects the rotor disc's near edge
  (the true top of the aircraft — the old audit only checked the fuselage
  centre, which read "in frame" while the body was clipped) and the tail
  tip, and reports rotorNearInFrame / tailInFrame.
- Spotlight cone kept WIDE (12 m bottom, 0.16) + pool 9 m / 0.4 (R14
  values); the wash risk is gone now the heli is pinned.
- Luminance journey (gate ≥ 0.47 both): R14 committed 0.476/0.481; first
  HELI-FIX renders 0.448 → 0.408 → pinned 0.384. Proven dead levers:
  toneMappingExposure is a NO-OP (renderer never sets toneMapping, so
  THREE's NoToneMapping applies — 1.45 and 2.2 both measured ~0.39);
  street segment only ~0.01 once pinned; cone only ~0.01. Working levers:
  cover lights sun 2.2→3.6 / hemi 1.35→2.0 / ambient 0.32→0.5 (+0.022),
  sky-dome lift (new `lift` param on buildSkyDome, cover only 1.7 — the
  dome is unlit so lights can't move it) (+0.04), staging slot PZ −80→20
  (+0.01). Final pinned cover: **Rec709 0.478, Rec601 0.490–0.491**,
  identical across re-renders. Body reads ~7% of frame height (top-1 is
  ~8–10% — the 12–15% target is not geometrically reachable with the full
  14.4 m rotor disc in frame from this low chase camera; the whole
  aircraft + rotor fully in frame with ~60 px top margin is the fix).
- Cover quantized to 256-colour palette PNG (PIL, Floyd-Steinberg) per the
  R14 cover convention: 195,329 B RGB → ~88 KB, under the 262,144 B cap,
  no visible banding, luminance unchanged.

## Other shots — side-by-side vs top-1 (checked, NO changes)

- 02 on-foot: Milo + enemies + van fire all in frame (audit confirms);
  parent already judged it GOOD. The muzzle/tracer reads as a large white
  triangle — a VFX scale note, not a framing defect; left alone.
- 03 map: all panels legible, matches top1_shot2's density; no defect.
- 04 garage: car reads (red wedge on turntable) but is partly occluded by
  a yellow lift post + the right upgrade panel; parent already judged it
  GOOD, and top1_shot3 is a title screen (no top-1 garage to match) — the
  key subject is not cut off by the frame; left alone.
- Pre-existing nits left alone (also in the R14 committed cover): the grey
  translucent rectangle on the hero car's rear, the heli tail tip passing
  behind the "3,900 / 5,200 RP" chip, the "71 km/h" readout with no dark
  chip behind it.
