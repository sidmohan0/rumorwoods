import { LLMQueue } from "../llm/llm";
import { World } from "../world/world";
import { MemoryStream } from "./memory";
import {
  Conversation,
  DayPlan,
  MemoryNode,
  Persona,
  PlanEntry,
} from "./types";
import {
  conversationMemoPrompt,
  conversationPlanningThoughtPrompt,
  dailyPlanPrompt,
  decomposePrompt,
  interviewPrompt,
  newCurrentlyPrompt,
  planNotePrompt,
  thoughtNotePrompt,
  dialogueOpenerPrompt,
  dialogueTurnPrompt,
  emojiPrompt,
  formatClock,
  formatDate,
  formatTime,
  importancePrompt,
  objectStatusPrompt,
  reactionPrompt,
  reflectionInsightsPrompt,
  reflectionQuestionsPrompt,
  summaryComponentPrompt,
} from "./prompts";

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

  private async scoreImportance(description: string): Promise<number> {
    const reply = await this.llm.chat(
      importancePrompt(this.persona, description),
      { temperature: 0, maxTokens: 8 },
    );
    const match = reply.match(/\d+/);
    const value = match ? parseInt(match[0], 10) : 3;
    return Math.min(10, Math.max(1, value));
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
    const emoji = await this.actionEmoji(entry.description);
    this.setAction(entry.description, location, Math.max(endsAt, now + 5), emoji);

    await this.memory.add(
      "observation",
      `${this.name} is ${entry.description}`,
      now,
      await this.scoreImportance(`${this.name} is ${entry.description}`),
      { subject: this.name },
    );

    if (location) {
      const target = this.world.resolveLocation(location);
      if (target) this.path = this.world.findPath({ x: this.x, y: this.y }, target);
      await this.updateObjectStatus(now);
    }
  }

  private async actionEmoji(description: string): Promise<string> {
    try {
      const reply = await this.llm.chat(emojiPrompt(description), {
        temperature: 0.2,
        maxTokens: 12,
      });
      const emojis = reply.match(/\p{Extended_Pictographic}/gu);
      return emojis ? emojis.slice(0, 2).join("") : "💬";
    } catch {
      return "💬";
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

    const results: Array<{
      description: string;
      aboutAgent: Agent | null;
      node: MemoryNode;
    }> = [];
    for (const candidate of candidates.slice(0, ATTENTION_BANDWIDTH)) {
      const node = await this.memory.add(
        "observation",
        candidate.description,
        now,
        candidate.importance ?? (await this.scoreImportance(candidate.description)),
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
    const emoji = await this.actionEmoji(reaction);
    this.setAction(reaction, null, now + 30, emoji);
    await this.memory.add(
      "observation",
      `${this.name} is ${reaction}`,
      now,
      await this.scoreImportance(reaction),
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
      await agent.memory.add(
        "chat",
        description,
        now,
        await agent.scoreImportance(description),
        { subject: `conversation with ${partner}` },
      );
      // Post-conversation memo and planning thought (official impl).
      try {
        const memo = await agent.llm.chat(
          conversationMemoPrompt(agent.name, transcript),
          { temperature: 0.4, maxTokens: 80 },
        );
        if (memo.trim()) {
          await agent.memory.add("reflection", memo.trim(), now, 4, {
            subject: agent.name,
          });
        }
        const planningThought = await agent.llm.chat(
          conversationPlanningThoughtPrompt(agent.name, transcript),
          { temperature: 0.4, maxTokens: 80 },
        );
        if (planningThought.trim()) {
          await agent.memory.add("plan", planningThought.trim(), now, 4, {
            subject: agent.name,
          });
        }
      } catch {
        // Non-fatal: the raw transcript memory is already stored.
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
