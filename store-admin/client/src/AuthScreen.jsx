import { useEffect, useState } from 'react';
import { apiFetch, saveAuthToken } from './api';
import PasswordInput from './PasswordInput';
import { showErrorAlert, showSuccessAlert } from './utils/notifications';

const INPUT = 'w-full h-11 px-3 bg-white/70 border border-stone-400 rounded-xl text-stone-900 text-sm placeholder-stone-500 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/30 transition-all disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed';
const CUSTOMER_INTERESTS = ['Áo thun', 'Áo sơ mi', 'Áo khoác', 'Quần jean', 'Quần kaki', 'Váy', 'Phụ kiện', 'Giày dép'];

function authErrorMessage(error, audience) {
  if (error?.name === 'TypeError') return 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';
  if (error?.status === 429) return 'Bạn thao tác quá nhiều lần. Vui lòng chờ hết thời gian đếm ngược rồi thử lại.';
  if (error?.status === 401 && audience === 'customer') return 'Tài khoản không tồn tại hoặc thông tin đăng nhập không chính xác.';
  if (error?.status === 401) return 'Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại.';
  if (error?.status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
  return error?.message || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}

export default function AuthScreen({ onAuthenticated }) {
  const initialCustomer = window.location.hash.startsWith('#/khach-hang/');
  const [audience, setAudience] = useState(initialCustomer ? 'customer' : 'staff');
  const [mode, setMode] = useState(initialCustomer && window.location.hash.endsWith('/register') ? 'register' : 'login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [interests, setInterests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const rateLimitRemaining = Math.max(0, Math.ceil((rateLimitUntil - countdownNow) / 1000));
  const ageGroup = getAgeGroup(dateOfBirth);

  useEffect(() => {
    if (!rateLimitUntil || rateLimitRemaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setCountdownNow(now);
      if (now >= rateLimitUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rateLimitUntil, rateLimitRemaining > 0]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || Date.now() < rateLimitUntil) return;
    setBusy(true);

    try {
      const isLogin = mode === 'login';
      const result = isLogin
        ? await apiFetch('/api/auth/login', { method: 'POST', body: { identifier, password, audience } })
        : await apiFetch('/api/auth/register', { method: 'POST', body: { username, email, password, full_name: fullName, date_of_birth: dateOfBirth, interests } });

      await showSuccessAlert(
        isLogin
          ? `Xin chào ${result.user?.full_name || result.user?.username || 'bạn'}!`
          : 'Tài khoản của bạn đã được tạo. Chào mừng bạn đến với Hung Fashion!',
      );

      if (!isLogin) {
        // Đăng ký chỉ tạo tài khoản; người dùng cần đăng nhập riêng để tạo phiên.
        setIdentifier(username);
        setPassword('');
        setMode('login');
        window.location.hash = '#/khach-hang/login';
        return;
      }

      // Chỉ lưu phiên và chuyển trang sau khi toast đăng nhập tự tắt.
      saveAuthToken(result.token, rememberMe);
      onAuthenticated(result.user);
    } catch (err) {
      if (err?.status === 429) {
        const waitSeconds = Math.max(1, Number(err.retryAfterSeconds) || 5 * 60);
        setCountdownNow(Date.now());
        setRateLimitUntil(Date.now() + waitSeconds * 1000);
      }
      await showErrorAlert(authErrorMessage(err, audience), {
        title: mode === 'login' ? 'Đăng nhập thất bại' : 'Đăng ký thất bại',
        confirmButtonText: 'Thử lại',
        allowOutsideClick: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const switchAudience = nextAudience => {
    setAudience(nextAudience);
    setMode('login');
    setPassword('');
    setIdentifier('');
    window.location.hash = nextAudience === 'customer' ? '#/khach-hang/login' : '#/nhan-vien/login';
  };

  return (
    <main className={`auth-screen grid min-h-screen place-items-center p-6${audience === 'customer' ? ' customer-auth-screen' : ''}`}>
      <section className={`auth-card w-full max-w-md p-8 border rounded-3xl${audience === 'customer' ? ' customer-auth-card' : ''}`}>
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 bg-white/50 border border-white/70 rounded-full text-stone-600 text-xs font-semibold uppercase tracking-wider mb-3">
            {audience === 'customer' ? 'Hung Fashion · Cửa hàng' : 'Hung Fashion · Nhân viên'}
          </span>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </h1>
          <p className="text-sm text-stone-700 mt-1.5">
            {mode === 'login' ? (audience === 'customer' ? 'Đăng nhập để mua sắm và theo dõi đơn hàng' : 'Đăng nhập vào khu vực quản lý') : 'Tạo tài khoản khách hàng mới'}
          </p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {audience === 'customer' && mode === 'register' && (
            <>
              <label className="block">
                <span className="block text-xs font-semibold text-stone-800 mb-1.5">Họ và tên</span>
                <input required maxLength={150} autoComplete="name" className={INPUT}
                  placeholder="Nhập họ và tên" value={fullName} onChange={e => setFullName(e.target.value)} />
              </label>
              <fieldset className="block">
                <legend className="block text-xs font-semibold text-stone-800 mb-2">Sở thích mua sắm <span className="font-normal text-stone-600">(có thể chọn nhiều)</span></legend>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_INTERESTS.map(interest => {
                    const selected = interests.includes(interest);
                    return <button key={interest} type="button" aria-pressed={selected}
                      onClick={() => setInterests(current => selected ? current.filter(item => item !== interest) : [...current, interest])}
                      className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${selected ? 'border-sky-700 bg-sky-100 text-sky-900' : 'border-stone-400 bg-white/70 text-stone-700 hover:border-sky-600'}`}>
                      {interest}
                    </button>;
                  })}
                </div>
              </fieldset>
              <label className="block">
                <span className="block text-xs font-semibold text-stone-800 mb-1.5">Ngày sinh</span>
                <input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" className={INPUT}
                  value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
                <span className="block text-xs text-stone-600 mt-1.5">Nhóm tuổi: {ageGroup || 'Chọn ngày sinh để xem nhóm tuổi'}</span>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-stone-800 mb-1.5">Tên đăng nhập</span>
                <input required minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" autoComplete="username"
                  className={INPUT} placeholder="Nhập tên đăng nhập" value={username} onChange={e => setUsername(e.target.value)} />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-stone-800 mb-1.5">Email</span>
                <input required type="email" maxLength={150} autoComplete="email" className={INPUT}
                  placeholder="example@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
              </label>
            </>
          )}

          {mode === 'login' && (
            <label className="block">
              <span className="block text-xs font-semibold text-stone-800 mb-1.5">Tên đăng nhập hoặc email</span>
              <input required autoComplete="username" className={INPUT}
                placeholder="Nhập tên đăng nhập hoặc email" value={identifier} onChange={e => setIdentifier(e.target.value)} />
            </label>
          )}

          <label className="block">
            <span className="block text-xs font-semibold text-stone-800 mb-1.5">Mật khẩu</span>
            <PasswordInput required minLength={8} maxLength={128}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Nhập mật khẩu"
              value={password} onChange={e => setPassword(e.target.value)} />
          </label>

          {mode === 'login' && (
            <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-stone-400 accent-sky-700"
              />
              <span>Duy trì đăng nhập</span>
            </label>
          )}

          {rateLimitRemaining > 0 && (
            <p className="m-0 text-center text-sm font-medium text-rose-700" role="status" aria-live="polite">
              Bạn thao tác quá nhiều lần. Vui lòng chờ {formatCountdown(rateLimitRemaining)} để thử lại.
            </p>
          )}
          <button type="submit" disabled={busy || rateLimitRemaining > 0 || (mode === 'register' && !dateOfBirth)}
            aria-busy={busy}
            className="w-full h-11 mt-1 bg-gradient-to-br from-teal-400 to-sky-400 text-[#082f2a] font-semibold rounded-xl shadow-[0_10px_25px_rgba(45,212,191,0.28)] hover:shadow-[0_14px_32px_rgba(45,212,191,0.38)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 cursor-pointer">
            {rateLimitRemaining > 0 ? `Vui lòng chờ ${formatCountdown(rateLimitRemaining)}` : busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        {audience === 'customer' && <div className="mt-6 pt-6 border-t border-stone-300/70 text-center">
          <button type="button"
            onClick={() => {
              const nextMode = mode === 'login' ? 'register' : 'login';
              setMode(nextMode);
              window.location.hash = nextMode === 'register' ? '#/khach-hang/register' : '#/khach-hang/login';
            }}
            className="text-xs font-medium text-sky-800 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 rounded transition-colors cursor-pointer">
            {mode === 'login' ? 'Chưa có tài khoản? Đăng ký khách hàng' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>}
        {audience === 'customer' && <button type="button" onClick={() => { window.location.hash = ''; }} className="mt-3 w-full text-xs font-medium text-stone-600 hover:text-stone-900">Tiếp tục xem sản phẩm</button>}
      </section>
    </main>
  );
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getAgeGroup(value) {
  if (!value) return '';
  const birthDate = new Date(`${value}T00:00:00`);
  const now = new Date();
  if (Number.isNaN(birthDate.valueOf()) || birthDate > now) return '';
  let age = now.getFullYear() - birthDate.getFullYear();
  if (now.getMonth() < birthDate.getMonth() || (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate())) age -= 1;
  if (age < 18) return '<18';
  if (age < 25) return '18–24';
  if (age < 35) return '25–34';
  if (age < 45) return '35–44';
  return '45+';
}
