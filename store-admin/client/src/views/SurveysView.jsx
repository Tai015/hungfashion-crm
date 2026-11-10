import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { useModalEffects } from '../hooks/useModalEffects';
import { apiFetch } from '../api';
import { TableSkeleton } from '../components/Skeleton';
import Pagination from '../components/Pagination';
import FilterPopover from '../components/FilterPopover';
import { useSweetAlertMessages } from '../utils/notifications';

const STATUS_LABEL = { Draft: 'Nháp', Active: 'Đang chạy', Closed: 'Đã đóng' };
const STATUS_COLOR = { Draft: 'bg-slate-500/15 text-slate-400 border-slate-500/20', Active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', Closed: 'bg-red-500/15 text-red-400 border-red-500/20' };
const QUESTION_TYPE_LABELS = { SingleChoice:'Chọn một đáp án', MultiChoice:'Chọn nhiều đáp án', Text:'Trả lời tự luận', Rating:'Đánh giá 1–5 sao' };
const GENDER_LABEL = { Male:'Nam', Female:'Nữ', Other:'Khác' };
const EMPTY_TARGETING = { target_gender:'', target_tier:'', min_age:'', max_age:'', target_interest_id:'', reward_promotion_id:'' };
const TOOLTIP_STYLE = { background:'rgba(20,18,16,0.92)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, color:'#f5f5f4' };

const INPUT    = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const TEXTAREA = 'w-full px-3 py-2.5 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all resize-y dark-input';
const SELECT   = INPUT + ' cursor-pointer';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-9 px-4 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer disabled:opacity-50';
const BTN_GREEN   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium rounded-xl transition-all hover:bg-emerald-500/25 cursor-pointer disabled:opacity-50';
const BTN_INDIGO  = 'inline-flex items-center gap-1.5 h-9 px-4 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-sm font-medium rounded-xl transition-all hover:bg-indigo-500/25 cursor-pointer disabled:opacity-50';
const PANEL    = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const TH       = 'px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap';
const TD       = 'px-3.5 py-3 border-b border-white/[0.05] text-white/78 align-middle';

const fmtDate = v => v ? new Date(v).toLocaleDateString('vi-VN') : '—';
const getLocalDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
};
const fmtDT   = v => v ? new Date(v).toLocaleString('vi-VN') : '—';
const audienceLabel = (s, interests = []) => {
  const p = [];
  if (s.target_gender) p.push(GENDER_LABEL[s.target_gender]||s.target_gender);
  if (s.target_tier)   p.push(`Hạng ${s.target_tier}`);
  if (s.min_age!=null||s.max_age!=null) p.push(`Tuổi ${s.min_age??'…'}–${s.max_age??'…'}`);
  if (s.target_interest_id) p.push(s.target_interest_name || interests.find(item => Number(item.interest_id) === Number(s.target_interest_id))?.interest || 'Sở thích đã chọn');
  return p.length ? p.join(' · ') : 'Tất cả khách hàng';
};

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-white/60 text-sm font-medium">{label}</span>}
      {children}
      {hint && <small className="text-white/35 text-xs">{hint}</small>}
    </label>
  );
}

export default function SurveysView() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [totalSurveys, setTotalSurveys] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [title, setTitle]     = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(getLocalDate);
  const [endDate, setEndDate] = useState('');
  const [targeting, setTargeting] = useState(EMPTY_TARGETING);
  const [interestOptions, setInterestOptions] = useState([]);
  const [rewardOptions, setRewardOptions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [results, setResults] = useState(null);
  const [detail, setDetail]   = useState(null);
  const [message, setMessage] = useState('');
  const detailRef = useRef(null);
  useSweetAlertMessages({ error, success: message });

  useEffect(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page, limit:20, paged:'true' });
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    apiFetch(`/api/surveys?${params}`)
      .then(d => { setSurveys(d.data || []); setTotalSurveys(d.total || 0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh, page, search, statusFilter]);

  useEffect(() => {
    apiFetch('/api/reports/interests')
      .then(rows => setInterestOptions(Array.isArray(rows) ? rows : []))
      .catch(e => setError(e.message));
    apiFetch('/api/promotions?active=true&limit=100')
      .then(rows => setRewardOptions(Array.isArray(rows) ? rows : []))
      .catch(e => setError(e.message));
  }, []);

  const newQ = () => ({ key: crypto.randomUUID(), question_text:'', question_type:'SingleChoice', is_required:true, options:['Rất hài lòng','Hài lòng','Bình thường','Chưa hài lòng'] });

  const openCreate = () => { setEditingId(null); setTitle(''); setDescription(''); setStartDate(getLocalDate()); setEndDate(''); setTargeting(EMPTY_TARGETING); setQuestions([newQ()]); setError(''); setMessage(''); setDetail(null); setFormOpen(true); };
  const openEdit = async id => {
    setBusy(true); setError(''); setMessage('');
    try {
      const s = await apiFetch(`/api/surveys/${id}`);
      setEditingId(id); setTitle(s.title||''); setDescription(s.description||'');
      setStartDate(s.start_date ? String(s.start_date).slice(0,10) : getLocalDate());
      setEndDate(s.end_date ? String(s.end_date).slice(0,10) : '');
      setTargeting({
        target_gender:s.target_gender||'', target_tier:s.target_tier||'',
        min_age:s.min_age == null ? '' : String(s.min_age),
        max_age:s.max_age == null ? '' : String(s.max_age),
        target_interest_id:s.target_interest_id == null ? '' : String(s.target_interest_id),
        reward_promotion_id:s.reward_promotion_id == null ? '' : String(s.reward_promotion_id),
      });
      setQuestions(s.questions.map(q => ({ key:crypto.randomUUID(), question_text:q.question_text, question_type:q.question_type, is_required:q.is_required, options:q.options.map(o => o.option_text) })));
      setDetail(null); setFormOpen(true);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const closeForm = () => { setFormOpen(false); setEditingId(null); setError(''); };
  useModalEffects(formOpen, closeForm);
  const updateQ   = (key, upd) => setQuestions(qs => qs.map(q => q.key===key ? {...q,...upd} : q));
  const updateQType = (q, qt) => updateQ(q.key, { question_type:qt, options:['SingleChoice','MultiChoice'].includes(qt) ? (q.options.length>=2 ? q.options : ['','']) : [] });

  const saveSurvey = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await apiFetch(editingId ? `/api/surveys/${editingId}` : '/api/surveys', {
        method: editingId ? 'PATCH' : 'POST',
        body: {
          title, description,
          start_date: startDate,
          end_date: endDate,
          target_gender:targeting.target_gender || null,
          target_tier:targeting.target_tier || null,
          min_age:targeting.min_age === '' ? null : Number(targeting.min_age),
          max_age:targeting.max_age === '' ? null : Number(targeting.max_age),
          target_interest_id:targeting.target_interest_id || null,
          reward_promotion_id:targeting.reward_promotion_id || null,
          questions: questions.map((q,i) => ({ question_text:q.question_text, question_type:q.question_type, display_order:i+1, is_required:q.is_required, options:q.options.map((o,j) => ({ option_text:o, display_order:j+1 })) })),
        },
      });
      setFormOpen(false); setEditingId(null);
      setMessage(editingId ? 'Đã cập nhật khảo sát nháp.' : 'Đã tạo khảo sát nháp.');
      setRefresh(v => v+1);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const sendSurvey = async id => {
    setBusy(true); setError(''); setMessage('');
    try {
      const audience = await apiFetch(`/api/surveys/${id}/recipients-preview`);
      const confirmation = await Swal.fire({
        icon: 'question',
        title: 'Xác nhận gửi khảo sát?',
        text: `Có ${audience.eligible_count} khách phù hợp. Sẽ gửi mới ${audience.new_recipient_count} lời mời; ${audience.already_invited_count} khách đã được mời trước đó.`,
        showCancelButton: true,
        confirmButtonText: 'Gửi khảo sát',
        cancelButtonText: 'Quay lại',
        confirmButtonColor: '#f97316',
        reverseButtons: true,
      });
      if (!confirmation.isConfirmed) return;
      const r = await apiFetch(`/api/surveys/${id}/send`, { method:'POST', body:{} });
      setMessage(r.message); setRefresh(v => v+1);
      if (detail?.survey_id===id) setDetail(await apiFetch(`/api/surveys/${id}`));
    }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const handleSurveyAction = (survey, action) => {
    if (action === 'details') openDetail(survey.survey_id);
    if (action === 'edit') openEdit(survey.survey_id);
    if (action === 'send') sendSurvey(survey.survey_id);
    if (action === 'results') loadResults(survey.survey_id);
  };
  const loadResults = async id => { setError(''); try { setResults(await apiFetch(`/api/surveys/${id}/results`)); } catch(e) { setError(e.message); } };
  const openDetail  = async id => {
    setBusy(true); setError(''); setFormOpen(false);
    try { setDetail(await apiFetch(`/api/surveys/${id}`)); setTimeout(() => detailRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 0); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Chăm sóc khách hàng</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Khảo sát khách hàng</h1>
        </div>
        <button className={`${BTN_PRIMARY} admin-primary-action`} type="button" onClick={openCreate}><Plus size={15}/> Tạo khảo sát</button>
      </div>


      {/* Create / edit form */}
      {formOpen && createPortal((
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-4" onClick={closeForm}>
        <motion.form initial={{ scale:0.96, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.96, opacity:0 }} className={`${PANEL} popup-surface w-full max-w-6xl max-h-[92vh] overflow-y-auto`} onClick={event => event.stopPropagation()} onSubmit={saveSurvey}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-lg font-bold">{editingId ? 'Chỉnh sửa khảo sát' : 'Tạo khảo sát mới'}</h2>
              <p className="m-0 mt-1 text-white/40 text-sm">Thêm câu hỏi, chọn kiểu trả lời và xem trước trước khi lưu.</p>
            </div>
            <button type="button" className="grid w-9 h-9 place-items-center border border-white/12 rounded-xl bg-white/[0.05] text-white/50 cursor-pointer transition-all hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400 shrink-0" onClick={closeForm}><X size={16}/></button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
            {/* Fields */}
            <div className="flex flex-col gap-4">
              <Field label="Tên khảo sát *" hint="Tên ngắn gọn giúp khách hàng nhận biết nội dung.">
                <input required maxLength={300} className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Khảo sát trải nghiệm mua sắm" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Ngày bắt đầu">
                  <input type="date" className={INPUT} value={startDate} readOnly aria-readonly="true" />
                  <small className="text-white/35 text-xs">Tự động lấy ngày hiện tại.</small>
                </Field>
                <Field label="Ngày kết thúc *">
                  <input type="date" required min={startDate} className={INPUT} value={endDate}
                    onChange={e => setEndDate(e.target.value)} />
                  <small className="text-white/35 text-xs">Khảo sát có hiệu lực đến hết ngày đã chọn.</small>
                </Field>
              </div>
              <Field label={<>Mô tả <small className="text-white/30 font-normal">Không bắt buộc</small></>}>
                <textarea maxLength={2000} rows={3} className={TEXTAREA} value={description} onChange={e => setDescription(e.target.value)} placeholder="Cho khách hàng biết mục đích và thời gian hoàn thành." />
              </Field>

              <section className="flex flex-col gap-3 p-4 border border-white/[0.08] rounded-xl bg-white/[0.025]">
                <div>
                  <h3 className="m-0 text-sm font-semibold">Đối tượng nhận khảo sát</h3>
                  <p className="m-0 mt-1 text-xs text-white/40">Khi gửi, lời mời chỉ đến tài khoản khách đang hoạt động khớp các điều kiện đã chọn.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Độ tuổi từ">
                    <input type="number" min="0" max="120" className={INPUT} value={targeting.min_age}
                      onChange={e => setTargeting(v => ({ ...v, min_age:e.target.value }))} placeholder="Không giới hạn" />
                  </Field>
                  <Field label="Đến tuổi">
                    <input type="number" min="0" max="120" className={INPUT} value={targeting.max_age}
                      onChange={e => setTargeting(v => ({ ...v, max_age:e.target.value }))} placeholder="Không giới hạn" />
                  </Field>
                  <Field label="Sở thích">
                    <select className={SELECT} value={targeting.target_interest_id}
                      onChange={e => setTargeting(v => ({ ...v, target_interest_id:e.target.value }))}>
                      <option value="">Tất cả sở thích</option>
                      {interestOptions.map(item => <option key={item.interest_id} value={item.interest_id}>{item.interest}</option>)}
                    </select>
                  </Field>
                  <Field label="Giới tính">
                    <select className={SELECT} value={targeting.target_gender}
                      onChange={e => setTargeting(v => ({ ...v, target_gender:e.target.value }))}>
                      <option value="">Tất cả</option><option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option>
                    </select>
                  </Field>
                  <Field label="Hạng khách hàng">
                    <select className={SELECT} value={targeting.target_tier}
                      onChange={e => setTargeting(v => ({ ...v, target_tier:e.target.value }))}>
                      <option value="">Tất cả hạng</option>
                      {['New','Regular','Silver','Gold','VIP'].map(tier => <option key={tier} value={tier}>{tier}</option>)}
                    </select>
                  </Field>
                </div>
              </section>

              <section className="flex flex-col gap-3 p-4 border border-orange-400/15 rounded-xl bg-orange-500/[0.035]">
                <div>
                  <h3 className="m-0 text-sm font-semibold">Mã giảm giá thưởng</h3>
                  <p className="m-0 mt-1 text-xs text-white/40">Mã được thêm vào Ví ưu đãi sau khi khách hoàn thành khảo sát.</p>
                </div>
                <Field label="Chương trình khuyến mãi">
                  <select className={SELECT} value={targeting.reward_promotion_id}
                    onChange={e => setTargeting(v => ({ ...v, reward_promotion_id:e.target.value }))}>
                    <option value="">Không tặng mã</option>
                    {rewardOptions.map(promo => <option key={promo.promotion_id} value={promo.promotion_id}>{promo.code} — {promo.name}</option>)}
                  </select>
                  {!rewardOptions.length && <small className="text-white/35 text-xs">Chưa có chương trình khuyến mãi đang hoạt động để chọn.</small>}
                </Field>
              </section>

              {/* Question builder */}
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="m-0 text-sm font-semibold">Câu hỏi</h3>
                    <p className="m-0 text-white/35 text-xs">Tối đa 50 câu hỏi.</p>
                  </div>
                  <button type="button" className={BTN_GHOST} disabled={questions.length>=50} onClick={() => setQuestions(qs => [...qs, newQ()])}><Plus size={14}/> Thêm câu hỏi</button>
                </div>
                {questions.map((q, idx) => (
                  <div key={q.key} className="p-4 border border-white/[0.09] rounded-2xl bg-white/[0.04] flex flex-col gap-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-orange-500/70 text-xs font-bold tabular-nums">{String(idx+1).padStart(2,'0')}</span>
                      <strong className="text-sm text-white/70 flex-1">Câu hỏi {idx+1}</strong>
                      <button type="button" className="text-xs text-red-400/70 hover:text-red-400 cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        disabled={questions.length===1} onClick={() => setQuestions(qs => qs.filter(x => x.key!==q.key))}>Xóa câu hỏi</button>
                    </div>
                    <Field>
                      <textarea required maxLength={1000} rows={2} className={TEXTAREA} value={q.question_text} onChange={e => updateQ(q.key,{question_text:e.target.value})} placeholder="Nhập nội dung câu hỏi..." />
                    </Field>
                    <div className="flex items-center gap-3 flex-wrap">
                      <select className={`${SELECT} w-auto flex-1`} value={q.question_type} onChange={e => updateQType(q, e.target.value)}>
                        {Object.entries(QUESTION_TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <label className="flex items-center gap-2 text-sm text-white/55 cursor-pointer">
                        <input type="checkbox" checked={q.is_required} onChange={e => updateQ(q.key,{is_required:e.target.checked})} className="w-4 h-4 accent-orange-500" />
                        Bắt buộc
                      </label>
                    </div>
                    {['SingleChoice','MultiChoice'].includes(q.question_type) && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white/45">Các lựa chọn</span>
                          <button type="button" className="text-xs text-orange-500/70 hover:text-orange-500 cursor-pointer transition-colors disabled:opacity-30" disabled={q.options.length>=100} onClick={() => updateQ(q.key,{options:[...q.options,'']})}>+ Thêm</button>
                        </div>
                        {q.options.map((opt, oi) => (
                          <div key={`${q.key}-o${oi}`} className="flex items-center gap-2">
                            <span className="w-6 text-center text-white/30 text-xs font-bold shrink-0">{String.fromCharCode(65+(oi%26))}</span>
                            <input required maxLength={300} className={`${INPUT} flex-1`} value={opt} onChange={e => setQuestions(qs => qs.map(x => x.key===q.key ? {...x, options:x.options.map((o,i) => i===oi?e.target.value:o)} : x))} placeholder={`Lựa chọn ${oi+1}`} />
                            <button type="button" className="grid w-7 h-7 place-items-center text-white/35 hover:text-red-400 cursor-pointer transition-colors disabled:opacity-20" disabled={q.options.length<=2} onClick={() => updateQ(q.key,{options:q.options.filter((_,i)=>i!==oi)})}><X size={13}/></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.question_type==='Rating' && <p className="m-0 text-white/35 text-xs">Khách hàng đánh giá theo thang điểm từ 1 đến 5 sao.</p>}
                    {q.question_type==='Text'   && <p className="m-0 text-white/35 text-xs">Khách hàng nhập câu trả lời dạng văn bản.</p>}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-white/35 text-xs">● Khảo sát lưu ở trạng thái nháp</span>
                <div className="flex gap-2">
                  <button type="button" className={BTN_GHOST} onClick={closeForm}>Hủy</button>
                  <button type="submit" className={`${BTN_PRIMARY} admin-primary-action`} disabled={busy}>{busy ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Tạo khảo sát nháp'}</button>
                </div>
              </div>
            </div>

            {/* Preview */}
            <aside className="flex flex-col gap-4 p-5 border border-white/[0.09] rounded-2xl bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <span className="text-orange-500">✦</span>
                <small className="text-white/35 text-[0.65rem] font-bold tracking-widest uppercase">Xem trước</small>
              </div>
              <p className="m-0 text-orange-500/70 text-[0.68rem] font-bold tracking-widest uppercase">HUNG FASHION · KHẢO SÁT</p>
              <h3 className="m-0 text-base font-bold">{title.trim()||'Tên khảo sát của bạn'}</h3>
              <p className="m-0 text-white/40 text-sm">{description.trim()||'Mô tả khảo sát sẽ hiển thị ở đây.'}</p>
              {questions.map((q, idx) => (
                <div key={q.key} className="p-3.5 border border-white/[0.07] rounded-xl bg-white/[0.03] flex flex-col gap-2">
                  <span className="text-white/30 text-[0.68rem] font-bold uppercase tracking-wider">{String(idx+1).padStart(2,'0')} {q.is_required ? 'BẮT BUỘC' : 'KHÔNG BẮT BUỘC'}</span>
                  <p className="m-0 text-white/75 text-sm">{q.question_text.trim()||`Câu hỏi ${idx+1} sẽ hiển thị ở đây.`}</p>
                  {q.question_type==='Rating' && <div className="text-yellow-400 tracking-widest text-base">★ ★ ★ ★ ★</div>}
                  {q.question_type==='Text'   && <div className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/20 text-xs px-3 flex items-center">Câu trả lời...</div>}
                  {['SingleChoice','MultiChoice'].includes(q.question_type) && q.options.map((o,oi) => (
                    <div key={oi} className="flex items-center gap-2 text-sm text-white/55">
                      <span className="w-5 h-5 grid place-items-center border border-white/20 rounded-full text-[0.65rem] font-bold shrink-0">{q.question_type==='MultiChoice'?'✓':String.fromCharCode(65+(oi%26))}</span>
                      {o.trim()||`Lựa chọn ${oi+1}`}
                    </div>
                  ))}
                </div>
              ))}
            </aside>
          </div>
        </motion.form>
        </motion.div>
        ), document.body)}

      {/* Survey list */}
      <div className={PANEL}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold">
            Danh sách khảo sát
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-500 text-xs font-semibold">{totalSurveys}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input type="search" className={`${INPUT} pl-9`} value={search} maxLength={100}
              placeholder="Tìm theo tiêu đề khảo sát..."
              onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </label>
          <FilterPopover title="Lọc khảo sát" activeCount={statusFilter ? 1 : 0}
            onClear={() => { setStatusFilter(''); setPage(1); }}>
            <label className="flex flex-col gap-1.5 text-xs text-white/65">Trạng thái
              <select className={`${SELECT} w-full`} value={statusFilter}
                onChange={event => { setStatusFilter(event.target.value); setPage(1); }}>
                <option value="">Tất cả trạng thái</option>
                <option value="Draft">Nháp</option>
                <option value="Active">Đang chạy</option>
                <option value="Closed">Đã đóng</option>
              </select>
            </label>
          </FilterPopover>
        </div>
        {loading ? <TableSkeleton rows={5} columns={9} /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>{['#','Tiêu đề','Đối tượng','Mã thưởng','Câu hỏi','Phản hồi','Ngày kết thúc','Trạng thái','Thao tác'].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {surveys.length ? surveys.map(s => (
                  <tr key={s.survey_id} className="hover:bg-white/[0.04] transition-colors">
                    <td className={`${TD} text-white/28 text-xs tabular-nums w-10`}>{s.survey_id}</td>
                    <td className={TD}>
                      <button type="button" disabled={busy} onClick={() => openDetail(s.survey_id)} className="text-left font-semibold text-[#f5f0eb] hover:text-orange-400 transition-colors cursor-pointer disabled:opacity-50">{s.title}</button>
                    </td>
                    <td className={`${TD} text-xs`}>{audienceLabel(s, interestOptions)}</td>
                    <td className={`${TD} text-orange-300 text-xs`}>{s.reward_promotion_code || '—'}</td>
                    <td className={`${TD} text-center tabular-nums`}>{s.question_count}</td>
                    <td className={`${TD} text-center tabular-nums`}>{s.response_count}</td>
                    <td className={TD}>{fmtDate(s.end_date)}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[s.status]||'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>{STATUS_LABEL[s.status]||s.status}</span>
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select aria-label={`Thao tác khảo sát ${s.title}`} disabled={busy} defaultValue=""
                          className={`${SELECT} h-9 min-w-36`} onChange={event => {
                            handleSurveyAction(s, event.target.value);
                            event.target.value = '';
                          }}>
                          <option value="" disabled>Chọn thao tác</option>
                          <option value="details">Chi tiết</option>
                          {s.status==='Draft' && <option value="edit">Sửa khảo sát</option>}
                          {s.status!=='Closed' && <option value="send">Gửi khảo sát</option>}
                          <option value="results">Xem kết quả</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} className="py-10 text-center text-white/25 text-sm">{search || statusFilter ? 'Không có khảo sát phù hợp bộ lọc.' : 'Chưa có khảo sát'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={totalSurveys} limit={20} loading={loading} onChange={setPage} />
      </div>

      {/* Detail panel */}
      {detail && (
        <article ref={detailRef} className={PANEL}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="m-0 text-white/40 text-xs font-semibold tracking-widest uppercase">Chi tiết khảo sát #{detail.survey_id}</p>
              <h2 className="m-0 mt-1 text-xl font-bold">{detail.title}</h2>
              <p className="m-0 mt-1 text-white/45 text-sm">{detail.description||'Không có mô tả.'}</p>
            </div>
            <button type="button" className="grid w-9 h-9 place-items-center border border-white/12 rounded-xl bg-white/[0.05] text-white/50 cursor-pointer transition-all hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400 shrink-0" onClick={() => { setDetail(null); setResults(null); }}><X size={16}/></button>
          </div>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 md:grid-cols-5 p-4 bg-white/[0.04] border border-white/[0.07] rounded-xl">
            {[['Trạng thái', STATUS_LABEL[detail.status]||detail.status], ['Người tạo', detail.created_by_name||'—'], ['Ngày tạo', fmtDT(detail.created_at)], ['Bắt đầu', fmtDate(detail.start_date)], ['Kết thúc', fmtDate(detail.end_date)], ['Đối tượng', audienceLabel(detail, interestOptions)], ['Mã giảm giá thưởng', detail.reward_promotion_code||'Không có'], ['Câu hỏi', detail.question_count??detail.questions?.length??0], ['Lời mời', detail.invitation_count??0], ['Đã trả lời', `${detail.response_count??0}${detail.invitation_count?` / ${detail.invitation_count}`:''}`], ['Hoàn thành', detail.completed_count??0]].map(([k,v]) => (
              <div key={k}><dt className="text-white/35 text-xs mb-0.5">{k}</dt><dd className="m-0 text-[#f5f0eb] text-sm font-medium">{v}</dd></div>
            ))}
          </dl>

          <div className="flex items-center gap-2 flex-wrap">
            {detail.status==='Draft'   && <button type="button" disabled={busy} onClick={() => openEdit(detail.survey_id)} className={BTN_INDIGO}>Sửa khảo sát</button>}
            {detail.status!=='Closed'  && <button type="button" disabled={busy} onClick={() => sendSurvey(detail.survey_id)} className={BTN_GREEN}>Gửi khảo sát</button>}
            <button type="button" disabled={busy} onClick={() => loadResults(detail.survey_id)} className={BTN_GHOST}>Xem kết quả</button>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold text-white/60">Nội dung câu hỏi</h3>
            {(detail.questions||[]).map((q,idx) => (
              <div key={q.question_id} className="p-4 border border-white/[0.07] rounded-xl bg-white/[0.03] flex flex-col gap-2">
                <span className="text-white/30 text-[0.68rem] font-bold uppercase tracking-wider">{String(idx+1).padStart(2,'0')} {q.is_required?'BẮT BUỘC':'KHÔNG BẮT BUỘC'} · {QUESTION_TYPE_LABELS[q.question_type]||q.question_type}</span>
                <p className="m-0 text-white/80 text-sm font-medium">{q.question_text}</p>
                {q.question_type==='Rating' && <div className="text-yellow-400 tracking-widest">★ ★ ★ ★ ★</div>}
                {q.question_type==='Text'   && <div className="text-white/30 text-sm italic">Câu trả lời tự luận của khách hàng</div>}
                {['SingleChoice','MultiChoice'].includes(q.question_type) && (q.options||[]).map((o,oi) => (
                  <div key={o.option_id} className="flex items-center gap-2 text-sm text-white/55">
                    <span className="w-5 h-5 grid place-items-center border border-white/20 rounded-full text-[0.65rem] font-bold shrink-0">{q.question_type==='MultiChoice'?'✓':String.fromCharCode(65+(oi%26))}</span>
                    {o.option_text}
                  </div>
                ))}
              </div>
            ))}
            {!detail.questions?.length && <p className="text-white/30 text-sm">Khảo sát này chưa có câu hỏi.</p>}
          </div>
        </article>
      )}

      {/* Results panel */}
      {results && (
        <div className={PANEL}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 text-[1.05rem] font-semibold">Kết quả: {results.title} <span className="text-white/40 font-normal text-sm">({results.total_responses} lượt trả lời)</span></h2>
            <button type="button" className={BTN_GHOST} onClick={() => setResults(null)}>Đóng</button>
          </div>
          {results.questions.map(item => (
            <section key={item.question_id} className="flex flex-col gap-2">
              <h4 className="m-0 text-sm font-semibold text-white/70">{item.question_text}</h4>
              {item.options.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={item.options}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="option_text" tick={{ fontSize:11, fill:'rgba(255,255,255,0.45)' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize:11, fill:'rgba(255,255,255,0.45)' }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="vote_count" name={item.question_type==='Rating'?'Lượt đánh giá':'Lượt chọn'} fill="#6366f1" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <small className="text-white/35 text-xs">{item.question_type==='Rating' ? 'Chưa có lượt đánh giá.' : `Câu hỏi tự luận: ${results.total_responses} lượt trả lời.`}</small>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
