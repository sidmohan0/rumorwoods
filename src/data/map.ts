import { AreaDef, MapDef, ObjectDef, SubAreaDef } from "../world/world";

/**
 * Smallville — the sandbox town from "Generative Agents: Interactive
 * Simulacra of Human Behavior" (Park et al., 2023): Hobbs Cafe, The
 * Rose and Crown Pub, The Willows Market and Pharmacy, Harvey Oak
 * Supply Store, Oak Hill College with its dorm, Johnson Park, a
 * co-living space, and family houses.
 */

function house(
  name: string,
  x: number,
  y: number,
  color: string,
  extraObjects: ObjectDef[] = [],
  bedrooms: string[] = ["bedroom"],
): AreaDef {
  // 14x10 house, door at bottom center
  const subareas: SubAreaDef[] = [];
  const bedroomWidth = Math.floor(6 / bedrooms.length);
  bedrooms.forEach((bedroom, i) => {
    const bx = x + 1 + i * bedroomWidth;
    subareas.push({
      name: bedroom,
      rect: { x: bx, y: y + 1, w: bedroomWidth, h: 4 },
      objects: [{ name: "bed", x: bx + 1, y: y + 2 }],
    });
  });
  subareas.push(
    {
      name: "kitchen",
      rect: { x: x + 7, y: y + 1, w: 6, h: 4 },
      objects: [
        { name: "stove", x: x + 9, y: y + 2 },
        { name: "refrigerator", x: x + 8, y: y + 2 },
        { name: "dining table", x: x + 11, y: y + 3 },
      ],
    },
    {
      name: "common room",
      rect: { x: x + 1, y: y + 5, w: 12, h: 4 },
      objects: [
        { name: "desk", x: x + 3, y: y + 6 },
        { name: "bookshelf", x: x + 10, y: y + 6 },
        ...extraObjects,
      ],
    },
  );
  return {
    name,
    kind: "building",
    rect: { x, y, w: 14, h: 10 },
    door: { x: x + 7, y: y + 9 },
    color,
    subareas,
  };
}

export const SMALLVILLE_MAP: MapDef = {
  name: "Smallville",
  width: 112,
  height: 74,
  areas: [
    {
      name: "Hobbs Cafe",
      kind: "building",
      rect: { x: 6, y: 5, w: 20, h: 13 },
      door: { x: 16, y: 17 },
      color: "#c98a4b",
      subareas: [
        {
          name: "counter",
          rect: { x: 7, y: 6, w: 12, h: 5 },
          objects: [
            { name: "coffee machine", x: 9, y: 7 },
            { name: "cash register", x: 12, y: 7 },
            { name: "pastry display", x: 15, y: 7 },
          ],
        },
        {
          name: "kitchen",
          rect: { x: 19, y: 6, w: 6, h: 5 },
          objects: [
            { name: "oven", x: 21, y: 7 },
            { name: "pantry", x: 23, y: 8 },
          ],
        },
        {
          name: "dining area",
          rect: { x: 7, y: 11, w: 18, h: 6 },
          objects: [
            { name: "cafe tables", x: 10, y: 13 },
            { name: "cozy corner booth", x: 20, y: 12 },
            { name: "notice board", x: 24, y: 14 },
          ],
        },
      ],
    },
    {
      name: "The Rose and Crown Pub",
      kind: "building",
      rect: { x: 32, y: 5, w: 18, h: 13 },
      door: { x: 41, y: 17 },
      color: "#a15c8f",
      subareas: [
        {
          name: "bar",
          rect: { x: 33, y: 6, w: 10, h: 5 },
          objects: [
            { name: "beer taps", x: 35, y: 7 },
            { name: "bar counter", x: 38, y: 7 },
          ],
        },
        {
          name: "stage",
          rect: { x: 43, y: 6, w: 6, h: 5 },
          objects: [
            { name: "piano", x: 45, y: 7 },
            { name: "microphone", x: 47, y: 8 },
          ],
        },
        {
          name: "seating area",
          rect: { x: 33, y: 11, w: 16, h: 6 },
          objects: [
            { name: "round tables", x: 36, y: 13 },
            { name: "dartboard", x: 46, y: 12 },
          ],
        },
      ],
    },
    {
      name: "The Willows Market and Pharmacy",
      kind: "building",
      rect: { x: 56, y: 5, w: 20, h: 13 },
      door: { x: 66, y: 17 },
      color: "#5b8c5a",
      subareas: [
        {
          name: "grocery aisles",
          rect: { x: 57, y: 6, w: 12, h: 10 },
          objects: [
            { name: "produce stand", x: 59, y: 8 },
            { name: "checkout counter", x: 63, y: 8 },
            { name: "grocery shelves", x: 60, y: 13 },
          ],
        },
        {
          name: "pharmacy counter",
          rect: { x: 69, y: 6, w: 6, h: 10 },
          objects: [
            { name: "medicine cabinet", x: 71, y: 8 },
            { name: "prescription counter", x: 73, y: 11 },
          ],
        },
      ],
    },
    {
      name: "Harvey Oak Supply Store",
      kind: "building",
      rect: { x: 82, y: 5, w: 16, h: 13 },
      door: { x: 90, y: 17 },
      color: "#8c7a5b",
      subareas: [
        {
          name: "storefront",
          rect: { x: 83, y: 6, w: 14, h: 6 },
          objects: [
            { name: "tool rack", x: 85, y: 8 },
            { name: "supply counter", x: 90, y: 8 },
            { name: "hardware shelves", x: 94, y: 8 },
          ],
        },
        {
          name: "stockroom",
          rect: { x: 83, y: 12, w: 14, h: 5 },
          objects: [
            { name: "workbench", x: 86, y: 14 },
            { name: "crates", x: 93, y: 14 },
          ],
        },
      ],
    },
    {
      name: "Oak Hill College",
      kind: "building",
      rect: { x: 6, y: 24, w: 28, h: 16 },
      door: { x: 20, y: 39 },
      color: "#5b6e8c",
      subareas: [
        {
          name: "classroom",
          rect: { x: 7, y: 25, w: 13, h: 7 },
          objects: [
            { name: "blackboard", x: 9, y: 26 },
            { name: "student desks", x: 13, y: 29 },
          ],
        },
        {
          name: "library",
          rect: { x: 20, y: 25, w: 13, h: 7 },
          objects: [
            { name: "bookshelves", x: 23, y: 27 },
            { name: "reading desk", x: 28, y: 29 },
          ],
        },
        {
          name: "commons",
          rect: { x: 7, y: 32, w: 26, h: 7 },
          objects: [
            { name: "lounge chairs", x: 12, y: 35 },
            { name: "study tables", x: 24, y: 35 },
          ],
        },
      ],
    },
    {
      name: "Oak Hill College Dorm",
      kind: "building",
      rect: { x: 38, y: 24, w: 24, h: 16 },
      door: { x: 50, y: 39 },
      color: "#6e5b8c",
      subareas: [
        {
          name: "Klaus Mueller's room",
          rect: { x: 39, y: 25, w: 5, h: 6 },
          objects: [
            { name: "bed", x: 40, y: 26 },
            { name: "desk", x: 42, y: 28 },
          ],
        },
        {
          name: "Maria Lopez's room",
          rect: { x: 44, y: 25, w: 5, h: 6 },
          objects: [
            { name: "bed", x: 45, y: 26 },
            { name: "computer desk", x: 47, y: 28 },
          ],
        },
        {
          name: "Eddy Lin's room",
          rect: { x: 49, y: 25, w: 4, h: 6 },
          objects: [
            { name: "bed", x: 50, y: 26 },
            { name: "sheet music stand", x: 51, y: 28 },
          ],
        },
        {
          name: "Wolfgang Schulz's room",
          rect: { x: 53, y: 25, w: 4, h: 6 },
          objects: [
            { name: "bed", x: 54, y: 26 },
            { name: "desk", x: 55, y: 28 },
          ],
        },
        {
          name: "Ayesha Khan's room",
          rect: { x: 57, y: 25, w: 4, h: 6 },
          objects: [
            { name: "bed", x: 58, y: 26 },
            { name: "desk", x: 59, y: 28 },
          ],
        },
        {
          name: "shared kitchen",
          rect: { x: 39, y: 31, w: 22, h: 8 },
          objects: [
            { name: "stove", x: 42, y: 33 },
            { name: "long table", x: 50, y: 35 },
            { name: "refrigerator", x: 57, y: 33 },
          ],
        },
      ],
    },
    {
      name: "Johnson Park",
      kind: "outdoor",
      rect: { x: 66, y: 24, w: 32, h: 16 },
      color: "#4f7a48",
      objects: [
        { name: "old oak tree", x: 72, y: 28 },
        { name: "pond", x: 82, y: 32 },
        { name: "park bench", x: 77, y: 36 },
        { name: "flower beds", x: 92, y: 28 },
        { name: "picnic tables", x: 92, y: 36 },
      ],
    },
    house("The Lin family's house", 6, 46, "#b0563d", [
      { name: "piano", x: 12, y: 52 },
    ], ["John and Mei's bedroom"]),
    house("The Moreno family's house", 24, 46, "#3d7ab0", [
      { name: "TV", x: 30, y: 52 },
    ], ["Tom and Jane's bedroom"]),
    house("The Moore family's house", 42, 46, "#b09a3d", [
      { name: "easel", x: 48, y: 52 },
    ], ["Sam and Jennifer's bedroom"]),
    house("Isabella Rodriguez's apartment", 60, 46, "#3db07a", [
      { name: "recipe books", x: 66, y: 52 },
    ]),
    house("Tamara and Carmen's house", 78, 46, "#7a3db0", [
      { name: "writing desk", x: 84, y: 52 },
    ], ["Tamara's bedroom", "Carmen's bedroom"]),
    house("Yuriko Yamamoto's house", 6, 60, "#b03d6e", [
      { name: "garden planters", x: 12, y: 66 },
    ]),
    house("Adam Smith's house", 24, 60, "#3db0a5", [
      { name: "manuscript desk", x: 30, y: 66 },
    ]),
    house("Arthur Burton's apartment", 42, 60, "#b0763d", [
      { name: "record player", x: 48, y: 66 },
    ]),
    house("Ryan Park's apartment", 60, 60, "#5a3db0", [
      { name: "computer", x: 66, y: 66 },
    ]),
    house("Giorgio Rossi's house", 78, 60, "#88b03d", [
      { name: "chalkboard", x: 84, y: 66 },
    ]),
    house("Carlos Gomez's house", 96, 60, "#b03d3d", [
      { name: "poetry shelf", x: 102, y: 66 },
    ]),
    {
      name: "The artist's co-living space",
      kind: "building",
      rect: { x: 96, y: 42, w: 14, h: 14 },
      door: { x: 103, y: 55 },
      color: "#8f6ea1",
      subareas: [
        {
          name: "Latoya Williams's room",
          rect: { x: 97, y: 43, w: 6, h: 4 },
          objects: [{ name: "bed", x: 98, y: 44 }],
        },
        {
          name: "Rajiv Patel's room",
          rect: { x: 103, y: 43, w: 6, h: 4 },
          objects: [{ name: "bed", x: 104, y: 44 }],
        },
        {
          name: "Abigail Chen's room",
          rect: { x: 97, y: 47, w: 6, h: 4 },
          objects: [{ name: "bed", x: 98, y: 48 }],
        },
        {
          name: "Francisco Lopez's room",
          rect: { x: 103, y: 47, w: 6, h: 4 },
          objects: [{ name: "bed", x: 104, y: 48 }],
        },
        {
          name: "Hailey Johnson's room",
          rect: { x: 97, y: 51, w: 6, h: 4 },
          objects: [{ name: "bed", x: 98, y: 52 }],
        },
        {
          name: "studio",
          rect: { x: 103, y: 51, w: 6, h: 4 },
          objects: [
            { name: "shared easel", x: 105, y: 52 },
            { name: "camera equipment", x: 107, y: 53 },
          ],
        },
      ],
    },
  ],
};
