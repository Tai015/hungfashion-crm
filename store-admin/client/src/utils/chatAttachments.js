export const CHAT_ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.pdf', '.txt', '.csv', '.docx', '.xlsx',
].join(',');

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function chatAttachmentError(file) {
  if (!ALLOWED_TYPES.has(file.type)) return 'Định dạng chưa hỗ trợ. Chọn ảnh, video MP4/WebM, PDF, TXT, CSV, DOCX hoặc XLSX.';
  const maxSize = file.type.startsWith('image/') ? 5 : file.type.startsWith('video/') ? 25 : 10;
  if (file.size > maxSize * 1024 * 1024) {
    const label = file.type.startsWith('image/') ? 'Ảnh' : file.type.startsWith('video/') ? 'Video' : 'Tài liệu';
    return `${label} tối đa ${maxSize} MB.`;
  }
  return '';
}
