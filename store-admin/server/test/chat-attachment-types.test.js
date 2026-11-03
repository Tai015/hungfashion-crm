import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatAttachmentTypes, validateChatAttachment } from '../src/chat-attachment-types.js';

test('accepts allowed document signatures', () => {
  const cases = [
    ['application/pdf', Buffer.from('%PDF-1.7 test')],
    ['text/plain', Buffer.from('Hello chat')],
    ['text/csv', Buffer.from('name,quantity\n')],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from([0x50, 0x4b, 0x03, 0x04, ...new Array(8).fill(0)])],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from([0x50, 0x4b, 0x03, 0x04, ...new Array(8).fill(0)])],
  ];

  for (const [mimetype, header] of cases) {
    assert.equal(validateChatAttachment(mimetype, header.length, header), null, mimetype);
  }
});

test('rejects unsupported types, mismatched signatures, and oversized documents', () => {
  assert.equal(validateChatAttachment('application/octet-stream', 12, Buffer.alloc(12))?.status, 400);
  assert.equal(validateChatAttachment('application/pdf', 12, Buffer.from('not-a-pdf'))?.status, 400);
  assert.equal(validateChatAttachment('application/pdf', chatAttachmentTypes['application/pdf'].maxSize + 1, Buffer.from('%PDF-1.7 test'))?.status, 413);
});
