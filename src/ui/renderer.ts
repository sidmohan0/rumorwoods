import { Agent } from "../core/agent";
import { World } from "../world/world";

const TILE = 12;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: World;
  private agents: Agent[];
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

  render(): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = "#2e4a2e";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Ground.
    ctx.fillStyle = "#6da05b";
    ctx.fillRect(0, 0, this.world.width * TILE, this.world.height * TILE);

    // Scatter of trees around the village edge (deterministic).
    ctx.fillStyle = "#4a7a3a";
    for (let i = 0; i < 300; i++) {
      const x = (i * 733) % this.world.width;
      const y = (i * 397) % this.world.height;
      const t = this.world.areaAt(x, y);
      if (t.area) continue;
      if ((i * 31) % 7 !== 0) continue;
      ctx.beginPath();
      ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    // Areas.
    for (const area of this.world.def.areas) {
      const { x, y, w, h } = area.rect;
      if (area.kind === "outdoor") {
        ctx.fillStyle = area.color + "55";
        ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
      } else {
        ctx.fillStyle = "#d9c8a9";
        ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
        ctx.strokeStyle = area.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x * TILE + 1.5, y * TILE + 1.5, w * TILE - 3, h * TILE - 3);
        if (area.door) {
          ctx.fillStyle = "#8a5a2b";
          ctx.fillRect(area.door.x * TILE, area.door.y * TILE, TILE, TILE);
        }
      }
      ctx.fillStyle = "#1d1d1dcc";
      ctx.font = `bold ${TILE * 0.85}px sans-serif`;
      ctx.textAlign = "center";
      const label =
        area.name.length > 26 ? area.name.slice(0, 24) + "…" : area.name;
      ctx.fillText(label, (x + w / 2) * TILE, (y - 0.35) * TILE);
    }

    // Objects.
    ctx.fillStyle = "#7a6248";
    for (const object of this.world.objects) {
      ctx.fillRect(
        object.x * TILE + 2,
        object.y * TILE + 2,
        TILE - 4,
        TILE - 4,
      );
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
