export async function measureServer<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const enabled =
    process.env.PERF_DEBUG === "1" ||
    process.env.NEXT_PUBLIC_PERF_DEBUG === "1";

  if (!enabled) return fn();

  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = Math.round(performance.now() - start);
    console.info(`[perf] ${label} ${duration}ms`);
  }
}
