export async function runWithConcurrency<T>(
  taskCount: number,
  concurrency: number,
  task: (index: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(taskCount);
  let nextIndex = 0;
  const workerCount = Math.min(taskCount, Math.max(1, Math.floor(concurrency)));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < taskCount) {
      const index = nextIndex++;
      results[index] = await task(index);
    }
  }));
  return results;
}
