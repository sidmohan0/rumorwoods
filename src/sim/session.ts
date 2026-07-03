import { Agent, AgentState } from "../core/agent";
import { Engine } from "./engine";
import { World } from "../world/world";

/**
 * Session persistence in IndexedDB. A session snapshot holds the sim
 * clock, every agent's mutable state (memory stream with embeddings —
 * IndexedDB structured-clones Float32Array natively), and world object
 * statuses. LLM backend choice is not part of a session; any backend
 * can resume any session.
 */

const DB_NAME = "rumorwoods";
const STORE = "sessions";

export interface SessionRecord {
  name: string;
  savedAt: number;
  simTime: number;
  agents: AgentState[];
  objects: Array<{ path: string; status: string }>;
}

export interface SessionSummary {
  name: string;
  savedAt: number;
  simTime: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function captureSession(
  name: string,
  engine: Engine,
  world: World,
): SessionRecord {
  return {
    name,
    savedAt: Date.now(),
    simTime: engine.time,
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
