import assert from 'node:assert/strict';
import test from 'node:test';
import argon2 from 'argon2';
import { buildApp } from '../app.js';
import { prisma } from '../database/prisma.js';

test('login, /me restoration, refresh rotation, invalid login, and logout revocation work through the API', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `session-${suffix}@example.test`;
  const password = 'session-test-password';
  const user = await prisma.user.create({ data: { email, name: 'Session Test', passwordHash: await argon2.hash(password) } });
  const app = await buildApp();
  try {
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'incorrect-password' } });
    assert.equal(invalid.statusCode, 401);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    assert.equal(login.statusCode, 200);
    const tokens = login.json<{ accessToken: string; refreshToken: string }>();
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${tokens.accessToken}` } })).statusCode, 200);

    const refresh = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: tokens.refreshToken } });
    assert.equal(refresh.statusCode, 200);
    const rotated = refresh.json<{ accessToken: string; refreshToken: string }>();
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: tokens.refreshToken } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${rotated.accessToken}` } })).statusCode, 200);

    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken: rotated.refreshToken } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: rotated.refreshToken } })).statusCode, 401);
  } finally {
    await app.close();
    await prisma.user.delete({ where: { id: user.id } });
  }
});
