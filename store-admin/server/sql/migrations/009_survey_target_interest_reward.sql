ALTER TABLE survey
  ADD COLUMN IF NOT EXISTS target_interest_id INTEGER
    REFERENCES interest(interest_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_promotion_id INTEGER
    REFERENCES promotion(promotion_id) ON DELETE SET NULL;
