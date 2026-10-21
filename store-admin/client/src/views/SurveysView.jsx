import { useState, useEffect, useRef } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';

const STATUS_LABEL = { Draft: '🔘 Nháp', Active: '🟢 Đang chạy', Closed: '⛔ Đã đóng' };
const QUESTION_TYPE_LABELS = {
  SingleChoice: 'Chọn một đáp án',
  MultiChoice: 'Chọn nhiều đáp án',
  Text: 'Trả lời tự luận',
  Rating: 'Đánh giá 1–5 sao',
};
const GENDER_LABEL = { Male: 'Nam', Female: 'Nữ', Other: 'Khác' };

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('vi-VN');
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
}

function audienceLabel(survey) {
  const parts = [];
  if (survey.target_gender) parts.push(GENDER_LABEL[survey.target_gender] || survey.target_gender);
  if (survey.target_tier) parts.push(`Hạng ${survey.target_tier}`);
  if (survey.min_age != null || survey.max_age != null) {
    parts.push(`Tuổi ${survey.min_age ?? '…'}–${survey.max_age ?? '…'}`);
  }
  return parts.length ? parts.join(' · ') : 'Tất cả khách hàng';
}

export default function SurveysView() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState([]);
  const [editingSurveyId, setEditingSurveyId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState('');
  const formRef = useRef(null);
  const detailRef = useRef(null);

  useEffect(() => {
    setError('');
    setLoading(true);
    apiFetch('/api/surveys')
      .then(d => setSurveys(Array.isArray(d) ? d : []))
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  const createQuestion = () => ({
    key: window.crypto.randomUUID(),
    question_text: '',
    question_type: 'SingleChoice',
    is_required: true,
    options: ['Rất hài lòng', 'Hài lòng', 'Bình thường', 'Chưa hài lòng'],
  });
  const openCreateForm = () => {
    setEditingSurveyId(null);
    setTitle('');
    setDescription('');
    setQuestions([createQuestion()]);
    setError('');
    setMessage('');
    setDetail(null);
    setFormOpen(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const openEditForm = async id => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const survey = await apiFetch(`/api/surveys/${id}`);
      setEditingSurveyId(id);
      setTitle(survey.title || '');
      setDescription(survey.description || '');
      setQuestions(survey.questions.map(question => ({
        key: window.crypto.randomUUID(),
        question_text: question.question_text,
        question_type: question.question_type,
        is_required: question.is_required,
        options: question.options.map(option => option.option_text),
      })));
      setDetail(null);
      setFormOpen(true);
      window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditingSurveyId(null);
    setError('');
  };
  const updateQuestion = (key, update) => {
    setQuestions(current => current.map(question => question.key === key
      ? { ...question, ...update }
      : question));
  };
  const updateQuestionType = (question, question_type) => {
    updateQuestion(question.key, {
      question_type,
      options: ['SingleChoice', 'MultiChoice'].includes(question_type)
        ? question.options.length >= 2 ? question.options : ['', '']
        : [],
    });
  };
  const updateOption = (questionKey, optionIndex, value) => {
    setQuestions(current => current.map(question => question.key === questionKey
      ? { ...question, options: question.options.map((option, index) => index === optionIndex ? value : option) }
      : question));
  };
  const addOption = questionKey => {
    setQuestions(current => current.map(question => question.key === questionKey
      ? { ...question, options: [...question.options, ''] }
      : question));
  };
  const removeOption = (questionKey, optionIndex) => {
    setQuestions(current => current.map(question => question.key === questionKey
      ? { ...question, options: question.options.filter((_, index) => index !== optionIndex) }
      : question));
  };
  const saveSurvey = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        title,
        description,
        questions: questions.map((question, index) => ({
          question_text: question.question_text,
          question_type: question.question_type,
          display_order: index + 1,
          is_required: question.is_required,
          options: question.options.map((option, optionIndex) => ({
            option_text: option,
            display_order: optionIndex + 1,
          })),
        })),
      };
      await apiFetch(editingSurveyId ? `/api/surveys/${editingSurveyId}` : '/api/surveys', {
        method: editingSurveyId ? 'PATCH' : 'POST',
        body: payload,
      });
      setFormOpen(false);
      setEditingSurveyId(null);
      setMessage(editingSurveyId
        ? 'Đã cập nhật khảo sát nháp.'
        : 'Đã tạo khảo sát nháp. Bạn có thể gửi khảo sát từ danh sách bên dưới.');
      setRefresh(value => value + 1);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const sendSurvey = async id => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch(`/api/surveys/${id}/send`, { method: 'POST', body: {} });
      setMessage(result.message);
      setRefresh(value => value + 1);
      if (detail?.survey_id === id) {
        setDetail(await apiFetch(`/api/surveys/${id}`));
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const loadResults = async id => {
    setError('');
    try { setResults(await apiFetch(`/api/surveys/${id}/results`)); }
    catch (requestError) { setError(requestError.message); }
  };
  const openDetail = async id => {
    setBusy(true);
    setError('');
    setFormOpen(false);
    try {
      const survey = await apiFetch(`/api/surveys/${id}`);
      setDetail(survey);
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const closeDetail = () => {
    setDetail(null);
    setResults(null);
  };

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">CRM</p><h1>Khảo sát khách hàng</h1></div>
        <button className="primary-btn survey-open-form" type="button" onClick={openCreateForm}>＋ Tạo khảo sát</button>
      </header>
      {error && <p className="settings-message settings-error" role="alert">{error}</p>}
      {message && <p className="settings-message settings-success" role="status">{message}</p>}
      {formOpen && <form ref={formRef} className="panel survey-create-form" onSubmit={saveSurvey}>
        <div className="survey-create-heading">
          <div className="survey-create-icon" aria-hidden="true">✦</div>
          <div>
            <h2>{editingSurveyId ? 'Chỉnh sửa khảo sát' : 'Tạo khảo sát mới'}</h2>
            <p>Thêm nhiều câu hỏi, chọn kiểu trả lời và xem trước nội dung trước khi lưu.</p>
          </div>
          <button className="survey-close-form" type="button" onClick={closeForm} aria-label="Đóng biểu mẫu">×</button>
        </div>
        <div className="survey-create-layout">
          <div className="survey-create-fields">
            <label className="survey-field">
              <span>Tên khảo sát <b>*</b></span>
              <input required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Khảo sát trải nghiệm mua sắm" />
              <small>Tên ngắn gọn giúp khách hàng nhận biết nội dung khảo sát.</small>
            </label>
            <label className="survey-field">
              <span>Mô tả <small>Không bắt buộc</small></span>
              <textarea maxLength={2000} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Cho khách hàng biết mục đích và thời gian hoàn thành khảo sát." />
            </label>
            <div className="survey-question-builder">
              <div className="survey-question-builder-heading">
                <div><h3>Câu hỏi</h3><p>Tạo tối đa 50 câu hỏi cho một khảo sát.</p></div>
                <button className="survey-add-question" type="button" disabled={questions.length >= 50} onClick={() => setQuestions(current => [...current, createQuestion()])}>＋ Thêm câu hỏi</button>
              </div>
              {questions.map((question, index) => (
                <section className="survey-question-editor" key={question.key}>
                  <div className="survey-question-editor-heading">
                    <span className="survey-question-number">{String(index + 1).padStart(2, '0')}</span>
                    <strong>Câu hỏi {index + 1}</strong>
                    <button className="survey-remove-question" type="button" disabled={questions.length === 1} onClick={() => setQuestions(current => current.filter(item => item.key !== question.key))}>Xóa câu hỏi</button>
                  </div>
                  <label className="survey-field">
                    <span>Nội dung câu hỏi <b>*</b></span>
                    <textarea required maxLength={1000} rows={2} value={question.question_text} onChange={e => updateQuestion(question.key, { question_text: e.target.value })} placeholder="Nhập nội dung câu hỏi..." />
                  </label>
                  <div className="survey-question-settings">
                    <label className="survey-field">
                      <span>Kiểu trả lời</span>
                      <select value={question.question_type} onChange={e => updateQuestionType(question, e.target.value)}>
                        {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="survey-required-toggle">
                      <input type="checkbox" checked={question.is_required} onChange={e => updateQuestion(question.key, { is_required: e.target.checked })} />
                      Bắt buộc trả lời
                    </label>
                  </div>
                  {['SingleChoice', 'MultiChoice'].includes(question.question_type) && (
                    <div className="survey-option-editor">
                      <div className="survey-option-heading"><strong>Các lựa chọn</strong><small>Cần ít nhất 2 lựa chọn</small></div>
                      {question.options.map((option, optionIndex) => (
                        <div className="survey-option-input" key={`${question.key}-option-${optionIndex}`}>
                          <i>{String.fromCharCode(65 + (optionIndex % 26))}</i>
                          <input required maxLength={300} aria-label={`Lựa chọn ${optionIndex + 1} cho câu ${index + 1}`} value={option} onChange={e => updateOption(question.key, optionIndex, e.target.value)} placeholder={`Lựa chọn ${optionIndex + 1}`} />
                          <button type="button" aria-label={`Xóa lựa chọn ${optionIndex + 1}`} disabled={question.options.length <= 2} onClick={() => removeOption(question.key, optionIndex)}>×</button>
                        </div>
                      ))}
                      <button className="survey-add-option" type="button" disabled={question.options.length >= 100} onClick={() => addOption(question.key)}>＋ Thêm lựa chọn</button>
                    </div>
                  )}
                  {question.question_type === 'Rating' && <p className="survey-field-hint">Khách hàng sẽ đánh giá theo thang điểm từ 1 đến 5 sao.</p>}
                  {question.question_type === 'Text' && <p className="survey-field-hint">Khách hàng sẽ nhập câu trả lời dạng văn bản.</p>}
                </section>
              ))}
            </div>
            <div className="survey-create-actions">
              <span><i aria-hidden="true">●</i> Khảo sát được lưu ở trạng thái nháp</span>
              <div>
                <button className="survey-cancel-button" type="button" onClick={closeForm}>Hủy</button>
                <button className="primary-btn" disabled={busy}>{busy ? 'Đang lưu...' : editingSurveyId ? 'Lưu thay đổi' : 'Tạo khảo sát nháp'}</button>
              </div>
            </div>
          </div>
          <aside className="survey-preview" aria-label="Xem trước khảo sát">
            <div className="survey-preview-top"><span>✦</span><small>XEM TRƯỚC</small></div>
            <p className="eyebrow">HUNG FASHION · KHẢO SÁT</p>
            <h3>{title.trim() || 'Tên khảo sát của bạn'}</h3>
            <p className="survey-preview-description">{description.trim() || 'Mô tả khảo sát sẽ hiển thị ở đây để khách hàng hiểu mục đích.'}</p>
            {questions.map((question, index) => (
              <div className="survey-preview-question" key={question.key}>
                <span>{String(index + 1).padStart(2, '0')} <b>{question.is_required ? 'CÂU HỎI BẮT BUỘC' : 'CÂU HỎI KHÔNG BẮT BUỘC'}</b></span>
                <p>{question.question_text.trim() || `Câu hỏi ${index + 1} sẽ hiển thị ở đây.`}</p>
                {question.question_type === 'Rating'
                  ? <div className="survey-preview-rating" aria-label="Thang điểm từ 1 đến 5">★ ★ ★ ★ ★</div>
                  : question.question_type === 'Text'
                    ? <div className="survey-preview-text">Câu trả lời của khách hàng...</div>
                    : question.options.map((option, optionIndex) => (
                      <div className="survey-preview-option" key={`${question.key}-preview-${optionIndex}`}><i>{question.question_type === 'MultiChoice' ? '✓' : String.fromCharCode(65 + (optionIndex % 26))}</i>{option.trim() || `Lựa chọn ${optionIndex + 1}`}</div>
                    ))}
              </div>
            ))}
          </aside>
        </div>
      </form>}
      <div className="panel">
        <div className="panel-header"><h3>Danh sách khảo sát</h3></div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Tiêu đề</th><th>Câu hỏi</th><th>Phản hồi</th><th>Ngày kết thúc</th><th>Trạng thái</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {surveys.length ? surveys.map(s => (
                <tr key={s.survey_id}>
                  <td>{s.survey_id}</td>
                  <td>
                    <button className="survey-title-button" type="button" disabled={busy} onClick={() => openDetail(s.survey_id)}>
                      <strong>{s.title}</strong>
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>{s.question_count}</td>
                  <td style={{ textAlign: 'center' }}>{s.response_count}</td>
                  <td>{formatDate(s.end_date)}</td>
                  <td>{STATUS_LABEL[s.status] || s.status}</td>
                  <td className="action-cell">
                    <button className="text-button" type="button" disabled={busy} onClick={() => openDetail(s.survey_id)}>Chi tiết</button>
                    {s.status === 'Draft' && <button className="survey-edit-button" type="button" disabled={busy} onClick={() => openEditForm(s.survey_id)}>Sửa</button>}
                    {s.status !== 'Closed' && <button className="event-btn" type="button" disabled={busy} onClick={() => sendSurvey(s.survey_id)}>Gửi khảo sát</button>}
                    <button className="text-button" type="button" onClick={() => loadResults(s.survey_id)}>Kết quả</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có khảo sát</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {detail && <article ref={detailRef} className="panel survey-detail">
        <div className="survey-detail-heading">
          <div>
            <p className="eyebrow">Chi tiết khảo sát #{detail.survey_id}</p>
            <h2>{detail.title}</h2>
            <p>{detail.description || 'Không có mô tả.'}</p>
          </div>
          <button className="survey-close-form" type="button" onClick={closeDetail} aria-label="Đóng chi tiết">×</button>
        </div>
        <dl className="survey-detail-stats">
          <div><dt>Trạng thái</dt><dd>{STATUS_LABEL[detail.status] || detail.status}</dd></div>
          <div><dt>Người tạo</dt><dd>{detail.created_by_name || '—'}</dd></div>
          <div><dt>Ngày tạo</dt><dd>{formatDateTime(detail.created_at)}</dd></div>
          <div><dt>Bắt đầu</dt><dd>{formatDate(detail.start_date)}</dd></div>
          <div><dt>Kết thúc</dt><dd>{formatDate(detail.end_date)}</dd></div>
          <div><dt>Đối tượng</dt><dd>{audienceLabel(detail)}</dd></div>
          <div><dt>Câu hỏi</dt><dd>{detail.question_count ?? detail.questions?.length ?? 0}</dd></div>
          <div><dt>Lời mời</dt><dd>{detail.invitation_count ?? 0}</dd></div>
          <div><dt>Đã trả lời</dt><dd>{detail.response_count ?? 0}{detail.invitation_count ? ` / ${detail.invitation_count}` : ''}</dd></div>
          <div><dt>Hoàn thành lời mời</dt><dd>{detail.completed_count ?? 0}</dd></div>
        </dl>
        <div className="survey-detail-actions">
          {detail.status === 'Draft' && <button className="survey-edit-button" type="button" disabled={busy} onClick={() => openEditForm(detail.survey_id)}>Sửa khảo sát</button>}
          {detail.status !== 'Closed' && <button className="event-btn" type="button" disabled={busy} onClick={() => sendSurvey(detail.survey_id)}>Gửi khảo sát</button>}
          <button className="text-button" type="button" disabled={busy} onClick={() => loadResults(detail.survey_id)}>Xem kết quả</button>
        </div>
        <div className="survey-detail-questions">
          <h3>Nội dung câu hỏi</h3>
          {(detail.questions || []).map((question, index) => (
            <section className="survey-preview-question" key={question.question_id}>
              <span>{String(index + 1).padStart(2, '0')} <b>{question.is_required ? 'CÂU HỎI BẮT BUỘC' : 'CÂU HỎI KHÔNG BẮT BUỘC'}</b> · {QUESTION_TYPE_LABELS[question.question_type] || question.question_type}</span>
              <p>{question.question_text}</p>
              {question.question_type === 'Rating'
                ? <div className="survey-preview-rating" aria-label="Thang điểm từ 1 đến 5">★ ★ ★ ★ ★</div>
                : question.question_type === 'Text'
                  ? <div className="survey-preview-text">Câu trả lời tự luận của khách hàng</div>
                  : (question.options || []).map((option, optionIndex) => (
                    <div className="survey-preview-option" key={option.option_id}>
                      <i>{question.question_type === 'MultiChoice' ? '✓' : String.fromCharCode(65 + (optionIndex % 26))}</i>
                      {option.option_text}
                    </div>
                  ))}
            </section>
          ))}
          {!detail.questions?.length && <p className="survey-field-hint">Khảo sát này chưa có câu hỏi.</p>}
        </div>
      </article>}
      {results && <div className="panel survey-results">
        <div className="panel-header"><h3>Kết quả: {results.title} ({results.total_responses} lượt trả lời)</h3><button className="text-button" type="button" onClick={() => setResults(null)}>Đóng</button></div>
        {results.questions.map(item => <section key={item.question_id}>
          <h4>{item.question_text}</h4>
          {item.options.length ? <ResponsiveContainer width="100%" height={200}><BarChart data={item.options}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="option_text" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} />
            <Tooltip /><Bar dataKey="vote_count" name={item.question_type === 'Rating' ? 'Lượt đánh giá' : 'Lượt chọn'} fill="#4f46e5" radius={[6, 6, 0, 0]} />
          </BarChart></ResponsiveContainer> : <small>{item.question_type === 'Rating' ? 'Chưa có lượt đánh giá.' : `Câu hỏi tự luận: ${results.total_responses} lượt trả lời.`}</small>}
        </section>)}
      </div>}
    </>
  );
}
