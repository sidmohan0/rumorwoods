export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ObjectDef {
  name: string;
  x: number;
  y: number;
}

export interface SubAreaDef {
  name: string;
  rect: Rect;
  /** Draw interior walls around this sub-area (needs a door). */
  walls?: boolean;
  door?: { x: number; y: number };
  /** Known-walkable tile to navigate to (for non-rectangular areas). */
  target?: { x: number; y: number } | null;
  objects?: ObjectDef[];
}

export interface AreaDef {
  name: string;
  kind: "building" | "outdoor";
  rect: Rect;
  door?: { x: number; y: number };
  target?: { x: number; y: number } | null;
  subareas?: SubAreaDef[];
  objects?: ObjectDef[];
  color: string;
}

/**
 * Optional per-tile layers for maps converted from tile mazes (e.g.
 * the original Ville from Park et al. 2023). When present they take
 * precedence over rect-painting in World.build. `collision` and
 * `kinds` are width*height character strings; the index arrays map
 * each tile to an area / flattened-subarea index (-1 = none).
 */
export interface TileLayers {
  collision: string;
  kinds: string;
  areaIdx: number[];
  subIdx: number[];
}

export interface MapDef {
  name: string;
  width: number;
  height: number;
  areas: AreaDef[];
  tiles?: TileLayers;
}

export interface WorldObject {
  name: string;
  /** environment-tree path, e.g. "Honeywood Tavern:bar:ale keg" */
  path: string;
  x: number;
  y: number;
  status: string;
}

export interface Tile {
  walkable: boolean;
  area: string | null;
  subarea: string | null;
  kind: "ground" | "wall" | "floor" | "door" | "water" | "tree" | "garden";
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function onBorder(r: Rect, x: number, y: number): boolean {
  return (
    inRect(r, x, y) &&
    (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1)
  );
}

export class World {
  readonly def: MapDef;
  readonly width: number;
  readonly height: number;
  tiles: Tile[];
  objects: WorldObject[] = [];
  private objectByPath = new Map<string, WorldObject>();

  constructor(def: MapDef) {
    this.def = def;
    this.width = def.width;
    this.height = def.height;
    this.tiles = Array.from({ length: def.width * def.height }, () => ({
      walkable: true,
      area: null,
      subarea: null,
      kind: "ground" as const,
    }));
    this.build();
  }

  private tile(x: number, y: number): Tile {
    return this.tiles[y * this.width + x];
  }

  private build(): void {
    if (this.def.tiles) {
      this.buildFromTiles(this.def.tiles);
      return;
    }
    for (const area of this.def.areas) {
      for (let y = area.rect.y; y < area.rect.y + area.rect.h; y++) {
        for (let x = area.rect.x; x < area.rect.x + area.rect.w; x++) {
          const t = this.tile(x, y);
          t.area = area.name;
          if (area.kind === "building") {
            if (onBorder(area.rect, x, y)) {
              t.kind = "wall";
              t.walkable = false;
            } else {
              t.kind = "floor";
            }
          }
        }
      }
      if (area.door) {
        const t = this.tile(area.door.x, area.door.y);
        t.kind = "door";
        t.walkable = true;
      }
      for (const sub of area.subareas ?? []) {
        for (let y = sub.rect.y; y < sub.rect.y + sub.rect.h; y++) {
          for (let x = sub.rect.x; x < sub.rect.x + sub.rect.w; x++) {
            const t = this.tile(x, y);
            t.subarea = sub.name;
            if (
              area.kind === "building" &&
              sub.walls === true &&
              onBorder(sub.rect, x, y) &&
              !onBorder(area.rect, x, y) &&
              t.kind !== "door"
            ) {
              t.kind = "wall";
              t.walkable = false;
            }
          }
        }
        if (sub.door) {
          const t = this.tile(sub.door.x, sub.door.y);
          t.kind = "door";
          t.walkable = true;
        }
        for (const obj of sub.objects ?? []) {
          this.addObject(obj, `${area.name}:${sub.name}`);
        }
      }
      for (const obj of area.objects ?? []) {
        this.addObject(obj, area.name);
      }
    }
  }

  private buildFromTiles(layers: TileLayers): void {
    const KIND: Record<string, Tile["kind"]> = {
      g: "ground",
      f: "floor",
      w: "wall",
      t: "tree",
      G: "garden",
    };
    // Flat subarea list in the same construction order the converter
    // used: areas in order, each area's subareas in order.
    const flatSubs: Array<{ area: string; sub: string }> = [];
    for (const area of this.def.areas) {
      for (const sub of area.subareas ?? []) {
        flatSubs.push({ area: area.name, sub: sub.name });
      }
    }
    for (let i = 0; i < this.width * this.height; i++) {
      const t = this.tiles[i];
      t.walkable = layers.collision[i] === "0";
      t.kind = KIND[layers.kinds[i]] ?? "ground";
      const ai = layers.areaIdx[i];
      t.area = ai >= 0 ? this.def.areas[ai].name : null;
      const si = layers.subIdx[i];
      t.subarea = si >= 0 ? flatSubs[si].sub : null;
    }
    for (const area of this.def.areas) {
      for (const sub of area.subareas ?? []) {
        for (const obj of sub.objects ?? []) {
          // Collision layer already encodes furniture walkability.
          this.addObject(obj, `${area.name}:${sub.name}`, false);
        }
      }
      for (const obj of area.objects ?? []) {
        this.addObject(obj, area.name, false);
      }
    }
  }

  private addObject(
    def: ObjectDef,
    parentPath: string,
    blockTile = true,
  ): void {
    const obj: WorldObject = {
      name: def.name,
      path: `${parentPath}:${def.name}`,
      x: def.x,
      y: def.y,
      status: "idle",
    };
    this.objects.push(obj);
    this.objectByPath.set(obj.path, obj);
    if (blockTile) this.tile(def.x, def.y).walkable = false;
  }

  isWalkable(x: number, y: number): boolean {
    return (
      x >= 0 && y >= 0 && x < this.width && y < this.height &&
      this.tile(x, y).walkable
    );
  }

  areaAt(x: number, y: number): { area: string | null; subarea: string | null } {
    const t = this.tile(x, y);
    return { area: t.area, subarea: t.subarea };
  }

  /** Human-readable location, e.g. "Honeywood Tavern: bar". */
  locationName(x: number, y: number): string {
    const { area, subarea } = this.areaAt(x, y);
    if (!area) return "the village commons";
    return subarea ? `${area}: ${subarea}` : area;
  }

  getObject(path: string): WorldObject | undefined {
    return this.objectByPath.get(path);
  }

  objectsNear(x: number, y: number, radius: number): WorldObject[] {
    return this.objects.filter(
      (o) => Math.abs(o.x - x) <= radius && Math.abs(o.y - y) <= radius,
    );
  }

  /** Environment-tree description of the areas known to an agent. */
  describeAreas(): string {
    return this.def.areas
      .map((a) => {
        const subs = (a.subareas ?? []).map((s) => s.name);
        return subs.length ? `${a.name} (${subs.join(", ")})` : a.name;
      })
      .join("; ");
  }

  describeArea(areaName: string): string {
    const area = this.def.areas.find((a) => a.name === areaName);
    if (!area) return "";
    const parts: string[] = [];
    for (const sub of area.subareas ?? []) {
      const objs = (sub.objects ?? []).map((o) => o.name);
      parts.push(`${sub.name}${objs.length ? ` (${objs.join(", ")})` : ""}`);
    }
    const rootObjs = (area.objects ?? []).map((o) => o.name);
    if (rootObjs.length) parts.push(rootObjs.join(", "));
    return parts.join("; ");
  }

  /**
   * Resolve a location string like "Honeywood Tavern" or
   * "Honeywood Tavern:bar" (optionally with an object leaf) to a
   * walkable target tile near the area/object.
   */
  resolveLocation(location: string): { x: number; y: number } | null {
    const segments = location.split(":").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return null;

    const objPath = segments.join(":");
    const obj = this.objectByPath.get(objPath);
    if (obj) return this.nearestWalkable(obj.x, obj.y);

    const area = this.def.areas.find(
      (a) => a.name.toLowerCase() === segments[0].toLowerCase(),
    );
    if (!area) return null;
    if (segments.length >= 2) {
      const sub = (area.subareas ?? []).find(
        (s) => s.name.toLowerCase() === segments[1].toLowerCase(),
      );
      if (sub) {
        if (segments.length >= 3) {
          const object = (sub.objects ?? []).find(
            (o) => o.name.toLowerCase() === segments[2].toLowerCase(),
          );
          if (object) return this.nearestWalkable(object.x, object.y);
        }
        if (sub.target) return this.nearestWalkable(sub.target.x, sub.target.y);
        return this.centerWalkable(sub.rect);
      }
    }
    if (area.target) return this.nearestWalkable(area.target.x, area.target.y);
    return this.centerWalkable(area.rect);
  }

  private centerWalkable(rect: Rect): { x: number; y: number } | null {
    const cx = Math.floor(rect.x + rect.w / 2);
    const cy = Math.floor(rect.y + rect.h / 2);
    return this.nearestWalkable(cx, cy);
  }

  nearestWalkable(x: number, y: number): { x: number; y: number } | null {
    if (this.isWalkable(x, y)) return { x, y };
    for (let r = 1; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.isWalkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  /** A* pathfinding on the tile grid (4-connected). */
  findPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Array<{ x: number; y: number }> {
    const target = this.isWalkable(to.x, to.y)
      ? to
      : this.nearestWalkable(to.x, to.y);
    if (!target) return [];
    const key = (x: number, y: number) => y * this.width + x;
    const open = new MinHeap();
    const gScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const startKey = key(from.x, from.y);
    gScore.set(startKey, 0);
    open.push(startKey, Math.abs(from.x - target.x) + Math.abs(from.y - target.y));
    const targetKey = key(target.x, target.y);
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    while (open.size > 0) {
      const current = open.pop();
      if (current === targetKey) {
        const path: Array<{ x: number; y: number }> = [];
        let k: number | undefined = current;
        while (k !== undefined && k !== startKey) {
          path.push({ x: k % this.width, y: Math.floor(k / this.width) });
          k = cameFrom.get(k);
        }
        path.reverse();
        return path;
      }
      const cx = current % this.width;
      const cy = Math.floor(current / this.width);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isWalkable(nx, ny) && key(nx, ny) !== targetKey) continue;
        const nk = key(nx, ny);
        const tentative = (gScore.get(current) ?? Infinity) + 1;
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, current);
          gScore.set(nk, tentative);
          open.push(
            nk,
            tentative + Math.abs(nx - target.x) + Math.abs(ny - target.y),
          );
        }
      }
    }
    return [];
  }
}

class MinHeap {
  private keys: number[] = [];
  private priorities: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, priority: number): void {
    this.keys.push(key);
    this.priorities.push(priority);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.keys[0];
    const lastKey = this.keys.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.priorities[0] = lastPriority;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < this.keys.length && this.priorities[l] < this.priorities[smallest])
          smallest = l;
        if (r < this.keys.length && this.priorities[r] < this.priorities[smallest])
          smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.priorities[a], this.priorities[b]] = [
      this.priorities[b],
      this.priorities[a],
    ];
  }
}
