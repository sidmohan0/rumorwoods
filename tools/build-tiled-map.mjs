/**
 * Converts a Tiled map (.tmj, Tiled's native JSON export) into the
 * map JSON consumed by src/world/world.ts — the same shape as
 * ville-map.json, so everything downstream (A*, perception, renderer,
 * character editor) works unchanged.
 *
 * Authoring conventions (see maps/README.md):
 * - tile layer "collision": any nonzero tile blocks movement
 * - object layer "sectors": named rectangles = buildings/outdoor areas.
 *   Multiple rects sharing a name merge into one (for L-shapes).
 *   Optional bool property "outdoor" (default false).
 * - object layer "arenas": named rectangles = rooms; assigned to the
 *   sector containing their center. Arena names matching
 *   /garden|park|yard/ render as ground rather than floor.
 * - object layer "objects": named point objects = interactables;
 *   assigned to the arena (and sector) containing them.
 * - any other tile layers (ground art, wall art) are ignored for now —
 *   visuals are derived from semantics, exactly like the Ville map.
 *
 * Usage: node tools/build-tiled-map.mjs <input.tmj> <output.json> [mapName]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [, , inputPath, outputPath, mapNameArg] = process.argv;
if (!inputPath || !outputPath) {
  console.error("usage: node tools/build-tiled-map.mjs <input.tmj> <output.json> [mapName]");
  process.exit(1);
}

const tiled = JSON.parse(readFileSync(inputPath, "utf8"));
if (tiled.orientation !== "orthogonal" || tiled.infinite) {
  throw new Error("expected a finite orthogonal Tiled map");
}
const W = tiled.width;
const H = tiled.height;
const TW = tiled.tilewidth;
const TH = tiled.tileheight;
const GROUND_ARENAS = /garden|park|yard/i;

const warnings = [];

function layersOfType(type) {
  return (tiled.layers ?? []).filter((l) => l.type === type);
}

function findLayer(type, name) {
  return (tiled.layers ?? []).find((l) => l.type === type && l.name === name);
}

function prop(object, name, fallback) {
  const p = (object.properties ?? []).find((q) => q.name === name);
  return p ? p.value : fallback;
}

// --- Collision -------------------------------------------------------
const collisionLayer = findLayer("tilelayer", "collision");
if (!collisionLayer) throw new Error('missing tile layer named "collision"');
if (collisionLayer.data.length !== W * H) {
  throw new Error("collision layer size does not match map size");
}
const collision = collisionLayer.data.map((gid) => (gid !== 0 ? 1 : 0));

// --- Rect helpers (Tiled object coords are in pixels) ---------------
function toTileRect(object) {
  const x = Math.round(object.x / TW);
  const y = Math.round(object.y / TH);
  const w = Math.max(1, Math.round(object.width / TW));
  const h = Math.max(1, Math.round(object.height / TH));
  return { x, y, w, h };
}

function rectTiles(rect) {
  const tiles = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H) tiles.push([x, y]);
    }
  }
  return tiles;
}

function centerOf(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function rectContains(rect, x, y) {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

// --- Sectors ---------------------------------------------------------
const sectorLayer = findLayer("objectgroup", "sectors");
if (!sectorLayer) throw new Error('missing object layer named "sectors"');
const sectors = new Map(); // name -> {rects, outdoor, tiles}
for (const object of sectorLayer.objects ?? []) {
  if (!object.name) {
    warnings.push("sector rectangle without a name — skipped");
    continue;
  }
  const entry = sectors.get(object.name) ?? {
    rects: [],
    outdoor: false,
    tiles: [],
    arenas: new Map(),
  };
  entry.rects.push(toTileRect(object));
  entry.outdoor = entry.outdoor || prop(object, "outdoor", false) === true;
  sectors.set(object.name, entry);
}
for (const entry of sectors.values()) {
  const seen = new Set();
  for (const rect of entry.rects) {
    for (const [x, y] of rectTiles(rect)) {
      const key = y * W + x;
      if (!seen.has(key)) {
        seen.add(key);
        entry.tiles.push([x, y]);
      }
    }
  }
}

// --- Arenas ----------------------------------------------------------
const arenaLayer = findLayer("objectgroup", "arenas");
for (const object of arenaLayer?.objects ?? []) {
  if (!object.name) {
    warnings.push("arena rectangle without a name — skipped");
    continue;
  }
  const rect = toTileRect(object);
  const center = centerOf(rect);
  const owner = [...sectors.entries()].find(([, s]) =>
    s.rects.some((r) => rectContains(r, center.x, center.y)),
  );
  if (!owner) {
    warnings.push(`arena "${object.name}" is not inside any sector — skipped`);
    continue;
  }
  const [, sector] = owner;
  const arena = sector.arenas.get(object.name) ?? { rects: [], tiles: [], objects: new Map() };
  arena.rects.push(rect);
  for (const [x, y] of rectTiles(rect)) arena.tiles.push([x, y]);
  sector.arenas.set(object.name, arena);
}

// --- Objects ---------------------------------------------------------
const objectLayer = findLayer("objectgroup", "objects");
for (const object of objectLayer?.objects ?? []) {
  if (!object.name) {
    warnings.push("point object without a name — skipped");
    continue;
  }
  const x = Math.min(W - 1, Math.max(0, Math.floor(object.x / TW)));
  const y = Math.min(H - 1, Math.max(0, Math.floor(object.y / TH)));
  let placed = false;
  for (const sector of sectors.values()) {
    for (const arena of sector.arenas.values()) {
      if (arena.rects.some((r) => rectContains(r, x + 0.5, y + 0.5))) {
        const list = arena.objects.get(object.name) ?? [];
        list.push([x, y]);
        arena.objects.set(object.name, list);
        placed = true;
        break;
      }
    }
    if (placed) break;
  }
  if (!placed) {
    warnings.push(`object "${object.name}" at ${x},${y} is not inside any arena — skipped`);
  }
}

// --- Targets and assembly (same rules as build-ville-map.mjs) -------
// Targets are constrained to the map's main walkable component so a
// bare-sector destination can never land in a furniture-enclosed
// pocket (a real bug the validator caught in the Ville port).
function labelComponents() {
  const comp = new Int32Array(W * H).fill(-1);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (comp[i] >= 0 || collision[i] !== 0) continue;
    const queue = [i];
    comp[i] = n;
    while (queue.length) {
      const k = queue.pop();
      const x = k % W, y = Math.floor(k / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (comp[nk] < 0 && collision[nk] === 0) {
          comp[nk] = n;
          queue.push(nk);
        }
      }
    }
    n++;
  }
  return comp;
}

let componentCache = null;
function mainComponent() {
  if (componentCache) return componentCache;
  const comp = labelComponents();
  const votes = new Map();
  for (const sector of sectors.values()) {
    for (const [x, y] of sector.tiles) {
      const c = comp[y * W + x];
      if (c >= 0) votes.set(c, (votes.get(c) ?? 0) + 1);
    }
  }
  let main = -1, bestVotes = -1;
  for (const [c, v] of votes) {
    if (v > bestVotes) { bestVotes = v; main = c; }
  }
  componentCache = { comp, main };
  return componentCache;
}

function centroidTarget(tiles) {
  const { comp, main } = mainComponent();
  let cx = 0, cy = 0;
  for (const [x, y] of tiles) { cx += x; cy += y; }
  cx /= tiles.length;
  cy /= tiles.length;
  let best = null, bestD = Infinity;
  let fallback = null, fallbackD = Infinity;
  for (const [x, y] of tiles) {
    if (collision[y * W + x] !== 0) continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (comp[y * W + x] === main) {
      if (d < bestD) { bestD = d; best = { x, y }; }
    } else if (d < fallbackD) {
      fallbackD = d;
      fallback = [x, y] && { x, y };
    }
  }
  if (!best && fallback) {
    warnings.push(
      `target at ${fallback.x},${fallback.y} is outside the main walkable component`,
    );
  }
  return best ?? fallback;
}

function bbox(tiles) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of tiles) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function objectPosition(tiles) {
  let cx = 0, cy = 0;
  for (const [x, y] of tiles) { cx += x; cy += y; }
  cx /= tiles.length;
  cy /= tiles.length;
  let best = tiles[0], bestD = Infinity;
  for (const [x, y] of tiles) {
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestD) { bestD = d; best = [x, y]; }
  }
  return { x: best[0], y: best[1] };
}

const PALETTE = [
  "#e6a23c", "#5b8dd9", "#c95d5d", "#6cae75", "#9a6dd7",
  "#d98cb3", "#58b5c9", "#c9a758", "#8ba0b5", "#b57f5b",
];

const areas = [];
const sectorNames = [...sectors.keys()].sort();
sectorNames.forEach((name, i) => {
  const sector = sectors.get(name);
  const subareas = [...sector.arenas.keys()].sort().map((arenaName) => {
    const arena = sector.arenas.get(arenaName);
    const objects = [...arena.objects.keys()].sort().map((objName) => ({
      name: objName,
      ...objectPosition(arena.objects.get(objName)),
    }));
    const target = centroidTarget(arena.tiles);
    if (!target) warnings.push(`no walkable tile in arena ${name}:${arenaName}`);
    return { name: arenaName, rect: bbox(arena.tiles), target, objects };
  });
  const target = centroidTarget(sector.tiles);
  if (!target) warnings.push(`no walkable tile in sector ${name}`);
  areas.push({
    name,
    kind: sector.outdoor ? "outdoor" : "building",
    rect: bbox(sector.tiles),
    target,
    color: PALETTE[i % PALETTE.length],
    subareas,
  });
});

const subList = [];
const areaIdx = new Array(W * H).fill(-1);
const subIdx = new Array(W * H).fill(-1);
areas.forEach((area, ai) => {
  const sector = sectors.get(area.name);
  for (const [x, y] of sector.tiles) areaIdx[y * W + x] = ai;
  for (const sub of area.subareas) {
    const flat = subList.length;
    subList.push(ai);
    for (const [x, y] of sector.arenas.get(sub.name).tiles) {
      subIdx[y * W + x] = flat;
    }
  }
});

let kinds = "";
for (let i = 0; i < W * H; i++) {
  const blocked = collision[i] !== 0;
  const ai = areaIdx[i];
  const si = subIdx[i];
  const area = ai >= 0 ? areas[ai] : null;
  let subName = null;
  if (si >= 0) {
    let count = 0;
    outer: for (const area2 of areas) {
      for (const sub of area2.subareas) {
        if (count === si) { subName = sub.name; break outer; }
        count++;
      }
    }
  }
  const outdoorish =
    !area || area.kind === "outdoor" || (subName && GROUND_ARENAS.test(subName));
  if (blocked) kinds += outdoorish ? "t" : "w";
  else if (!area) kinds += "g";
  else if (subName && GROUND_ARENAS.test(subName)) kinds += "G";
  else if (area.kind === "outdoor") kinds += "g";
  else kinds += "f";
}

const out = {
  name: mapNameArg ?? basename(inputPath).replace(/\.(tmj|json)$/, ""),
  width: W,
  height: H,
  areas,
  tiles: {
    collision: collision.join(""),
    kinds,
    areaIdx,
    subIdx,
    subList,
  },
};

writeFileSync(outputPath, JSON.stringify(out));
const objCount = areas.reduce(
  (n, a) => n + a.subareas.reduce((m, s) => m + s.objects.length, 0),
  0,
);
console.log(
  `wrote ${outputPath}: ${areas.length} sectors, ${subList.length} arenas, ` +
    `${objCount} objects, ${W}x${H} tiles`,
);
console.log(`${warnings.length} warnings`);
for (const w of warnings) console.log("  warn:", w);
