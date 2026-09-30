import assert from 'node:assert/strict';
import test from 'node:test';
import { can } from './permissions.js';

test('organization permissions distinguish owner, admin, member, and viewer capabilities', () => {
  assert.equal(can('OWNER', 'organization:manage'), true);
  assert.equal(can('OWNER', 'admin:approve'), true);
  assert.equal(can('ADMIN', 'member:manage'), true);
  assert.equal(can('ADMIN', 'admin:approve'), false);
  assert.equal(can('ADMIN', 'organization:manage'), false);
  assert.equal(can('MEMBER', 'document:upload'), true);
  assert.equal(can('MEMBER', 'member:manage'), false);
  assert.equal(can('VIEWER', 'knowledge_base:read'), true);
  assert.equal(can('VIEWER', 'document:upload'), false);
});
