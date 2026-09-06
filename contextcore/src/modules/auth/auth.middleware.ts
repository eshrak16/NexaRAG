import { FastifyReply, FastifyRequest } from 'fastify';

import { authService, HttpAuthError } from './auth.service.js';

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new HttpAuthError('MISSING_AUTH_TOKEN', 'Authentication token is required.', 401);
  }

  const accessToken = authorization.slice(7).trim();

  try {
    const payload = authService.verifyAccessToken(accessToken);
    const user = await authService.getUserById(payload.sub);

    if (!user) {
      throw new HttpAuthError('USER_NOT_FOUND', 'Authenticated user no longer exists.', 401);
    }

    request.user = user;
  } catch (error) {
    if (error instanceof HttpAuthError) {
      throw error;
    }

    throw new HttpAuthError('INVALID_AUTH_TOKEN', 'The access token is invalid or expired.', 401);
  }
}
