// MARISOL BAY - HUD layer: cash, health, wanted stars, turf progress, objective
// banner, speed/vehicle readout, the minimap canvas, title + pause + jobs menus,
// mission cards, toasts and damage feedback. DOM and 2D canvas only: no images,
// no external fonts, no network.

import {
  DISTRICTS as CONFIG_DISTRICTS,
  WORLD as CONFIG_WORLD,
  SAVE_KEY as CONFIG_SAVE_KEY,
  TURF as CONFIG_TURF,
  TURF_INCOME_TICK as CONFIG_INCOME_TICK,
  TURF_INCOME_PER_TICK as CONFIG_INCOME_PER_TICK,
} from './config.js';

const INCOME_TICK = typeof CONFIG_INCOME_TICK === 'number' ? CONFIG_INCOME_TICK : 25;
const INCOME_PER_TICK = typeof CONFIG_INCOME_PER_TICK === 'number' ? CONFIG_INCOME_PER_TICK : 60;

const TUNE = {
  mapSize: 132,
  mapHz: 12,
  toastLife: 3.2,
  toastMax: 4,
  cardLife: 6.5,
  damageFlash: 1.0,
  lowHealth: 34,
  districtCount: typeof CONFIG_TURF === 'object' && CONFIG_TURF && CONFIG_TURF.districtCount
    ? CONFIG_TURF.districtCount
    : 6,
};

// Minimap world window: a little ocean west of the beach, everything else city.
const BOUNDS = { x0: -258, x1: 236, z0: -232, z1: 232 };

const VEHICLE_NAMES = {
  sedan: 'Sedan',
  taxi: 'Marisol Cab',
  van: 'Cargo Van',
  sport: 'Kite Coupe',
};

// R8: named police units for the response panel (top-1 style). Index follows
// the snapshot policePositions order: cruisers first, then foot cops.
const POLICE_NAMES = [
  'KITE-1', 'MARLIN-3', 'CORAL-48', 'CORAL-85', 'CORAL-43',
  'VIPER-2', 'HERON-2', 'BASTION-3', 'GULL-8', 'OSPREY-1', 'TARPON-38',
];
const POLICE_ROLES = [
  'RAMMING', 'PURSUIT', 'FLANKING', 'CLOSING IN', 'RESPONDING',
  'SPOTLIGHT', 'ROADBLOCK', 'PURSUIT',
];

// R9: flat-shaded 2D portraits for crew cards + dialog (the only place a
// face appears — the 3D models stay faceless). One painter, two sizes.
const PORTRAITS = {
  Mira: { skin: '#d9a06f', hair: '#1c1a18', hairStyle: 'cap', shirt: '#e85d26' },
  Lio: { skin: '#c98d63', hair: '#2a2119', hairStyle: 'short', shirt: '#2f7f96' },
  Kiki: { skin: '#9c6b48', hair: '#1c1a18', hairStyle: 'ponytail', shirt: '#e8c86a' },
  'Inez Voss': { skin: '#f1c9a5', hair: '#8a7355', hairStyle: 'bun', shirt: '#b4517a' },
};

function drawPortrait(canvas, spec) {
  if (!canvas || !canvas.getContext) return;
  const s = spec || PORTRAITS.Mira;
  const size = canvas.width || 34;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const u = size / 34;
  ctx.clearRect(0, 0, size, size);
  // Shirt block at the bottom.
  ctx.fillStyle = s.shirt;
  ctx.fillRect(0, 26 * u, size, 8 * u);
  // Face.
  ctx.fillStyle = s.skin;
  ctx.beginPath();
  ctx.arc(17 * u, 17 * u, 10.5 * u, 0, Math.PI * 2);
  ctx.fill();
  // Hair silhouette (the identifier — cap / short / ponytail / bun).
  ctx.fillStyle = s.hair;
  if (s.hairStyle === 'cap') {
    ctx.beginPath();
    ctx.arc(17 * u, 13 * u, 10.5 * u, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(6.5 * u, 12 * u, 21 * u, 2.6 * u);
  } else if (s.hairStyle === 'ponytail') {
    ctx.beginPath();
    ctx.arc(17 * u, 12 * u, 10.5 * u, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(24 * u, 12 * u, 4 * u, 14 * u);
    ctx.beginPath();
    ctx.arc(26 * u, 27 * u, 2.4 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.arc(17 * u, 12 * u, 10 * u, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(17 * u, 4 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(17 * u, 12.5 * u, 10.5 * u, Math.PI, 0);
    ctx.fill();
  }
  // Eyes + mouth.
  ctx.fillStyle = '#1c1a18';
  ctx.beginPath();
  ctx.arc(13 * u, 17 * u, 1.3 * u, 0, Math.PI * 2);
  ctx.arc(21 * u, 17 * u, 1.3 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(14.5 * u, 22.5 * u, 5 * u, 1.1 * u);
}

// R9: weapon slots (display data — ammo for the pistol slot is live).
// Icons are plain two-letter codes (no emoji — headless Chrome has no emoji
// font and would draw tofu boxes).
const WEAPON_SLOTS = [
  { n: 1, icon: 'FT', name: 'FISTS', ammo: '\u221E' },
  { n: 2, icon: 'P9', name: 'PISTOL', ammo: null },
  { n: 3, icon: 'SM', name: 'SMG', ammo: '30/60' },
  { n: 4, icon: '12', name: '12G', ammo: '18' },
  { n: 5, icon: 'AR', name: 'AR-9', ammo: null, locked: true },
  { n: 6, icon: 'RP', name: 'RPG', ammo: null, locked: true },
];

// R9: garage upgrade list (Hillside Garage — fictional, prices in game $).
const GARAGE_UPGRADES = [
  { name: 'REPAIR', fx: 'Condition 84% \u2192 100%', price: '$450', status: 'OWNED' },
  { name: 'RESPRAY', fx: 'Ganti warna cat (pilih warna)', price: '$800', status: '' },
  { name: 'ENGINE TUNE', fx: 'Top speed +12%', price: '$1,200', status: 'LOCKED' },
  { name: 'ARMOUR PLATING', fx: 'Armour +25', price: '$950', status: '' },
  { name: 'NITRO', fx: 'Boost 3 detik', price: '$600', status: 'OWNED' },
  { name: 'SUSPENSION', fx: 'Handling +15%', price: '$700', status: 'LOCKED' },
  { name: 'BRAKES', fx: 'Jarak rem \u221220%', price: '$500', status: '' },
  { name: 'WEAPON MOUNT', fx: 'Pasang senjata di mobil', price: '$1,500', status: 'LOCKED' },
  { name: 'TURBO', fx: 'Acceleration +18%', price: '$1,100', status: 'LOCKED' },
  { name: 'NEON KIT', fx: 'Lampu bawah mobil', price: '$350', status: '' },
];

const DISTRICTS = Array.isArray(CONFIG_DISTRICTS) && CONFIG_DISTRICTS.length
  ? CONFIG_DISTRICTS
  : [
    { key: 'beachfront', name: 'Beachfront', center: { x: -199, z: 0 }, size: { w: 26, d: 460 }, ground: 0xe6d6b2, accent: 0x2fb6c9 },
    { key: 'marina', name: 'Marina', center: { x: -103, z: 105 }, size: { w: 166, d: 250 }, ground: 0xa8a89c, accent: 0x1c8a9c },
    { key: 'oldquarter', name: 'Old Quarter', center: { x: -103, z: -125 }, size: { w: 166, d: 210 }, ground: 0xa2927c, accent: 0x8c3b2e },
    { key: 'downtown', name: 'Downtown', center: { x: 45, z: -125 }, size: { w: 130, d: 210 }, ground: 0x9a9c98, accent: 0x2a6f8e },
    { key: 'portside', name: 'Portside', center: { x: 170, z: 170 }, size: { w: 120, d: 120 }, ground: 0x8b8a80, accent: 0xb4552e },
    { key: 'hillside', name: 'Hillside', center: { x: 105, z: 105 }, size: { w: 250, d: 250 }, ground: 0x93a06a, accent: 0x3f7a4a },
  ];

const WORLD = CONFIG_WORLD || {
  landEdgeX: -212,
  sandCenterX: -198,
  sandWidth: 28,
  promenadeX: -178,
  promenadeWidth: 12,
  maxX: 226,
  gridLinesX: [-140, -80, -20, 40, 100, 160, 220],
  gridLinesZ: [-200, -140, -80, -20, 40, 100, 160, 220],
};

const SAVE_KEY = CONFIG_SAVE_KEY || 'marisol-bay-save-v1';

const STYLE_ID = 'mb-hud-style';

const CSS = `
.mb-topright{position:absolute;right:18px;top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:5px;text-align:right;}
.mb-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:5px;
  background:rgba(9,16,24,.42);border:1px solid rgba(255,246,229,.16);
  font:600 10px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;color:#ffd9a8;text-transform:uppercase;}
.mb-dot{width:6px;height:6px;border-radius:50%;background:#ffd166;box-shadow:0 0 7px rgba(255,209,102,.75);}
.mb-chip.tod-dusk .mb-dot{background:#ff9d5c;box-shadow:0 0 8px rgba(255,120,60,.85);}
.mb-chip.tod-night .mb-dot{background:#7fb2ff;box-shadow:0 0 8px rgba(110,160,255,.85);}
.mb-cash{font:700 27px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.04em;color:#fff4de;
  text-shadow:0 2px 12px rgba(0,0,0,.6),0 0 22px rgba(255,150,60,.22);}
.mb-stars{font-size:19px;line-height:1;letter-spacing:3px;color:rgba(255,246,229,.16);}
.mb-stars .on{color:#ffd166;text-shadow:0 0 9px rgba(255,190,60,.75);}
.mb-stars.hot{animation:mb-flash .62s steps(2,end) infinite;}
@keyframes mb-flash{50%{opacity:.35;}}
.mb-turf{min-width:152px;padding:6px 8px 7px;border-radius:6px;background:rgba(9,16,24,.4);
  border:1px solid rgba(255,246,229,.14);text-align:left;}
.mb-turf-top{display:flex;justify-content:space-between;align-items:baseline;
  font:700 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;color:#ffcf9b;text-transform:uppercase;}
.mb-turf-top b{font-size:11px;color:#fff2dd;letter-spacing:.08em;}
.mb-pips{display:flex;gap:3px;margin:6px 0 5px;}
.mb-pip{flex:1;height:5px;border-radius:2px;background:rgba(255,246,229,.16);}
.mb-pip.on{background:linear-gradient(90deg,#ffb347,#ffd166);box-shadow:0 0 7px rgba(255,180,70,.45);}
.mb-income{font:600 9px/1.2 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.12em;color:#e7d8c0;opacity:.82;text-transform:uppercase;}
.mb-health{position:absolute;left:28px;bottom:104px;width:212px;}
.mb-health-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;
  font:700 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;color:#ffcf9b;text-transform:uppercase;}
.mb-health-top b{color:#fff2dd;letter-spacing:.06em;}
.mb-health-bar{height:7px;border-radius:3px;background:rgba(8,14,20,.62);
  border:1px solid rgba(255,246,229,.22);overflow:hidden;}
.mb-health-fill{height:100%;width:100%;background:linear-gradient(90deg,#54d98c,#a8e05f);}
.mb-health-fill.mid{background:linear-gradient(90deg,#ffc247,#ffd97a);}
.mb-health-fill.low{background:linear-gradient(90deg,#ff5a4d,#ff8b6a);box-shadow:0 0 10px rgba(255,80,60,.6);}
.mb-health-foot{margin-top:4px;font:600 9px/1.2 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.14em;color:#ffe9c9;opacity:.72;text-transform:uppercase;}
.mb-speed{position:absolute;right:170px;bottom:18px;text-align:right;opacity:0;transform:translateY(4px);
  transition:opacity .18s ease,transform .18s ease;}
.mb-speed.on{opacity:1;transform:translateY(0);}
.mb-speed-num{font:700 30px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#fff4de;
  text-shadow:0 2px 12px rgba(0,0,0,.6);}
.mb-speed-unit{margin-left:4px;font:600 9px/1 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.18em;color:#ffcf9b;}
.mb-vehicle{font:600 10px/1.5 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.14em;
  color:#ffe9c9;opacity:.8;text-transform:uppercase;}
.mb-controls{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);
  font:600 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.14em;color:#ffe9c9;
  opacity:.5;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.75);text-transform:uppercase;}
.mb-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(ellipse at center,rgba(0,0,0,0) 36%,rgba(170,22,22,.62) 100%);}
.mb-toasts{position:absolute;left:50%;bottom:126px;transform:translateX(-50%);
  display:flex;flex-direction:column-reverse;align-items:center;gap:6px;width:max-content;max-width:62vw;}
.mb-toast{max-width:62vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  padding:6px 12px;border-radius:4px;border:1px solid rgba(255,209,102,.28);border-left:2px solid #ffb347;
  background:rgba(9,16,24,.62);color:#fff2dd;text-transform:uppercase;
  font:600 11px/1.2 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;
  text-shadow:0 1px 2px rgba(0,0,0,.85);}
.mb-toast.cash{border-left-color:#54d98c;border-color:rgba(84,217,140,.3);}
.mb-toast.good{border-left-color:#ffd166;}
.mb-toast.heat{border-left-color:#ff5a4d;border-color:rgba(255,90,77,.36);}
.mb-toast.cool{border-left-color:#7fd8d0;border-color:rgba(127,216,208,.32);}
.mb-obj-title{font:700 10.5px/1.5 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;color:#ffd166;}
.mb-obj-text{font:600 11.5px/1.45 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;color:#f2e6d3;}
.mb-obj-bar{width:200px;height:4px;margin-top:6px;border-radius:2px;overflow:hidden;
  background:rgba(8,14,20,.55);border:1px solid rgba(255,246,229,.14);}
.mb-obj-fill{height:100%;width:0;background:linear-gradient(90deg,#ffb347,#ffd166);}
.mb-obj-prog{margin-top:3px;font:600 9px/1.2 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.14em;color:#ffcf9b;opacity:.85;}
#start{display:none;align-items:center;justify-content:center;}
#start.hidden{display:none !important;}
#start [hidden]{display:none !important;}
.mb-panel{position:relative;pointer-events:auto;width:min(560px,88vw);max-height:88vh;overflow:auto;
  padding:26px 30px 24px;border-radius:12px;color:#f4ecdc;
  background:linear-gradient(160deg,rgba(11,20,29,.95),rgba(19,27,39,.93));
  border:1px solid rgba(255,209,102,.22);box-shadow:0 26px 74px rgba(0,0,0,.6);
  font:500 13px/1.5 "Trebuchet MS","Segoe UI",sans-serif;}
.mb-kicker{font:700 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.3em;color:#7fd8d0;text-transform:uppercase;}
.mb-title{margin:8px 0 4px;font:700 clamp(34px,7vw,50px)/0.96 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.14em;color:#fff6e5;text-shadow:0 4px 30px rgba(255,128,52,.4);}
.mb-sub{font:600 10px/1.4 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.22em;color:#ffcf9b;text-transform:uppercase;}
.mb-lede{margin:14px 0 0;color:#cfd8dd;font-size:12.5px;line-height:1.55;}
.mb-keys{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;margin:16px 0 2px;
  font-size:11.5px;color:#c9d4da;}
.mb-key{font:700 10px/1.6 "Consolas","Menlo",monospace;letter-spacing:.04em;color:#ffd166;white-space:nowrap;}
.mb-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;}
.mb-btn{pointer-events:auto;cursor:pointer;padding:11px 16px;border-radius:6px;
  border:1px solid rgba(255,246,229,.28);background:rgba(255,246,229,.06);color:#fff2dd;
  font:700 11px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;text-transform:uppercase;
  transition:background .15s ease,border-color .15s ease;}
.mb-btn:hover{background:rgba(255,246,229,.15);border-color:rgba(255,246,229,.5);}
.mb-btn.primary{background:linear-gradient(180deg,#ffb347,#e88a2c);border-color:#ffcf9b;color:#20160c;}
.mb-btn.primary:hover{background:linear-gradient(180deg,#ffc264,#f09736);}
.mb-note{margin-top:14px;font:400 10.5px/1.45 "Trebuchet MS","Segoe UI",sans-serif;color:#8fa0ab;}
.mb-stats{display:grid;grid-template-columns:1fr auto;gap:6px 18px;margin-top:16px;
  padding-top:14px;border-top:1px solid rgba(255,246,229,.12);font-size:12px;}
.mb-stats span:nth-child(odd){color:#a8b6bf;text-transform:uppercase;font-size:10px;letter-spacing:.14em;line-height:1.9;}
.mb-stats span:nth-child(even){color:#ffe9c9;font-weight:700;text-align:right;}
.mb-card-head{font:700 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.3em;color:#7fd8d0;text-transform:uppercase;}
.mb-card-title{margin:10px 0 4px;font:700 30px/1.05 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.1em;color:#ffd166;text-transform:uppercase;}
.mb-card.bad .mb-card-title{color:#ff8b6a;}
.mb-card-sub{font:600 11px/1.45 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;color:#c9d4da;}
.mb-rows{display:grid;grid-template-columns:1fr auto;gap:6px 18px;margin-top:16px;font-size:12px;}
.mb-rows .k{color:#a8b6bf;text-transform:uppercase;font-size:10px;letter-spacing:.14em;line-height:1.9;}
.mb-rows .v{color:#ffe9c9;font-weight:700;text-align:right;}
.mb-jobs{margin-top:14px;display:flex;flex-direction:column;gap:6px;max-height:42vh;overflow:auto;}
.mb-job{display:flex;justify-content:space-between;gap:12px;padding:7px 9px;border-radius:5px;
  background:rgba(255,246,229,.04);border:1px solid rgba(255,246,229,.1);font-size:11.5px;}
.mb-job b{color:#fff2dd;font-weight:700;letter-spacing:.05em;}
.mb-job span{color:#a8b6bf;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;}
.mb-job.done{opacity:.5;}
.mb-job.done b{text-decoration:line-through;}
/* R8: top-1 style panels — police response, crew abilities, dialog. */
.mb-police{position:absolute;left:28px;top:126px;width:232px;padding:8px 10px 7px;border-radius:6px;
  background:rgba(9,16,24,.66);border:1px solid rgba(255,246,229,.16);display:none;z-index:5;}
.mb-police.on{display:block;}
.mb-police-head{display:flex;justify-content:space-between;align-items:baseline;
  font:700 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;color:#ff8b6a;text-transform:uppercase;}
.mb-police-head b{color:#fff2dd;font-size:10.5px;}
.mb-police-row{display:flex;justify-content:space-between;gap:8px;margin-top:5px;
  font:600 10.5px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.08em;color:#f2e6d3;}
.mb-police-row .u{color:#ffd166;font-weight:700;}
.mb-police-row .r{color:#8fb7c9;}
.mb-police-row .d{color:#fff2dd;font-weight:700;}
.mb-police-foot{margin-top:6px;font:600 9px/1.2 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.14em;color:#7fd8d0;text-transform:uppercase;}
.mb-crew{position:absolute;right:18px;top:172px;width:208px;display:none;flex-direction:column;gap:5px;z-index:5;}
.mb-crew.on{display:flex;}
.mb-crew-head{padding:5px 8px;border-radius:5px;background:rgba(9,16,24,.88);border:1px solid rgba(255,246,229,.16);
  font:700 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.22em;color:#7fd8d0;text-transform:uppercase;}
.mb-crew-face{flex:0 0 auto;width:24px;height:24px;border-radius:4px;border:1px solid rgba(255,246,229,.25);}
/* R9: weapon slots — horizontal row, right column above the crew cards. */
.mb-weapons{position:absolute;right:18px;top:118px;display:none;flex-direction:row;gap:4px;z-index:5;}
.mb-weapons.on{display:flex;}
.mb-wslot{width:32px;padding:4px 0 3px;border-radius:5px;background:rgba(9,16,24,.72);
  border:1px solid rgba(255,246,229,.18);text-align:center;}
.mb-wslot .n{font:700 8px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#8fa0ab;}
.mb-wslot .i{font:700 13px/1.2 "Trebuchet MS","Segoe UI",sans-serif;color:#fff2dd;}
.mb-wslot .a{font:600 8px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#7fd8d0;}
.mb-wslot.active{border-color:#ffd166;background:rgba(60,44,10,.82);box-shadow:0 0 10px rgba(255,209,102,.35);}
.mb-wslot.active .i{color:#ffd166;}
.mb-wslot.locked{opacity:.55;}
.mb-wslot.locked .i{font-size:8px;color:#8fa0ab;letter-spacing:.05em;}
/* R9: radio line — sits above the big speed number, bottom right. */
.mb-radio{position:absolute;right:170px;bottom:88px;display:none;text-align:right;z-index:5;
  font:600 10px/1.4 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;color:#ffe9c9;
  text-shadow:0 1px 3px rgba(0,0,0,.8);white-space:nowrap;}
.mb-radio.on{display:block;}
.mb-radio .st{font-weight:700;}
.mb-radio .bar{height:3px;margin-top:3px;border-radius:2px;background:rgba(255,246,229,.2);overflow:hidden;}
.mb-radio .fill{height:100%;width:0%;}
/* R9: air-unit chip under the wanted stars (top-right stack). */
.mb-airunit{display:none;padding:4px 8px;border-radius:5px;background:rgba(9,16,24,.66);
  border:1px solid rgba(127,216,208,.4);font:700 9.5px/1 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.14em;color:#7fd8d0;text-transform:uppercase;}
.mb-airunit.on{display:block;}
/* R9: garage screen — fullscreen overlay; the 3D car shows through the left. */
.mb-garage{position:absolute;inset:0;display:none;z-index:6;pointer-events:none;}
.mb-garage.on{display:block;}
.mb-garage-top{position:absolute;left:0;right:0;top:0;height:52px;display:flex;align-items:center;gap:14px;
  padding:0 18px;background:linear-gradient(180deg,rgba(8,14,20,.92),rgba(8,14,20,.55));}
.mb-garage-name{font:700 20px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.14em;color:#ffc93c;
  text-shadow:0 2px 10px rgba(0,0,0,.7);}
.mb-garage-sub{font:600 10px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;color:#7fd8d0;text-transform:uppercase;}
.mb-garage-cash{margin-left:auto;font:700 22px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#3ddc5a;}
.mb-garage-panel{position:absolute;right:16px;top:64px;width:352px;padding:12px 14px;border-radius:8px;
  background:rgba(12,18,26,.94);border:1px solid rgba(255,246,229,.2);pointer-events:auto;}
.mb-garage-panel h3{font:700 15px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.18em;color:#fff2dd;}
.mb-garage-panel h3 span{color:#7fd8d0;font-size:10px;letter-spacing:.14em;}
.mb-garage-row{display:flex;align-items:baseline;gap:8px;padding:5px 8px;margin-top:3px;border-radius:5px;
  font:700 11px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.08em;color:#f2e6d3;}
.mb-garage-row.sel{background:rgba(255,201,60,.16);outline:1px solid rgba(255,201,60,.6);}
.mb-garage-row .fx{flex:1;font:600 9px/1.3 "Trebuchet MS","Segoe UI",sans-serif;color:#a8b6bf;letter-spacing:.06em;}
.mb-garage-row .pr{color:#3ddc5a;}
.mb-garage-row .st-owned{color:#3ddc5a;}
.mb-garage-row .st-locked{color:#e5484d;}
.mb-garage-card{margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(255,246,229,.06);
  border:1px solid rgba(255,246,229,.14);}
.mb-garage-carcard{position:absolute;left:16px;bottom:56px;width:330px;margin-top:0;
  background:rgba(12,18,26,.92);}
.mb-garage-card .cn{font:700 14px/1.2 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;color:#fff2dd;}
.mb-garage-card .cc{font:600 9px/1.4 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.16em;color:#a8b6bf;}
.mb-garage-bar{height:8px;margin-top:6px;border-radius:4px;background:rgba(255,246,229,.16);overflow:hidden;}
.mb-garage-fill{height:100%;background:linear-gradient(90deg,#54d98c,#a8e05f);}
.mb-garage-stat{display:flex;align-items:center;gap:8px;margin-top:5px;
  font:600 9px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.12em;color:#c9d4da;}
.mb-garage-stat .sb{flex:1;height:5px;border-radius:3px;background:rgba(255,246,229,.16);overflow:hidden;}
.mb-garage-stat .sf{height:100%;background:#35d0d8;}
.mb-garage-foot{position:absolute;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;gap:10px;
  padding:0 18px;background:linear-gradient(0deg,rgba(8,14,20,.92),rgba(8,14,20,.4));}
.mb-garage-btn{padding:8px 14px;border-radius:6px;background:rgba(255,246,229,.1);
  border:1px solid rgba(255,246,229,.3);font:700 10px/1 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.14em;color:#fff2dd;}
.mb-garage-btn.buy{background:linear-gradient(180deg,#54d98c,#2f9e57);border-color:#a8e05f;color:#0c1a10;}
.mb-garage-btn.equip{background:linear-gradient(180deg,#ffb347,#e88a2c);border-color:#ffcf9b;color:#20160c;}
/* R9: garage mode hides every gameplay HUD element. */
.mb-garage-on .mb-police,.mb-garage-on .mb-crew,.mb-garage-on .mb-weapons,.mb-garage-on .mb-dialog,
.mb-garage-on .mb-speed,.mb-garage-on .mb-radio,.mb-garage-on .mb-health,.mb-garage-on .mb-topright,
.mb-garage-on #objective,.mb-garage-on #minimap,.mb-garage-on #turf-income{display:none !important;}
.mb-garage-on #title{display:none !important;}
/* R9: action popup for driving shots (DRIFT / NEAR MISS). */
.mb-shot-popup{position:absolute;right:220px;top:200px;display:none;padding:7px 12px;border-radius:6px;
  background:rgba(9,16,24,.78);border:1px solid rgba(255,209,102,.5);z-index:5;
  font:700 13px/1.2 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.14em;color:#ffd166;}
.mb-shot-popup.on{display:block;}
/* R9 shot mode: bigger, brighter minimap. */
.mb-shot #minimap{width:150px !important;height:150px !important;}
/* R9 shot mode: the turf panel crowds the right column — hide it in shots. */
.mb-shot .mb-turf{display:none !important;}
canvas.mb-dialog-face{padding:0;background:none;border:1px solid rgba(255,246,229,.3);border-radius:5px;}
.mb-crew-card{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:6px;
  background:rgba(9,16,24,.66);border:1px solid rgba(255,246,229,.16);}
.mb-crew-key{flex:0 0 auto;width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,#ffb347,#e88a2c);color:#20160c;font:700 11px/1 "Trebuchet MS","Segoe UI",sans-serif;}
.mb-crew-name{font:700 10.5px/1.25 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;color:#fff2dd;text-transform:uppercase;}
.mb-crew-who{font:600 9px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;color:#a8b6bf;text-transform:uppercase;}
.mb-dialog{position:absolute;left:50%;bottom:130px;transform:translateX(-50%);width:320px;display:none;
  padding:9px 12px;border-radius:6px;background:rgba(9,16,24,.72);border:1px solid rgba(255,246,229,.18);z-index:5;}
.mb-dialog.on{display:flex;gap:10px;align-items:flex-start;}
.mb-dialog-face{flex:0 0 auto;width:34px;height:34px;border-radius:5px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(160deg,#2fb6c9,#1c6f8c);color:#fff;font:700 15px/1 "Trebuchet MS","Segoe UI",sans-serif;}
.mb-dialog-name{font:700 10.5px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.12em;color:#7fd8d0;text-transform:uppercase;}
.mb-dialog-text{margin-top:2px;font:600 11.5px/1.45 "Trebuchet MS","Segoe UI",sans-serif;color:#f2e6d3;}
/* R8 shot mode: the brand title, controls strip, turf ticker, centre hint pill,
   toasts and centre event cards are hidden — at 800x480 they all collide with
   the speed readout, the minimap or each other. The in-game HUD stays intact. */
.mb-shot #title{display:none !important;}
.mb-shot .mb-controls{display:none !important;}
.mb-shot #turf-income{display:none !important;}
.mb-shot #hud > div[style*="92px"]{display:none !important;}
.mb-shot .mb-toasts{display:none !important;}
.mb-shot #hud > .mb-panel{display:none !important;}
`;

// --------------------------------------------------------------------- helpers

function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function money(value) {
  const n = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function numOf() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (typeof v === 'number' && isFinite(v)) return v;
  }
  return null;
}

function textOf() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (typeof v === 'string' && v.length) return v;
  }
  return '';
}

function hexOf(value) {
  if (typeof value === 'string') return value;
  const n = Number.isFinite(value) ? value : 0x888888;
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

function pressKey(code, key) {
  if (typeof window === 'undefined' || typeof window.KeyboardEvent !== 'function') return false;
  try {
    window.dispatchEvent(new window.KeyboardEvent('keydown', {
      code,
      key: key || '',
      bubbles: true,
    }));
    return true;
  } catch (err) {
    return false;
  }
}

function hasSave() {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return false;
  }
}

function readTurf(turf, takenCount) {
  const owned = {};
  const pct = {};
  let count = 0;
  if (Array.isArray(turf)) {
    const map = {};
    for (let i = 0; i < turf.length; i++) {
      const entry = turf[i];
      if (typeof entry === 'string') map[entry] = true;
      else if (entry && typeof entry === 'object' && entry.key) {
        map[entry.key] = numOf(entry.progress, entry.value) === null ? !!entry.taken : entry.progress;
      }
    }
    turf = map;
  }
  if (turf && typeof turf === 'object') {
    let src = turf;
    if (turf.taken && typeof turf.taken === 'object' && !Array.isArray(turf.taken)) src = turf.taken;
    else if (turf.districts && typeof turf.districts === 'object' && !Array.isArray(turf.districts)) src = turf.districts;
    const listed = Array.isArray(turf.owned) ? turf.owned : Array.isArray(turf.list) ? turf.list : null;
    if (listed) {
      for (let i = 0; i < listed.length; i++) {
        const entry = listed[i];
        const key = typeof entry === 'string' ? entry : entry && entry.key;
        if (key) src[key] = true;
      }
    }
    for (let i = 0; i < DISTRICTS.length; i++) {
      const key = DISTRICTS[i].key;
      const v = src[key];
      const raw = turf[key];
      let own = false;
      let progress = 0;
      if (typeof v === 'boolean') {
        own = v;
        progress = v ? 100 : 0;
      } else if (typeof v === 'number') {
        progress = clamp(v, 0, 100);
        own = v >= 100;
      } else if (v && typeof v === 'object') {
        progress = clamp(numOf(v.progress, v.value, v.percent) || 0, 0, 100);
        own = !!v.taken || progress >= 100;
      }
      if (!own && raw !== v) {
        if (raw === true) {
          own = true;
          progress = 100;
        } else if (typeof raw === 'number' && raw > progress) {
          progress = clamp(raw, 0, 100);
          own = raw >= 100;
        }
      }
      pct[key] = own ? 100 : progress;
      if (own) {
        owned[key] = true;
        count++;
      }
    }
  }
  const reported = numOf(takenCount);
  if (reported !== null && reported > count) count = clamp(Math.round(reported), 0, TUNE.districtCount);
  return { owned, pct, count };
}

function readObjective(objective, districtName) {
  const where = districtName ? districtName.toUpperCase() + ' \u00b7 ' : '';
  const fallback = {
    title: 'Free Roam',
    text: where + 'Press J for the next job',
    progress: '',
    ratio: -1,
  };
  if (!objective) return fallback;
  if (typeof objective === 'string') {
    return { title: 'Objective', text: objective, progress: '', ratio: -1 };
  }
  if (typeof objective !== 'object') return fallback;

  const title = textOf(
    objective.title,
    objective.label,
    objective.name,
    objective.heading,
  ) || 'Objective';
  const text = textOf(
    objective.text,
    objective.detail,
    objective.description,
    objective.objective,
    objective.goal,
    objective.hint,
    objective.message,
  );

  let done = null;
  let total = null;
  const p = objective.progress;
  if (typeof p === 'number') {
    done = p;
    total = numOf(objective.target, objective.total);
  } else if (p && typeof p === 'object') {
    done = numOf(p.done, p.current, p.value, p.count);
    total = numOf(p.total, p.target, p.max, p.required);
  }
  if (done === null) {
    done = numOf(objective.count, objective.current, objective.collected, objective.done);
    total = numOf(objective.total, objective.target, objective.required);
  }

  let progress = '';
  if (typeof objective.progressText === 'string' && objective.progressText.length) {
    progress = objective.progressText;
  } else if (done !== null && total !== null && total > 0) {
    progress = Math.round(done) + ' / ' + Math.round(total);
  } else if (done !== null) {
    progress = String(Math.round(done));
  } else if (typeof objective.remaining === 'number') {
    progress = Math.round(objective.remaining) + ' left';
  }
  if (!progress) {
    const left = numOf(objective.timeLeft, objective.timer, objective.clock);
    if (left !== null) progress = 'Time ' + Math.max(0, Math.ceil(left)) + 's';
  }

  let ratio = -1;
  if (done !== null && total !== null && total > 0) ratio = clamp(done / total, 0, 1);

  return { title, text: text || fallback.text, progress, ratio };
}

function toastKind(text) {
  const t = String(text || '').toUpperCase();
  if (t.indexOf('HEAT CLEARED') >= 0 || t.indexOf('MUTED') >= 0) return 'cool';
  if (t.indexOf('MISSION COMPLETE') >= 0 || t.indexOf('TAKEN OVER') >= 0) return 'good';
  if (t.indexOf('MISSION FAILED') >= 0 || t.indexOf('BUSTED') >= 0 || t.indexOf('WASTED') >= 0) return 'heat';
  if (t.indexOf('WANTED') >= 0 || t.indexOf('HEAT') >= 0) return 'heat';
  if (t.indexOf('+$') >= 0 || t.indexOf('PAID') >= 0 || t.indexOf('STASH') >= 0 || t.indexOf('INCOME') >= 0) return 'cash';
  return '';
}

function drawMarkerList(snap) {
  const out = [];
  const push = (list) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || typeof p !== 'object') continue;
      if (p.taken || p.collected || p.done) continue;
      const x = numOf(p.x, p.px, p.position && p.position.x);
      const z = numOf(p.z, p.pz, p.position && p.position.z);
      if (x === null || z === null) continue;
      out.push({ x, z });
    }
  };
  push(snap.markers);
  push(snap.pickups);
  push(snap.collectibles);
  push(snap.taxiMarkers);
  push(snap.trialMarkers);
  return out;
}

export class HUD {
  constructor(callbacks) {
    this.callbacks = callbacks || {};
    this.time = 0;
    this.started = false;
    this.playing = false;
    this.paused = false;
    this.mapVisible = true;
    this.panel = null;
    this.cardTimer = 0;
    this.mapAcc = 1;
    this.mapBase = null;
    this.snapshot = null;
    this.toasts = [];
    this.card = null;
    this.cache = {};
    this.wanted = 0;
    this.turfCount = 0;

    this.prev = { cash: null, wanted: 0, health: null };
    this.flash = 0;
    this.vigValue = -1;

    this.el = {};
    this.panels = {};

    this.injectStyles();
    this.buildHud();
    this.buildOverlay();
    this.initMap();
    this.openPanel('title');
    this.refreshTitle();
    this.syncVisibility();

    this._onResize = () => this.resizeMap();
    if (typeof window !== 'undefined') window.addEventListener('resize', this._onResize);
  }

  // ------------------------------------------------------------------- styles
  injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  setText(key, node, value) {
    if (!node) return;
    const text = String(value);
    const cacheKey = 't:' + key;
    if (this.cache[cacheKey] === text) return;
    this.cache[cacheKey] = text;
    node.textContent = text;
  }

  setStyle(key, node, prop, value) {
    if (!node) return;
    const cacheKey = 's:' + key;
    if (this.cache[cacheKey] === value) return;
    this.cache[cacheKey] = value;
    node.style[prop] = value;
  }

  // ---------------------------------------------------------------------- HUD
  buildHud() {
    if (typeof document === 'undefined') return;

    this.root = document.getElementById('hud');
    if (!this.root) {
      this.root = make('div');
      this.root.id = 'hud';
      document.body.appendChild(this.root);
    }
    this.root.style.pointerEvents = 'none';

    this.startOverlay = document.getElementById('start');
    if (!this.startOverlay) {
      this.startOverlay = make('div');
      this.startOverlay.id = 'start';
      document.body.appendChild(this.startOverlay);
    }
    this.startOverlay.style.display = 'none';

    this.objectiveEl = document.getElementById('objective');
    this.brandEl = document.getElementById('title');
    this.incomeEl = document.getElementById('turf-income');

    this.minimap = document.getElementById('minimap');
    if (!this.minimap) {
      this.minimap = make('canvas');
      this.minimap.id = 'minimap';
      this.minimap.width = TUNE.mapSize;
      this.minimap.height = TUNE.mapSize;
      document.body.appendChild(this.minimap);
    }
    this.mapCtx = this.minimap.getContext ? this.minimap.getContext('2d') : null;

    this.vignette = make('div', 'mb-vignette');
    this.root.appendChild(this.vignette);

    const top = make('div', 'mb-topright');

    this.el.timeDot = make('span', 'mb-dot');
    this.el.timeLabel = make('span', null, 'Day');
    this.el.timeChip = make('div', 'mb-chip tod-day');
    this.el.timeChip.appendChild(this.el.timeDot);
    this.el.timeChip.appendChild(this.el.timeLabel);

    this.el.cash = make('div', 'mb-cash', '$0');

    this.el.stars = make('div', 'mb-stars');
    this.el.starSpans = [];
    for (let i = 0; i < 5; i++) {
      const star = make('span', null, '\u2605');
      this.el.stars.appendChild(star);
      this.el.starSpans.push(star);
    }

    this.el.turf = make('div', 'mb-turf');
    const turfTop = make('div', 'mb-turf-top');
    const turfLabel = make('span', null, 'Turf');
    this.el.turfCount = make('b', null, '0 / 6');
    turfTop.appendChild(turfLabel);
    turfTop.appendChild(this.el.turfCount);
    const pipRow = make('div', 'mb-pips');
    this.el.pips = [];
    for (let i = 0; i < TUNE.districtCount; i++) {
      const pip = make('span', 'mb-pip');
      pipRow.appendChild(pip);
      this.el.pips.push(pip);
    }
    this.el.income = make('div', 'mb-income', 'No district income');
    this.el.turf.appendChild(turfTop);
    this.el.turf.appendChild(pipRow);
    this.el.turf.appendChild(this.el.income);

    this.el.airUnit = make('div', 'mb-airunit', 'AIR UNIT \u00B7 HELI 1 \u2014 TRACKING');

    top.appendChild(this.el.timeChip);
    top.appendChild(this.el.cash);
    top.appendChild(this.el.stars);
    top.appendChild(this.el.airUnit);
    top.appendChild(this.el.turf);
    this.root.appendChild(top);

    const health = make('div', 'mb-health');
    const healthTop = make('div', 'mb-health-top');
    const hpName = make('span', null, 'Milo Kade');
    this.el.hpValue = make('b', null, '100');
    healthTop.appendChild(hpName);
    healthTop.appendChild(this.el.hpValue);
    const bar = make('div', 'mb-health-bar');
    this.el.hpFill = make('div', 'mb-health-fill');
    bar.appendChild(this.el.hpFill);
    this.el.ammo = make('div', 'mb-health-foot', 'Pistol \u00b7 12 rounds');
    health.appendChild(healthTop);
    health.appendChild(bar);
    health.appendChild(this.el.ammo);
    this.root.appendChild(health);

    const speed = make('div', 'mb-speed');
    this.el.speedNum = make('span', 'mb-speed-num', '0');
    this.el.vehicle = make('div', 'mb-vehicle', 'On foot');
    const speedRow = make('div');
    speedRow.appendChild(this.el.speedNum);
    speedRow.appendChild(make('span', 'mb-speed-unit', 'km/h'));
    speed.appendChild(speedRow);
    speed.appendChild(this.el.vehicle);
    this.el.speed = speed;
    this.root.appendChild(speed);

    // R9: radio now-playing line (above the speed number, bottom right).
    const radio = make('div', 'mb-radio');
    this.el.radioStation = make('div');
    this.el.radioTrack = make('div');
    const radioBar = make('div', 'bar');
    this.el.radioFill = make('div', 'fill');
    radioBar.appendChild(this.el.radioFill);
    radio.appendChild(this.el.radioStation);
    radio.appendChild(this.el.radioTrack);
    radio.appendChild(radioBar);
    this.el.radio = radio;
    this.root.appendChild(radio);

    // R9: action popup for driving shots.
    this.el.shotPopup = make('div', 'mb-shot-popup', '');
    this.root.appendChild(this.el.shotPopup);

    // R8 panels: police response (named units + live distance), crew ability
    // cards, and the dialog box. Built once, shown by updateShotPanels().
    const policePanel = make('div', 'mb-police');
    this.el.policeHead = make('div', 'mb-police-head');
    this.el.policeHead.appendChild(make('span', null, 'Police response'));
    this.el.policeHeadCount = make('b', null, '0 units');
    this.el.policeHead.appendChild(this.el.policeHeadCount);
    this.el.policeRows = make('div');
    this.el.policeFoot = make('div', 'mb-police-foot', 'Responding');
    policePanel.appendChild(this.el.policeHead);
    policePanel.appendChild(this.el.policeRows);
    policePanel.appendChild(this.el.policeFoot);
    this.el.police = policePanel;
    this.root.appendChild(policePanel);

    const crew = make('div', 'mb-crew');
    crew.appendChild(make('div', 'mb-crew-head', 'Crew · Abilities'));
    const crewDefs = [
      ['Z', 'Swap plates', 'Mira · Driver', PORTRAITS.Mira],
      ['X', 'Quick fix', 'Lio · Mechanic', PORTRAITS.Lio],
      ['C', 'Eyes out', 'Kiki · Lookout', PORTRAITS.Kiki],
    ];
    this.el.crewFaces = [];
    for (let i = 0; i < crewDefs.length; i++) {
      const card = make('div', 'mb-crew-card');
      const face = make('canvas', 'mb-crew-face');
      face.width = 24;
      face.height = 24;
      drawPortrait(face, crewDefs[i][3]);
      this.el.crewFaces.push(face);
      card.appendChild(face);
      const mid = make('div');
      mid.appendChild(make('div', 'mb-crew-name', crewDefs[i][1]));
      mid.appendChild(make('div', 'mb-crew-who', crewDefs[i][2]));
      card.appendChild(mid);
      const key = make('div', 'mb-crew-key', crewDefs[i][0]);
      key.style.marginLeft = 'auto';
      card.appendChild(key);
      crew.appendChild(card);
    }
    this.el.crew = crew;
    this.root.appendChild(crew);

    // R9: weapon slots row (right column, above the crew cards).
    const weapons = make('div', 'mb-weapons');
    this.el.weaponSlots = [];
    for (let i = 0; i < WEAPON_SLOTS.length; i++) {
      const s = WEAPON_SLOTS[i];
      const slot = make('div', 'mb-wslot' + (s.locked ? ' locked' : ''));
      slot.appendChild(make('div', 'n', s.n));
      slot.appendChild(make('div', 'i', s.locked ? 'LOCKED' : s.icon));
      const ammoEl = make('div', 'a', s.locked ? '' : (s.ammo === null ? '' : s.ammo));
      slot.appendChild(ammoEl);
      weapons.appendChild(slot);
      this.el.weaponSlots.push({ slot, ammoEl, def: s });
    }
    this.el.weapons = weapons;
    this.root.appendChild(weapons);

    const dialog = make('div', 'mb-dialog');
    const dialogFace = make('canvas', 'mb-dialog-face');
    dialogFace.width = 34;
    dialogFace.height = 34;
    this.el.dialogFace = dialogFace;
    drawPortrait(dialogFace, PORTRAITS.Mira);
    const dialogMid = make('div');
    this.el.dialogName = make('div', 'mb-dialog-name', '');
    this.el.dialogText = make('div', 'mb-dialog-text', '');
    dialogMid.appendChild(this.el.dialogName);
    dialogMid.appendChild(this.el.dialogText);
    dialog.appendChild(this.el.dialogFace);
    dialog.appendChild(dialogMid);
    this.el.dialog = dialog;
    this.root.appendChild(dialog);

    // R9: garage screen (Hillside Garage) — fullscreen overlay.
    this.buildGaragePanel();

    this.root.appendChild(make(
      'div',
      'mb-controls',
      'WASD move \u00b7 Shift sprint \u00b7 E car \u00b7 F punch \u00b7 Click/G fire \u00b7 R reload \u00b7 P pause \u00b7 M mute \u00b7 H jobs',
    ));

    this.toastLayer = make('div', 'mb-toasts');
    this.root.appendChild(this.toastLayer);

    if (this.objectiveEl) {
      this.objectiveEl.replaceChildren();
      this.objTitle = make('div', 'mb-obj-title');
      this.objText = make('div', 'mb-obj-text');
      this.objBar = make('div', 'mb-obj-bar');
      this.objFill = make('div', 'mb-obj-fill');
      this.objBar.appendChild(this.objFill);
      this.objProgress = make('div', 'mb-obj-prog');
      this.objectiveEl.appendChild(this.objTitle);
      this.objectiveEl.appendChild(this.objText);
      this.objectiveEl.appendChild(this.objBar);
      this.objectiveEl.appendChild(this.objProgress);
    }
  }

  panelShell(name, cls) {
    const wrap = make('div', 'mb-panel ' + (cls || ''));
    wrap.dataset.panel = name;
    this.panels[name] = wrap;
    this.startOverlay.appendChild(wrap);
    return wrap;
  }

  button(label, cls, onClick) {
    const btn = make('button', 'mb-btn ' + (cls || ''), label);
    btn.type = 'button';
    const swallow = (e) => {
      e.stopPropagation();
    };
    btn.addEventListener('pointerdown', swallow);
    btn.addEventListener('pointerup', swallow);
    btn.addEventListener('mousedown', swallow);
    btn.addEventListener('mouseup', swallow);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onClick === 'function') onClick();
    });
    return btn;
  }

  buildOverlay() {
    if (typeof document === 'undefined') return;
    const ov = this.startOverlay;
    ov.replaceChildren();
    this.panels = {};
    this.buildTitlePanel();
    this.buildPausePanel();
    this.buildJobsPanel();

    const block = (e) => {
      e.stopPropagation();
    };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel']) {
      ov.addEventListener(type, block);
    }
  }

  buildTitlePanel() {
    const p = this.panelShell('title', 'mb-titlecard');

    p.appendChild(make('div', 'mb-kicker', 'Driver for hire \u00b7 Marisol Bay'));
    p.appendChild(make('div', 'mb-title', 'MARISOL BAY'));
    p.appendChild(make('div', 'mb-sub', 'Six districts. One city. Take it.'));
    p.appendChild(make('div', 'mb-lede',
      'Milo Kade drives rich tourists by day and moves other people\u2019s cargo by night. ' +
      'The bay is carved into six districts and every one of them pays somebody. ' +
      'Take the turf, mind the heat, keep the car running.'));

    const keys = make('div', 'mb-keys');
    const rows = [
      ['WASD / Shift', 'Walk, sprint'],
      ['E', 'Enter or exit a car'],
      ['F / Click / G', 'Punch, fire'],
      ['R', 'Reload'],
      ['J', 'Start the next job'],
      ['H', 'Job list'],
      ['P / Esc', 'Pause'],
      ['M', 'Mute audio'],
    ];
    for (let i = 0; i < rows.length; i++) {
      keys.appendChild(make('div', 'mb-key', rows[i][0]));
      keys.appendChild(make('div', null, rows[i][1]));
    }
    p.appendChild(keys);

    this.el.titleStats = make('div', 'mb-stats');
    p.appendChild(this.el.titleStats);

    const actions = make('div', 'mb-actions');
    this.el.continueBtn = this.button('Continue', 'primary', () => this.beginGame());
    this.el.newBtn = this.button('New Game', '', () => this.newGame());
    this.el.jobsFromTitle = this.button('Jobs', '', () => this.toggleMissions());
    actions.appendChild(this.el.continueBtn);
    actions.appendChild(this.el.newBtn);
    actions.appendChild(this.el.jobsFromTitle);
    p.appendChild(actions);

    p.appendChild(make('div', 'mb-note',
      'An original game made for the make.fun bounty \u2014 own city, own characters, own code.'));
  }

  buildPausePanel() {
    const p = this.panelShell('pause', 'mb-card');

    p.appendChild(make('div', 'mb-card-head', 'Paused'));
    p.appendChild(make('div', 'mb-card-title', 'Marisol Bay'));
    p.appendChild(make('div', 'mb-card-sub', 'The bay waits. Nothing moves while you are here.'));

    this.el.pauseStats = make('div', 'mb-stats');
    p.appendChild(this.el.pauseStats);

    const actions = make('div', 'mb-actions');
    actions.appendChild(this.button('Resume', 'primary', () => this.resume()));
    actions.appendChild(this.button('Restart Job', '', () => this.restartJob()));
    actions.appendChild(this.button('Save', '', () => this.saveNow()));
    actions.appendChild(this.button('Mute / Unmute', '', () => pressKey('KeyM', 'm')));
    actions.appendChild(this.button('Toggle Map', '', () => this.setMinimap(!this.mapVisible)));
    actions.appendChild(this.button('Quit to Title', '', () => this.quitToTitle()));
    p.appendChild(actions);
  }

  buildJobsPanel() {
    const p = this.panelShell('jobs', 'mb-card');
    p.appendChild(make('div', 'mb-card-head', 'Work board'));
    p.appendChild(make('div', 'mb-card-title', 'Jobs'));
    p.appendChild(make('div', 'mb-card-sub', 'Story jobs unlock as districts fall under your flag.'));
    this.el.jobList = make('div', 'mb-jobs');
    p.appendChild(this.el.jobList);
    const actions = make('div', 'mb-actions');
    actions.appendChild(this.button('Close', 'primary', () => this.openPanel(this.jobsReturn || null)));
    actions.appendChild(this.button('Start Next', '', () => this.restartJob()));
    p.appendChild(actions);
  }

  openPanel(name) {
    if (!this.startOverlay) return;
    this.panel = name || null;
    const keys = Object.keys(this.panels);
    for (let i = 0; i < keys.length; i++) {
      const node = this.panels[keys[i]];
      const on = keys[i] === name;
      node.style.display = on ? 'block' : 'none';
    }
    if (name) {
      this.startOverlay.style.display = 'flex';
      this.startOverlay.classList.remove('hidden');
      if (name === 'title') this.refreshTitle();
      if (name === 'pause') this.refreshPause();
      if (name === 'jobs') this.refreshJobs();
    } else {
      this.startOverlay.style.display = 'none';
      this.startOverlay.classList.add('hidden');
    }
    this.syncVisibility();
  }

  closePanel() {
    this.openPanel(null);
  }

  refreshTitle() {
    if (!this.el.titleStats) return;
    const game = typeof window !== 'undefined' ? window.MARISOL : null;
    const saved = hasSave();
    if (this.el.continueBtn) this.el.continueBtn.style.display = saved ? '' : 'none';

    let held = this.turfCount;
    let bank = this.snapshot ? (numOf(this.snapshot.cash) || 0) : 0;
    if (game && game.missions) {
      if (typeof game.missions.turfCount === 'function') {
        const n = game.missions.turfCount();
        if (typeof n === 'number' && isFinite(n)) held = clamp(Math.round(n), 0, TUNE.districtCount);
      }
      if (typeof game.cash === 'number' && isFinite(game.cash)) bank = game.cash;
    }
    this.turfCount = held;

    const rows = [
      'Districts held', held + ' / ' + TUNE.districtCount,
      'Bank', money(bank),
      'Save slot', saved ? 'continue available' : 'empty',
    ];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < rows.length; i++) frag.appendChild(make('span', null, rows[i]));
    this.el.titleStats.replaceChildren(frag);
  }

  refreshPause() {
    if (!this.el.pauseStats) return;
    const snap = this.snapshot || {};
    const rows = [
      'District', snap.district || '\u2014',
      'Turf', this.turfCount + ' / ' + TUNE.districtCount,
      'Bank', money(snap.cash || 0),
      'Heat', this.wanted + ' / 5',
    ];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < rows.length; i++) frag.appendChild(make('span', null, rows[i]));
    this.el.pauseStats.replaceChildren(frag);
  }

  beginGame() {
    this.started = true;
    this.playing = true;
    this.paused = false;
    this.closePanel();
    if (this.root) this.root.style.opacity = '1';
    if (typeof this.callbacks.onStart === 'function') this.callbacks.onStart();
  }

  newGame() {
    let hadSave = false;
    try {
      if (typeof localStorage !== 'undefined') {
        hadSave = !!localStorage.getItem(SAVE_KEY);
        localStorage.removeItem(SAVE_KEY);
      }
    } catch (err) {
      void err;
    }
    if (hadSave && typeof location !== 'undefined' && typeof location.reload === 'function') {
      location.reload();
      return;
    }
    this.startFresh();
  }

  startFresh() {
    this.beginGame();
    this.toast('NEW GAME \u00b7 WELCOME TO MARISOL BAY', 3.4);
    this.toast('PRESS J FOR YOUR FIRST JOB', 3.6);
  }

  resume() {
    if (this.paused) {
      if (typeof this.callbacks.onPauseToggle === 'function') this.callbacks.onPauseToggle();
      else this.setPaused(false);
    } else {
      this.closePanel();
    }
  }

  restartJob() {
    this.resume();
    if (!this.started) return;
    const game = typeof window !== 'undefined' ? window.MARISOL : null;
    const missions = game && game.missions;
    if (missions && typeof missions === 'object') {
      if (typeof missions.restart === 'function') {
        try {
          missions.restart();
          this.toast('JOB RESTARTED', 2);
          return;
        } catch (err) {
          void err;
        }
      }
      const current = missions.current || missions.activeMission || null;
      if (current && typeof missions.startMission === 'function' && typeof current.id === 'string') {
        try {
          if (missions.isMissionActive) missions.startMission(current.id);
          else pressKey('KeyJ', 'j');
          return;
        } catch (err) {
          void err;
        }
      }
    }
    pressKey('KeyJ', 'j');
  }

  saveNow() {
    const game = typeof window !== 'undefined' ? window.MARISOL : null;
    try {
      if (game && game.save && game.missions && typeof game.missions.serialize === 'function') {
        const data = game.missions.serialize();
        data.cash = game.cash;
        data.settings = {
          volume: game.audio ? game.audio.volume : 1,
          muted: game.audio ? game.audio.muted : false,
          minimap: this.mapVisible,
        };
        game.save.save(data);
        this.toast('GAME SAVED', 2);
      } else {
        this.toast('SAVE UNAVAILABLE', 2);
      }
    } catch (err) {
      this.toast('SAVE FAILED', 2);
    }
  }

  quitToTitle() {
    if (this.paused && typeof this.callbacks.onPauseToggle === 'function') {
      this.callbacks.onPauseToggle();
    }
    this.paused = false;
    this.started = false;
    this.playing = false;
    this.clearToasts();
    this.openPanel('title');
    this.refreshTitle();
  }

  setPaused(v) {
    this.paused = !!v;
    if (!this.started) return;
    if (this.paused) {
      this.refreshPause();
      this.openPanel('pause');
    } else if (this.panel === 'pause' || this.panel === 'jobs') {
      this.closePanel();
    }
  }

  syncVisibility() {
    const on = !!this.started;
    if (this.root) this.root.style.visibility = on ? 'visible' : 'hidden';
    if (this.objectiveEl) this.objectiveEl.style.visibility = on ? 'visible' : 'hidden';
    if (this.minimap) this.minimap.style.display = (on && this.mapVisible) ? 'block' : 'none';
    if (this.incomeEl) this.incomeEl.style.visibility = on ? 'visible' : 'hidden';
    if (this.brandEl) {
      const overlayUp = !!this.startOverlay && this.startOverlay.style.display !== 'none';
      const hide = this.panel === 'title' && overlayUp;
      this.brandEl.style.display = hide ? 'none' : 'block';
    }
  }

  setMinimap(on) {
    const value = !!on;
    const changed = value !== this.mapVisible;
    this.mapVisible = value;
    if (this.minimap) this.minimap.style.display = this.mapVisible ? 'block' : 'none';
    if (changed && this.started) this.toast(this.mapVisible ? 'MAP ON' : 'MAP OFF', 1.4);
  }

  toggleMissions() {
    if (this.panel === 'jobs') {
      this.openPanel(this.jobsReturn || null);
      return;
    }
    this.jobsReturn = this.panel || (this.started ? null : 'title');
    this.refreshJobs();
    this.openPanel('jobs');
  }

  missionsList() {
    const snap = this.snapshot;
    if (snap && snap.missions) return snap.missions;
    const game = typeof window !== 'undefined' ? window.MARISOL : null;
    if (game && game.missions && typeof game.missions.getMissions === 'function') {
      return game.missions.getMissions();
    }
    return null;
  }

  refreshJobs() {
    if (!this.el.jobList) return;
    const list = this.missionsList();
    const rows = [];
    const statusOf = (m) => {
      if (!m || typeof m !== 'object') return { status: 'Open', done: false };
      if (m.completed === true || m.done === true) return { status: 'Done', done: true };
      const raw = textOf(m.status, m.state);
      if (raw) return { status: raw, done: raw.toLowerCase() === 'done' || raw.toLowerCase() === 'complete' };
      if (m.active === true) return { status: 'Active', done: false };
      if (m.locked === true || m.unlocked === false) return { status: 'Locked', done: false };
      return { status: 'Open', done: false };
    };
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const m = list[i] || {};
        const title = textOf(m.title, m.name, m.id) || 'Job';
        const info = statusOf(m);
        rows.push({ title, status: info.status, done: info.done });
      }
    } else if (list && typeof list === 'object') {
      const keys = Object.keys(list);
      for (let i = 0; i < keys.length; i++) {
        const m = list[keys[i]] || {};
        const title = textOf(m.title, m.name, keys[i]);
        const info = statusOf(m);
        rows.push({ title, status: info.status, done: info.done });
      }
    }
    if (!rows.length) {
      rows.push({ title: 'No jobs listed', status: 'Free roam', done: false });
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < rows.length; i++) {
      const row = make('div', 'mb-job' + (rows[i].done ? ' done' : ''));
      row.appendChild(make('b', null, rows[i].title));
      row.appendChild(make('span', null, rows[i].status));
      frag.appendChild(row);
    }
    this.el.jobList.replaceChildren(frag);
  }

  // R8: dialog line for screenshot scenes. Crew cards and the dialog show in
  // shot mode; the police panel shows whenever units are on the map.
  setShotDialog(speaker, role, text) {
    this.shotDialog = {
      speaker: String(speaker || ''),
      role: String(role || ''),
      text: String(text || ''),
    };
    if (this.el.dialogFace) {
      const first = String(this.shotDialog.speaker || 'Mira').split(' ')[0];
      drawPortrait(this.el.dialogFace, PORTRAITS[first] || PORTRAITS.Mira);
    }
    if (this.el.dialogName) {
      this.el.dialogName.textContent = this.shotDialog.speaker
        + (this.shotDialog.role ? '  ·  ' + this.shotDialog.role : '');
    }
    if (this.el.dialogText) this.el.dialogText.textContent = this.shotDialog.text;
  }

  // R9: garage screen (Hillside Garage). A fullscreen overlay; the 3D car
  // shows through the left half, the upgrade panel fills the right.
  buildGaragePanel() {
    const wrap = make('div', 'mb-garage');
    const top = make('div', 'mb-garage-top');
    top.appendChild(make('span', 'mb-garage-name', 'HILLSIDE GARAGE'));
    top.appendChild(make('span', 'mb-garage-sub', 'Spray & Tune \u00B7 Pilar Santos \u2014 \u201CYou break it, I bill it.\u201D'));
    this.el.garageCash = make('span', 'mb-garage-cash', '$18,450');
    top.appendChild(this.el.garageCash);
    wrap.appendChild(top);

    const panel = make('div', 'mb-garage-panel');
    const head = make('h3', null, 'SPRAY & TUNE ');
    head.appendChild(make('span', null, 'CAR UPGRADES'));
    panel.appendChild(head);
    for (let i = 0; i < GARAGE_UPGRADES.length; i++) {
      const u = GARAGE_UPGRADES[i];
      const row = make('div', 'mb-garage-row' + (i === 2 ? ' sel' : ''));
      row.appendChild(make('span', null, u.name));
      row.appendChild(make('span', 'fx', u.fx));
      if (u.status === 'OWNED') row.appendChild(make('span', 'st-owned', '\u2713 OWNED'));
      else if (u.status === 'LOCKED') {
        row.appendChild(make('span', 'st-locked', 'LOCKED \u00B7 LV 6'));
        row.appendChild(make('span', 'pr', u.price));
      } else row.appendChild(make('span', 'pr', u.price));
      panel.appendChild(row);
    }
    wrap.appendChild(panel);

    // Car card sits bottom-left, over the 3D car (like the winners' garage).
    const card = make('div', 'mb-garage-card mb-garage-carcard');
    card.appendChild(make('div', 'cn', 'KITE COUPE'));
    card.appendChild(make('div', 'cc', 'CLASS: SPORT \u00B7 CONDITION 84%'));
    const bar = make('div', 'mb-garage-bar');
    const fill = make('div', 'mb-garage-fill');
    fill.style.width = '84%';
    bar.appendChild(fill);
    card.appendChild(bar);
    const stats = [
      ['TOP SPEED', 78, '186 KM/H'],
      ['ACCELERATION', 72, '7.2 S 0\u2013100'],
      ['ARMOUR', 60, '60/100'],
      ['HANDLING', 81, '81/100'],
    ];
    for (let i = 0; i < stats.length; i++) {
      const st = make('div', 'mb-garage-stat');
      st.appendChild(make('span', null, stats[i][0]));
      const sb = make('div', 'sb');
      const sf = make('div', 'sf');
      sf.style.width = stats[i][1] + '%';
      sb.appendChild(sf);
      st.appendChild(sb);
      st.appendChild(make('span', null, stats[i][2]));
      card.appendChild(st);
    }
    wrap.appendChild(card);

    const foot = make('div', 'mb-garage-foot');
    foot.appendChild(make('span', 'mb-garage-btn', '\u25C0 BACK'));
    foot.appendChild(make('span', 'mb-garage-btn', 'REPAIR ALL \u2014 $450'));
    const buy = make('span', 'mb-garage-btn buy', 'BUY');
    const equip = make('span', 'mb-garage-btn equip', 'EQUIP');
    foot.appendChild(buy);
    foot.appendChild(equip);
    wrap.appendChild(foot);

    this.el.garage = wrap;
    this.root.appendChild(wrap);
  }

  openGarage(cash) {
    if (this.el.garageCash && typeof cash === 'number') {
      this.el.garageCash.textContent = money(cash);
    }
    if (this.el.garage) this.el.garage.classList.add('on');
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('mb-garage-on');
    }
    this.garageOpen = true;
  }

  closeGarage() {
    if (this.el.garage) this.el.garage.classList.remove('on');
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mb-garage-on');
    }
    this.garageOpen = false;
  }

  // R9: staged mission objective for screenshot scenes (overrides the live
  // mission objective in applySnapshot while set).
  setShotObjective(title, text, progress, ratio) {
    this.shotObjective = {
      title: String(title || ''),
      text: String(text || ''),
      progress: String(progress || ''),
      ratio: typeof ratio === 'number' ? ratio : -1,
    };
  }

  clearShotObjective() {
    this.shotObjective = null;
  }

  // R9: staged radio line for screenshot scenes.
  setShotRadio(station, track, progress) {
    this.shotRadio = { station, track, progress: typeof progress === 'number' ? progress : 0 };
  }

  // R9: staged action popup (DRIFT / NEAR MISS) for driving shots.
  setShotPopup(text) {
    this.shotPopup = String(text || '');
    if (this.el.shotPopup) {
      this.el.shotPopup.textContent = this.shotPopup;
      this.el.shotPopup.classList.toggle('on', !!this.shotPopup);
    }
  }

  updateShotPanels(snap) {
    const shot = typeof document !== 'undefined'
      && document.body && document.body.classList.contains('mb-shot');
    const px = snap && snap.playerPos ? snap.playerPos.x : 0;
    const pz = snap && snap.playerPos ? snap.playerPos.z : 0;
    const units = [];
    if (snap && Array.isArray(snap.policePositions)) {
      for (let i = 0; i < snap.policePositions.length; i++) {
        const p = snap.policePositions[i];
        if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
        units.push({ d: Math.round(Math.hypot(p.x - px, p.z - pz)), i });
      }
    }
    units.sort((a, b) => a.d - b.d);
    const shown = units.slice(0, 6);
    // R9: heli row always on top of the police panel when the air unit is up.
    const heli = snap && snap.heli && snap.heli.visible ? snap.heli : null;
    if (this.el.police) {
      const show = shown.length > 0 || !!heli;
      this.el.police.classList.toggle('on', show);
      if (show) {
        const key = (heli ? 'H:' + heli.dist + '|' : '') + shown.map((u) => u.i + ':' + u.d).join('|');
        if (key !== this.cache.policeKey) {
          this.cache.policeKey = key;
          this.setText('policeCount', this.el.policeHeadCount,
            (shown.length + (heli ? 1 : 0)) + ' units');
          const frag = document.createDocumentFragment();
          if (heli) {
            const row = make('div', 'mb-police-row');
            row.appendChild(make('span', 'u', 'HELI 1'));
            row.appendChild(make('span', 'r', 'SPOTLIGHT'));
            row.appendChild(make('span', 'd', heli.dist + ' m'));
            frag.appendChild(row);
          }
          for (let k = 0; k < shown.length; k++) {
            const row = make('div', 'mb-police-row');
            row.appendChild(make('span', 'u', POLICE_NAMES[shown[k].i % POLICE_NAMES.length]));
            row.appendChild(make('span', 'r', POLICE_ROLES[shown[k].i % POLICE_ROLES.length]));
            row.appendChild(make('span', 'd', shown[k].d + ' m'));
            frag.appendChild(row);
          }
          this.el.policeRows.replaceChildren(frag);
          const closest = heli ? Math.min(heli.dist, shown.length ? shown[0].d : 999) : shown[0].d;
          this.setText('policeFoot', this.el.policeFoot,
            closest <= 25
              ? 'In sight \u00B7 closest ' + closest + ' m'
              : 'Responding \u00B7 closest ' + closest + ' m');
        }
      }
    }
    if (this.el.airUnit) {
      this.el.airUnit.classList.toggle('on', !!heli);
      if (heli) {
        this.setText('airUnit', this.el.airUnit,
          'AIR UNIT \u00B7 HELI 1 \u2014 ' + (heli.state === 'arriving' ? 'INBOUND' : 'TRACKING'));
      }
    }
    if (this.el.crew) this.el.crew.classList.toggle('on', shot);
    if (this.el.weapons) {
      this.el.weapons.classList.toggle('on', shot);
      if (shot && this.el.weaponSlots) {
        for (let i = 0; i < this.el.weaponSlots.length; i++) {
          const w = this.el.weaponSlots[i];
          w.slot.classList.toggle('active', i === 1);
          if (w.def.ammo === null && !w.def.locked && snap && typeof snap.ammo === 'number') {
            const label = w.def.name === 'PISTOL' ? Math.round(snap.ammo) + '' : '';
            if (label && w.ammoEl.textContent !== label) w.ammoEl.textContent = label;
          }
        }
      }
    }
    if (this.el.radio) {
      const np = (snap && snap.radio) || this.shotRadio || null;
      const showRadio = !!(shot && np);
      this.el.radio.classList.toggle('on', showRadio);
      if (showRadio) {
        const stationName = np.station || np.stationId || '';
        const trackTitle = np.title || np.track || '';
        const artist = np.artist || '';
        const key = stationName + '|' + trackTitle + '|' + Math.floor((np.progress || 0) * 20);
        if (key !== this.cache.radioKey) {
          this.cache.radioKey = key;
          const stationLine = '\u266A ' + stationName + ' \u2014 ' + (np.playing ? 'PLAYING' : 'PAUSED');
          this.setText('radioStation', this.el.radioStation, stationLine);
          this.setText('radioTrack', this.el.radioTrack, '\u201C' + trackTitle + '\u201D' + (artist ? ' \u2014 ' + artist : ''));
          this.el.radioStation.style.color = np.color || '#ffe9c9';
          this.el.radioFill.style.background = np.color || '#ffd166';
        }
        this.el.radioFill.style.width = Math.round((np.progress || 0) * 100) + '%';
      }
    }
    if (this.el.dialog) {
      this.el.dialog.classList.toggle('on', !!(shot && this.shotDialog && this.shotDialog.text));
    }
  }

  // ---------------------------------------------------------------- toasts
  toast(text, seconds) {
    if (!this.toastLayer || typeof document === 'undefined') return;
    const message = String(text === undefined || text === null ? '' : text).trim();
    if (!message) return;

    const life = typeof seconds === 'number' && seconds > 0 ? seconds : TUNE.toastLife;
    const node = make('div', 'mb-toast' + (toastKind(message) ? ' ' + toastKind(message) : ''), message);
    this.toastLayer.appendChild(node);
    const item = { node, life, max: life };
    this.toasts.push(item);
    while (this.toasts.length > TUNE.toastMax) {
      const old = this.toasts.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
    this.noticeEvent(message);
  }

  clearToasts() {
    for (let i = 0; i < this.toasts.length; i++) {
      const t = this.toasts[i];
      if (t.node.parentNode) t.node.parentNode.removeChild(t.node);
    }
    this.toasts.length = 0;
  }

  updateToasts(dt) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.life -= dt;
      if (t.life <= 0) {
        if (t.node.parentNode) t.node.parentNode.removeChild(t.node);
        this.toasts.splice(i, 1);
      } else if (t.life < 0.4) {
        t.node.style.opacity = String(Math.max(0, t.life / 0.4));
      }
    }
  }

  // ------------------------------------------------------------ event cards
  noticeEvent(message) {
    const text = message.toUpperCase();
    const reward = /\+\$([0-9,]+)/.exec(message);
    const rewardValue = reward ? Number(reward[1].replace(/,/g, '')) : 0;
    const bankNow = () => {
      if (this.prev.cash !== null) return this.prev.cash;
      if (this.snapshot) return numOf(this.snapshot.cash) || 0;
      return 0;
    };

    if (text.indexOf('MISSION COMPLETE') >= 0) {
      this.showCard('complete', {
        head: 'Job closed',
        title: 'Mission Complete',
        sub: 'The bay noticed. Heat is climbing.',
        rows: [
          ['Payout', '+' + money(rewardValue)],
          ['Districts held', this.turfCount + ' / ' + TUNE.districtCount],
          ['Bank', money(bankNow() + rewardValue)],
        ],
      });
    } else if (text.indexOf('MISSION FAILED') >= 0) {
      const reason = message.split('\u2014')[1] || message.replace(/MISSION FAILED/i, '');
      this.showCard('failed', {
        head: 'Job blown',
        title: 'Mission Failed',
        sub: (reason || '').trim() || 'It fell apart. Press J to try again.',
        rows: [
          ['Retry', 'Press J'],
          ['Bank', money(bankNow())],
        ],
      });
    } else if (text.indexOf('BUSTED') >= 0 || text.indexOf('WASTED') >= 0) {
      this.showCard('failed', {
        head: 'Marisol PD',
        title: text.indexOf('BUSTED') >= 0 ? 'Busted' : 'Wasted',
        sub: 'The bay spits you back out on the promenade.',
        rows: [['Bank', money(bankNow())]],
      });
    } else if (/TAKEN OVER$/.test(text)) {
      const name = message.replace(/\s*TAKEN OVER$/i, '');
      this.showCard('turf', {
        head: 'Turf secured',
        title: name || 'District',
        sub: 'Income starts today. Heat starts now.',
        rows: [
          ['Districts held', this.turfCount + ' / ' + TUNE.districtCount],
          ['Income', money(this.turfCount * INCOME_PER_TICK) + ' / ' + INCOME_TICK + 's'],
        ],
      });
    }
  }

  showCard(kind, config) {
    if (!this.root || typeof document === 'undefined') return;
    this.hideCard();
    const bad = kind === 'failed';
    const node = make('div', 'mb-panel mb-card' + (bad ? ' bad' : ''));
    node.style.position = 'absolute';
    node.style.left = '50%';
    node.style.top = '50%';
    node.style.transform = 'translate(-50%, -50%)';
    node.style.pointerEvents = 'none';
    node.style.width = 'min(420px, 78vw)';
    node.style.padding = '20px 24px';
    node.style.opacity = '0.97';

    node.appendChild(make('div', 'mb-card-head', config.head || ''));
    node.appendChild(make('div', 'mb-card-title', config.title || ''));
    if (config.sub) node.appendChild(make('div', 'mb-card-sub', config.sub));

    const rows = make('div', 'mb-rows');
    const list = Array.isArray(config.rows) ? config.rows : [];
    for (let i = 0; i < list.length; i++) {
      rows.appendChild(make('div', 'k', list[i][0]));
      rows.appendChild(make('div', 'v', list[i][1]));
    }
    node.appendChild(rows);
    node.appendChild(make('div', 'mb-note', 'Press J for the next job \u00b7 P to pause'));

    this.root.appendChild(node);
    this.card = node;
    this.cardTimer = TUNE.cardLife;
  }

  hideCard() {
    if (this.card && this.card.parentNode) this.card.parentNode.removeChild(this.card);
    this.card = null;
    this.cardTimer = 0;
  }

  updateCard(dt) {
    if (!this.card) return;
    this.cardTimer -= dt;
    if (this.cardTimer <= 0) {
      this.hideCard();
    } else if (this.cardTimer < 0.5) {
      this.card.style.opacity = String(Math.max(0, this.cardTimer / 0.5));
    }
  }

  // ------------------------------------------------------------------ minimap
  initMap() {
    this.resizeMap();
    this.buildMapBase();
    this.mapAcc = 1;
  }

  resizeMap() {
    if (!this.minimap) return;
    const size = TUNE.mapSize;
    if (this.minimap.width !== size) this.minimap.width = size;
    if (this.minimap.height !== size) this.minimap.height = size;
    this.mapDpr = 1;
  }

  mapX(x) {
    const t = (x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0);
    return clamp(t, 0, 1) * TUNE.mapSize;
  }

  mapY(z) {
    const t = (z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0);
    return clamp(t, 0, 1) * TUNE.mapSize;
  }

  buildMapBase() {
    if (typeof document === 'undefined') return;
    const S = TUNE.mapSize;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.mapBase = canvas;

    const mx = (x) => this.mapX(x);
    const my = (z) => this.mapY(z);
    const rect = (x0, z0, x1, z1) => {
      const ax = mx(Math.min(x0, x1));
      const az = my(Math.min(z0, z1));
      const bx = mx(Math.max(x0, x1));
      const bz = my(Math.max(z0, z1));
      return [ax, az, Math.max(0.6, bx - ax), Math.max(0.6, bz - az)];
    };

    ctx.fillStyle = '#123948';
    ctx.fillRect(0, 0, S, S);

    const waterGrad = ctx.createLinearGradient(0, 0, mx(WORLD.landEdgeX), 0);
    waterGrad.addColorStop(0, '#1d6178');
    waterGrad.addColorStop(1, '#2a7d92');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, Math.max(1, mx(WORLD.landEdgeX)), S);

    const landR = rect(WORLD.landEdgeX, BOUNDS.z0, WORLD.maxX, BOUNDS.z1);
    ctx.fillStyle = '#4a5a4c';
    ctx.fillRect(landR[0], landR[1], landR[2], landR[3]);

    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      const r = rect(d.center.x - d.size.w / 2, d.center.z - d.size.d / 2,
        d.center.x + d.size.w / 2, d.center.z + d.size.d / 2);
      ctx.fillStyle = hexOf(d.ground);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      ctx.globalAlpha = 1;
    }

    const sandR = rect(
      WORLD.sandCenterX - WORLD.sandWidth / 2, BOUNDS.z0,
      WORLD.sandCenterX + WORLD.sandWidth / 2, BOUNDS.z1,
    );
    ctx.fillStyle = '#e3d3ac';
    ctx.fillRect(sandR[0], sandR[1], sandR[2], sandR[3]);

    const promR = rect(
      WORLD.promenadeX - WORLD.promenadeWidth / 2, BOUNDS.z0,
      WORLD.promenadeX + WORLD.promenadeWidth / 2, BOUNDS.z1,
    );
    ctx.fillStyle = '#cfc4a8';
    ctx.fillRect(promR[0], promR[1], promR[2], promR[3]);

    const xs = Array.isArray(WORLD.gridLinesX) ? WORLD.gridLinesX : [];
    const zs = Array.isArray(WORLD.gridLinesZ) ? WORLD.gridLinesZ : [];
    ctx.strokeStyle = '#2f353b';
    ctx.lineWidth = 1;
    for (let i = 0; i < xs.length; i++) {
      const px = Math.round(mx(xs[i])) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, my(WORLD.minZ !== undefined ? WORLD.minZ : BOUNDS.z0));
      ctx.lineTo(px, my(WORLD.maxZ !== undefined ? WORLD.maxZ : BOUNDS.z1));
      ctx.stroke();
    }
    for (let i = 0; i < zs.length; i++) {
      const py = Math.round(my(zs[i])) + 0.5;
      ctx.beginPath();
      ctx.moveTo(mx(xs.length ? xs[0] - 18 : BOUNDS.x0), py);
      ctx.lineTo(mx(WORLD.maxX), py);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,246,229,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx(WORLD.landEdgeX) + 0.5, 0);
    ctx.lineTo(mx(WORLD.landEdgeX) + 0.5, S);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,246,229,0.5)';
    ctx.font = '600 7px "Trebuchet MS","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      if (d.key === 'beachfront') continue;
      const label = d.name.split(' ')[0].toUpperCase();
      ctx.fillText(label, mx(d.center.x), my(d.center.z));
    }
  }

  // Side-activity blips (taxi fares, time trials, cash stashes). main.js only
  // hands over the story marker, so the rest is read defensively off the live
  // missions object and re-scanned a few times a second.
  scanExtras() {
    const now = this.time;
    if (this.extraT && now - this.extraT < 0.5) return this.extraMarkers;
    this.extraT = now;
    const out = [];
    const game = typeof window !== 'undefined' ? window.MARISOL : null;
    const missions = game && game.missions;
    if (!missions || typeof missions !== 'object') {
      this.extraMarkers = out;
      return out;
    }
    let keys = [];
    try {
      keys = Object.keys(missions);
    } catch (err) {
      keys = [];
    }
    for (let k = 0; k < keys.length; k++) {
      const name = keys[k];
      if (name.charAt(0) === '_') continue;
      let value = null;
      try {
        value = missions[name];
      } catch (err) {
        continue;
      }
      if (!Array.isArray(value)) continue;
      for (let i = 0; i < value.length && i < 24; i++) {
        const item = value[i];
        if (!item || typeof item !== 'object') continue;
        if (item.taken || item.collected || item.done || item.completed) continue;
        const x = numOf(item.x, item.px, item.position && item.position.x);
        const z = numOf(item.z, item.pz, item.position && item.position.z);
        if (x === null || z === null) continue;
        out.push({ x, z });
      }
    }
    this.extraMarkers = out;
    return out;
  }

  drawMap(snap) {
    const ctx = this.mapCtx;
    if (!ctx || !this.mapBase) return;
    const S = TUNE.mapSize;

    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mapBase, 0, 0);

    if (snap) {
      const turf = readTurf(snap.turf, snap.districtsTaken);
      for (let i = 0; i < DISTRICTS.length; i++) {
        const d = DISTRICTS[i];
        if (!turf.owned[d.key]) continue;
        const x = this.mapX(d.center.x - d.size.w / 2);
        const y = this.mapY(d.center.z - d.size.d / 2);
        const w = this.mapX(d.center.x + d.size.w / 2) - x;
        const h = this.mapY(d.center.z + d.size.d / 2) - y;
        ctx.fillStyle = 'rgba(255,179,71,0.19)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(255,209,102,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      }

      const traffic = snap.trafficPositions;
      if (Array.isArray(traffic)) {
        ctx.fillStyle = 'rgba(255,246,229,0.3)';
        for (let i = 0; i < traffic.length; i++) {
          const p = traffic[i];
          if (!p) continue;
          ctx.fillRect(this.mapX(p.x) - 0.5, this.mapY(p.z) - 0.5, 1, 1);
        }
      }

      const police = snap.policePositions;
      if (Array.isArray(police)) {
        for (let i = 0; i < police.length; i++) {
          const p = police[i];
          if (!p) continue;
          const x = this.mapX(p.x);
          const y = this.mapY(p.z);
          const blink = Math.sin(this.time * 9 + i) > 0;
          ctx.beginPath();
          ctx.arc(x, y, 2.1, 0, Math.PI * 2);
          ctx.fillStyle = blink ? '#ff4438' : '#4f7bff';
          ctx.fill();
        }
      }

      // R9: heli icon — a white/cyan rotor cross, bigger than ground dots.
      const heli = snap.heliPos;
      if (heli && typeof heli.x === 'number' && typeof heli.z === 'number') {
        const hx = this.mapX(heli.x);
        const hy = this.mapY(heli.z);
        ctx.beginPath();
        ctx.arc(hx, hy, 4.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(127,216,208,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(hx - 3, hy);
        ctx.lineTo(hx + 3, hy);
        ctx.moveTo(hx, hy - 3);
        ctx.lineTo(hx, hy + 3);
        ctx.stroke();
      }

      const markers = drawMarkerList(snap);
      const px = snap.playerPos ? snap.playerPos.x : 0;
      const pz = snap.playerPos ? snap.playerPos.z : 0;
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        if (Math.hypot(m.x - px, m.z - pz) > 170) continue;
        const x = this.mapX(m.x);
        const y = this.mapY(m.z);
        ctx.beginPath();
        ctx.arc(x, y, 1.9, 0, Math.PI * 2);
        ctx.fillStyle = '#7fd8d0';
        ctx.fill();
      }

      const extras = this.scanExtras();
      for (let i = 0; i < extras.length; i++) {
        const m = extras[i];
        if (Math.hypot(m.x - px, m.z - pz) > 170) continue;
        ctx.beginPath();
        ctx.arc(this.mapX(m.x), this.mapY(m.z), 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffcf9b';
        ctx.fill();
      }

      const marker = snap.missionMarker;
      const markerX = marker && typeof marker === 'object'
        ? numOf(marker.x, marker.px, marker.position && marker.position.x, marker.pos && marker.pos.x)
        : null;
      const markerZ = marker && typeof marker === 'object'
        ? numOf(marker.z, marker.pz, marker.position && marker.position.z, marker.pos && marker.pos.z)
        : null;
      if (markerX !== null && markerZ !== null) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4.4);
        const x = this.mapX(markerX);
        const y = this.mapY(markerZ);
        ctx.beginPath();
        ctx.arc(x, y, 4 + pulse * 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,209,102,' + (0.75 - pulse * 0.5).toFixed(2) + ')';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd166';
        ctx.fill();
      }

      if (snap.playerPos) {
        const x = this.mapX(numOf(snap.playerPos.x, 0));
        const y = this.mapY(numOf(snap.playerPos.z, 0));
        const heading = typeof snap.heading === 'number' ? snap.heading : 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI - heading);
        ctx.beginPath();
        ctx.moveTo(0, -5.2);
        ctx.lineTo(3.6, 4.2);
        ctx.lineTo(0, 2.2);
        ctx.lineTo(-3.6, 4.2);
        ctx.closePath();
        ctx.fillStyle = '#fff6e5';
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,28,36,0.85)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.fillStyle = 'rgba(9,16,24,0.55)';
    ctx.beginPath();
    ctx.arc(9, 9, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9c9';
    ctx.font = '700 8px "Trebuchet MS","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 9, 9.5);
    ctx.beginPath();
    ctx.moveTo(9, 3.2);
    ctx.lineTo(11.2, 7.4);
    ctx.lineTo(6.8, 7.4);
    ctx.closePath();
    ctx.fillStyle = '#ffb347';
    ctx.fill();
  }

  // ------------------------------------------------------------------- update
  update(dt, snap) {
    const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.time += step;
    if (snap) this.snapshot = snap;

    this.updateToasts(step);
    this.updateCard(step);

    if (this.started !== this.cache.started) {
      this.cache.started = this.started;
      this.syncVisibility();
    }

    if (!this.started) {
      this.titleAcc = (this.titleAcc || 0) + step;
      if (this.panel === 'title' && (this.titleAcc > 1 || !this.titleShown)) {
        this.titleAcc = 0;
        this.titleShown = true;
        this.refreshTitle();
      }
    }

    if (this.started) this.applySnapshot(snap, step);

    this.mapAcc += step;
    if (this.started && this.mapVisible) {
      const interval = 1 / TUNE.mapHz;
      if (this.mapAcc >= interval || !this.mapDrawn) {
        this.mapAcc = 0;
        this.mapDrawn = true;
        this.drawMap(snap);
      }
    }
  }

  applySnapshot(snap, dt) {
    if (!snap) return;
    const step = typeof dt === 'number' && dt > 0 ? dt : 0;

    const cash = numOf(snap.cash);
    let cashDelta = 0;
    const prevCash = this.prev.cash;
    if (cash !== null) {
      const shown = Math.round(cash);
      this.setText('cash', this.el.cash, money(shown));
      if (this.prev.cash !== null && shown !== this.prev.cash) {
        cashDelta = shown - this.prev.cash;
        if (cashDelta >= 50) this.toast('+' + money(cashDelta) + ' CASH', 2.4);
        else if (cashDelta <= -50) this.toast('-' + money(-cashDelta), 2.4);
      }
      this.prev.cash = shown;
    }

    const wanted = clamp(Math.round(numOf(snap.wanted) || 0), 0, 5);
    if (wanted !== this.cache.wanted) {
      const firstSync = this.cache.wanted === undefined;
      this.cache.wanted = wanted;
      for (let i = 0; i < this.el.starSpans.length; i++) {
        const on = i < wanted;
        const star = this.el.starSpans[i];
        if (on) star.classList.add('on');
        else star.classList.remove('on');
      }
      if (this.el.stars) {
        if (wanted >= 4) this.el.stars.classList.add('hot');
        else this.el.stars.classList.remove('hot');
      }
      if (!firstSync && wanted > this.prev.wanted) this.toast('WANTED LEVEL ' + wanted, 2.2);
      else if (!firstSync && wanted < this.prev.wanted && wanted === 0) this.toast('HEAT CLEARED', 2.2);
      else if (!firstSync && wanted < this.prev.wanted) this.toast('HEAT COOLING \u2014 ' + wanted + ' STAR', 2.2);
      if (wanted === 0 && this.prev.wanted >= 1 && cashDelta <= -100) {
        const fine = -cashDelta;
        this.deathAt = this.time;
        this.showCard('failed', {
          head: 'Marisol PD',
          title: fine >= 200 ? 'Busted' : 'Wasted',
          sub: fine >= 200
            ? 'They ran your plate and took the fine out of your pocket.'
            : 'The bay spits you back out on the promenade.',
          rows: [
            [fine >= 200 ? 'Fine' : 'Hospital bill', money(fine)],
            ['Bank', money(prevCash === null ? 0 : prevCash)],
            ['Retry', 'Press J'],
          ],
        });
      }
      this.prev.wanted = wanted;
      this.wanted = wanted;
    }

    const health = numOf(snap.health);
    if (health !== null) {
      const hp = clamp(Math.round(health), 0, 100);
      if (hp !== this.cache.health) {
        this.cache.health = hp;
        this.setText('hp', this.el.hpValue, hp);
        this.setStyle('hpw', this.el.hpFill, 'width', hp + '%');
        const cls = hp <= TUNE.lowHealth ? 'mb-health-fill low' : hp <= 60 ? 'mb-health-fill mid' : 'mb-health-fill';
        if (this.cache.hpClass !== cls) {
          this.cache.hpClass = cls;
          this.el.hpFill.className = cls;
        }
      }
      if (this.prev.health !== null && hp < this.prev.health - 1) {
        this.flash = Math.min(1, this.flash + (this.prev.health - hp) / 34);
      }
      if (this.prev.health !== null && this.prev.health <= 18 && hp >= 99 &&
        this.time - (this.deathAt || -99) > 6) {
        this.deathAt = this.time;
        this.showCard('failed', {
          head: 'Marisol Bay',
          title: 'Wasted',
          sub: 'Patched up on the promenade. The bay keeps your cash, not your pride.',
          rows: [
            ['Hospital bill', money(cashDelta < 0 ? -cashDelta : 0)],
            ['Bank', money(prevCash === null ? 0 : prevCash)],
            ['Retry', 'Press J'],
          ],
        });
      }
      this.prev.health = hp;
    }

    const ammo = numOf(snap.ammo);
    if (ammo !== null) this.setText('ammo', this.el.ammo, 'Pistol \u00b7 ' + Math.round(ammo) + ' rounds');

    const turf = readTurf(snap.turf, snap.districtsTaken);
    this.turfCount = turf.count;
    for (let i = 0; i < DISTRICTS.length && i < this.el.pips.length; i++) {
      const key = DISTRICTS[i].key;
      const value = turf.pct[key] || 0;
      const cacheKey = 'pip:' + key;
      if (this.cache[cacheKey] === value) continue;
      this.cache[cacheKey] = value;
      const pip = this.el.pips[i];
      if (value >= 100) {
        pip.classList.add('on');
        pip.style.background = '';
      } else {
        pip.classList.remove('on');
        const fill = Math.round(value);
        pip.style.background = fill > 0
          ? 'linear-gradient(90deg,#ffb347 ' + fill + '%,rgba(255,246,229,.16) ' + fill + '%)'
          : '';
      }
    }
    if (turf.count !== this.cache.turf) {
      this.cache.turf = turf.count;
      this.setText('turf', this.el.turfCount, turf.count + ' / ' + TUNE.districtCount);
    }

    const income = turf.count * INCOME_PER_TICK;
    if (income !== this.cache.income) {
      const prevIncome = this.cache.income;
      this.cache.income = income;
      this.setText(
        'income',
        this.el.income,
        income > 0
          ? money(income) + ' / ' + INCOME_TICK + 's \u00b7 income'
          : 'No district income',
      );
      if (typeof prevIncome === 'number' && income > prevIncome) {
        this.toast('DISTRICT INCOME  +' + money(income - prevIncome) + ' / TICK', 2.6);
      }
    }

    // R9: a staged shot objective overrides the live mission objective.
    const obj = this.shotObjective
      ? {
        title: this.shotObjective.title,
        text: this.shotObjective.text,
        progress: this.shotObjective.progress,
        ratio: this.shotObjective.ratio,
      }
      : readObjective(snap.objective, snap.district);
    const objKey = obj.title + '|' + obj.text + '|' + obj.progress;
    if (objKey !== this.cache.objKey) {
      this.cache.objKey = objKey;
      this.setText('objTitle', this.objTitle, obj.title);
      this.setText('objText', this.objText, obj.text);
      this.setText('objProgress', this.objProgress, obj.progress);
      const showBar = obj.ratio >= 0;
      if (this.objBar) this.objBar.style.display = showBar ? 'block' : 'none';
      if (showBar) this.setStyle('objFill', this.objFill, 'width', Math.round(obj.ratio * 100) + '%');
    }

    const driving = !!snap.driving;
    if (driving !== this.cache.driving) {
      this.cache.driving = driving;
      if (this.el.speed) {
        if (driving) this.el.speed.classList.add('on');
        else this.el.speed.classList.remove('on');
      }
    }

    const kmh = Math.round(Math.abs(numOf(snap.speed) || 0) * 3.6);
    if (kmh !== this.cache.kmh) {
      this.cache.kmh = kmh;
      this.setText('kmh', this.el.speedNum, kmh);
    }

    const carType = snap.driving && snap.driving !== true && typeof snap.driving === 'object'
      ? snap.driving.type
      : (typeof window !== 'undefined' && window.MARISOL && window.MARISOL.driving
        ? window.MARISOL.driving.type
        : null);
    const vehicleLabel = driving
      ? (VEHICLE_NAMES[carType] || 'Stolen ' + (carType || 'car'))
      : 'On foot';
    if (vehicleLabel !== this.cache.vehicle) {
      this.cache.vehicle = vehicleLabel;
      this.setText('vehicle', this.el.vehicle, vehicleLabel);
    }

    const tod = textOf(snap.timeOfDay) || (typeof window !== 'undefined' && window.MARISOL ? window.MARISOL.timeOfDay : '') || 'day';
    if (tod !== this.cache.tod) {
      this.cache.tod = tod;
      const labels = { day: 'Day', dusk: 'Dusk', night: 'Night' };
      this.setText('tod', this.el.timeLabel, labels[tod] || tod);
      this.el.timeChip.className = 'mb-chip tod-' + (labels[tod] ? tod : 'day');
    }

    this.updateVignette(step, numOf(snap.health));
    this.updateShotPanels(snap);
  }

  updateVignette(dt, health) {
    if (!this.vignette) return;
    this.flash = Math.max(0, this.flash - dt * TUNE.damageFlash);
    let value = this.flash * 0.9;
    if (typeof health === 'number' && health <= TUNE.lowHealth) {
      const lowness = 1 - clamp(health / TUNE.lowHealth, 0, 1);
      value = Math.max(value, lowness * (0.22 + 0.16 * Math.sin(this.time * 5.4)));
    }
    const opacity = clamp(value, 0, 0.92);
    if (Math.abs(opacity - this.vigValue) > 0.02) {
      this.vigValue = opacity;
      this.vignette.style.opacity = opacity.toFixed(2);
    }
  }

  dispose() {
    if (typeof window !== 'undefined') window.removeEventListener('resize', this._onResize);
    this.clearToasts();
    this.hideCard();
  }
}

