-- Preserve the status before an order transition for the customer interaction timeline.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

