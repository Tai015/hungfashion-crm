function createRoleMetrics() {
  return {
    total: 0,
    failed: 0,
    windowMessages: 0,
    windowFailures: 0,
    windowStartedAt: Date.now(),
  };
}

export const kafkaMetrics = {
  producer: createRoleMetrics(),
  consumer: createRoleMetrics(),
};
