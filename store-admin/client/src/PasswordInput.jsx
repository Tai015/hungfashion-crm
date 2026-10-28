import { useState } from 'react';

const INPUT_CLS = 'w-full h-11 pl-3 pr-11 bg-white/70 border border-stone-400 rounded-xl text-stone-900 text-sm placeholder-stone-500 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/30 transition-all disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed';

export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative w-full">
      <input {...props} type={visible ? 'text' : 'password'} className={INPUT_CLS} />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 rounded transition-colors p-1 cursor-pointer"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2" style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true" focusable="false">
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
