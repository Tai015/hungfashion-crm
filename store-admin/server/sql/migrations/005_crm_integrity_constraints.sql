-- Bảo đảm tính hợp lệ của phản hồi và câu trả lời khảo sát CRM.

ALTER TABLE feedback
  ADD CONSTRAINT feedback_product_requires_product_and_rating
  CHECK (
    feedback_type <> 'Product'
    OR (product_id IS NOT NULL AND rating IS NOT NULL)
  );

ALTER TABLE survey
  ADD CONSTRAINT survey_age_range_check
  CHECK (
    (min_age IS NULL OR min_age >= 0)
    AND (max_age IS NULL OR max_age >= 0)
    AND (min_age IS NULL OR max_age IS NULL OR min_age <= max_age)
  ),
  ADD CONSTRAINT survey_date_range_check
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date);

ALTER TABLE survey_option
  ADD CONSTRAINT survey_option_question_option_unique
  UNIQUE (question_id, option_id);

ALTER TABLE survey_answer
  ADD CONSTRAINT survey_answer_option_question_fk
  FOREIGN KEY (question_id, option_id)
  REFERENCES survey_option (question_id, option_id);
