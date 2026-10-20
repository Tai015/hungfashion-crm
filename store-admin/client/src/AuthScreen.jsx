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
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Hung Fashion CRM</p>
        <h1>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản khách hàng'}</h1>
        <p className="auth-intro">Đăng nhập vào khu vực phù hợp với tài khoản của bạn.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <form className="stack-form" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>Họ và tên<input required maxLength={150} autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} /></label>
              <label>Tên đăng nhập<input required minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /></label>
              <label>Email<input required type="email" maxLength={150} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
            </>
          )}
          {mode === 'login' && (
            <label>Tên đăng nhập hoặc email<input required autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
          )}
          <label>Mật khẩu<PasswordInput required minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button className="primary-btn" type="submit" disabled={busy}>{busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>
        </form>
        <button className="text-button" type="button" onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
          {mode === 'login' ? 'Chưa có tài khoản khách hàng? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </section>
    </main>
  );
}
