import { Agent } from "../core/agent";
import { Conversation, MemoryKind } from "../core/types";

/**
 * Behavioral metrics computed live from agent state — no bookkeeping
 * during the sim. Both reports are derived on demand: diffusion from
 * memory-stream timestamps, the social network from conversation logs.
 * This mirrors how the paper measured its §6 end-to-end results
 * (information diffusion, relationship formation), but automated.
 */

/** A piece of information whose spread through town is measured. */
export interface TrackedTopic {
  id: string;
  label: string;
  /** Case-insensitive substrings; a memory mentioning any is a "hit". */
  keywords: string[];
}

export interface AgentAwareness {
  name: string;
  /** Sim minutes when the first matching memory was written; null = unaware. */
  firstAwareAt: number | null;
  /** Kind of the earliest matching memory ("chat" = heard in conversation). */
  via: MemoryKind | null;
  /** Description of the earliest matching memory, for tracing. */
  evidence: string | null;
}

/** One step of a cumulative count-over-sim-time curve. */
export interface CurvePoint {
  t: number;
  count: number;
}

export interface DiffusionReport {
  topic: TrackedTopic;
  agents: AgentAwareness[];
  awareCount: number;
  totalAgents: number;
  curve: CurvePoint[];
}

export interface AgentNetworkStats {
  name: string;
  conversations: number;
  partners: number;
}

export interface NetworkReport {
  agentCount: number;
  /** Distinct conversations (each is logged by both participants). */
  conversationCount: number;
  /** Agent pairs that have conversed at least once. */
  uniquePairCount: number;
  /** uniquePairCount / C(agentCount, 2), the paper's network density. */
  density: number;
  perAgent: AgentNetworkStats[];
  /** Cumulative distinct conversations over sim time. */
  curve: CurvePoint[];
}

function matchesTopic(description: string, keywords: string[]): boolean {
  const lower = description.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * When (in sim time) did each agent first hold a memory mentioning the
 * topic? Seed memories count (that agent is the origin); memories of
 * kind "chat" mean the agent heard it in conversation.
 */
export function computeDiffusion(
  agents: readonly Agent[],
  topic: TrackedTopic,
): DiffusionReport {
  const awareness: AgentAwareness[] = agents.map((agent) => {
    let earliest: { createdAt: number; kind: MemoryKind; description: string } | null =
      null;
    for (const node of agent.memory.nodes) {
      if (!matchesTopic(node.description, topic.keywords)) continue;
      if (!earliest || node.createdAt < earliest.createdAt) {
        earliest = {
          createdAt: node.createdAt,
          kind: node.kind,
          description: node.description,
        };
      }
    }
    return {
      name: agent.name,
      firstAwareAt: earliest?.createdAt ?? null,
      via: earliest?.kind ?? null,
      evidence: earliest?.description ?? null,
    };
  });

  const awareTimes = awareness
    .map((a) => a.firstAwareAt)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  return {
    topic,
    agents: [...awareness].sort(
      (a, b) => (a.firstAwareAt ?? Infinity) - (b.firstAwareAt ?? Infinity),
    ),
    awareCount: awareTimes.length,
    totalAgents: agents.length,
    curve: cumulativeCurve(awareTimes),
  };
}

/** Deduplicate conversations logged by both participants. */
function distinctConversations(agents: readonly Agent[]): Conversation[] {
  const seen = new Map<string, Conversation>();
  for (const agent of agents) {
    const logged = agent.conversation
      ? [...agent.conversationLog, agent.conversation]
      : agent.conversationLog;
    for (const conversation of logged) {
      const key =
        [...conversation.participants].sort().join("|") +
        ":" +
        conversation.startedAt;
      if (!seen.has(key)) seen.set(key, conversation);
    }
  }
  return [...seen.values()];
}

export function computeNetwork(agents: readonly Agent[]): NetworkReport {
  const conversations = distinctConversations(agents);

  const pairs = new Set<string>();
  const perAgentConversations = new Map<string, number>();
  const perAgentPartners = new Map<string, Set<string>>();
  for (const conversation of conversations) {
    const [a, b] = conversation.participants;
    pairs.add([a, b].sort().join("|"));
    for (const [self, partner] of [
      [a, b],
      [b, a],
    ] as const) {
      perAgentConversations.set(self, (perAgentConversations.get(self) ?? 0) + 1);
      const partners = perAgentPartners.get(self) ?? new Set<string>();
      partners.add(partner);
      perAgentPartners.set(self, partners);
    }
  }

  const n = agents.length;
  const possiblePairs = (n * (n - 1)) / 2;
  const startTimes = conversations
    .map((c) => c.startedAt)
    .sort((a, b) => a - b);

  return {
    agentCount: n,
    conversationCount: conversations.length,
    uniquePairCount: pairs.size,
    density: possiblePairs > 0 ? pairs.size / possiblePairs : 0,
    perAgent: agents
      .map((agent) => ({
        name: agent.name,
        conversations: perAgentConversations.get(agent.name) ?? 0,
        partners: perAgentPartners.get(agent.name)?.size ?? 0,
      }))
      .sort((a, b) => b.conversations - a.conversations),
    curve: cumulativeCurve(startTimes),
  };
}

function cumulativeCurve(sortedTimes: readonly number[]): CurvePoint[] {
  const curve: CurvePoint[] = [];
  for (const [i, t] of sortedTimes.entries()) {
    const last = curve[curve.length - 1];
    if (last && last.t === t) {
      curve[curve.length - 1] = { t, count: i + 1 };
    } else {
      curve.push({ t, count: i + 1 });
    }
  }
  return curve;
}

/** Bundle of everything the Metrics panel shows, also used for export. */
export interface MetricsReport {
  scenario: string;
  simTime: number;
  capturedAt: string;
  diffusion: DiffusionReport[];
  network: NetworkReport;
}

export function computeMetrics(
  agents: readonly Agent[],
  topics: readonly TrackedTopic[],
  scenario: string,
  simTime: number,
): MetricsReport {
  return {
    scenario,
    simTime,
    capturedAt: new Date().toISOString(),
    diffusion: topics.map((topic) => computeDiffusion(agents, topic)),
    network: computeNetwork(agents),
  };
}
