const hasZipHeader = bytes => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
  && bytes[2] === 0x03 && bytes[3] === 0x04;
const hasTextHeader = bytes => bytes.length > 0 && !bytes.includes(0)
  && ![...bytes].some(byte => byte < 0x08 || (byte > 0x0d && byte < 0x20));

export const chatAttachmentTypes = Object.freeze({
  'image/jpeg': { extension: '.jpg', maxSize: 5 * 1024 * 1024, signature: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { extension: '.png', maxSize: 5 * 1024 * 1024, signature: bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: '.webp', maxSize: 5 * 1024 * 1024, signature: bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
  'image/gif': { extension: '.gif', maxSize: 5 * 1024 * 1024, signature: bytes => ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) },
  'video/mp4': { extension: '.mp4', maxSize: 25 * 1024 * 1024, signature: bytes => bytes.toString('ascii', 4, 8) === 'ftyp' },
  'video/webm': { extension: '.webm', maxSize: 25 * 1024 * 1024, signature: bytes => bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  'application/pdf': { extension: '.pdf', maxSize: 10 * 1024 * 1024, signature: bytes => bytes.toString('ascii', 0, 5) === '%PDF-' },
  'text/plain': { extension: '.txt', maxSize: 10 * 1024 * 1024, minBytes: 1, signature: hasTextHeader },
  'text/csv': { extension: '.csv', maxSize: 10 * 1024 * 1024, minBytes: 1, signature: hasTextHeader },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: '.docx', maxSize: 10 * 1024 * 1024, signature: hasZipHeader },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extension: '.xlsx', maxSize: 10 * 1024 * 1024, signature: hasZipHeader },
});

export function chatAttachmentTypeError(mimetype) {
  if (mimetype?.startsWith('image/')) return 'Mỗi ảnh tối đa 5 MB.';
  if (mimetype?.startsWith('video/')) return 'Mỗi video tối đa 25 MB.';
  return 'Mỗi tài liệu tối đa 10 MB.';
}

export function validateChatAttachment(mimetype, size, header) {
  const type = chatAttachmentTypes[mimetype];
  if (!type) return { status: 400, message: 'Chỉ hỗ trợ ảnh, video MP4/WebM, PDF, TXT, CSV, DOCX hoặc XLSX.' };
  if (size > type.maxSize) return { status: 413, message: chatAttachmentTypeError(mimetype) };
  if (header.length < (type.minBytes || 12) || !type.signature(header)) {
    return { status: 400, message: 'Tệp tải lên không đúng định dạng.' };
  }
  return null;
}
