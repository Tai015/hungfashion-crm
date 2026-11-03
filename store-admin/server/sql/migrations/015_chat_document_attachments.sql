ALTER TABLE chat_message_attachment
  ALTER COLUMN mime_type TYPE VARCHAR(100);

ALTER TABLE chat_message_attachment
  DROP CONSTRAINT IF EXISTS chat_message_attachment_mime_type_check;

ALTER TABLE chat_message_attachment
  ADD CONSTRAINT chat_message_attachment_mime_type_check
  CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
    'application/pdf', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ));
