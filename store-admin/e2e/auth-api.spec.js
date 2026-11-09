import { test, expect } from '@playwright/test';

const customerIdentifier = process.env.E2E_CUSTOMER_IDENTIFIER;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;
const staffIdentifier = process.env.E2E_STAFF_IDENTIFIER;
const staffPassword = process.env.E2E_STAFF_PASSWORD;

test('khách hàng đăng nhập thành công qua API cục bộ', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token).toEqual(expect.any(String));
  expect(body.user.role).toBe('KHACH_HANG');
});

test('nhân viên đăng nhập thành công qua API cục bộ', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { identifier: staffIdentifier, password: staffPassword, audience: 'staff' },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token).toEqual(expect.any(String));
  expect(body.user.role).toBe('QL_NHAN_SU');
});

test('không cho tài khoản khách đăng nhập ở cổng nhân viên', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'staff' },
  });

  expect(response.status()).toBe(401);
});

test('từ chối mật khẩu sai', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: `${customerPassword}-wrong`, audience: 'customer' },
  });

  expect(response.status()).toBe(401);
});
