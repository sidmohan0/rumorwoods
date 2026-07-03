import { Persona } from "../core/types";
import { Engine } from "./engine";
import { openDb, txDone, ROSTER_STORE } from "./db";

/**
 * Custom character roster, persisted in IndexedDB. When present it
 * replaces the built-in 25 personas at startup; edits apply live to a
 * running engine via reconcileRoster.
 */

/** Rosters are stored per scenario (map) — see data/scenarios.ts. */
function rosterKey(scenarioId: string): string {
  return `custom:${scenarioId}`;
}

export async function loadRoster(scenarioId: string): Promise<Persona[] | null> {
  const db = await openDb();
  const tx = db.transaction(ROSTER_STORE, "readonly");
  const req = tx.objectStore(ROSTER_STORE).get(rosterKey(scenarioId));
  await txDone(tx);
  db.close();
  const record = req.result as { id: string; personas: Persona[] } | undefined;
  return record?.personas ?? null;
}

export async function saveRoster(
  scenarioId: string,
  personas: Persona[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ROSTER_STORE, "readwrite");
  tx.objectStore(ROSTER_STORE).put({
    id: rosterKey(scenarioId),
    personas: structuredClone(personas),
  });
  await txDone(tx);
  db.close();
}

export async function clearRoster(scenarioId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ROSTER_STORE, "readwrite");
  tx.objectStore(ROSTER_STORE).delete(rosterKey(scenarioId));
  await txDone(tx);
  db.close();
}

/**
 * Make the engine's agents match `personas`: update fields of existing
 * agents in place (prompts read persona fields at call time, so edits
 * take effect on the next LLM call), remove agents no longer in the
 * roster, and add new ones. Returns agents that were newly created so
 * the caller can seed their memories when the sim is already seeded.
 */
export function reconcileRoster(
  engine: Engine,
  personas: Persona[],
): { added: ReturnType<Engine["addAgent"]>[] } {
  const wanted = new Map(personas.map((p) => [p.name, p]));

  for (const agent of [...engine.agents]) {
    if (!wanted.has(agent.name)) engine.removeAgent(agent.name);
  }

  const existing = new Set(engine.agents.map((a) => a.name));
  const added = [];
  for (const persona of personas) {
    if (existing.has(persona.name)) {
      const agent = engine.agents.find((a) => a.name === persona.name)!;
      const currentlyChanged = agent.persona.currently !== persona.currently;
      Object.assign(agent.persona, persona);
      if (currentlyChanged) agent.currently = persona.currently;
    } else {
      added.push(engine.addAgent(structuredClone(persona)));
    }
  }
  return { added };
}
