import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const QUESTION_TYPES = new Set(['SingleChoice', 'MultiChoice', 'Text', 'Rating']);
const GENDERS = new Set(['Male', 'Female', 'Other']);
const CUSTOMER_TIERS = new Set(['New', 'Regular', 'Silver', 'Gold', 'VIP']);

function validateSurveyPayload(body) {
  const {
    title, description, questions, target_gender, target_tier,
    min_age, max_age, target_interest_id, reward_promotion_id,
  } = body || {};
  const minAge = min_age == null || min_age === '' ? null : Number(min_age);
  const maxAge = max_age == null || max_age === '' ? null : Number(max_age);
  const interestId = target_interest_id == null || target_interest_id === '' ? null : Number(target_interest_id);
  const rewardPromotionId = reward_promotion_id == null || reward_promotion_id === '' ? null : Number(reward_promotion_id);
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 300
    || (description != null && (typeof description !== 'string' || description.length > 2000))
    || (target_gender != null && target_gender !== '' && !GENDERS.has(target_gender))
    || (target_tier != null && target_tier !== '' && !CUSTOMER_TIERS.has(target_tier))
    || (minAge !== null && (!Number.isInteger(minAge) || minAge < 0 || minAge > 120))
    || (maxAge !== null && (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 120))
    || (minAge !== null && maxAge !== null && minAge > maxAge)
    || (interestId !== null && (!Number.isInteger(interestId) || interestId < 1))
    || (rewardPromotionId !== null && (!Number.isInteger(rewardPromotionId) || rewardPromotionId < 1))
    || !Array.isArray(questions) || questions.length < 1 || questions.length > 50) {
    return 'Thông tin khảo sát, bộ lọc khách hàng hoặc phần thưởng không hợp lệ.';
  }

  for (const question of questions) {
    if (!question || typeof question.question_text !== 'string'
      || !question.question_text.trim() || question.question_text.trim().length > 1000
      || !QUESTION_TYPES.has(question.question_type)
      || (question.is_required !== undefined && typeof question.is_required !== 'boolean')
      || !Array.isArray(question.options || [])
      || (question.options || []).length > 100
      || (question.options || []).some(option => typeof option?.option_text !== 'string'
        || !option.option_text.trim() || option.option_text.trim().length > 300)) {
      return 'Một hoặc nhiều câu hỏi hoặc lựa chọn không hợp lệ.';
    }
    if (['SingleChoice', 'MultiChoice'].includes(question.question_type)
      && (question.options || []).length < 2) {
      return 'Câu hỏi chọn đáp án cần ít nhất 2 lựa chọn.';
    }
    if (['Text', 'Rating'].includes(question.question_type) && (question.options || []).length) {
      return 'Câu hỏi tự luận và đánh giá không dùng danh sách lựa chọn.';
    }
  }
  return null;
}

function addRecipientTargetFilters(survey, conditions, params, purchaseDays = null) {
  conditions.push("a.status = 'Active'");
  if (survey.target_gender) {
    params.push(survey.target_gender);
    conditions.push(`c.gender = $${params.length}`);
  }
  if (survey.target_tier) {
    params.push(survey.target_tier);
    conditions.push(`c.customer_tier = $${params.length}`);
  }
  if (survey.min_age !== null) {
    params.push(survey.min_age);
    conditions.push(`EXTRACT(YEAR FROM AGE(c.date_of_birth)) >= $${params.length}`);
  }
  if (survey.max_age !== null) {
    params.push(survey.max_age);
    conditions.push(`EXTRACT(YEAR FROM AGE(c.date_of_birth)) <= $${params.length}`);
  }
  if (survey.target_interest_id !== null) {
    params.push(survey.target_interest_id);
    conditions.push(`EXISTS (
      SELECT 1 FROM customer_interest ci
      WHERE ci.customer_id=c.customer_id AND ci.interest_id=$${params.length}
    )`);
  }
  if (purchaseDays !== null) {
    params.push(purchaseDays);
    conditions.push(`c.customer_id IN (
      SELECT DISTINCT customer_id FROM "order"
      WHERE ordered_at >= NOW() - INTERVAL '1 day' * $${params.length}
    )`);
  }
}

async function insertSurveyQuestions(client, surveyId, questions) {
  for (const [index, question] of questions.entries()) {
    const { rows: [savedQuestion] } = await client.query(
      `INSERT INTO survey_question (survey_id, question_text, question_type, display_order, is_required)
       VALUES ($1,$2,$3,$4,$5) RETURNING question_id`,
      [surveyId, question.question_text.trim(), question.question_type, index + 1, question.is_required !== false],
    );
    for (const [optionIndex, option] of (question.options || []).entries()) {
      await client.query(
        `INSERT INTO survey_option (question_id, option_text, display_order)
         VALUES ($1,$2,$3)`,
        [savedQuestion.question_id, option.option_text.trim(), optionIndex + 1],
      );
    }
  }
}

async function ensureRewardPromotion(client, promotionId) {
  if (promotionId == null || promotionId === '') return null;
  const { rows } = await client.query(
    `SELECT promotion_id FROM promotion
     WHERE promotion_id=$1 AND is_active=TRUE AND CURRENT_DATE BETWEEN start_date AND end_date`,
    [promotionId],
  );
  return rows.length ? null : 'Chỉ có thể chọn chương trình khuyến mãi đang hoạt động và còn hạn.';
}

router.get('/mine', async (req, res) => {
  if (!req.user.customer_id) return res.status(403).json({ message: 'Tài khoản chưa liên kết hồ sơ khách hàng.' });
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const [surveys, count] = await Promise.all([pool.query(
      `SELECT s.survey_id, s.title, s.description, s.end_date,
              si.status AS invitation_status, si.invited_at
       FROM survey_invitation si
       JOIN survey s ON s.survey_id = si.survey_id
       WHERE si.customer_id = $1 AND s.status = 'Active'
         AND si.status <> 'Completed'
         AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
       ORDER BY si.invited_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.customer_id, limit, offset],
    ), pool.query(
      `SELECT COUNT(*)::int AS total FROM survey_invitation si
       JOIN survey s ON s.survey_id=si.survey_id
       WHERE si.customer_id=$1 AND s.status='Active' AND si.status <> 'Completed'
         AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)`,
      [req.user.customer_id],
    )]);
    if (req.query.paged === 'true') return res.json({ data: surveys.rows, total: count.rows[0].total, page, limit });
    return res.json(surveys.rows);
  } catch {
    return res.status(500).json({ message: 'Không thể tải danh sách khảo sát.' });
  }
});

// GET /api/surveys – danh sách khảo sát
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    if ((status !== undefined && (typeof status !== 'string' || !['Draft', 'Active', 'Closed'].includes(status)))
      || search.length > 100) {
      return res.status(400).json({ message: 'Bộ lọc khảo sát không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`s.title ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [surveys, count] = await Promise.all([pool.query(
      `SELECT s.*,
              e.full_name AS created_by_name,
              (SELECT i.interest_name FROM interest i WHERE i.interest_id=s.target_interest_id) AS target_interest_name,
              (SELECT p.code FROM promotion p WHERE p.promotion_id=s.reward_promotion_id) AS reward_promotion_code,
              COUNT(DISTINCT sq.question_id)::int AS question_count,
              COUNT(DISTINCT sr.response_id)::int AS response_count
       FROM survey s
       LEFT JOIN employee e ON e.employee_id = s.created_by
       LEFT JOIN survey_question sq ON sq.survey_id = s.survey_id
       LEFT JOIN survey_response sr ON sr.survey_id = s.survey_id
       ${where}
       GROUP BY s.survey_id, e.full_name
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ), pool.query(`SELECT COUNT(*)::int AS total FROM survey s ${where}`, params)]);
    if (req.query.paged === 'true') return res.json({ data: surveys.rows, total: count.rows[0].total, page, limit });
    res.json(surveys.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/surveys/:id/recipients-preview – đếm nhóm khách phù hợp trước khi gửi
router.get('/:id/recipients-preview', async (req, res) => {
  try {
    const { rows: [survey] } = await pool.query(
      `SELECT target_gender, target_tier, min_age, max_age, target_interest_id
       FROM survey WHERE survey_id=$1`,
      [req.params.id],
    );
    if (!survey) return res.status(404).json({ message: 'Không tìm thấy khảo sát.' });

    const params = [req.params.id];
    const conditions = [];
    addRecipientTargetFilters(survey, conditions, params);
    const { rows: [counts] } = await pool.query(
      `SELECT COUNT(*)::int AS eligible_count,
              COUNT(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM survey_invitation si
                WHERE si.survey_id=$1 AND si.customer_id=c.customer_id
              ))::int AS new_recipient_count
       FROM customer c
       LEFT JOIN account a ON a.account_id=c.account_id
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return res.json({
      eligible_count: counts.eligible_count,
      new_recipient_count: counts.new_recipient_count,
      already_invited_count: counts.eligible_count - counts.new_recipient_count,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Không thể đếm khách hàng phù hợp với khảo sát.' });
  }
});

// GET /api/surveys/:id – chi tiết khảo sát + câu hỏi + lựa chọn
router.get('/:id', async (req, res) => {
  try {
    if (req.user.role_name === 'KHACH_HANG') {
      const { rowCount } = await pool.query(
        `SELECT 1
         FROM survey_invitation si
         JOIN survey s ON s.survey_id = si.survey_id
         WHERE si.survey_id=$1 AND si.customer_id=$2
           AND si.status <> 'Completed' AND s.status='Active'
           AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)`,
        [req.params.id, req.user.customer_id],
      );
      if (!rowCount) return res.status(403).json({ message: 'Khảo sát này chưa được gửi tới tài khoản của bạn.' });
    }
    const { rows: survey } = await pool.query(
      `SELECT s.*, e.full_name AS created_by_name,
              (SELECT i.interest_name FROM interest i WHERE i.interest_id=s.target_interest_id) AS target_interest_name,
              (SELECT p.code FROM promotion p WHERE p.promotion_id=s.reward_promotion_id) AS reward_promotion_code,
              (SELECT COUNT(*)::int FROM survey_question sqc WHERE sqc.survey_id = s.survey_id) AS question_count,
              (SELECT COUNT(*)::int FROM survey_response src WHERE src.survey_id = s.survey_id) AS response_count,
              (SELECT COUNT(*)::int FROM survey_invitation sic WHERE sic.survey_id = s.survey_id) AS invitation_count,
              (SELECT COUNT(*)::int FROM survey_invitation sic
                WHERE sic.survey_id = s.survey_id AND sic.status = 'Completed') AS completed_count
       FROM survey s LEFT JOIN employee e ON e.employee_id = s.created_by
       WHERE s.survey_id = $1`,
      [req.params.id]
    );
    if (!survey.length) return res.status(404).json({ message: 'Không tìm thấy khảo sát' });

    const { rows: questions } = await pool.query(
      `SELECT sq.*
       FROM survey_question sq
       WHERE sq.survey_id = $1
       ORDER BY sq.display_order`,
      [req.params.id]
    );

    // Lấy options theo từng câu hỏi
    const questionIds = questions.map(q => q.question_id);
    let options = [];
    if (questionIds.length) {
      const { rows } = await pool.query(
        `SELECT * FROM survey_option
         WHERE question_id = ANY($1::int[])
         ORDER BY display_order`,
        [questionIds]
      );
      options = rows;
    }

    const questionsWithOptions = questions.map(q => ({
      ...q,
      options: options.filter(o => o.question_id === q.question_id),
    }));

    const payload = { ...survey[0], questions: questionsWithOptions };
    if (req.user.role_name === 'KHACH_HANG') {
      delete payload.question_count;
      delete payload.response_count;
      delete payload.invitation_count;
      delete payload.completed_count;
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/surveys – tạo khảo sát + câu hỏi + lựa chọn
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const validationError = validateSurveyPayload(req.body);
    if (validationError) return res.status(400).json({ message: validationError });

    await client.query('BEGIN');
    const {
      title, description,
      target_gender, target_tier, min_age, max_age,
      target_interest_id, reward_promotion_id,
      start_date, end_date,
      questions,
    } = req.body;

    const rewardError = await ensureRewardPromotion(client, reward_promotion_id);
    if (rewardError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: rewardError });
    }

    const { rows } = await client.query(
      `INSERT INTO survey
         (created_by, title, description, target_gender, target_tier,
          min_age, max_age, target_interest_id, reward_promotion_id,
          start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Draft') RETURNING *`,
      [req.user.employee_id, title.trim(), description?.trim() || null,
       target_gender || null, target_tier || null,
       min_age === '' ? null : min_age, max_age === '' ? null : max_age,
       target_interest_id || null, reward_promotion_id || null,
       start_date || null, end_date || null]
    );
    const survey = rows[0];
    await insertSurveyQuestions(client, survey.survey_id, questions);

    await client.query('COMMIT');
    res.status(201).json(survey);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23514' || err.code === '23503' || err.code === '22P02' || err.code === '22007') return res.status(400).json({ message: 'Thông tin khảo sát không hợp lệ.' });
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/surveys/:id – cập nhật khảo sát nháp chưa gửi.
router.patch('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const validationError = validateSurveyPayload(req.body);
    if (validationError) return res.status(400).json({ message: validationError });

    await client.query('BEGIN');
    const { rows: [survey] } = await client.query(
      `SELECT survey_id, status
       FROM survey
       WHERE survey_id = $1
       FOR UPDATE`,
      [req.params.id],
    );
    if (!survey) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy khảo sát.' });
    }
    if (survey.status !== 'Draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Chỉ có thể sửa khảo sát ở trạng thái nháp.' });
    }
    const { rowCount } = await client.query(
      `SELECT 1
       FROM survey_invitation
       WHERE survey_id = $1
       UNION ALL
       SELECT 1
       FROM survey_response
       WHERE survey_id = $1
       LIMIT 1`,
      [survey.survey_id],
    );
    if (rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Không thể sửa khảo sát đã gửi lời mời hoặc đã có câu trả lời.' });
    }

    const {
      title, description, target_gender, target_tier, min_age, max_age,
      target_interest_id, reward_promotion_id,
    } = req.body;
    const rewardError = await ensureRewardPromotion(client, reward_promotion_id);
    if (rewardError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: rewardError });
    }
    await client.query(
      `UPDATE survey
       SET title=$2, description=$3, target_gender=$4, target_tier=$5,
           min_age=$6, max_age=$7, target_interest_id=$8, reward_promotion_id=$9,
           updated_at=NOW()
       WHERE survey_id = $1`,
      [survey.survey_id, title.trim(), description?.trim() || null,
       target_gender || null, target_tier || null,
       min_age === '' ? null : min_age, max_age === '' ? null : max_age,
       target_interest_id || null, reward_promotion_id || null],
    );
    await client.query('DELETE FROM survey_question WHERE survey_id = $1', [survey.survey_id]);
    await insertSurveyQuestions(client, survey.survey_id, req.body.questions);
    await client.query('COMMIT');
    res.json({
      survey_id: survey.survey_id, title: title.trim(), description: description?.trim() || null,
      target_gender: target_gender || null, target_tier: target_tier || null,
      min_age: min_age === '' ? null : min_age, max_age: max_age === '' ? null : max_age,
      target_interest_id: target_interest_id || null, reward_promotion_id: reward_promotion_id || null,
      status: survey.status,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23514' || err.code === '23503' || err.code === '22P02' || err.code === '22007') {
      return res.status(400).json({ message: 'Thông tin khảo sát không hợp lệ.' });
    }
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/surveys/:id/status – Active / Closed / Draft
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Draft', 'Active', 'Closed'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái khảo sát không hợp lệ.' });
    }
    const { rows } = await pool.query(
      `UPDATE survey SET status=$1, updated_at=NOW()
       WHERE survey_id=$2 RETURNING survey_id, title, status`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy khảo sát' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/surveys/:id/send – gửi khảo sát cho nhóm khách hàng
router.post('/:id/send', async (req, res) => {
  const client = await pool.connect();
  try {
    const { purchased_within_days } = req.body || {};
    const purchaseDays = purchased_within_days === undefined || purchased_within_days === null
      ? null
      : Number(purchased_within_days);
    if (purchaseDays !== null && (!Number.isInteger(purchaseDays) || purchaseDays < 1 || purchaseDays > 3650)) {
      return res.status(400).json({ message: 'Điều kiện gửi khảo sát không hợp lệ.' });
    }
    await client.query('BEGIN');
    const { rows: surveys } = await client.query(
      `SELECT status, target_gender, target_tier, min_age, max_age, target_interest_id
       FROM survey WHERE survey_id=$1 FOR UPDATE`,
      [req.params.id],
    );
    if (!surveys.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy khảo sát.' });
    }
    if (surveys[0].status === 'Closed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Không thể gửi khảo sát đã đóng.' });
    }
    const survey = surveys[0];
    const params = [req.params.id, req.user.employee_id || null];
    const conditions = [];
    addRecipientTargetFilters(survey, conditions, params, purchaseDays);

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows: [delivery] } = await client.query(
      `WITH matching AS MATERIALIZED (
         SELECT c.customer_id
         FROM customer c
         LEFT JOIN account a ON a.account_id = c.account_id
         ${where}
       ),
       inserted AS (
         INSERT INTO survey_invitation (survey_id, customer_id, invited_by)
         SELECT $1, matching.customer_id, $2
         FROM matching
         ON CONFLICT (survey_id, customer_id) DO NOTHING
         RETURNING customer_id
       )
       SELECT
         (SELECT COUNT(*)::int FROM matching) AS eligible_count,
         (SELECT COUNT(*)::int FROM inserted) AS recipient_count`,
      params,
    );

    // Kích hoạt khảo sát nếu còn Draft
    await client.query(
      `UPDATE survey SET status='Active', updated_at=NOW() WHERE survey_id=$1 AND status='Draft'`,
      [req.params.id]
    );
    await client.query('COMMIT');

    res.json({
      message: delivery.recipient_count
        ? `Đã gửi khảo sát đến ${delivery.recipient_count} khách hàng mới${delivery.eligible_count > delivery.recipient_count ? `; ${delivery.eligible_count - delivery.recipient_count} khách hàng đủ điều kiện đã được mời trước đó` : ''}.`
        : delivery.eligible_count
          ? `${delivery.eligible_count} khách hàng đủ điều kiện đã được mời khảo sát này trước đó; không gửi lời mời trùng.`
          : 'Không có khách hàng có tài khoản đang hoạt động phù hợp với điều kiện gửi khảo sát.',
      recipient_count: delivery.recipient_count,
      eligible_count: delivery.eligible_count,
      already_invited_count: delivery.eligible_count - delivery.recipient_count,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '22P02' || err.code === '23503') {
      return res.status(400).json({ message: 'Bộ lọc khảo sát không hợp lệ.' });
    }
    res.status(500).json({ message: 'Không thể gửi khảo sát.' });
  } finally {
    client.release();
  }
});

// POST /api/surveys/:id/respond – khách hàng trả lời khảo sát
router.post('/:id/respond', async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.user.customer_id) return res.status(403).json({ message: 'Tài khoản chưa liên kết hồ sơ khách hàng.' });
    await client.query('BEGIN');
    const { answers = [] } = req.body || {};
    if (!Array.isArray(answers) || answers.length > 50) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Danh sách câu trả lời không hợp lệ.' });
    }
    // [{ question_id, option_id?, answer_text? }]

    const { rows: invitations } = await client.query(
      `SELECT si.invitation_id, s.reward_promotion_id
       FROM survey_invitation si
       JOIN survey s ON s.survey_id = si.survey_id
       WHERE si.survey_id=$1 AND si.customer_id=$2
         AND si.status <> 'Completed' AND s.status='Active'
         AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
       FOR UPDATE OF si`,
      [req.params.id, req.user.customer_id],
    );
    if (!invitations.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Khảo sát không được gửi tới tài khoản này hoặc đã đóng.' });
    }
    const { rows: surveyQuestions } = await client.query(
      `SELECT question_id, question_type, is_required
       FROM survey_question WHERE survey_id=$1`,
      [req.params.id],
    );
    const questionById = new Map(surveyQuestions.map((question) => [question.question_id, question]));
    const submittedQuestionIds = new Set(answers.map((answer) => Number(answer.question_id)));
    if (surveyQuestions.some((question) => question.is_required && !submittedQuestionIds.has(question.question_id))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Vui lòng trả lời tất cả câu hỏi bắt buộc.' });
    }
    const seenAnswers = new Set();
    for (const answer of answers) {
      const question = questionById.get(Number(answer.question_id));
      if (!question || !Number.isInteger(Number(answer.question_id))
        || (answer.option_id != null && !Number.isInteger(Number(answer.option_id)))
        || (answer.answer_text != null && (typeof answer.answer_text !== 'string' || answer.answer_text.length > 2000))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Câu trả lời không hợp lệ hoặc không thuộc khảo sát.' });
      }
      const answerKey = `${question.question_id}:${answer.option_id ?? 'text'}`;
      if (seenAnswers.has(answerKey)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Không thể gửi trùng một câu trả lời.' });
      }
      seenAnswers.add(answerKey);
      if (['SingleChoice', 'Text', 'Rating'].includes(question.question_type)
        && answers.filter((item) => Number(item.question_id) === question.question_id).length > 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Câu hỏi này chỉ nhận một câu trả lời.' });
      }
      if (['SingleChoice', 'MultiChoice'].includes(question.question_type) && answer.option_id == null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Vui lòng chọn phương án trả lời.' });
      }
      if (question.question_type === 'Text'
        && (answer.option_id != null || typeof answer.answer_text !== 'string' || !answer.answer_text.trim())) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Câu trả lời văn bản không hợp lệ.' });
      }
      if (question.question_type === 'Rating'
        && (answer.option_id != null || !/^[1-5]$/.test(answer.answer_text || ''))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Đánh giá cần là số nguyên từ 1 đến 5.' });
      }
      if (['SingleChoice', 'MultiChoice'].includes(question.question_type) && answer.answer_text != null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Câu hỏi chọn đáp án không nhận thêm nội dung văn bản.' });
      }
    }

    const { rows } = await client.query(
      `INSERT INTO survey_response (survey_id, customer_id)
       VALUES ($1,$2) RETURNING *`,
      [req.params.id, req.user.customer_id]
    );
    const response = rows[0];

    for (const ans of answers) {
      if (ans.option_id != null) {
        const { rowCount } = await client.query(
          `SELECT 1 FROM survey_option WHERE question_id=$1 AND option_id=$2`,
          [ans.question_id, ans.option_id],
        );
        if (!rowCount) {
          const error = new Error('Lựa chọn không thuộc câu hỏi này.');
          error.statusCode = 400;
          throw error;
        }
      }
      await client.query(
        `INSERT INTO survey_answer (response_id, question_id, option_id, answer_text)
         VALUES ($1,$2,$3,$4)`,
        [response.response_id, ans.question_id, ans.option_id || null, ans.answer_text || null]
      );
    }

    await client.query(
      `UPDATE survey_invitation SET status='Completed' WHERE invitation_id=$1`,
      [invitations[0].invitation_id],
    );
    let reward = null;
    if (invitations[0].reward_promotion_id) {
      const promotionId = invitations[0].reward_promotion_id;
      const { rows: [promotion] } = await client.query(
        'SELECT promotion_id, code FROM promotion WHERE promotion_id=$1', [promotionId],
      );
      if (promotion) {
        const { rowCount } = await client.query(
          `INSERT INTO user_promotion (customer_id, promotion_id)
           VALUES ($1,$2) ON CONFLICT (customer_id, promotion_id) DO NOTHING`,
          [req.user.customer_id, promotionId],
        );
        reward = { code: promotion.code, granted: rowCount > 0 };
      }
    }
    await client.query('COMMIT');
    const rewardMessage = reward
      ? reward.granted
        ? ` Mã giảm giá ${reward.code} đã được thêm vào Ví ưu đãi.`
        : ` Mã giảm giá ${reward.code} đã có trong Ví ưu đãi của bạn.`
      : '';
    res.status(201).json({
      message: `Cảm ơn bạn đã hoàn thành khảo sát!${rewardMessage}`,
      response_id: response.response_id,
      reward,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ message: 'Bạn đã trả lời khảo sát này rồi' });
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// GET /api/surveys/:id/results – thống kê kết quả khảo sát
router.get('/:id/results', async (req, res) => {
  const { from, to } = req.query;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if ((from === undefined) !== (to === undefined)
    || (from !== undefined && (!validDate(from) || !validDate(to)
      || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1 < 1
      || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1 > 3660))) {
    return res.status(400).json({ message: 'Khoảng ngày không hợp lệ; cần from và to theo định dạng YYYY-MM-DD, tối đa 10 năm.' });
  }
  const rangeFrom = from ?? null;
  const rangeTo = to ?? null;
  try {
    const { rows: survey } = await pool.query(
      `SELECT s.survey_id, s.title, s.status,
              COUNT(DISTINCT sr.response_id)::int AS total_responses
       FROM survey s
       LEFT JOIN survey_response sr ON sr.survey_id = s.survey_id
         AND ($2::date IS NULL OR (sr.submitted_at >= $2::date AND sr.submitted_at < $3::date + INTERVAL '1 day'))
       WHERE s.survey_id = $1
       GROUP BY s.survey_id, s.title, s.status`,
      [req.params.id, rangeFrom, rangeTo]
    );
    if (!survey.length) return res.status(404).json({ message: 'Không tìm thấy khảo sát' });

    // Thống kê từng câu hỏi
    const { rows: questionStats } = await pool.query(
      `SELECT sq.question_id, sq.question_text, sq.question_type,
              so.option_id, so.option_text,
              CASE WHEN sq.question_type = 'Rating' THEN sa.answer_text END AS rating_value,
              COUNT(sa.answer_id)::int AS vote_count
       FROM survey_question sq
       LEFT JOIN survey_option so   ON so.question_id = sq.question_id
       LEFT JOIN survey_answer sa ON (
         (sa.question_id = sq.question_id AND sa.option_id = so.option_id)
         OR (sq.question_type = 'Rating' AND sa.question_id = sq.question_id AND sa.option_id IS NULL)
       ) AND sa.response_id IN (
                                      SELECT sr.response_id FROM survey_response sr
                                      WHERE sr.survey_id = $1
                                        AND ($2::date IS NULL OR (sr.submitted_at >= $2::date AND sr.submitted_at < $3::date + INTERVAL '1 day'))
       )
       WHERE sq.survey_id = $1
       GROUP BY sq.question_id, sq.question_text, sq.question_type,
                so.option_id, so.option_text, rating_value
       ORDER BY sq.display_order, so.display_order, rating_value`,
      [req.params.id, rangeFrom, rangeTo]
    );

    // Nhóm theo câu hỏi
    const questionsMap = {};
    for (const row of questionStats) {
      if (!questionsMap[row.question_id]) {
        questionsMap[row.question_id] = {
          question_id: row.question_id,
          question_text: row.question_text,
          question_type: row.question_type,
          options: [],
        };
      }
      if (row.option_id) {
        questionsMap[row.question_id].options.push({
          option_id: row.option_id,
          option_text: row.option_text,
          vote_count: row.vote_count,
        });
      } else if (row.rating_value !== null) {
        questionsMap[row.question_id].options.push({
          option_text: `${row.rating_value} sao`,
          vote_count: row.vote_count,
        });
      }
    }

    res.json({
      ...survey[0],
      questions: Object.values(questionsMap),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
