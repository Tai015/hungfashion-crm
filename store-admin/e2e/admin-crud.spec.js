import { test, expect } from '@playwright/test';

const TOKEN_KEY = 'hung-fashion-access-token';
const unique = (prefix) => `${prefix}_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const localHost = new Set(['localhost', '127.0.0.1']);

async function api(page, path, { method = 'GET', body } = {}) {
  return page.evaluate(async ({ path, method, body, tokenKey }) => {
    const token = localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey);
    if (!token) throw new Error('Không tìm thấy access token sau khi đăng nhập E2E.');
    const response = await fetch(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, body: payload };
  }, { path, method, body, tokenKey: TOKEN_KEY });
}

async function loginAsAdmin(page) {
  const identifier = process.env.E2E_ADMIN_IDENTIFIER;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!identifier || !password, 'Cần cấu hình tài khoản ADMIN E2E riêng trong .env.e2e.');

  const baseUrl = new URL(process.env.E2E_BASE_URL || 'http://localhost:5173');
  test.skip(!localHost.has(baseUrl.hostname), 'Bộ CRUD E2E chỉ được phép chạy trên Local.');

  await page.goto('/#/nhan-vien/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toHaveCount(0, { timeout: 20_000 });

  const roles = await api(page, '/api/accounts/roles/all');
  expect(roles.status).toBe(200);
}

test.describe('Admin CRUD — Local only', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.E2E_ALLOW_MUTATIONS !== '1',
      'Đã bỏ qua thao tác CRUD: bật E2E_ALLOW_MUTATIONS=1 chỉ trên database Local dùng riêng cho kiểm thử.');
    await loginAsAdmin(page);
  });

  test('CRUD sản phẩm và xóa mềm không làm mất dữ liệu sản phẩm', async ({ page }) => {
    const [sizes, colors] = await Promise.all([
      api(page, '/api/products/sizes'),
      api(page, '/api/products/colors'),
    ]);
    expect(sizes.status).toBe(200);
    expect(colors.status).toBe(200);
    test.skip(!sizes.body.length || !colors.body.length, 'Database Local cần có ít nhất một size và một màu.');

    const sku = unique('SKU').toUpperCase();
    const created = await api(page, '/api/products', {
      method: 'POST',
      body: {
        product_name: unique('Sản phẩm'),
        description: 'Playwright E2E product',
        import_price: 100000,
        selling_price: 150000,
        variants: [{ size_id: sizes.body[0].size_id, color_id: colors.body[0].color_id, sku, quantity: 3 }],
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const productId = created.body.product_id;
    try {
      const updated = await api(page, `/api/products/${productId}`, {
        method: 'PATCH',
        body: {
          product_name: `${created.body.product_name} updated`,
          description: 'Updated by Playwright E2E',
          import_price: 110000,
          selling_price: 160000,
        },
      });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body.product_name).toContain('updated');

      const removed = await api(page, `/api/products/${productId}`, { method: 'DELETE' });
      expect(removed.status, JSON.stringify(removed.body)).toBe(200);
      expect(removed.body.message).toContain('ẩn');
    } finally {
      // Product DELETE is intentionally a soft delete; do not hard-delete historical data.
      await api(page, `/api/products/${productId}`, { method: 'DELETE' }).catch(() => {});
    }
  });

  test('tạo và cập nhật hồ sơ nhân viên', async ({ page }) => {
    const fullName = unique('Nhân viên E2E');
    const created = await api(page, '/api/employees', {
      method: 'POST',
      body: { full_name: fullName, position: 'Nhân viên kiểm thử', email: `${unique('employee')}@example.test` },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const employeeId = created.body.employee_id;
    const updated = await api(page, `/api/employees/${employeeId}`, {
      method: 'PUT',
      body: {
        full_name: fullName,
        position: 'Nhân viên kiểm thử (đã cập nhật)',
        is_active: false,
      },
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.is_active).toBe(false);
  });

  test('tạo tài khoản nhân viên, khóa và mở khóa tài khoản', async ({ page }) => {
    const roles = await api(page, '/api/accounts/roles/all');
    expect(roles.status).toBe(200);
    const staffRole = roles.body.find((role) => role.role_name === 'QL_BAN_HANG')
      || roles.body.find((role) => role.role_name === 'QL_KHO');
    test.skip(!staffRole, 'Database Local chưa có role nhân viên phù hợp.');

    const username = unique('staff').slice(0, 90);
    const created = await api(page, '/api/accounts', {
      method: 'POST',
      body: { role_id: staffRole.role_id, username, password: 'E2e-Test-Password-2026!' },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const accountId = created.body.account_id;
    try {
      const blocked = await api(page, `/api/accounts/${accountId}/status`, {
        method: 'PATCH', body: { status: 'Blocked' },
      });
      expect(blocked.status, JSON.stringify(blocked.body)).toBe(200);
      expect(blocked.body.status).toBe('Blocked');

      const blockedLogin = await api(page, '/api/auth/login', {
        method: 'POST',
        body: { identifier: username, password: 'E2e-Test-Password-2026!', audience: 'staff' },
      });
      expect(blockedLogin.status).toBe(401);
      expect(blockedLogin.body.message).toContain('đã bị khóa');

      const unlocked = await api(page, `/api/accounts/${accountId}/status`, {
        method: 'PATCH', body: { status: 'Active' },
      });
      expect(unlocked.status, JSON.stringify(unlocked.body)).toBe(200);
      expect(unlocked.body.status).toBe('Active');
    } finally {
      await api(page, `/api/accounts/${accountId}/status`, {
        method: 'PATCH', body: { status: 'Blocked' },
      }).catch(() => {});
      await api(page, `/api/accounts/${accountId}`, { method: 'DELETE' }).catch(() => {});
    }
  });

  test('CRUD khách hàng không có lịch sử giao dịch', async ({ page }) => {
    const fullName = unique('Khách E2E');
    const created = await api(page, '/api/customers', {
      method: 'POST',
      body: { full_name: fullName, email: `${unique('customer')}@example.test`, interests: [] },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const customerId = created.body.customer_id;
    try {
      const updated = await api(page, `/api/customers/${customerId}`, {
        method: 'PUT',
        body: { full_name: `${fullName} updated`, interests: [] },
      });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body.full_name).toContain('updated');
      const removed = await api(page, `/api/customers/${customerId}`, { method: 'DELETE' });
      expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    } finally {
      await api(page, `/api/customers/${customerId}`, { method: 'DELETE' }).catch(() => {});
    }
  });

  test('CRUD promotion và tắt promotion sau khi cập nhật', async ({ page }) => {
    const code = unique('E2E').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40).toUpperCase();
    const promotion = {
      code,
      name: 'Playwright E2E promotion',
      promo_type: 'Percent',
      value: 10,
      min_order: 0,
      max_discount: null,
      usage_limit: 10,
      start_date: '2026-01-01',
      end_date: '2099-12-31',
      is_active: true,
    };
    const created = await api(page, '/api/promotions', { method: 'POST', body: promotion });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const promotionId = created.body.promotion_id;
    const updated = await api(page, `/api/promotions/${promotionId}`, {
      method: 'PATCH',
      body: { ...promotion, name: 'Playwright E2E promotion updated', value: 15, is_active: false },
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.is_active).toBe(false);
    expect(updated.body.value).toBe(15);
  });

  test('không xóa hồ sơ khách hàng đã có đơn hàng', async ({ page }) => {
    const customerId = Number(process.env.E2E_ORDER_CUSTOMER_ID);
    test.skip(!Number.isSafeInteger(customerId) || customerId < 1,
      'Cần E2E_ORDER_CUSTOMER_ID trỏ đến khách test đã có đơn hàng trong database Local.');
    const result = await api(page, `/api/customers/${customerId}`, { method: 'DELETE' });
    expect(result.status).toBe(409);
    expect(
      result.body.message.includes('đơn hàng') || Number(result.body.blockers?.orders) > 0
        || result.body.message.includes('tài khoản đăng nhập'),
      JSON.stringify(result.body),
    ).toBe(true);
  });

  test('ẩn sản phẩm đã có trong đơn không làm mất chi tiết đơn cũ', async ({ page }) => {
    const productId = Number(process.env.E2E_ORDER_PRODUCT_ID);
    const orderId = Number(process.env.E2E_ORDER_ID);
    test.skip(!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(orderId) || orderId < 1,
      'Cần E2E_ORDER_PRODUCT_ID và E2E_ORDER_ID của dữ liệu test Local.');
    const before = await api(page, `/api/orders/${orderId}`);
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    const orderJson = JSON.stringify(before.body);
    expect(orderJson).toContain(String(productId));
    const removed = await api(page, `/api/products/${productId}`, { method: 'DELETE' });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const after = await api(page, `/api/orders/${orderId}`);
    expect(after.status, JSON.stringify(after.body)).toBe(200);
    expect(after.body).toEqual(before.body);
  });
});
