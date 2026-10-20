import { useState } from 'react';

export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-input-wrap">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        className="password-visibility-button"
        type="button"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={visible}
        title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {visible ? (
            <>
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 002.8 2.8" />
              <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.6 3.2M6.2 6.2C3.9 7.6 2.8 9.5 2.5 11c1 1.8 4.3 6 9.5 6 1 0 1.9-.2 2.7-.5" />
            </>
          ) : (
            <>
              <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6z" />
              <circle cx="12" cy="12" r="2.5" />
            </>
          )}
        </svg>
      </button>
    </span>
  );
}
