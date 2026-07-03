import { Agent, AgentState } from "../core/agent";
import { Persona } from "../core/types";
import { Engine } from "./engine";
import { World } from "../world/world";
import { openDb, txDone, SESSIONS_STORE as STORE } from "./db";
import { reconcileRoster } from "./roster";

/**
 * Session persistence in IndexedDB. A session snapshot holds the sim
 * clock, the persona roster (so saves from customized towns restore
 * correctly), every agent's mutable state (memory stream with
 * embeddings — IndexedDB structured-clones Float32Array natively),
 * and world object statuses. LLM backend choice is not part of a
 * session; any backend can resume any session.
 */

export interface SessionRecord {
  name: string;
  savedAt: number;
  simTime: number;
  /** Scenario (map) the session belongs to; absent in older records (= ville). */
  scenario?: string;
  /** Roster at save time; absent in records saved before rosters existed. */
  personas?: Persona[];
  agents: AgentState[];
  objects: Array<{ path: string; status: string }>;
}

export interface SessionSummary {
  name: string;
  savedAt: number;
  simTime: number;
}

export function captureSession(
  name: string,
  engine: Engine,
  world: World,
  scenarioId: string,
): SessionRecord {
  return {
    name,
    savedAt: Date.now(),
    simTime: engine.time,
    scenario: scenarioId,
    personas: engine.agents.map((a) => structuredClone(a.persona)),
    agents: engine.agents.map((a) => a.serialize()),
    objects: world.objects.map((o) => ({ path: o.path, status: o.status })),
  };
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  await txDone(tx);
  db.close();
}

export async function listSessions(): Promise<SessionSummary[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).getAll();
  await txDone(tx);
  db.close();
  const records = (req.result ?? []) as SessionRecord[];
  return records
    .map(({ name, savedAt, simTime }) => ({ name, savedAt, simTime }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadSession(name: string): Promise<SessionRecord | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).get(name);
  await txDone(tx);
  db.close();
  return (req.result as SessionRecord | undefined) ?? null;
}

export async function deleteSession(name: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(name);
  await txDone(tx);
  db.close();
}

/** Apply a snapshot to a live engine/world (engine should be paused). */
export function applySession(
  record: SessionRecord,
  engine: Engine,
  world: World,
): void {
  engine.time = record.simTime;

  // Align the roster with the one saved in the record, so sessions
  // from customized towns restore their exact cast.
  if (record.personas) {
    reconcileRoster(engine, record.personas);
  }

  const byName = new Map<string, Agent>(
    engine.agents.map((a) => [a.name, a]),
  );
  for (const state of record.agents) {
    byName.get(state.name)?.restore(state);
  }

  // Re-link active conversations with shared object identity per pair.
  const linked = new Set<string>();
  for (const state of record.agents) {
    if (!state.conversation || !state.conversationPartnerName) continue;
    const self = byName.get(state.name);
    const partner = byName.get(state.conversationPartnerName);
    if (!self || !partner || linked.has(self.name)) continue;
    const conversation = structuredClone(state.conversation);
    self.conversation = conversation;
    self.conversationPartner = partner;
    partner.conversation = conversation;
    partner.conversationPartner = self;
    linked.add(self.name);
    linked.add(partner.name);
  }

  for (const saved of record.objects) {
    const object = world.getObject(saved.path);
    if (object) object.status = saved.status;
  }
}
