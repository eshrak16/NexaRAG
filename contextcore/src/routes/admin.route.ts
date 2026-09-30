import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ZodError } from 'zod';
import { authenticate } from '../modules/auth/auth.middleware.js';
import { HttpAuthError } from '../modules/auth/auth.service.js';
import { adminService } from '../modules/organizations/admin.service.js';
import { requireOrganizationMembership } from '../modules/organizations/organization.authorization.js';

const orgParams = z.object({ id: z.string().min(1) });
const reviewParams = z.object({ id: z.string().min(1), requestId: z.string().min(1) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/organizations/:id/admin-requests', { preHandler: [authenticate, requireOrganizationMembership] }, async (request, reply) => {
    try {
      const { id } = orgParams.parse(request.params);
      if (!request.user) throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      return reply.status(201).send(await adminService.requestAdmin(id, request.user.id));
    } catch (error) {
      if (error instanceof HttpAuthError) return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      if (error instanceof ZodError) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid admin request.' } });
      throw error;
    }
  });

  app.get('/api/v1/organizations/:id/admin-requests', { preHandler: [authenticate, requireOrganizationMembership] }, async (request, reply) => {
    try {
      const { id } = orgParams.parse(request.params);
      if (!request.user) throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      return reply.send(await adminService.listRequests(id, request.user.id));
    } catch (error) {
      if (error instanceof HttpAuthError) return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      if (error instanceof ZodError) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid admin request.' } });
      throw error;
    }
  });

  for (const [decision, approve] of [['approve', true], ['reject', false]] as const) {
    app.post(`/api/v1/organizations/:id/admin-requests/:requestId/${decision}`, { preHandler: [authenticate, requireOrganizationMembership] }, async (request, reply) => {
      try {
        const { id, requestId } = reviewParams.parse(request.params);
        if (!request.user) throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
        return reply.send(await adminService.reviewRequest(id, requestId, request.user.id, approve));
      } catch (error) {
        if (error instanceof HttpAuthError) return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
        if (error instanceof ZodError) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid admin request.' } });
        throw error;
      }
    });
  }

  app.get('/api/v1/organizations/:id/audit-events', { preHandler: [authenticate, requireOrganizationMembership] }, async (request, reply) => {
    try {
      const { id } = orgParams.parse(request.params);
      if (!request.user) throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      return reply.send(await adminService.listAuditEvents(id, request.user.id));
    } catch (error) {
      if (error instanceof HttpAuthError) return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      if (error instanceof ZodError) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid admin request.' } });
      throw error;
    }
  });
}
