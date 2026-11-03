export async function writeOutboxEvent(client, { eventId, topic, partitionKey, payload }) {
  const { rowCount } = await client.query(
    `INSERT INTO outbox_events (event_id, topic, partition_key, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, topic, partitionKey, JSON.stringify(payload)],
  );
  return rowCount > 0;
}
