-- 006_chat.sql: Bảng hỗ trợ khách hàng trực tuyến (CSKH)

CREATE TABLE IF NOT EXISTS conversation (
  conversation_id SERIAL PRIMARY KEY,
  customer_id     INT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
  assigned_to     INT REFERENCES employee(employee_id) ON DELETE SET NULL,
  subject         VARCHAR(300) NOT NULL DEFAULT 'Hỗ trợ khách hàng',
  status          VARCHAR(20)  NOT NULL DEFAULT 'Open'
                  CHECK (status IN ('Open', 'Resolved', 'Closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_message (
  message_id        SERIAL PRIMARY KEY,
  conversation_id   INT  NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
  sender_account_id INT  NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
  content           TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read           BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_conversation_customer_id ON conversation(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversation_status      ON conversation(status);
CREATE INDEX IF NOT EXISTS idx_conversation_updated_at  ON conversation(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_message_conv_id     ON chat_message(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_sent_at     ON chat_message(sent_at ASC);
