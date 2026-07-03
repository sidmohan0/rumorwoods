import { MapDef } from "../world/world";
import villeMapJson from "./ville-map.json";

/**
 * "The Ville" — the actual Smallville map from "Generative Agents:
 * Interactive Simulacra of Human Behavior" (Park et al., 2023),
 * converted from the original repository's tile-matrix data
 * (Apache-2.0) by tools/build-ville-map.mjs. All 19 sectors, 63
 * arenas, and per-tile collision are preserved; visuals are rendered
 * from a CC0 tileset rather than the original commercial art.
 */
export const SMALLVILLE_MAP: MapDef = villeMapJson as unknown as MapDef;
