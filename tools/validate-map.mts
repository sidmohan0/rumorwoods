/**
 * Validates a converted map JSON against the real World implementation:
 * every sector and arena must resolve to a walkable target, every
 * object must have an adjacent walkable tile, and every sector must be
 * reachable from every other (one connected walkable component).
 *
 * Usage: npx tsx tools/validate-map.mts src/data/honeywood-map.json
 */
import { readFileSync } from "node:fs";
import { World, MapDef } from "../src/world/world";

const path = process.argv[2];
if (!path) {
  console.error("usage: npx tsx tools/validate-map.mts <map.json>");
  process.exit(1);
}

const def = JSON.parse(readFileSync(path, "utf8")) as MapDef;
const world = new World(def);
let failures = 0;

function check(label: string, ok: boolean): void {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

console.log(`${def.name}: ${def.width}x${def.height}, ${def.areas.length} sectors`);

for (const area of def.areas) {
  check(`sector "${area.name}" resolves`, world.resolveLocation(area.name) !== null);
  for (const sub of area.subareas ?? []) {
    const spot = world.resolveLocation(`${area.name}:${sub.name}`);
    check(`arena "${area.name}:${sub.name}" resolves`, spot !== null);
    for (const object of sub.objects ?? []) {
      check(
        `object "${area.name}:${sub.name}:${object.name}" approachable`,
        world.nearestWalkable(object.x, object.y) !== null,
      );
    }
  }
}

// Cross-sector reachability from the first sector's target.
const origin = world.resolveLocation(def.areas[0].name);
if (origin) {
  for (const area of def.areas.slice(1)) {
    const destination = world.resolveLocation(area.name);
    if (!destination) continue;
    const route = world.findPath(origin, destination);
    check(
      `path "${def.areas[0].name}" -> "${area.name}" (${route.length} steps)`,
      route.length > 0,
    );
  }
}

const walkable = world.tiles.filter((t) => t.walkable).length;
console.log(`${walkable} walkable tiles, ${world.objects.length} objects`);
if (failures === 0) {
  console.log("OK — all checks passed");
} else {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
