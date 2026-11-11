import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;

test('Electron CRM: hoàn tất 12 chức năng quản lý và khách hàng bằng API + PostgreSQL thật', async () => {
  test.setTimeout(240_000);
  const db = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true',
  });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const customerIdentifier = process.env.E2E_CUSTOMER_IDENTIFIER;
  const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;
  const staffIdentifier = process.env.E2E_STAFF_IDENTIFIER;
  const staffPassword = process.env.E2E_STAFF_PASSWORD;
  for (const [key, value] of Object.entries({ customerIdentifier, customerPassword, staffIdentifier, staffPassword })) {
    expect(value, `Thiếu cấu hình ${key}`).toBeTruthy();
  }

  const electronApp = await electron.launch({
    args: ['desktop/main.js', '--no-sandbox'],
    env: { ...process.env, E2E_ELECTRON_TEST_MODE: 'true' },
  });
  let customerId;
  let accountId;
  let surveyId;
  let feedbackId;
  let seededProductId;
  let seededCategoryId;
  let customerToken;
  let staffToken;
  const results = [];

  try {
    const launcher = await electronApp.firstWindow();
    await expect(launcher.locator('#open-local')).toBeVisible();
    await launcher.locator('#open-local').click();
    await expect.poll(() => electronApp.windows().length, { timeout: 30_000 }).toBe(2);
    const page = electronApp.windows().find(window => window.url().includes('/#/nhan-vien/login'));
    expect(page, 'Phải chạy trong cửa sổ Electron nhân viên').toBeTruthy();
    await expect(page.evaluate(() => window.storeAdminLauncher?.isElectronApp)).resolves.toBe(true);

    const api = async (token, method, path, body) => page.evaluate(async ({ token, method, path, body }) => {
      const response = await fetch(path, {
        method,
        credentials: 'include',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: response.status, data };
    }, { token, method, path, body });

    const customerLogin = await api(null, 'POST', '/api/auth/login', {
      identifier: customerIdentifier, password: customerPassword, audience: 'customer', rememberMe: true,
    });
    expect(customerLogin.status, JSON.stringify(customerLogin.data)).toBe(200);
    customerToken = customerLogin.data.token;
    customerId = customerLogin.data.user.customer_id;
    accountId = customerLogin.data.user.account_id;
    expect(customerId).toBeTruthy();

    const staffLogin = await api(null, 'POST', '/api/auth/login', {
      identifier: staffIdentifier, password: staffPassword, audience: 'staff', rememberMe: true,
    });
    expect(staffLogin.status, JSON.stringify(staffLogin.data)).toBe(200);
    staffToken = staffLogin.data.token;

    // C03 — Hồ sơ khách hàng: cập nhật thông tin và xác minh dữ liệu lưu trong PostgreSQL.
    const interest = await db.query(
      `INSERT INTO interest (interest_name) VALUES ($1)
       ON CONFLICT (interest_name) DO UPDATE SET interest_name=EXCLUDED.interest_name
       RETURNING interest_id`, [`E2E Interest ${suffix}`],
    );
    const profileUpdate = await api(customerToken, 'PUT', '/api/auth/me', {
      full_name: `E2E Customer ${suffix}`, gender: 'Other', date_of_birth: '1998-05-12',
      phone: '0900000000', address: 'Địa chỉ kiểm thử',
      interests: [`E2E Interest ${suffix}`],
    });
    expect(profileUpdate.status, JSON.stringify(profileUpdate.data)).toBe(200);
    const profileDb = await db.query(
      `SELECT c.full_name, c.date_of_birth, c.phone,
              EXISTS (SELECT 1 FROM customer_interest ci WHERE ci.customer_id=c.customer_id) AS has_interest
       FROM customer c WHERE c.customer_id=$1`, [customerId],
    );
    expect(profileDb.rows[0]?.full_name).toBe(`E2E Customer ${suffix}`);
    expect(profileDb.rows[0]?.date_of_birth?.toISOString?.().slice(0, 10) || String(profileDb.rows[0]?.date_of_birth).slice(0, 10)).toBe('1998-05-12');
    expect(profileDb.rows[0]?.has_interest).toBe(true);
    results.push('C03');

    // C04 + M04 — Gửi phản hồi sản phẩm, sau đó nhân viên xử lý và trả lời.
    // Tạo dữ liệu sản phẩm riêng cho test: CI database mới migrate thường chưa có catalog.
    // Dùng category/product/variant trong PostgreSQL tạm, không phụ thuộc seed hoặc dữ liệu production.
    const categorySeed = await db.query(
      `INSERT INTO category (category_name, description)
       VALUES ($1, $2) RETURNING category_id`,
      [`E2E Feedback Category ${suffix}`, 'Disposable category for Electron CRM integration test'],
    );
    seededCategoryId = categorySeed.rows[0].category_id;
    const productSeed = await db.query(
      `INSERT INTO product
         (category_id, product_name, description, import_price, selling_price)
       VALUES ($1, $2, $3, 10000, 25000)
       RETURNING product_id`,
      [seededCategoryId, `E2E Feedback Product ${suffix}`, 'Disposable product for feedback integration test'],
    );
    seededProductId = productSeed.rows[0].product_id;
    await db.query(
      `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity, is_default)
       VALUES ($1, NULL, NULL, $2, 0, TRUE)`,
      [seededProductId, `E2E-FEEDBACK-${suffix}`],
    );
    const product = await db.query(
      `SELECT product_id FROM product WHERE product_id=$1 AND is_active=TRUE`,
      [seededProductId],
    );
    expect(product.rowCount, 'Sản phẩm fixture phải được tạo trong PostgreSQL CI').toBe(1);
    const feedback = await page.evaluate(async ({ token, productId, suffix }) => {
      const form = new FormData();
      form.set('product_id', String(productId));
      form.set('feedback_type', 'Product');
      form.set('rating', '5');
      form.set('content', `E2E feedback ${suffix}`);
      const response = await fetch('/api/feedbacks', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      return { status: response.status, data: await response.json() };
    }, { token: customerToken, productId: product.rows[0].product_id, suffix });
    expect(feedback.status, JSON.stringify(feedback.data)).toBe(201);
    feedbackId = feedback.data.feedback_id;
    expect(feedbackId).toBeTruthy();
    const feedbackDb = await db.query('SELECT content, status FROM feedback WHERE feedback_id=$1', [feedbackId]);
    expect(feedbackDb.rows[0]?.content).toBe(`E2E feedback ${suffix}`);
    results.push('C04');

    const reply = await api(staffToken, 'PATCH', `/api/feedbacks/${feedbackId}/reply`, {
      reply: `Hung Fashion đã tiếp nhận phản hồi kiểm thử ${suffix}.`,
    });
    expect(reply.status, JSON.stringify(reply.data)).toBe(200);
    const replied = await db.query('SELECT status, reply FROM feedback WHERE feedback_id=$1', [feedbackId]);
    expect(replied.rows[0]?.status).toBe('Resolved');
    expect(replied.rows[0]?.reply).toContain(suffix);
    results.push('M04');

    // M05 — Báo cáo độ tuổi và sở thích phải trả về dữ liệu có cấu trúc.
    const ageReport = await api(staffToken, 'GET', '/api/reports/customer-ages');
    expect(ageReport.status, JSON.stringify(ageReport.data)).toBe(200);
    expect(Array.isArray(ageReport.data)).toBe(true);
    const interestReport = await api(staffToken, 'GET', '/api/reports/interests');
    expect(interestReport.status, JSON.stringify(interestReport.data)).toBe(200);
    expect(Array.isArray(interestReport.data)).toBe(true);
    results.push('M05');

    // M06 + C05 + M07 — Tạo khảo sát, gửi lời mời, khách trả lời, đọc thống kê.
    const surveyCreate = await api(staffToken, 'POST', '/api/surveys', {
      title: `E2E Survey ${suffix}`,
      description: 'Khảo sát tự động trong database CI dùng một lần.',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      questions: [{
        question_text: 'Bạn đánh giá trải nghiệm mua sắm thế nào?',
        question_type: 'SingleChoice',
        is_required: true,
        options: [{ option_text: 'Tốt' }, { option_text: 'Cần cải thiện' }],
      }],
    });
    expect(surveyCreate.status, JSON.stringify(surveyCreate.data)).toBe(201);
    surveyId = surveyCreate.data.survey_id;
    const sendSurvey = await api(staffToken, 'POST', `/api/surveys/${surveyId}/send`, {});
    expect(sendSurvey.status, JSON.stringify(sendSurvey.data)).toBe(200);
    expect(sendSurvey.data.recipient_count).toBeGreaterThanOrEqual(1);
    results.push('M06');

    const mine = await api(customerToken, 'GET', '/api/surveys/mine');
    expect(mine.status, JSON.stringify(mine.data)).toBe(200);
    expect(mine.data.some(item => Number(item.survey_id) === Number(surveyId))).toBe(true);
    const surveyDetail = await api(customerToken, 'GET', `/api/surveys/${surveyId}`);
    expect(surveyDetail.status, JSON.stringify(surveyDetail.data)).toBe(200);
    const question = await db.query(
      `SELECT sq.question_id, so.option_id
       FROM survey_question sq JOIN survey_option so ON so.question_id=sq.question_id
       WHERE sq.survey_id=$1 ORDER BY so.display_order LIMIT 1`, [surveyId],
    );
    expect(question.rowCount).toBe(1);
    const response = await api(customerToken, 'POST', `/api/surveys/${surveyId}/respond`, {
      answers: [{ question_id: question.rows[0].question_id, option_id: question.rows[0].option_id }],
    });
    expect(response.status, JSON.stringify(response.data)).toBe(201);
    const surveyResponseDb = await db.query(
      'SELECT response_id FROM survey_response WHERE survey_id=$1 AND customer_id=$2',
      [surveyId, customerId],
    );
    expect(surveyResponseDb.rowCount).toBe(1);
    results.push('C05');

    const surveyResults = await api(staffToken, 'GET', `/api/surveys/${surveyId}/results`);
    expect(surveyResults.status, JSON.stringify(surveyResults.data)).toBe(200);
    expect(surveyResults.data.total_responses).toBe(1);
    expect(surveyResults.data.questions?.[0]?.options?.[0]?.vote_count).toBe(1);
    results.push('M07');

    // M03 — Khóa khách hàng và xác minh các phiên đã bị thu hồi, đăng nhập mới bị chặn.
    const block = await api(staffToken, 'PATCH', `/api/customers/${customerId}/account-status`, { status: 'Blocked' });
    expect(block.status, JSON.stringify(block.data)).toBe(200);
    const accountDb = await db.query('SELECT status FROM account WHERE account_id=$1', [accountId]);
    expect(accountDb.rows[0]?.status).toBe('Blocked');
    const sessionsDb = await db.query(
      'SELECT COUNT(*)::int AS active FROM account_sessions WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>NOW()',
      [accountId],
    );
    expect(sessionsDb.rows[0]?.active).toBe(0);
    const blockedLogin = await api(null, 'POST', '/api/auth/login', {
      identifier: customerIdentifier, password: customerPassword, audience: 'customer', rememberMe: true,
    });
    expect(blockedLogin.status).toBe(401);
    results.push('M03');

    // M01/M02 and C01/C02 are already exercised by electron-crud.spec.js and auth-api-ci.spec.js.
    expect(results.sort()).toEqual(['C03', 'C04', 'C05', 'M03', 'M04', 'M05', 'M06', 'M07'].sort());
  } finally {
    // survey_answer references survey_question without ON DELETE CASCADE.
    // Remove dependent answers before deleting the survey and its questions.
    if (surveyId) {
      await db.query(
        `DELETE FROM survey_answer
         WHERE question_id IN (SELECT question_id FROM survey_question WHERE survey_id=$1)`,
        [surveyId],
      ).catch(() => {});
      await db.query('DELETE FROM survey WHERE survey_id=$1', [surveyId]).catch(() => {});
    }
    if (feedbackId) await db.query('DELETE FROM feedback WHERE feedback_id=$1', [feedbackId]).catch(() => {});
    if (seededProductId) await db.query('DELETE FROM product WHERE product_id=$1', [seededProductId]).catch(() => {});
    if (seededCategoryId) await db.query('DELETE FROM category WHERE category_id=$1', [seededCategoryId]).catch(() => {});
    if (customerId && accountId) {
      await db.query('UPDATE account SET status=\'Active\' WHERE account_id=$1', [accountId]).catch(() => {});
      await db.query('UPDATE account_sessions SET revoked_at=NOW() WHERE account_id=$1', [accountId]).catch(() => {});
    }
    await electronApp.close().catch(() => {});
    await db.end();
  }
});
