import { useState } from 'react';
import { apiFetch, TOKEN_KEY } from './api';
import PasswordInput from './PasswordInput';

const INPUT = 'w-full h-11 px-3 bg-white/70 border border-stone-400 rounded-xl text-stone-900 text-sm placeholder-stone-500 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/30 transition-all disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed';

function authErrorMessage(error) {
  if (error?.name === 'TypeError') return 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';
  if (error?.status === 401) return 'Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại.';
  if (error?.status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
  return error?.message || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const result = mode === 'login'
        ? await apiFetch('/api/auth/login', { method: 'POST', body: { identifier, password } })
        : await apiFetch('/api/auth/register', { method: 'POST', body: { username, email, password, full_name: fullName } });
      window.localStorage.setItem(TOKEN_KEY, result.token);
      onAuthenticated(result.user);
    } catch (err) { setError(authErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md p-8 bg-white/50 border border-white/75 rounded-3xl shadow-[0_18px_40px_rgba(28,25,23,0.1)] backdrop-blur-2xl">
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 bg-white/50 border border-white/70 rounded-full text-stone-600 text-xs font-semibold uppercase tracking-wider mb-3">
            Hung Fashion CRM
          </span>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </h1>
          <p className="text-sm text-stone-700 mt-1.5">
            {mode === 'login' ? 'Đăng nhập vào hệ thống quản lý' : 'Điền thông tin để tạo tài khoản mới'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm" role="alert">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label className="block">
                <span className="block text-xs font-semibold text-stone-800 mb-1.5">Họ và tên</span>
                <input required maxLength={150} autoComplete="name" className={INPUT}
                  placeholder="Nguyễn Văn A" value={fullName} onChange={e => setFullName(e.target.value)} />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-stone-800 mb-1.5">Tên đăng nhập</span>
                <input required minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" autoComplete="username"
                  className={INPUT} placeholder="user123" value={username} onChange={e => setUsername(e.target.value)} />
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
                placeholder="admin / admin@hungfashion.vn" value={identifier} onChange={e => setIdentifier(e.target.value)} />
            </label>
          )}

          <label className="block">
            <span className="block text-xs font-semibold text-stone-800 mb-1.5">Mật khẩu</span>
            <PasswordInput required minLength={8} maxLength={128}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password} onChange={e => setPassword(e.target.value)} />
          </label>

          <button type="submit" disabled={busy}
            aria-busy={busy}
            className="w-full h-11 mt-1 bg-gradient-to-br from-teal-400 to-sky-400 text-[#082f2a] font-semibold rounded-xl shadow-[0_10px_25px_rgba(45,212,191,0.28)] hover:shadow-[0_14px_32px_rgba(45,212,191,0.38)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 cursor-pointer">
            {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-stone-300/70 text-center">
          <button type="button"
            onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}
            className="text-xs font-medium text-sky-800 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 rounded transition-colors cursor-pointer">
            {mode === 'login' ? 'Chưa có tài khoản khách hàng? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>
      </section>
    </main>
  );
}
