import { useState } from 'react';
import { apiFetch, TOKEN_KEY } from './api';
import PasswordInput from './PasswordInput';

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = mode === 'login'
        ? await apiFetch('/api/auth/login', { method: 'POST', body: { identifier, password } })
        : await apiFetch('/api/auth/register', {
          method: 'POST',
          body: { username, email, password, full_name: fullName },
        });
      window.localStorage.setItem(TOKEN_KEY, result.token);
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

      <section className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Hung Fashion CRM
          </span>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản khách hàng'}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            {mode === 'login' ? 'Đăng nhập vào hệ thống quản lý' : 'Điền thông tin bên dưới để tạo tài khoản mới'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm" role="alert">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Họ và tên</label>
                <input
                  required
                  maxLength={150}
                  autoComplete="name"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Tên đăng nhập</label>
                <input
                  required
                  minLength={3}
                  maxLength={100}
                  pattern="[A-Za-z0-9_.-]+"
                  autoComplete="username"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                  placeholder="user123"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  required
                  type="email"
                  maxLength={150}
                  autoComplete="email"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                  placeholder="example@gmail.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </>
          )}

          {mode === 'login' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Tên đăng nhập hoặc email</label>
              <input
                required
                autoComplete="username"
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                placeholder="admin / admin@hungfashion.vn"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Mật khẩu</label>
            <PasswordInput
              required
              minLength={8}
              maxLength={128}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/25 transition-all duration-200 cursor-pointer disabled:opacity-50 text-sm mt-2"
          >
            {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800/80 text-center">
          <button
            type="button"
            onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
          >
            {mode === 'login' ? 'Chưa có tài khoản khách hàng? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>
      </section>
    </main>
  );
}
