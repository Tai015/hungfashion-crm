import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

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
    await client.query('BEGIN');
    const {
      created_by, title, description,
      target_gender, target_tier, min_age, max_age,
      start_date, end_date,
      questions = [],   // [{ question_text, question_type, display_order, options: [] }]
    } = req.body;

    const { rows } = await client.query(
      `INSERT INTO survey
         (created_by, title, description, target_gender, target_tier,
          min_age, max_age, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Draft') RETURNING *`,
      [created_by, title, description, target_gender, target_tier,
       min_age, max_age, start_date, end_date]
    );
    const survey = rows[0];

    for (const q of questions) {
      const { rows: qRows } = await client.query(
        `INSERT INTO survey_question (survey_id, question_text, question_type, display_order, is_required)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [survey.survey_id, q.question_text, q.question_type, q.display_order ?? 1, q.is_required ?? true]
      );
      const question = qRows[0];

      for (const opt of (q.options || [])) {
        await client.query(
          `INSERT INTO survey_option (question_id, option_text, display_order)
           VALUES ($1,$2,$3)`,
          [question.question_id, opt.option_text, opt.display_order ?? 1]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(survey);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/surveys/:id/status – Active / Closed / Draft
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
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
    const { gender, tier, min_age, max_age, purchased_within_days } = req.body;
    const conditions = ['a.status = \'Active\''];
    const params = [req.params.id];

    if (gender) {
      params.push(gender);
      conditions.push(`c.gender = $${params.length}`);
    }
    if (tier) {
      params.push(tier);
      conditions.push(`c.customer_tier = $${params.length}`);
    }
    if (min_age) {
      params.push(min_age);
      conditions.push(`EXTRACT(YEAR FROM AGE(c.date_of_birth)) >= $${params.length}`);
    }
    if (max_age) {
      params.push(max_age);
      conditions.push(`EXTRACT(YEAR FROM AGE(c.date_of_birth)) <= $${params.length}`);
    }
    if (purchased_within_days) {
      params.push(purchased_within_days);
      conditions.push(
        `c.customer_id IN (
           SELECT DISTINCT customer_id FROM "order"
           WHERE ordered_at >= NOW() - INTERVAL '1 day' * $${params.length}
         )`
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Lấy danh sách KH phù hợp chưa được gửi khảo sát này
    const { rows: customers } = await pool.query(
      `SELECT c.customer_id FROM customer c
       LEFT JOIN account a ON a.account_id = c.account_id
       ${where}
       AND c.customer_id NOT IN (
         SELECT customer_id FROM survey_response WHERE survey_id = $1
       )`,
      params
    );

    // Kích hoạt khảo sát nếu còn Draft
    await pool.query(
      `UPDATE survey SET status='Active', updated_at=NOW() WHERE survey_id=$1 AND status='Draft'`,
      [req.params.id]
    );

    res.json({
      message: `Đã gửi khảo sát đến ${customers.length} khách hàng`,
      recipient_count: customers.length,
      customer_ids: customers.map(c => c.customer_id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/surveys/:id/respond – khách hàng trả lời khảo sát
router.post('/:id/respond', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { customer_id, answers = [] } = req.body;
    // [{ question_id, option_id?, answer_text? }]

    const { rows } = await client.query(
      `INSERT INTO survey_response (survey_id, customer_id)
       VALUES ($1,$2) RETURNING *`,
      [req.params.id, customer_id]
    );
    const response = rows[0];

    for (const ans of answers) {
      await client.query(
        `INSERT INTO survey_answer (response_id, question_id, option_id, answer_text)
         VALUES ($1,$2,$3,$4)`,
        [response.response_id, ans.question_id, ans.option_id || null, ans.answer_text || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Cảm ơn bạn đã hoàn thành khảo sát!', response_id: response.response_id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ message: 'Bạn đã trả lời khảo sát này rồi' });
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// GET /api/surveys/:id/results – thống kê kết quả khảo sát
router.get('/:id/results', async (req, res) => {
  try {
    const { rows: survey } = await pool.query(
      `SELECT survey_id, title, status,
              COUNT(DISTINCT sr.response_id)::int AS total_responses
       FROM survey s
       LEFT JOIN survey_response sr ON sr.survey_id = s.survey_id
       WHERE s.survey_id = $1
       GROUP BY s.survey_id`,
      [req.params.id]
    );
    if (!survey.length) return res.status(404).json({ message: 'Không tìm thấy khảo sát' });

    // Thống kê từng câu hỏi
    const { rows: questionStats } = await pool.query(
      `SELECT sq.question_id, sq.question_text, sq.question_type,
              so.option_id, so.option_text,
              COUNT(sa.answer_id)::int AS vote_count
       FROM survey_question sq
       LEFT JOIN survey_option so   ON so.question_id = sq.question_id
       LEFT JOIN survey_answer sa   ON sa.question_id = sq.question_id
                                    AND sa.option_id = so.option_id
       WHERE sq.survey_id = $1
       GROUP BY sq.question_id, sq.question_text, sq.question_type,
                so.option_id, so.option_text
       ORDER BY sq.display_order, so.display_order`,
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
