import { Kafka } from 'kafkajs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDirectory = path.dirname(serverDirectory);

function readPem(value, filePath) {
  if (filePath) {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectDirectory, filePath);
    return readFileSync(resolvedPath, 'utf8').trim();
  }
  return value?.replace(/\\n/g, '\n').trim();
}

function getKafkaSsl() {
  const ca = readPem(process.env.KAFKA_SSL_CA, process.env.KAFKA_SSL_CA_PATH);
  const cert = readPem(process.env.KAFKA_SSL_CERT, process.env.KAFKA_SSL_CERT_PATH);
  const key = readPem(process.env.KAFKA_SSL_KEY, process.env.KAFKA_SSL_KEY_PATH);
  if (!ca && !cert && !key) return undefined;
  if (!ca || Boolean(cert) !== Boolean(key)) {
    throw new Error('Kafka TLS needs KAFKA_SSL_CA and both KAFKA_SSL_CERT/KAFKA_SSL_KEY.');
  }
  return { ca: [ca], ...(cert ? { cert, key } : {}) };
}

export function createKafkaClient(clientId) {
  const brokers = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || '')
    .split(',')
    .map(broker => broker.trim())
    .filter(Boolean);
  if (!brokers.length) throw new Error('Set KAFKA_BROKER or KAFKA_BROKERS before starting Kafka clients.');

  const ssl = getKafkaSsl();
  return new Kafka({ clientId, brokers, ...(ssl ? { ssl } : {}) });
}
