import { LLMQueue } from "../llm/llm";
import { World } from "../world/world";
import { bumpNextMemoryId, MemoryStream } from "./memory";
import {
  Conversation,
  DayPlan,
  MemoryNode,
  Persona,
  PlanEntry,
} from "./types";
import {
  ACTION_NOTE_SCHEMA,
  actionNotePrompt,
  CONVERSATION_OUTCOME_SCHEMA,
  conversationOutcomePrompt,
  dailyPlanPrompt,
  decomposePrompt,
  interviewPrompt,
  newCurrentlyPrompt,
  planNotePrompt,
  thoughtNotePrompt,
  dialogueOpenerPrompt,
  dialogueTurnPrompt,
  formatClock,
  formatDate,
  formatTime,
  importanceBatchPrompt,
  importanceBatchSchema,
  objectStatusPrompt,
  reactionPrompt,
  reflectionInsightsPrompt,
  reflectionQuestionsPrompt,
  summaryComponentPrompt,
} from "./prompts";

/** Parse a (possibly fenced) JSON object reply; null on failure. */
function parseJson<T>(reply: string): T | null {
  const cleaned = reply.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function clampImportance(value: unknown, fallback = 3): number {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : fallback;
}

const REFLECTION_THRESHOLD = 150;
const VISION_RADIUS = 8;
/** Max perceived events per step (official implementation: att_bandwidth). */
const ATTENTION_BANDWIDTH = 3;
const REACT_COOLDOWN_MINUTES = 60;

export interface CurrentAction {
  description: string;
  location: string | null;
  /** sim minutes since epoch when this action ends */
  endsAt: number;
}

/** Serialized mutable agent state (session save/load). */
export interface AgentState {
  name: string;
  x: number;
  y: number;
  path: Array<{ x: number; y: number }>;
  action: CurrentAction;
  emoji: string;
  asleep: boolean;
  dayPlan: DayPlan | null;
  currently: string;
  conversationLog: Conversation[];
  conversationPartnerName: string | null;
  conversation: Conversation | null;
  summaryCache: { day: number; text: string } | null;
  reactCooldowns: Array<[string, number]>;
  memory: {
    importanceSinceReflection: number;
    nodes: MemoryNode[];
  };
}

export class Agent {
  readonly persona: Persona;
  readonly memory = new MemoryStream();
  private world: World;
  private llm: LLMQueue;

  x: number;
  y: number;
  path: Array<{ x: number; y: number }> = [];
  action: CurrentAction;
  emoji = "😴";
  asleep = true;

  dayPlan: DayPlan | null = null;
  conversation: Conversation | null = null;
  conversationPartner: Agent | null = null;
  conversationLog: Conversation[] = [];

  /** The agent's evolving "currently" status, revised each new day. */
  currently: string;

  private summaryCache: { day: number; text: string } | null = null;
  private reactCooldowns = new Map<string, number>();

  constructor(persona: Persona, world: World, llm: LLMQueue) {
    this.persona = persona;
    this.currently = persona.currently;
    this.world = world;
    this.llm = llm;
    const home = world.resolveLocation(persona.home) ?? { x: 2, y: 2 };
    this.x = home.x;
    this.y = home.y;
    this.action = {
      description: "sleeping",
      location: persona.home,
      endsAt: persona.wakeHour * 60,
    };
  }

  get name(): string {
    return this.persona.name;
  }

  /** Snapshot of all mutable state, for session save (see sim/session.ts). */
  serialize(): AgentState {
    return {
      name: this.name,
      x: this.x,
      y: this.y,
      path: this.path.map((p) => ({ ...p })),
      action: { ...this.action },
      emoji: this.emoji,
      asleep: this.asleep,
      dayPlan: this.dayPlan ? structuredClone(this.dayPlan) : null,
      currently: this.currently,
      conversationLog: structuredClone(this.conversationLog),
      conversationPartnerName: this.conversationPartner?.name ?? null,
      conversation: this.conversation ? structuredClone(this.conversation) : null,
      summaryCache: this.summaryCache ? { ...this.summaryCache } : null,
      reactCooldowns: [...this.reactCooldowns.entries()],
      memory: {
        importanceSinceReflection: this.memory.importanceSinceReflection,
        nodes: this.memory.nodes.map((n) => ({ ...n })),
      },
    };
  }

  /**
   * Restore a snapshot. Conversation partner references are re-linked
   * afterwards by the session loader (they need shared object identity
   * across the pair).
   */
  restore(state: AgentState): void {
    this.x = state.x;
    this.y = state.y;
    this.path = state.path.map((p) => ({ ...p }));
    this.action = { ...state.action };
    this.emoji = state.emoji;
    this.asleep = state.asleep;
    this.dayPlan = state.dayPlan ? structuredClone(state.dayPlan) : null;
    this.currently = state.currently;
    this.conversationLog = structuredClone(state.conversationLog);
    this.conversation = null;
    this.conversationPartner = null;
    this.summaryCache = state.summaryCache ? { ...state.summaryCache } : null;
    this.reactCooldowns = new Map(state.reactCooldowns);
    this.memory.importanceSinceReflection =
      state.memory.importanceSinceReflection;
    this.memory.nodes = state.memory.nodes.map((n) => ({ ...n }));
    let maxId = 0;
    for (const n of this.memory.nodes) maxId = Math.max(maxId, n.id);
    bumpNextMemoryId(maxId);
  }

  /** Seed the memory stream from the persona description (paper section 5). */
  async seedMemories(now: number): Promise<void> {
    const statements = [
      `${this.name} is ${this.persona.age} years old`,
      `${this.name}'s innate traits: ${this.persona.innateTraits}`,
      ...this.persona.learned.split(";").map((s) => s.trim()),
      this.persona.currently,
      this.persona.lifestyle,
      `${this.name} lives at ${this.persona.home.split(":")[0]}`,
    ].filter(Boolean);
    for (const statement of statements) {
      await this.memory.add("observation", statement, now, 5, {
        subject: this.name,
      });
    }
    this.memory.importanceSinceReflection = 0;
  }

  /**
   * Packed action annotation: emoji + importance in one constrained
   * call (previously two separate calls).
   */
  private async annotateAction(
    description: string,
  ): Promise<{ emoji: string; importance: number }> {
    try {
      const reply = await this.llm.chat(
        actionNotePrompt(this.persona, description),
        { temperature: 0.2, maxTokens: 40, jsonSchema: ACTION_NOTE_SCHEMA },
      );
      const parsed = parseJson<{ emoji?: string; importance?: number }>(reply);
      const emojis = (parsed?.emoji ?? "").match(/\p{Extended_Pictographic}/gu);
      return {
        emoji: emojis ? emojis.slice(0, 2).join("") : "💬",
        importance: clampImportance(parsed?.importance),
      };
    } catch {
      return { emoji: "💬", importance: 3 };
    }
  }

  /** Score several observations' importance in one constrained call. */
  private async scoreImportanceBatch(
    descriptions: string[],
  ): Promise<number[]> {
    if (descriptions.length === 0) return [];
    try {
      const reply = await this.llm.chat(
        importanceBatchPrompt(this.persona, descriptions),
        {
          temperature: 0,
          maxTokens: 20 + 6 * descriptions.length,
          jsonSchema: importanceBatchSchema(descriptions.length),
        },
      );
      const parsed = parseJson<{ scores?: unknown[] }>(reply);
      return descriptions.map((_, i) =>
        clampImportance(parsed?.scores?.[i]),
      );
    } catch {
      return descriptions.map(() => 3);
    }
  }

  /** Paper appendix A: dynamically generated agent summary description. */
  async summaryDescription(now: number): Promise<string> {
    const day = Math.floor(now / 1440);
    if (this.summaryCache && this.summaryCache.day === day) {
      return this.summaryCache.text;
    }
    const components: string[] = [];
    for (const question of [
      "core characteristics",
      "current daily occupation",
      "feeling about his or her recent progress in life",
    ] as const) {
      const retrieved = await this.memory.retrieve(
        `${this.name}'s ${question}`,
        now,
        8,
      );
      if (retrieved.length === 0) continue;
      const summary = await this.llm.chat(
        summaryComponentPrompt(this.name, question, retrieved),
        { temperature: 0.3, maxTokens: 100 },
      );
      components.push(summary.trim());
    }
    const text =
      `Name: ${this.name} (age: ${this.persona.age})\n` +
      `Innate traits: ${this.persona.innateTraits}\n` +
      `${this.currently}\n` +
      components.join("\n");
    this.summaryCache = { day, text };
    return text;
  }

  // ------------------------------------------------------------------
  // Planning (paper section 4.3)
  // ------------------------------------------------------------------

  async ensureDayPlan(now: number): Promise<void> {
    const day = Math.floor(now / 1440);
    if (this.dayPlan && this.dayPlan.day === day) return;

    // New day (not the first): revise identity before planning.
    if (this.dayPlan) await this.reviseIdentity(now);

    const summary = await this.summaryDescription(now);
    const yesterday =
      this.dayPlan && this.dayPlan.broadStrokes.length
        ? `On ${formatDate((day - 1) * 1440)}, ${this.name} ` +
          this.dayPlan.broadStrokes.map((s, i) => `${i + 1}) ${s}`).join(" ")
        : `${this.persona.lifestyle}.`;

    const reply = await this.llm.chat(
      dailyPlanPrompt(summary, this.persona, formatDate(now), yesterday),
      { temperature: 0.7, maxTokens: 400 },
    );
    const broadStrokes = ("1)" + reply)
      .split(/\d+\)\s*/)
      .map((s) => s.trim().replace(/[,.]$/, ""))
      .filter((s) => s.length > 3);

    this.dayPlan = { day, broadStrokes, hourly: [], detailed: [] };

    const planText = `${this.name}'s plan for ${formatDate(now)}: ${broadStrokes.join("; ")}`;
    await this.memory.add("plan", planText, now, 5, { subject: this.name });

    await this.decomposeDay(now, broadStrokes);
  }

  /**
   * New-day identity revision (official implementation): retrieve
   * recent plans and important events, note what to remember and how
   * the agent feels, and rewrite the agent's "currently" status.
   */
  private async reviseIdentity(now: number): Promise<void> {
    const day = Math.floor(now / 1440);
    const retrieved = [
      ...(await this.memory.retrieve(
        `${this.name}'s plan for ${formatDate(now)}`,
        now,
        10,
      )),
      ...(await this.memory.retrieve(
        `Important recent events for ${this.name}'s life`,
        now,
        10,
      )),
    ];
    const statements = [...new Set(retrieved)]
      .map((n) => `${formatTime(n.createdAt)}: ${n.description}`)
      .join("\n");
    const planNote = await this.llm.chat(
      planNotePrompt(this.name, statements, formatDate(now)),
      { temperature: 0.4, maxTokens: 150 },
    );
    const thoughtNote = await this.llm.chat(
      thoughtNotePrompt(this.name, statements),
      { temperature: 0.4, maxTokens: 150 },
    );
    const reply = await this.llm.chat(
      newCurrentlyPrompt(
        this.name,
        this.currently,
        `${planNote} ${thoughtNote}`.replace(/\n/g, " "),
        formatDate((day - 1) * 1440),
        formatDate(now),
      ),
      { temperature: 0.4, maxTokens: 120 },
    );
    const match = reply.match(/Status:\s*([\s\S]+)/i);
    const status = (match ? match[1] : reply).trim();
    if (status) {
      this.currently = status;
      this.summaryCache = null;
      await this.memory.add("reflection", status, now, 5, {
        subject: this.name,
      });
    }
  }

  /** Decompose broad strokes into ~hour-long entries with locations. */
  private async decomposeDay(now: number, broadStrokes: string[]): Promise<void> {
    const summary = await this.summaryDescription(now);
    const wake = Math.round(this.persona.wakeHour * 60);
    const reply = await this.llm.chat(
      decomposePrompt(
        summary,
        this.persona,
        formatDate(now),
        broadStrokes.join("; "),
        formatClock(wake),
        "11:59 pm",
        "roughly hour-long",
        this.world.describeAreas(),
      ),
      { temperature: 0.5, maxTokens: 700 },
    );
    const entries = this.parseSchedule(reply, wake, 1440);
    if (this.dayPlan) this.dayPlan.hourly = entries;
  }

  /** Lazily decompose the current hourly block into 5-15 minute tasks. */
  private async decomposeBlock(now: number, block: PlanEntry): Promise<void> {
    const summary = await this.summaryDescription(now);
    const reply = await this.llm.chat(
      decomposePrompt(
        summary,
        this.persona,
        formatDate(now),
        block.description,
        formatClock(block.start),
        formatClock(block.start + block.duration),
        "5-15 minute",
        block.location ?? this.world.describeAreas(),
      ),
      { temperature: 0.5, maxTokens: 500 },
    );
    const entries = this.parseSchedule(
      reply,
      block.start,
      block.start + block.duration,
    );
    for (const entry of entries) {
      if (!entry.location) entry.location = block.location;
    }
    if (this.dayPlan) {
      this.dayPlan.detailed = this.dayPlan.detailed
        .filter(
          (e) =>
            e.start + e.duration <= block.start ||
            e.start >= block.start + block.duration,
        )
        .concat(entries)
        .sort((a, b) => a.start - b.start);
    }
  }

  private parseSchedule(
    reply: string,
    rangeStart: number,
    rangeEnd: number,
  ): PlanEntry[] {
    const entries: PlanEntry[] = [];
    for (const line of reply.split("\n")) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 2) continue;
      const times = parts[0].match(
        /(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*~\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i,
      );
      if (!times) continue;
      const start = parseClock(times[1], times[2], times[3]);
      const end = parseClock(times[4], times[5], times[6]);
      if (start === null || end === null) continue;
      const clampedStart = Math.max(start, rangeStart);
      const clampedEnd = Math.min(end <= start ? end + 1440 : end, rangeEnd);
      if (clampedEnd <= clampedStart) continue;
      entries.push({
        start: clampedStart,
        duration: clampedEnd - clampedStart,
        description: parts[1],
        location: parts[2] && parts[2].toLowerCase() !== "none" ? parts[2] : undefined,
      });
    }
    return entries;
  }

  private planEntryAt(minutesSinceMidnight: number): PlanEntry | null {
    if (!this.dayPlan) return null;
    const find = (entries: PlanEntry[]) =>
      entries.find(
        (e) =>
          minutesSinceMidnight >= e.start &&
          minutesSinceMidnight < e.start + e.duration,
      ) ?? null;
    return find(this.dayPlan.detailed) ?? find(this.dayPlan.hourly);
  }

  // ------------------------------------------------------------------
  // The perceive → retrieve → react loop (paper sections 4.1, 4.3.1)
  // ------------------------------------------------------------------

  /** Main cognition step, called once per sim tick by the engine. */
  async step(now: number, agents: Agent[]): Promise<void> {
    const minutes = now % 1440;

    // Sleeping until wake time.
    if (minutes < this.persona.wakeHour * 60 && !this.conversation) {
      this.setAction("sleeping", this.persona.home, now + 30, "😴");
      this.asleep = true;
      return;
    }
    this.asleep = false;

    await this.ensureDayPlan(now);

    // Perceive surroundings; store novel observations.
    const observations = await this.perceive(now, agents);

    // While conversing, stay put; dialogue is driven by the engine.
    if (this.conversation) return;

    // Consider reacting to observed agents.
    for (const obs of observations) {
      if (!obs.aboutAgent) continue;
      const reacted = await this.maybeReact(now, obs);
      if (reacted) return;
    }

    // Follow the plan.
    if (now >= this.action.endsAt) {
      await this.advancePlan(now);
    }

    // Reflection check (paper: threshold over recent importance sum).
    if (this.memory.importanceSinceReflection >= REFLECTION_THRESHOLD) {
      await this.reflect(now);
    }
  }

  private async advancePlan(now: number): Promise<void> {
    const minutes = now % 1440;
    let entry = this.planEntryAt(minutes);
    const isHourlyOnly =
      entry !== null &&
      this.dayPlan !== null &&
      !this.dayPlan.detailed.includes(entry);
    if ((entry && isHourlyOnly) || !entry) {
      const block = entry ?? {
        start: minutes,
        duration: 60,
        description: `going about ${this.name}'s usual routine`,
        location: this.persona.workplace ?? this.persona.home.split(":")[0],
      };
      await this.decomposeBlock(now, block);
      entry = this.planEntryAt(minutes) ?? block;
    }

    const location = entry.location ?? null;
    const endsAt =
      Math.floor(now / 1440) * 1440 + entry.start + entry.duration;
    const note = await this.annotateAction(entry.description);
    this.setAction(
      entry.description,
      location,
      Math.max(endsAt, now + 5),
      note.emoji,
    );

    await this.memory.add(
      "observation",
      `${this.name} is ${entry.description}`,
      now,
      note.importance,
      { subject: this.name },
    );

    if (location) {
      const target = this.world.resolveLocation(location);
      if (target) this.path = this.world.findPath({ x: this.x, y: this.y }, target);
      await this.updateObjectStatus(now);
    }
  }

  /** Update the status of the object the agent is interacting with. */
  private async updateObjectStatus(now: number): Promise<void> {
    const nearby = this.world.objectsNear(this.x, this.y, 3);
    if (nearby.length === 0) return;
    const reply = await this.llm.chat(
      objectStatusPrompt(
        this.name,
        this.action.description,
        nearby.map((o) => o.name),
      ),
      { temperature: 0.2, maxTokens: 60 },
    );
    const objMatch = reply.match(/Object:\s*(.+)/i);
    const stateMatch = reply.match(/State:\s*(.+)/i);
    if (!objMatch || !stateMatch) return;
    const objName = objMatch[1].trim().toLowerCase();
    if (objName === "none") return;
    const object = nearby.find((o) => o.name.toLowerCase() === objName);
    if (object) {
      object.status = stateMatch[1].trim();
      await this.memory.add(
        "observation",
        `The ${object.name} at ${this.world.locationName(object.x, object.y)} is ${object.status}`,
        now,
        1,
        { subject: object.path },
      );
    }
  }

  private setAction(
    description: string,
    location: string | null,
    endsAt: number,
    emoji: string,
  ): void {
    this.action = { description, location, endsAt };
    this.emoji = emoji;
    if (description === "sleeping") {
      const home = this.world.resolveLocation(this.persona.home);
      if (home && (this.x !== home.x || this.y !== home.y)) {
        this.path = this.world.findPath({ x: this.x, y: this.y }, home);
      }
    }
  }

  private async perceive(
    now: number,
    agents: Agent[],
  ): Promise<Array<{ description: string; aboutAgent: Agent | null; node: MemoryNode }>> {
    // Gather candidate percepts sorted by distance, then keep only the
    // closest ATTENTION_BANDWIDTH novel ones (paper/official impl).
    const candidates: Array<{
      distance: number;
      description: string;
      aboutAgent: Agent | null;
      subject: string;
      importance: number | null;
    }> = [];

    for (const other of agents) {
      if (other === this) continue;
      const distance = Math.hypot(other.x - this.x, other.y - this.y);
      if (distance > VISION_RADIUS) continue;
      const description = `${other.name} is ${other.action.description}`;
      const last = this.memory.latestWithSubject(other.name);
      if (last && last.description === description) continue;
      candidates.push({
        distance,
        description,
        aboutAgent: other,
        subject: other.name,
        importance: null,
      });
    }

    for (const object of this.world.objectsNear(this.x, this.y, VISION_RADIUS)) {
      if (object.status === "idle") continue;
      const description = `The ${object.name} at ${this.world.locationName(object.x, object.y)} is ${object.status}`;
      const last = this.memory.latestWithSubject(object.path);
      if (last && last.description === description) continue;
      candidates.push({
        distance: Math.hypot(object.x - this.x, object.y - this.y),
        description,
        aboutAgent: null,
        subject: object.path,
        importance: 1,
      });
    }

    candidates.sort((a, b) => a.distance - b.distance);

    const kept = candidates.slice(0, ATTENTION_BANDWIDTH);

    // Score all unscored percepts in a single packed call.
    const unscored = kept.filter((c) => c.importance === null);
    const scores = await this.scoreImportanceBatch(
      unscored.map((c) => c.description),
    );
    unscored.forEach((c, i) => {
      c.importance = scores[i];
    });

    const results: Array<{
      description: string;
      aboutAgent: Agent | null;
      node: MemoryNode;
    }> = [];
    for (const candidate of kept) {
      const node = await this.memory.add(
        "observation",
        candidate.description,
        now,
        candidate.importance ?? 3,
        { subject: candidate.subject },
      );
      results.push({
        description: candidate.description,
        aboutAgent: candidate.aboutAgent,
        node,
      });
    }

    return results;
  }

  /**
   * Reaction decision (paper 4.3.1): summarize relevant context via two
   * retrieval queries, then ask whether to react. Returns true if the
   * agent reacted (e.g. by initiating a conversation).
   */
  private async maybeReact(
    now: number,
    obs: { description: string; aboutAgent: Agent | null },
  ): Promise<boolean> {
    const other = obs.aboutAgent!;
    if (other.asleep || other.conversation) return false;
    const cooldownKey = other.name;
    const lastReact = this.reactCooldowns.get(cooldownKey) ?? -Infinity;
    if (now - lastReact < REACT_COOLDOWN_MINUTES) return false;
    this.reactCooldowns.set(cooldownKey, now);

    const context = await this.relevantContext(now, other, obs.description);
    const summary = await this.summaryDescription(now);
    const reply = await this.llm.chat(
      reactionPrompt(
        summary,
        formatTime(now),
        this.persona,
        this.action.description,
        `${this.name} saw ${obs.description}.`,
        context,
      ),
      { temperature: 0.7, maxTokens: 120 },
    );
    const react = /React:\s*yes/i.test(reply);
    if (!react) return false;
    const reactionMatch = reply.match(/Reaction:\s*(.+)/i);
    const reaction = reactionMatch ? reactionMatch[1].trim() : "";

    if (/conversation|talk|chat|ask|greet|say|discuss/i.test(reaction)) {
      await this.startConversation(now, other, obs.description, context, reaction);
      return true;
    }

    // Non-dialogue reaction: replace the current action.
    const note = await this.annotateAction(reaction);
    this.setAction(reaction, null, now + 30, note.emoji);
    await this.memory.add(
      "observation",
      `${this.name} is ${reaction}`,
      now,
      note.importance,
      { subject: this.name },
    );
    return true;
  }

  /** Paper 4.3.1: relationship + status retrieval, summarized together. */
  private async relevantContext(
    now: number,
    other: Agent,
    observation: string,
  ): Promise<string> {
    const relationship = await this.memory.retrieve(
      `What is ${this.name}'s relationship with ${other.name}?`,
      now,
      6,
    );
    const aboutAction = await this.memory.retrieve(observation, now, 6);
    const combined = [...new Set([...relationship, ...aboutAction])];
    if (combined.length === 0) return `${this.name} does not know ${other.name} well.`;
    const reply = await this.llm.chat(
      summaryComponentPrompt(
        this.name,
        `relationship with ${other.name} and knowledge relevant to "${observation}"`,
        combined,
      ),
      { temperature: 0.3, maxTokens: 120 },
    );
    return reply.trim();
  }

  // ------------------------------------------------------------------
  // Dialogue (paper section 4.3.2)
  // ------------------------------------------------------------------

  private async startConversation(
    now: number,
    other: Agent,
    observation: string,
    context: string,
    intent: string,
  ): Promise<void> {
    if (this.conversation || other.conversation) return;
    const summary = await this.summaryDescription(now);
    const opener = await this.llm.chat(
      dialogueOpenerPrompt(
        summary,
        formatTime(now),
        this.persona,
        `${this.action.description}. ${intent}`,
        `${this.name} saw ${observation}.`,
        context,
        other.name,
      ),
      { temperature: 0.8, maxTokens: 100 },
    );
    const conversation: Conversation = {
      participants: [this.name, other.name],
      turns: [{ speaker: this.name, text: opener.trim() }],
      startedAt: now,
      endedAt: null,
    };
    this.conversation = conversation;
    other.conversation = conversation;
    this.conversationPartner = other;
    other.conversationPartner = this;
    this.emoji = "💬";
    other.emoji = "💬";
    this.action = {
      description: `conversing with ${other.name}`,
      location: null,
      endsAt: now + 30,
    };
    other.action = {
      description: `conversing with ${this.name}`,
      location: null,
      endsAt: now + 30,
    };
    // Walk toward each other.
    other.path = this.world.findPath(
      { x: other.x, y: other.y },
      { x: this.x, y: this.y },
    );
    this.path = [];
  }

  /** Generate this agent's next line; returns whether they ended it. */
  async takeDialogueTurn(now: number): Promise<boolean> {
    const conversation = this.conversation;
    const other = this.conversationPartner;
    if (!conversation || !other) return true;
    const lastLine = conversation.turns[conversation.turns.length - 1];
    const context = await this.relevantContext(
      now,
      other,
      `${other.name} said: "${lastLine.text}"`,
    );
    const history = conversation.turns
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");
    const summary = await this.summaryDescription(now);
    const reply = await this.llm.chat(
      dialogueTurnPrompt(
        summary,
        formatTime(now),
        this.persona,
        this.action.description,
        context,
        other.name,
        history,
      ),
      { temperature: 0.8, maxTokens: 120 },
    );
    const sayMatch = reply.match(/Say:\s*([\s\S]*?)(?:\nEnd conversation:|$)/i);
    const text = (sayMatch ? sayMatch[1] : reply).trim().replace(/^"|"$/g, "");
    if (text) conversation.turns.push({ speaker: this.name, text });
    const ended =
      /End conversation:\s*yes/i.test(reply) || conversation.turns.length >= 12;
    return ended;
  }

  async endConversation(now: number): Promise<void> {
    const conversation = this.conversation;
    const other = this.conversationPartner;
    if (!conversation) return;
    conversation.endedAt = now;
    for (const agent of [this, other]) {
      if (!agent) continue;
      agent.conversationLog.push(conversation);
      agent.conversation = null;
      agent.conversationPartner = null;
    }
    const transcript = conversation.turns
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");
    for (const agent of [this, other]) {
      if (!agent) continue;
      const partner = agent === this ? other?.name : this.name;
      const description = `${agent.name} had a conversation with ${partner}:\n${transcript}`;

      // Packed post-conversation call: importance + memo + planning
      // thought in one constrained reply (official impl: three calls).
      let importance = 5;
      let memo = "";
      let planningThought = "";
      try {
        const reply = await agent.llm.chat(
          conversationOutcomePrompt(agent.name, transcript),
          {
            temperature: 0.4,
            maxTokens: 200,
            jsonSchema: CONVERSATION_OUTCOME_SCHEMA,
          },
        );
        const parsed = parseJson<{
          importance?: number;
          memo?: string;
          planning_thought?: string;
        }>(reply);
        importance = clampImportance(parsed?.importance, 5);
        memo = (parsed?.memo ?? "").trim();
        planningThought = (parsed?.planning_thought ?? "").trim();
      } catch {
        // Non-fatal: fall back to storing the transcript alone.
      }

      await agent.memory.add("chat", description, now, importance, {
        subject: `conversation with ${partner}`,
      });
      if (memo) {
        await agent.memory.add("reflection", memo, now, 4, {
          subject: agent.name,
        });
      }
      if (planningThought) {
        await agent.memory.add("plan", planningThought, now, 4, {
          subject: agent.name,
        });
      }
      // Resume plans from the interruption point.
      agent.action = { ...agent.action, endsAt: now };
    }
  }

  /**
   * User-to-agent interview (paper section 3): answer a question in
   * character, conditioned on retrieved memories. Does not advance the
   * sim or store the exchange in the agent's memory.
   */
  async interview(
    now: number,
    question: string,
    history: string,
  ): Promise<string> {
    const retrieved = await this.memory.retrieve(question, now, 12);
    const context = retrieved.map((n) => n.description).join("; ");
    const summary = await this.summaryDescription(now);
    return (
      await this.llm.chat(
        interviewPrompt(
          summary,
          formatTime(now),
          this.name,
          this.action.description,
          context,
          history,
          question,
        ),
        { temperature: 0.7, maxTokens: 200 },
      )
    ).trim();
  }

  // ------------------------------------------------------------------
  // Reflection (paper section 4.2)
  // ------------------------------------------------------------------

  async reflect(now: number): Promise<void> {
    this.memory.importanceSinceReflection = 0;
    const recent = this.memory.recent(100);
    const statements = recent.map((n) => n.description).join("\n");
    const questionsReply = await this.llm.chat(
      reflectionQuestionsPrompt(statements),
      { temperature: 0.5, maxTokens: 150 },
    );
    const questions = questionsReply
      .split("\n")
      .map((q) => q.replace(/^\d+[.)]\s*/, "").trim())
      .filter((q) => q.length > 5)
      .slice(0, 3);

    for (const question of questions) {
      const retrieved = await this.memory.retrieve(question, now, 15);
      const numbered = retrieved
        .map((n, i) => `${i + 1}. ${n.description}`)
        .join("\n");
      const insightsReply = await this.llm.chat(
        reflectionInsightsPrompt(this.name, numbered),
        { temperature: 0.5, maxTokens: 300 },
      );
      for (const line of insightsReply.split("\n")) {
        const match = line.match(/^(?:\d+[.)]\s*)?(.+?)\s*\(because of ([\d,\s]+)\)/i);
        if (!match) continue;
        const insight = match[1].trim();
        const evidence = match[2]
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((i) => i >= 1 && i <= retrieved.length)
          .map((i) => retrieved[i - 1].id);
        await this.memory.add("reflection", insight, now, 6, {
          evidence,
          subject: this.name,
        });
      }
    }
  }

  /** Move along the current path; called by the engine each tick. */
  moveAlongPath(tilesPerTick: number): void {
    for (let i = 0; i < tilesPerTick && this.path.length > 0; i++) {
      const next = this.path.shift()!;
      this.x = next.x;
      this.y = next.y;
      // Stop within speaking distance of a conversation partner.
      if (
        this.conversationPartner &&
        Math.abs(this.x - this.conversationPartner.x) <= 1 &&
        Math.abs(this.y - this.conversationPartner.y) <= 1
      ) {
        this.path = [];
        break;
      }
    }
  }
}

function parseClock(
  hourStr: string,
  minuteStr: string | undefined,
  ampm: string | undefined,
): number | null {
  let hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return null;
  const minute = minuteStr ? parseInt(minuteStr, 10) : 0;
  if (ampm) {
    const lower = ampm.toLowerCase();
    if (lower === "pm" && hour !== 12) hour += 12;
    if (lower === "am" && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
}
