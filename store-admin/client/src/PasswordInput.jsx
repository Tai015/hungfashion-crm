import { useState } from 'react';

export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={visible}
        title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round" aria-hidden="true" focusable="false">
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
    </div>
  );
}
