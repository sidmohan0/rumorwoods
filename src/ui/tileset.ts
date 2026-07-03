/**
 * CC0 tile art: Kenney's "Roguelike/RPG pack" (kenney.nl), a 57x31
 * spritesheet of 16px tiles with 1px spacing. Coordinates below are
 * (column, row) into that sheet. See public/tiles/LICENSE-kenney.txt.
 */
export const SHEET_URL = "/tiles/roguelike.png";
export const SPRITE = 16;
const STRIDE = 17;

export type TileRef = readonly [col: number, row: number];

export const TERRAIN = {
  grass: [5, 0] as TileRef,
  grassSpeckled: [5, 1] as TileRef,
  flowersRed: [1, 6] as TileRef,
  flowersWhite: [1, 9] as TileRef,
  floorWood: [8, 2] as TileRef,
  floorWoodAlt: [9, 2] as TileRef,
  floorStone: [6, 2] as TileRef,
  wallBrick: [5, 4] as TileRef,
  treePine: [16, 9] as TileRef,
  treeRound: [19, 9] as TileRef,
  bush: [21, 9] as TileRef,
};

/** Object name → sprite. Anything missing falls back to the crate. */
export const OBJECT_SPRITES: Record<string, TileRef> = {
  bed: [14, 2],
  desk: [19, 0],
  "common room table": [19, 0],
  "library table": [19, 0],
  "computer desk": [19, 0],
  closet: [26, 5],
  shelf: [10, 3],
  bookshelf: [10, 3],
  "pharmacy store shelf": [10, 3],
  "grocery store shelf": [10, 3],
  "supply store product shelf": [10, 3],
  "supply store counter": [16, 0],
  "grocery store counter": [16, 0],
  "pharmacy store counter": [16, 0],
  "classroom podium": [16, 0],
  blackboard: [23, 4],
  "classroom student seating": [19, 2],
  "bar customer seating": [19, 2],
  "cafe customer seating": [19, 2],
  "garden chair": [19, 2],
  "common room sofa": [23, 3],
  "library sofa": [23, 3],
  "bathroom sink": [29, 2],
  "kitchen sink": [29, 2],
  toilet: [31, 2],
  refrigerator: [25, 2],
  "cooking area": [13, 0],
  computer: [18, 1],
  "game console": [18, 1],
  "house garden": [1, 6],
  "dorm garden": [1, 6],
  "park garden": [1, 9],
};

/**
 * Walkable staff zones ("behind the cafe counter") and generic misc
 * items where a sprite would mislead more than help.
 */
export const SKIP_OBJECT_SPRITES = /^behind the /;

export const FALLBACK_OBJECT: TileRef = [27, 0]; // crate

export function drawTile(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  ref: TileRef,
  x: number,
  y: number,
): void {
  ctx.drawImage(
    sheet,
    ref[0] * STRIDE,
    ref[1] * STRIDE,
    SPRITE,
    SPRITE,
    x * SPRITE,
    y * SPRITE,
    SPRITE,
    SPRITE,
  );
}
