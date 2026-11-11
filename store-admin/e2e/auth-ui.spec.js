import { test, expect } from '@playwright/test';

const TOKEN_KEY = 'hung-fashion-access-token';
const NEW_ACCOUNT = {
  username: 'e2e-new-customer',
  email: 'e2e-new-customer@example.test',
  password: 'NewCustomerPass123!',
  full_name: 'E2E New Customer',
  date_of_birth: '1998-05-12',
  interests: ['Áo thun'],
};
const EXISTING_CUSTOMER = {
  username: 'e2e-existing-customer',
  email: 'e2e-existing-customer@example.test',
  password: 'ExistingCustomerPass123!',
};
const EXISTING_STAFF = {
  username: 'e2e-existing-staff',
  email: 'e2e-existing-staff@example.test',
  password: 'ExistingStaffPass123!',
};

async function prepareAuthPage(page, hash) {
  await page.route('**/api/health', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true }),
  }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Vui lòng đăng nhập để tiếp tục.' }),
  }));
  await page.goto(hash);
  await expect(page.getByRole('heading', { name: /Đăng nhập|Tạo tài khoản/ })).toBeVisible();
}

async function fillCustomerRegistration(page, account) {
  await page.getByLabel('Họ và tên').fill(account.full_name);
  await page.getByLabel('Ngày sinh').fill(account.date_of_birth);
  await page.getByLabel('Tên đăng nhập').fill(account.username);
  await page.getByLabel('Email').fill(account.email);
  await page.locator('input[autocomplete="new-password"]').fill(account.password);
}

async function dismissSuccessToast(page) {
  const toast = page.locator('.swal2-popup');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Thành công');
  await page.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(toast).toBeHidden();
}

async function login(page, hash, account, audience, remember = false) {
  await prepareAuthPage(page, hash);
  await page.getByLabel('Tên đăng nhập hoặc email').fill(account.username);
  await page.locator('input[autocomplete="current-password"]').fill(account.password);
  if (remember) await page.getByLabel('Duy trì đăng nhập').check();
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await dismissSuccessToast(page);
  const expectedRoute = audience === 'customer' ? /#\/khach-hang\/catalog$/ : /#\/admin\/dashboard$/;
  await expect(page).toHaveURL(expectedRoute);
}

test('khách hàng đăng ký tài khoản mới rồi đăng nhập bằng chính tài khoản vừa tạo', async ({ page }) => {
  const accounts = new Map();
  await page.route('**/api/auth/register', async route => {
    const submitted = route.request().postDataJSON();
    const key = submitted.username.toLowerCase();
    if (accounts.has(key) || [...accounts.values()].some(item => item.email.toLowerCase() === submitted.email.toLowerCase())) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Tên đăng nhập hoặc email đã được sử dụng.' }),
      });
    }
    accounts.set(key, submitted);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'registration-token-must-not-be-stored',
        user: { account_id: 101, username: submitted.username, full_name: submitted.full_name, role: 'KHACH_HANG' },
      }),
    });
  });
  await page.route('**/api/auth/login', async route => {
    const submitted = route.request().postDataJSON();
    const account = accounts.get(submitted.identifier.toLowerCase());
    if (submitted.audience !== 'customer' || !account || account.password !== submitted.password) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Tài khoản không tồn tại hoặc thông tin đăng nhập không chính xác.' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': 'hung-fashion-session=new-customer-login-session; Path=/; HttpOnly; SameSite=Lax' },
      body: JSON.stringify({
        user: { account_id: 101, username: account.username, full_name: account.full_name, role: 'KHACH_HANG' },
      }),
    });
  });
  await page.route('**/api/auth/heartbeat', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'KHACH_HANG' }),
  }));

  await prepareAuthPage(page, '/#/khach-hang/register');
  await fillCustomerRegistration(page, NEW_ACCOUNT);
  await page.getByRole('button', { name: 'Đăng ký' }).click();
  await dismissSuccessToast(page);

  await expect(page).toHaveURL(/#\/khach-hang\/login$/);
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull();
  await page.getByLabel('Tên đăng nhập hoặc email').fill(NEW_ACCOUNT.username);
  await page.locator('input[autocomplete="current-password"]').fill(NEW_ACCOUNT.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await dismissSuccessToast(page);
  await expect(page).toHaveURL(/#\/khach-hang\/catalog$/);
  expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  await expect.poll(async () => (await page.context().cookies()).some(cookie =>
    cookie.name === 'hung-fashion-session' && cookie.value === 'new-customer-login-session' && cookie.httpOnly,
  )).toBe(true);
});

test('khách hàng đăng ký bằng tài khoản cũ phải nhận lỗi trùng username/email', async ({ page }) => {
  let registrationAttempts = 0;
  await page.route('**/api/auth/register', async route => {
    registrationAttempts += 1;
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Tên đăng nhập hoặc email đã được sử dụng.' }),
    });
  });

  await prepareAuthPage(page, '/#/khach-hang/register');
  await fillCustomerRegistration(page, {
    ...NEW_ACCOUNT,
    username: EXISTING_CUSTOMER.username,
    email: EXISTING_CUSTOMER.email,
  });
  await page.getByRole('button', { name: 'Đăng ký' }).click();

  const dialog = page.locator('.swal2-popup');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Đăng ký thất bại');
  await expect(dialog).toContainText('Tên đăng nhập hoặc email đã được sử dụng.');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/khach-hang\/register$/);
  expect(registrationAttempts).toBe(1);
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull();
});

test('đăng nhập khách hàng bằng tài khoản cũ và dùng cookie phiên khi không duy trì đăng nhập', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({}),
  }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Vui lòng đăng nhập để tiếp tục.' }),
  }));
  await page.route('**/api/auth/login', route => {
    const submitted = route.request().postDataJSON();
    expect(submitted.audience).toBe('customer');
    expect(submitted.identifier).toBe(EXISTING_CUSTOMER.username);
    expect(submitted.password).toBe(EXISTING_CUSTOMER.password);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': 'hung-fashion-session=existing-customer-session; Path=/; HttpOnly; SameSite=Lax' },
      body: JSON.stringify({
        user: { account_id: 201, username: EXISTING_CUSTOMER.username, full_name: 'Existing Customer', role: 'KHACH_HANG' },
      }),
    });
  });
  await page.route('**/api/auth/heartbeat', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'KHACH_HANG' }),
  }));

  await login(page, '/#/khach-hang/login', EXISTING_CUSTOMER, 'customer');
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull();
  await expect.poll(async () => (await page.context().cookies()).some(cookie =>
    cookie.name === 'hung-fashion-session' && cookie.value === 'existing-customer-session',
  )).toBe(true);
});

test('đăng nhập nhân viên bằng tài khoản cũ và lưu token localStorage khi bật duy trì đăng nhập', async ({ page }) => {
  await page.route('**/api/auth/login', route => {
    const submitted = route.request().postDataJSON();
    expect(submitted.audience).toBe('staff');
    expect(submitted.identifier).toBe(EXISTING_STAFF.username);
    expect(submitted.password).toBe(EXISTING_STAFF.password);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'existing-staff-token',
        user: { account_id: 202, username: EXISTING_STAFF.username, full_name: 'Existing Staff', role: 'ADMIN' },
      }),
    });
  });
  await page.route('**/api/auth/heartbeat', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'ADMIN' }),
  }));

  await login(page, '/#/nhan-vien/login', EXISTING_STAFF, 'staff', true);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBe('existing-staff-token');
  expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull();
});

test('hiện lại cảnh báo khi đăng nhập sai cùng thông tin hai lần liên tiếp', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/auth/login', route => {
    attempts += 1;
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Thông tin đăng nhập không chính xác.' }),
    });
  });

  await prepareAuthPage(page, '/#/nhan-vien/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(EXISTING_STAFF.username);
  await page.locator('input[autocomplete="current-password"]').fill('WrongPassword123!');

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    const dialog = page.locator('.swal2-popup');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Đăng nhập thất bại');
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(dialog).toBeHidden();
  }

  expect(attempts).toBe(2);
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull();
});


test('hiển thị đồng hồ đếm ngược và khóa nút khi API giới hạn đăng nhập', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 429,
    headers: { 'retry-after': '65' },
    contentType: 'application/json',
    body: JSON.stringify({
      code: 'AUTH_RATE_LIMITED',
      message: 'Bạn thao tác quá nhiều lần.',
      retryAfterSeconds: 65,
    }),
  }));

  await prepareAuthPage(page, '/#/khach-hang/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(EXISTING_CUSTOMER.username);
  await page.locator('input[autocomplete="current-password"]').fill(EXISTING_CUSTOMER.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  const dialog = page.locator('.swal2-popup');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Bạn thao tác quá nhiều lần');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole('status')).toContainText(/01:0[0-5]/);
  await expect(page.getByRole('button', { name: /Vui lòng chờ 01:0[0-5]/ })).toBeDisabled();
});


test('nhân viên mở được lịch sử tương tác của khách hàng trong màn hình quản lý khách hàng', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    // The broad matcher also matches Vite modules under /src/api/; let those load normally.
    if (!pathname.startsWith('/api/')) return route.continue();
    if (pathname === '/api/auth/me') {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Vui lòng đăng nhập để tiếp tục.' }),
      });
    }
    if (pathname === '/api/auth/login') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'set-cookie': 'hung-fashion-session=timeline-admin-session; Path=/; HttpOnly; SameSite=Lax' },
        body: JSON.stringify({
          user: { account_id: 1, username: 'timeline-admin', full_name: 'Timeline Admin', role: 'ADMIN' },
        }),
      });
    }
    if (pathname === '/api/auth/heartbeat') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ role: 'ADMIN' }),
      });
    }
    if (pathname === '/api/reports/summary') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          revenue: 0,
          activeUsers: 0,
          orders: 0,
          conversionPercent: 0,
          growthPercent: 0,
          conversionChange: 0,
        }),
      });
    }
    if (pathname === '/api/reports/top-products' || pathname === '/api/reports/revenue') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    if (pathname === '/api/customers') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            customer_id: 12,
            full_name: 'E2E Timeline Customer',
            phone: '0900000012',
            email: 'timeline-customer@example.test',
            gender: 'Other',
            customer_tier: 'Regular',
            points_balance: 25,
            account_id: 12,
            account_status: 'Active',
          }],
          total: 1,
        }),
      });
    }
    if (pathname === '/api/customers/12/orders') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          order_id: 9001,
          order_status: 'Pending',
          total_amount: 250000,
          order_channel: 'Website',
          ordered_at: '2026-11-10T08:00:00.000Z',
          item_count: 2,
        }]),
      });
    }
    if (pathname === '/api/customers/12/interactions') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            interaction_id: 'order:9001',
            customer_id: 12,
            interaction_type: 'order',
            title: 'Đặt đơn hàng #9001',
            summary: 'Trạng thái: Pending · Tổng tiền: 250.000 ₫',
            occurred_at: '2026-11-10T08:00:00.000Z',
          }],
          limit: 20,
          hasMore: false,
          nextCursor: null,
          olderCursor: null,
          range: 'last-12-months',
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // Use the mobile layout so the test follows the real menu interaction:
  // open the navigation drawer, then select the Khách hàng item.
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, '/#/nhan-vien/login', EXISTING_STAFF, 'staff');
  await page.locator('button.dashboard-mobile-menu').click();
  await page.getByRole('button', { name: 'Khách hàng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý khách hàng' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem lịch sử tương tác của E2E Timeline Customer' }).click();
  await expect(page.getByText('Lịch sử tương tác')).toBeVisible();
  await expect(page.getByText('Lịch sử mua hàng')).toBeVisible();
  await expect(page.getByText('Đơn hàng #9001', { exact: true })).toBeVisible();
  await expect(page.getByText('Đặt đơn hàng #9001')).toBeVisible();
  await expect(page.getByText(/250\.000/)).toBeVisible();
});
