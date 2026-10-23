const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');

describe('Admin Staff Operations: No Supabase Auth Dependencies', () => {
  let server;
  let baseUrl;
  let dbMod;

  before(async () => {
    dbMod = require('../src/config/db');

    const app = express();
    app.use(express.json());

    // Mock admin middleware user
    app.use((req, _res, next) => {
      req.user = { id: 1, role: 'ADMIN', name: 'Super Admin' };
      next();
    });

    const adminController = require('../src/controllers/adminController');

    app.put('/api/admin/staff/:id/role', adminController.updateStaffRole);
    app.put('/api/admin/staff/:id/reset-password', adminController.resetStaffPassword);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('Staff role change succeeds without any Supabase Auth calls', async () => {
    let roleUpdatedWith = null;

    dbMod.prisma.user.findUnique = async ({ where }) => {
      if (where.id === 2) {
        return { id: 2, email: 'staff@example.com', role: 'VENDOR' };
      }
      return null;
    };

    dbMod.prisma.user.update = async ({ where, data }) => {
      roleUpdatedWith = data.role;
      return {
        id: where.id,
        name: 'Staff Member',
        email: 'staff@example.com',
        role: data.role,
        isActive: true,
        isDemo: false,
        createdAt: new Date(),
      };
    };

    dbMod.prisma.auditLog = {
      create: async () => ({ id: 1 }),
    };

    const res = await fetch(`${baseUrl}/api/admin/staff/2/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'KITCHEN' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.staff.role, 'KITCHEN');
    assert.equal(roleUpdatedWith, 'KITCHEN');
  });

  test('Staff password reset succeeds without any Supabase Auth calls', async () => {
    let passwordUpdated = false;

    dbMod.prisma.user.update = async ({ where, data }) => {
      if (data.password) {
        passwordUpdated = true;
      }
      return {
        id: where.id,
        name: 'Staff Member',
        email: 'staff@example.com',
        role: 'VENDOR',
      };
    };

    dbMod.prisma.auditLog = {
      create: async () => ({ id: 2 }),
    };

    const res = await fetch(`${baseUrl}/api/admin/staff/2/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'newSecurePassword123' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(data.message, /Password reset successfully/);
    assert.equal(passwordUpdated, true);
  });
});
