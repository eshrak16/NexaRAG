declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export type AuthUserResponse = {
  user: AuthUser;
} & AuthTokens;
