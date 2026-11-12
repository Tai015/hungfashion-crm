import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccessToken } from '../src/auth.js';

function decodePayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

test('access tokens preserve the requested remember-me mode', (context) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
  context.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  const remembered = decodePayload(createAccessToken(1, 'remembered-session', 8 * 60 * 60, true));
  const temporary = decodePayload(createAccessToken(1, 'temporary-session', 8 * 60 * 60, false));

  assert.equal(remembered.rememberMe, true);
  assert.equal(temporary.rememberMe, false);
});
