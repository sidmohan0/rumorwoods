# Custom maps (Tiled pipeline)

Maps are authored in [Tiled](https://www.mapeditor.org/) (free, open
source) and converted into the JSON the simulation consumes. Honeywood
(`honeywood.tmj`) is the reference example.

## Authoring conventions

Create an orthogonal, finite map (16×16 tiles; the repo's
`public/tiles/roguelike.png` Kenney sheet makes what-you-paint match
what the game renders). Then add these layers:

| Layer name  | Type         | Meaning |
| ----------- | ------------ | ------- |
| `collision` | tile layer   | any nonzero tile blocks movement (walls, furniture, trees, fences) — remember door gaps! |
| `sectors`   | object layer | named rectangles = buildings/outdoor areas. Multiple rects with the same name merge (L-shapes). Add a bool property `outdoor: true` for parks/greens. |
| `arenas`    | object layer | named rectangles = rooms, assigned to the sector containing their center. Names matching `garden`/`park`/`yard` render as ground with flowers. |
| `objects`   | object layer | named **point** objects = interactables (bed, stove, counter…). Agents perceive and use these; place them inside arenas. |

Any other tile layers (painted ground/wall art) are currently ignored —
visuals are derived from semantics, like the Ville port.

## Converting and validating

```bash
node tools/build-tiled-map.mjs maps/yourtown.tmj src/data/yourtown-map.json "Your Town"
npx tsx tools/validate-map.mts src/data/yourtown-map.json
```

The validator checks that every sector, room, and object resolves to a
reachable spot, and that all buildings connect to one walkable world —
it catches enclosed-pocket bugs (a class of error it found in the Ville
port itself).

## Wiring into the app

Register the map plus a default cast in `src/data/scenarios.ts`, then
open the app with `?map=yourtown`. Rosters (character editor) and saved
sessions are stored per scenario.
