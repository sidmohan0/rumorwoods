export type MemoryKind = "observation" | "reflection" | "plan" | "chat";

export interface MemoryNode {
  id: number;
  kind: MemoryKind;
  description: string;
  createdAt: number; // sim minutes since epoch
  lastAccessedAt: number;
  importance: number; // 1..10
  embedding: Float32Array | null;
  /** For reflections: ids of the memory nodes cited as evidence. */
  evidence?: number[];
  /** Subject of the memory (usually agent or object name), for dedup. */
  subject?: string;
}

export interface PlanEntry {
  /** sim minutes since midnight */
  start: number;
  /** duration in minutes */
  duration: number;
  description: string;
  /** environment tree path, e.g. "Honeywood Tavern:bar" */
  location?: string;
}

export interface DayPlan {
  day: number;
  broadStrokes: string[];
  hourly: PlanEntry[];
  /** fine 5-15 minute decomposition, generated lazily per hourly block */
  detailed: PlanEntry[];
}

export interface ConversationTurn {
  speaker: string;
  text: string;
}

export interface Conversation {
  participants: [string, string];
  turns: ConversationTurn[];
  startedAt: number;
  endedAt: number | null;
}

export interface Persona {
  name: string;
  age: number;
  innateTraits: string;
  /** Semicolon-delimited life description; split into seed memories. */
  learned: string;
  currently: string;
  lifestyle: string;
  /** Home location in the environment tree, e.g. "The Lin family's house:bedroom". */
  home: string;
  /** Where the agent spends their working hours, if anywhere in particular. */
  workplace?: string;
  color: string;
  /** Hour of day the agent usually wakes up (may be fractional). */
  wakeHour: number;
}
