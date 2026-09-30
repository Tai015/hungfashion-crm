import { randomUUID } from 'node:crypto';

const apiUrl = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const targetRate = Number(process.argv[2] || process.env.KAFKA_BENCHMARK_RATE || 10);
const durationSeconds = Number(process.argv[3] || process.env.KAFKA_BENCHMARK_DURATION_SECONDS || 30);

if (!Number.isFinite(targetRate) || targetRate < 1 || targetRate > 1000) {
  throw new Error('Rate must be between 1 and 1000 events per second.');
}
if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 300) {
  throw new Error('Duration must be between 1 and 300 seconds.');
}

const totalTarget = Math.floor(targetRate * durationSeconds);
const intervalMs = 1000 / targetRate;
const maxInFlight = Math.min(500, Math.max(10, Math.ceil(targetRate * 2)));
const runId = randomUUID();
const startedAt = Date.now();
const latencies = [];
const pendingRequests = new Set();
let requestsStarted = 0;
let accepted = 0;
let failed = 0;
let windowAccepted = 0;
let windowFailed = 0;
let windowStartedAt = startedAt;

function logProgress() {
  const now = Date.now();
  const intervalSeconds = (now - windowStartedAt) / 1000;
  console.log(JSON.stringify({
    type: 'kafka_benchmark_progress',
    runId,
    topic: 'transaction-events',
    intervalSeconds: Number(intervalSeconds.toFixed(1)),
    attempted: requestsStarted,
    accepted,
    failed,
    intervalAccepted: windowAccepted,
    intervalFailed: windowFailed,
    intervalPerSecond: Number((windowAccepted / intervalSeconds).toFixed(2)),
  }));
  windowAccepted = 0;
  windowFailed = 0;
  windowStartedAt = now;
}

async function sendTransaction(sequence) {
  const requestStartedAt = performance.now();
  requestsStarted += 1;
  const transaction = {
    eventId: randomUUID(),
    benchmarkRunId: runId,
    transactionId: `BENCH-${runId}-${String(sequence).padStart(6, '0')}`,
    eventType: 'transaction_completed',
    amount: (Math.floor(Math.random() * 90) + 10) * 1000,
    currency: 'VND',
    status: 'completed',
    source: 'kafka-load-test',
    occurredAt: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${apiUrl}/api/events/transaction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(transaction),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }
    accepted += 1;
    windowAccepted += 1;
    latencies.push(performance.now() - requestStartedAt);
  } catch (error) {
    failed += 1;
    windowFailed += 1;
    console.error(JSON.stringify({
      type: 'kafka_benchmark_request_failed',
      runId,
      sequence,
      message: error.message,
    }));
  }
}

const progressTimer = setInterval(logProgress, 5000);
console.log(JSON.stringify({
  type: 'kafka_benchmark_started',
  runId,
  topic: 'transaction-events',
  apiUrl,
  targetRate,
  durationSeconds,
  totalTarget,
}));

for (let sequence = 1; sequence <= totalTarget; sequence += 1) {
  const scheduledAt = startedAt + (sequence - 1) * intervalMs;
  const delay = scheduledAt - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

  while (pendingRequests.size >= maxInFlight) {
    await Promise.race(pendingRequests);
  }

  let request;
  request = sendTransaction(sequence).finally(() => pendingRequests.delete(request));
  pendingRequests.add(request);
}

await Promise.all(pendingRequests);
clearInterval(progressTimer);
logProgress();

latencies.sort((left, right) => left - right);
const elapsedSeconds = (Date.now() - startedAt) / 1000;
const percentile95 = latencies.length
  ? latencies[Math.ceil(latencies.length * 0.95) - 1]
  : 0;
console.log(JSON.stringify({
  type: 'kafka_benchmark_summary',
  runId,
  topic: 'transaction-events',
  targetEvents: totalTarget,
  requestsStarted,
  accepted,
  failed,
  elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
  acceptedPerSecond: Number((accepted / elapsedSeconds).toFixed(2)),
  averageLatencyMs: latencies.length
    ? Number((latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length).toFixed(2))
    : 0,
  p95LatencyMs: Number(percentile95.toFixed(2)),
}));

if (failed > 0 || accepted !== totalTarget) process.exitCode = 1;