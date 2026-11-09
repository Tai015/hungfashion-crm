export async function publishOutboxMessages(producerClient, messagesByTopic) {
  for (const [topic, messages] of Object.entries(messagesByTopic)) {
    await producerClient.send({ topic, messages });
  }
}

