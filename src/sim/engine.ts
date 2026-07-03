import { Agent } from "../core/agent";
import { Persona } from "../core/types";
import { LLMQueue } from "../llm/llm";
import { World } from "../world/world";

/** Sim minutes advanced per tick. */
export const TICK_MINUTES = 10;
/** Tiles an agent can walk per tick. */
const TILES_PER_TICK = 20;
/** Sim starts at 6:00 am on day 1 (February 13, 2023). */
const START_MINUTES = 6 * 60;

export type EngineState = "idle" | "running" | "paused";

export class Engine {
  readonly world: World;
  readonly agents: Agent[] = [];
  /** Sim minutes since epoch (day 0 midnight). */
  time = START_MINUTES;
  state: EngineState = "idle";
  onTick?: () => void;
  onLog?: (entry: string) => void;
  /** Fires as each agent finishes cognition within the current tick. */
  onTickProgress?: (done: number, total: number) => void;
  private stepping = false;

  constructor(world: World, llm: LLMQueue, personas: Persona[]) {
    this.world = world;
    for (const persona of personas) {
      this.agents.push(new Agent(persona, world, llm));
    }
  }

  async seed(): Promise<void> {
    for (const agent of this.agents) {
      await agent.seedMemories(this.time);
    }
  }

  start(): void {
    if (this.state === "running") return;
    this.state = "running";
    void this.loop();
  }

  pause(): void {
    this.state = "paused";
  }

  private async loop(): Promise<void> {
    while (this.state === "running") {
      await this.tick();
      this.onTick?.();
      // Yield to the render loop between ticks.
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  /**
   * One sim tick: every agent perceives / retrieves / plans / reacts,
   * ongoing conversations advance one turn per side, agents move, and
   * the clock advances.
   */
  async tick(): Promise<void> {
    if (this.stepping) return;
    this.stepping = true;
    try {
      // Cognition for all agents (LLM calls are serialized by the queue).
      let stepped = 0;
      this.onTickProgress?.(0, this.agents.length);
      await Promise.all(
        this.agents.map(async (agent) => {
          try {
            await agent.step(this.time, this.agents);
          } catch (err) {
            this.onLog?.(`[error] ${agent.name}: ${String(err)}`);
          } finally {
            stepped++;
            this.onTickProgress?.(stepped, this.agents.length);
          }
        }),
      );

      // Advance ongoing conversations by one exchange per tick.
      const handled = new Set<Agent>();
      for (const agent of this.agents) {
        if (!agent.conversation || handled.has(agent)) continue;
        const partner = agent.conversationPartner;
        if (!partner) continue;
        handled.add(agent);
        handled.add(partner);
        // Only speak once the two are adjacent.
        if (
          Math.abs(agent.x - partner.x) > 2 ||
          Math.abs(agent.y - partner.y) > 2
        )
          continue;
        const lastSpeaker =
          agent.conversation.turns[agent.conversation.turns.length - 1]?.speaker;
        const speaker = lastSpeaker === agent.name ? partner : agent;
        try {
          const ended = await speaker.takeDialogueTurn(this.time);
          const lastTurn =
            agent.conversation.turns[agent.conversation.turns.length - 1];
          if (lastTurn && lastTurn.speaker === speaker.name) {
            this.onLog?.(`${speaker.name}: ${lastTurn.text}`);
          }
          if (ended) await speaker.endConversation(this.time);
        } catch (err) {
          this.onLog?.(`[error] dialogue ${speaker.name}: ${String(err)}`);
          await speaker.endConversation(this.time);
        }
      }

      // Movement.
      for (const agent of this.agents) {
        agent.moveAlongPath(TILES_PER_TICK);
      }

      this.time += TICK_MINUTES;
    } finally {
      this.stepping = false;
    }
  }
}
