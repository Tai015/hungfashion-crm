import { useState } from 'react';
import { apiFetch } from '../api';
import { useModalEffects } from '../hooks/useModalEffects';

const INPUT = 'w-full h-11 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm outline-none focus:border-violet-400/60 dark-input';

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useModalEffects(true, onClose);

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) return setError('Mật khẩu xác nhận chưa khớp.');
    if (newPassword.length < 8 || newPassword.length > 128 || new TextEncoder().encode(newPassword).length > 72) {
      return setError('Mật khẩu mới cần từ 8–128 ký tự và tối đa 72 byte.');
    }
    setBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      });
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(requestError.message || 'Không thể đổi mật khẩu lúc này.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="popup-surface w-full max-w-md rounded-2xl border p-6 text-[#f5f0eb]">
      <h2 id="change-password-title" className="m-0 text-xl font-bold">Đổi mật khẩu</h2>
      {done ? <>
        <p className="mt-3 text-sm text-emerald-300">Đã đổi mật khẩu thành công. Các phiên đăng nhập khác đã được kết thúc.</p>
        <button type="button" className="mt-4 h-10 rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white" onClick={onClose}>Đóng</button>
      </> : <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">Mật khẩu hiện tại<input className={INPUT} type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">Mật khẩu mới<input className={INPUT} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">Nhập lại mật khẩu mới<input className={INPUT} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
        {error && <p className="m-0 text-sm text-rose-300" role="alert">{error}</p>}
        <div className="mt-2 flex gap-2"><button type="submit" disabled={busy} className="h-10 rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button><button type="button" className="h-10 rounded-xl border border-white/15 px-5 text-sm text-white/70" onClick={onClose}>Hủy</button></div>
      </form>}
    </section>
  </div>;
}
