CREATE TABLE IF NOT EXISTS chat_message_attachment (
  attachment_id BIGSERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES chat_message(message_id) ON DELETE CASCADE,
  storage_name VARCHAR(100) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_message_attachment_message_idx
  ON chat_message_attachment(message_id, attachment_id);
