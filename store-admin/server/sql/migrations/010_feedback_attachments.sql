CREATE TABLE IF NOT EXISTS feedback_attachment (
  attachment_id BIGSERIAL PRIMARY KEY,
  feedback_id INTEGER NOT NULL REFERENCES feedback(feedback_id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type VARCHAR(100) NOT NULL,
  original_name TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_attachment_feedback_idx
  ON feedback_attachment(feedback_id, attachment_id);
