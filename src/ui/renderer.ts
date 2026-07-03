import { Agent } from "../core/agent";
import { World } from "../world/world";
import {
  SHEET_URL,
  SPRITE,
  TERRAIN,
  OBJECT_SPRITES,
  SKIP_OBJECT_SPRITES,
  FALLBACK_OBJECT,
  drawTile,
} from "./tileset";

const TILE = SPRITE;

/** Deterministic per-tile hash for texture variation. */
function tileHash(x: number, y: number): number {
  let h = x * 73856093 + y * 19349663;
  h = (h ^ (h >> 13)) * 83492791;
  return Math.abs(h ^ (h >> 16));
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: World;
  private agents: Agent[];
  private baseMap: HTMLCanvasElement | null = null;
  private sheet: HTMLImageElement;
  selected: Agent | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;
  onSelect?: (agent: Agent | null) => void;

  constructor(canvas: HTMLCanvasElement, world: World, agents: Agent[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.world = world;
    this.agents = agents;
    canvas.addEventListener("click", (e) => this.handleClick(e));
    canvas.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
    });
    this.sheet = new Image();
    this.sheet.src = SHEET_URL;
    this.sheet.onload = () => {
      this.baseMap = this.prerender();
    };
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    const fitX = rect.width / (this.world.width * TILE);
    const fitY = rect.height / (this.world.height * TILE);
    this.scale = Math.min(fitX, fitY);
    this.offsetX = (rect.width - this.world.width * TILE * this.scale) / 2;
    this.offsetY = (rect.height - this.world.height * TILE * this.scale) / 2;
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const mx = e.offsetX;
    const my = e.offsetY;
    this.offsetX = mx - (mx - this.offsetX) * factor;
    this.offsetY = my - (my - this.offsetY) * factor;
    this.scale *= factor;
  }

  private handleClick(e: MouseEvent): void {
    const wx = (e.offsetX - this.offsetX) / (TILE * this.scale);
    const wy = (e.offsetY - this.offsetY) / (TILE * this.scale);
    let best: Agent | null = null;
    let bestDist = 2.2;
    for (const agent of this.agents) {
      const d = Math.hypot(agent.x + 0.5 - wx, agent.y + 0.5 - wy);
      if (d < bestDist) {
        bestDist = d;
        best = agent;
      }
    }
    this.selected = best;
    this.onSelect?.(best);
  }

  /** Draw the static world once into an offscreen canvas. */
  private prerender(): HTMLCanvasElement {
    const off = document.createElement("canvas");
    off.width = this.world.width * SPRITE;
    off.height = this.world.height * SPRITE;
    const ctx = off.getContext("2d")!;
    const sheet = this.sheet;

    for (let y = 0; y < this.world.height; y++) {
      for (let x = 0; x < this.world.width; x++) {
        const tile = this.world.tiles[y * this.world.width + x];
        const h = tileHash(x, y);
        switch (tile.kind) {
          case "floor":
            drawTile(
              ctx,
              sheet,
              h % 5 === 0 ? TERRAIN.floorWoodAlt : TERRAIN.floorWood,
              x,
              y,
            );
            break;
          case "wall":
            drawTile(ctx, sheet, TERRAIN.wallBrick, x, y);
            break;
          case "garden":
            drawTile(ctx, sheet, TERRAIN.grass, x, y);
            drawTile(
              ctx,
              sheet,
              h % 3 === 0 ? TERRAIN.flowersWhite : TERRAIN.flowersRed,
              x,
              y,
            );
            break;
          case "tree":
            drawTile(ctx, sheet, TERRAIN.grass, x, y);
            drawTile(
              ctx,
              sheet,
              h % 3 === 0
                ? TERRAIN.treePine
                : h % 3 === 1
                  ? TERRAIN.treeRound
                  : TERRAIN.bush,
              x,
              y,
            );
            break;
          default: {
            drawTile(
              ctx,
              sheet,
              h % 7 === 0 ? TERRAIN.grassSpeckled : TERRAIN.grass,
              x,
              y,
            );
          }
        }
      }
    }

    for (const object of this.world.objects) {
      if (SKIP_OBJECT_SPRITES.test(object.name)) continue;
      const ref = OBJECT_SPRITES[object.name] ?? FALLBACK_OBJECT;
      drawTile(ctx, sheet, ref, object.x, object.y);
    }
    return off;
  }

  render(): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = "#25331f";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    ctx.imageSmoothingEnabled = false;

    if (this.baseMap) {
      ctx.drawImage(this.baseMap, 0, 0);
    } else {
      // Tile sheet still loading: plain ground placeholder.
      ctx.fillStyle = "#6da05b";
      ctx.fillRect(0, 0, this.world.width * TILE, this.world.height * TILE);
    }

    // Sector labels.
    for (const area of this.world.def.areas) {
      const { x, y, w } = area.rect;
      ctx.font = `bold ${TILE * 0.85}px sans-serif`;
      ctx.textAlign = "center";
      const label =
        area.name.length > 30 ? area.name.slice(0, 28) + "…" : area.name;
      const lx = (x + w / 2) * TILE;
      const ly = (y - 0.35) * TILE;
      ctx.strokeStyle = "#00000088";
      ctx.lineWidth = 3;
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, lx, ly);
    }

    // Agents.
    for (const agent of this.agents) {
      const px = agent.x * TILE + TILE / 2;
      const py = agent.y * TILE + TILE / 2;
      if (agent === this.selected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, TILE * 0.95, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = agent.persona.color;
      ctx.beginPath();
      ctx.arc(px, py, TILE * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#00000066";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Emoji status bubble above the head, as in the paper.
      ctx.font = `${TILE * 1.1}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(agent.emoji, px, py - TILE * 0.9);

      // Name label.
      ctx.font = `${TILE * 0.7}px sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#00000099";
      ctx.lineWidth = 2.5;
      const firstName = agent.name.split(" ")[0];
      ctx.strokeText(firstName, px, py + TILE * 1.5);
      ctx.fillText(firstName, px, py + TILE * 1.5);
    }

    ctx.restore();
  }
}
