import { FastifyInstance } from 'fastify';

import { authenticate } from '../modules/auth/auth.middleware.js';
import { HttpAuthError } from '../modules/auth/auth.service.js';
import { requireOrganizationMembership, requireOrganizationRole } from '../modules/organizations/organization.authorization.js';
import { addMemberSchema, createOrganizationSchema, organizationIdParamSchema, memberIdParamSchema, updateMemberRoleSchema, updateOrganizationSchema } from '../modules/organizations/organization.schema.js';
import { organizationService } from '../modules/organizations/organization.service.js';

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/organizations', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = createOrganizationSchema.parse(request.body);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await organizationService.createOrganization(request.user, body.name);
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.get('/api/v1/organizations', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const organizations = await organizationService.listUserOrganizations(request.user.id);
      return reply.status(200).send(organizations);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.get('/api/v1/organizations/:id', { preHandler: [authenticate, requireOrganizationMembership] }, async (request, reply) => {
    try {
      const params = organizationIdParamSchema.parse(request.params);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const organization = await organizationService.getOrganizationByIdWithRole(params.id, request.user.id);

      if (!organization) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this organization.',
          },
        });
      }

      return reply.status(200).send(organization);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.patch('/api/v1/organizations/:id', { preHandler: [authenticate, requireOrganizationRole(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const params = organizationIdParamSchema.parse(request.params);
      const body = updateOrganizationSchema.parse(request.body);

      const organization = await organizationService.updateOrganization(params.id, body.name);
      return reply.status(200).send(organization);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.get('/api/v1/organizations/:id/members', { preHandler: [authenticate, requireOrganizationMembership] }, async (request, reply) => {
    try {
      const params = organizationIdParamSchema.parse(request.params);
      const members = await organizationService.listMembers(params.id);
      return reply.status(200).send(members);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.post('/api/v1/organizations/:id/members', { preHandler: [authenticate, requireOrganizationRole(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const params = organizationIdParamSchema.parse(request.params);
      const body = addMemberSchema.parse(request.body);
      const member = await organizationService.addMember(params.id, body.email, body.role, request.membership?.role);
      return reply.status(201).send(member);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.patch('/api/v1/organizations/:id/members/:userId', { preHandler: [authenticate, requireOrganizationRole(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const params = {
        id: (request.params as { id: string }).id,
        userId: (request.params as { userId: string }).userId,
      };
      const body = updateMemberRoleSchema.parse(request.body);
      const result = await organizationService.changeMemberRole(params.id, params.userId, body.role, request.membership?.role);
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.delete('/api/v1/organizations/:id/members/:userId', { preHandler: [authenticate, requireOrganizationRole(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const params = {
        id: (request.params as { id: string }).id,
        userId: (request.params as { userId: string }).userId,
      };

      await organizationService.removeMember(params.id, params.userId, request.membership?.role);
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      throw error;
    }
  });
}
