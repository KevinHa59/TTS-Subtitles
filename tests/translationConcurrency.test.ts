import assert from "node:assert/strict";
import { test } from "node:test";
import { runWithConcurrency } from "../src/utils/translationConcurrency";

test("runs no more than the requested number of tasks at once", async () => {
  let activeTasks = 0;
  let maximumActiveTasks = 0;

  const results = await runWithConcurrency(7, 3, async (index) => {
    activeTasks += 1;
    maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeTasks -= 1;
    return index * 2;
  });

  assert.equal(maximumActiveTasks, 3);
  assert.deepEqual(results, [0, 2, 4, 6, 8, 10, 12]);
});

test("runs available tasks when there are fewer tasks than workers", async () => {
  const results = await runWithConcurrency(2, 4, async (index) => index + 1);
  assert.deepEqual(results, [1, 2]);
});
