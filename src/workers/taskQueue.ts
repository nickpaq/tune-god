/** Start work only when a slot is available, so waiting jobs do not allocate/copy audio. */
export function taskQueue(concurrency: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return <T>(task: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const run = () => {
      active++;
      void Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active--;
        waiting.shift()?.();
      });
    };
    if (active < concurrency) run();
    else waiting.push(run);
  });
}
