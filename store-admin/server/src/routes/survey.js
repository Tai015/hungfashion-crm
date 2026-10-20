import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const QUESTION_TYPES = new Set(['SingleChoice', 'MultiChoice', 'Text', 'Rating']);

function validateSurveyPayload(body) {
  const { title, description, questions } = body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 300
    || (description != null && (typeof description !== 'string' || description.length > 2000))
    || !Array.isArray(questions) || questions.length < 1 || questions.length > 50) {
    return 'Khảo sát cần tiêu đề hợp lệ và từ 1 đến 50 câu hỏi.';
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

router.get('/mine', async (req, res) => {
  if (!req.user.customer_id) return res.status(403).json({ message: 'Tài khoản chưa liên kết hồ sơ khách hàng.' });
  try {
    const { rows } = await pool.query(
      `SELECT s.survey_id, s.title, s.description, s.end_date,
              si.status AS invitation_status, si.invited_at
       FROM survey_invitation si
       JOIN survey s ON s.survey_id = si.survey_id
       WHERE si.customer_id = $1 AND s.status = 'Active'
         AND si.status <> 'Completed'
         AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
       ORDER BY si.invited_at DESC`,
      [req.user.customer_id],
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ message: 'Không thể tải danh sách khảo sát.' });
  }
});

// GET /api/surveys – danh sách khảo sát
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`s.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT s.*,
              e.full_name AS created_by_name,
              COUNT(DISTINCT sq.question_id)::int AS question_count,
              COUNT(DISTINCT sr.response_id)::int AS response_count
       FROM survey s
       LEFT JOIN employee e ON e.employee_id = s.created_by
       LEFT JOIN survey_question sq ON sq.survey_id = s.survey_id
       LEFT JOIN survey_response sr ON sr.survey_id = s.survey_id
       ${where}
       GROUP BY s.survey_id, e.full_name
       ORDER BY s.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      `SELECT s.*, e.full_name AS created_by_name
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

    res.json({ ...survey[0], questions: questionsWithOptions });
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
      start_date, end_date,
      questions,
    } = req.body;

    const { rows } = await client.query(
      `INSERT INTO survey
         (created_by, title, description, target_gender, target_tier,
          min_age, max_age, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Draft') RETURNING *`,
      [req.user.employee_id, title.trim(), description, target_gender, target_tier,
       min_age, max_age, start_date, end_date]
    );
    const survey = rows[0];
    await insertSurveyQuestions(client, survey.survey_id, questions);

    await client.query('COMMIT');
    res.status(201).json(survey);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23514' || err.code === '22P02' || err.code === '22007') return res.status(400).json({ message: 'Thông tin khảo sát không hợp lệ.' });
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

    const { title, description } = req.body;
    await client.query(
      `UPDATE survey
       SET title = $2, description = $3, updated_at = NOW()
       WHERE survey_id = $1`,
      [survey.survey_id, title.trim(), description?.trim() || null],
    );
    await client.query('DELETE FROM survey_question WHERE survey_id = $1', [survey.survey_id]);
    await insertSurveyQuestions(client, survey.survey_id, req.body.questions);
    await client.query('COMMIT');
    res.json({ survey_id: survey.survey_id, title: title.trim(), description: description?.trim() || null, status: survey.status });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23514' || err.code === '22P02' || err.code === '22007') {
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
  try {
    const { gender, tier, min_age, max_age, purchased_within_days } = req.body || {};
    const minAge = min_age === undefined || min_age === null ? null : Number(min_age);
    const maxAge = max_age === undefined || max_age === null ? null : Number(max_age);
    const purchaseDays = purchased_within_days === undefined || purchased_within_days === null
      ? null
      : Number(purchased_within_days);
    if ((gender && !['Male', 'Female', 'Other'].includes(gender))
      || (minAge !== null && (!Number.isInteger(minAge) || minAge < 0 || minAge > 120))
      || (maxAge !== null && (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 120))
      || (minAge !== null && maxAge !== null && minAge > maxAge)
      || (purchaseDays !== null && (!Number.isInteger(purchaseDays) || purchaseDays < 1 || purchaseDays > 3650))) {
      return res.status(400).json({ message: 'Điều kiện gửi khảo sát không hợp lệ.' });
    }
    const { rows: surveys } = await pool.query(
      `SELECT status FROM survey WHERE survey_id=$1`,
      [req.params.id],
    );
    if (!surveys.length) return res.status(404).json({ message: 'Không tìm thấy khảo sát.' });
    if (surveys[0].status === 'Closed') {
      return res.status(409).json({ message: 'Không thể gửi khảo sát đã đóng.' });
    }
    const conditions = ['a.status = \'Active\''];
    const params = [req.params.id, req.user.employee_id || null];

    if (gender) {
      params.push(gender);
      conditions.push(`c.gender = $${params.length}`);
    }
    if (tier) {
      params.push(tier);
      conditions.push(`c.customer_tier = $${params.length}`);
    }
    if (minAge !== null) {
      params.push(minAge);
      conditions.push(`EXTRACT(YEAR FROM AGE(c.date_of_birth)) >= $${params.length}`);
    }
    if (maxAge !== null) {
      params.push(maxAge);
      conditions.push(`EXTRACT(YEAR FROM AGE(c.date_of_birth)) <= $${params.length}`);
    }
    if (purchaseDays !== null) {
      params.push(purchaseDays);
      conditions.push(
        `c.customer_id IN (
           SELECT DISTINCT customer_id FROM "order"
           WHERE ordered_at >= NOW() - INTERVAL '1 day' * $${params.length}
         )`
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows: [delivery] } = await pool.query(
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
    await pool.query(
      `UPDATE survey SET status='Active', updated_at=NOW() WHERE survey_id=$1 AND status='Draft'`,
      [req.params.id]
    );

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
    res.status(500).json({ message: 'Không thể gửi khảo sát.' });
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
      `SELECT si.invitation_id
       FROM survey_invitation si
       JOIN survey s ON s.survey_id = si.survey_id
       WHERE si.survey_id=$1 AND si.customer_id=$2
         AND si.status <> 'Completed' AND s.status='Active'
         AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
       FOR UPDATE`,
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
    await client.query('COMMIT');
    res.status(201).json({ message: 'Cảm ơn bạn đã hoàn thành khảo sát!', response_id: response.response_id });
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
  try {
    const { rows: survey } = await pool.query(
      `SELECT s.survey_id, s.title, s.status,
              COUNT(DISTINCT sr.response_id)::int AS total_responses
       FROM survey s
       LEFT JOIN survey_response sr ON sr.survey_id = s.survey_id
       WHERE s.survey_id = $1
       GROUP BY s.survey_id, s.title, s.status`,
      [req.params.id]
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
       LEFT JOIN survey_answer sa   ON (
                                      sa.question_id = sq.question_id
                                      AND sa.option_id = so.option_id
                                    ) OR (
                                      sq.question_type = 'Rating'
                                      AND sa.question_id = sq.question_id
                                      AND sa.option_id IS NULL
                                    )
       WHERE sq.survey_id = $1
       GROUP BY sq.question_id, sq.question_text, sq.question_type,
                so.option_id, so.option_text, rating_value
       ORDER BY sq.display_order, so.display_order, rating_value`,
      [req.params.id]
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
