import { useEffect, useState } from 'react';

export default function PaymentCountdown({ expiresAt, actionLabel = 'chuyển khoản' }) {
  const deadline = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));

  useEffect(() => {
    if (!Number.isFinite(deadline)) return undefined;
    const update = () => setRemaining(Math.max(0, deadline - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (!Number.isFinite(deadline)) return null;
  if (remaining <= 0) {
    return <p className="m-0 text-center text-sm font-semibold text-red-400">Đã hết hạn thanh toán. Đơn hàng đang được cập nhật.</p>;
  }

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return (
    <p className="m-0 text-center text-sm text-amber-300">
      Vui lòng {actionLabel} trong <strong className="tabular-nums">{minutes}:{String(seconds).padStart(2, '0')}</strong> phút.
    </p>
  );
}
