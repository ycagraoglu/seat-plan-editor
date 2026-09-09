import { it, expect } from "vitest";
import { mergeRowLabels } from "../../src/core/labelfit.js";

const left = { key: "a", blockId: "a", level: "1", text: "29", x: 0, y: 0, nx: 1, ny: 0, reach: 60 };
const right = { ...left, key: "b", blockId: "b", x: 80, nx: -1 };

it("centers matching row ends in a shared aisle without mutating the source", () => {
  expect(mergeRowLabels([left, right])).toEqual([{ ...left, x: 40 }]);
  expect(left.x).toBe(0);
  expect(right.x).toBe(80);
});

it("preserves distinct rows, levels, distant ends and ends facing away", () => {
  for (const change of [
    { text: "30" }, { level: "2" }, { x: 300 }, { y: 50 },
    { nx: 1 }, { x: -80 }, { blockId: "a" },
  ]) {
    expect(mergeRowLabels([left, { ...right, ...change }])).toHaveLength(2);
  }
});

it("merges rotated aisles and keeps each end in at most one pair", () => {
  const a = { ...left, nx: 0, ny: 1 };
  const b = { ...right, x: 0, y: 80, nx: 0, ny: -1 };
  expect(mergeRowLabels([a, b])[0]).toMatchObject({ x: 0, y: 40 });
  expect(mergeRowLabels([left, right, { ...right, key: "c", blockId: "c", x: 90 }])).toHaveLength(2);
});
