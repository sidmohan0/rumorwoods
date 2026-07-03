import { MapDef } from "../world/world";
import { Persona } from "../core/types";
import villeMapJson from "./ville-map.json";
import honeywoodMapJson from "./honeywood-map.json";
import { PERSONAS } from "./personas";
import { HONEYWOOD_PERSONAS } from "./personas-honeywood";

/**
 * A scenario bundles a map with its default cast. Selected via the
 * ?map= query parameter; the Ville (the paper's Smallville) is the
 * default. Custom rosters and sessions are stored per scenario.
 */
export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  map: MapDef;
  personas: Persona[];
}

export const SCENARIOS: Record<string, Scenario> = {
  ville: {
    id: "ville",
    title: "the Ville",
    blurb: "The original Smallville — 25 residents on the paper's exact map",
    map: villeMapJson as unknown as MapDef,
    personas: PERSONAS,
  },
  honeywood: {
    id: "honeywood",
    title: "Honeywood",
    blurb: "A hamlet of 3 — tavern gossip travels fast (Tiled pipeline demo)",
    map: honeywoodMapJson as unknown as MapDef,
    personas: HONEYWOOD_PERSONAS,
  },
};

export function scenarioFromQuery(search: string): Scenario {
  const id = new URLSearchParams(search).get("map") ?? "ville";
  return SCENARIOS[id] ?? SCENARIOS.ville;
}
