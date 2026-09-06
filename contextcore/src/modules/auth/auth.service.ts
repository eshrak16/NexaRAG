import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import argon2 from 'argon2';

import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { AuthTokenPayload, AuthTokens, AuthUser, AuthUserResponse } from './auth.types.js';
import { hashToken, parseTokenTtl } from './auth.utils.js';

export class HttpAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'HttpAuthError';
  }
}

export class AuthService {
  private readonly accessTokenTtlMs = parseTokenTtl(env.JWT_ACCESS_TOKEN_TTL);
  private readonly refreshTokenTtlMs = parseTokenTtl(env.JWT_REFRESH_TOKEN_TTL);

  private toAuthUser(user: {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async storeRefreshToken(userId: string, refreshToken: string, replacedTokenId?: string): Promise<void> {
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlMs);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        replacedById: replacedTokenId ?? null,
      },
    });
  }

  private async revokeRefreshTokenById(tokenId: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeRefreshTokensForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: { revokedAt: new Date() },
    });
  }

  private signToken(payload: AuthTokenPayload, expiresIn: string): string {
    const signingOptions = {
      expiresIn: expiresIn as SignOptions['expiresIn'],
      issuer: env.JWT_ISSUER,
      subject: payload.sub,
    } as SignOptions;

    return jwt.sign(payload, env.JWT_SECRET, signingOptions);
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user ? this.toAuthUser(user) : null;
  }

  private async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  verifyAccessToken(token: string): AuthTokenPayload {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
    }) as JwtPayload;

    if (!payload.sub || !payload.email || payload.type !== 'access') {
      throw new HttpAuthError('INVALID_ACCESS_TOKEN', 'The access token is invalid.', 401);
    }

    return {
      sub: payload.sub,
      email: payload.email,
      type: 'access',
    };
  }

  verifyRefreshToken(token: string): AuthTokenPayload {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
    }) as JwtPayload;

    if (!payload.sub || !payload.email || payload.type !== 'refresh') {
      throw new HttpAuthError('INVALID_REFRESH_TOKEN', 'The refresh token is invalid.', 401);
    }

    return {
      sub: payload.sub,
      email: payload.email,
      type: 'refresh',
    };
  }

  async register(email: string, name: string, password: string): Promise<AuthUserResponse> {
    const existingUser = await this.findUserByEmail(email);

    if (existingUser) {
      throw new HttpAuthError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.', 409);
    }

    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.issueTokensForUser(this.toAuthUser(user));
  }

  async login(email: string, password: string): Promise<AuthUserResponse> {
    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new HttpAuthError('INVALID_CREDENTIALS', 'The email or password is incorrect.', 401);
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password);

    if (!passwordMatches) {
      throw new HttpAuthError('INVALID_CREDENTIALS', 'The email or password is incorrect.', 401);
    }

    return this.issueTokensForUser(this.toAuthUser(user));
  }

  async refresh(refreshToken: string): Promise<AuthUserResponse> {
    const payload = this.verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const storedRefreshToken = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!storedRefreshToken || !storedRefreshToken.user) {
      throw new HttpAuthError('INVALID_REFRESH_TOKEN', 'The refresh token is invalid or has expired.', 401);
    }

    const user = this.toAuthUser(storedRefreshToken.user);

    await this.revokeRefreshTokenById(storedRefreshToken.id);
    await this.storeRefreshToken(user.id, refreshToken, storedRefreshToken.id);

    return this.issueTokensForUser(user, storedRefreshToken.id);
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);

      const token = await prisma.refreshToken.findFirst({
        where: {
          tokenHash,
          ...(userId ? { userId } : {}),
          revokedAt: null,
        },
      });

      if (token) {
        await this.revokeRefreshTokenById(token.id);
      }

      return;
    }

    if (!userId) {
      return;
    }

    await this.revokeRefreshTokensForUser(userId);
  }

  private async issueTokensForUser(user: AuthUser, replacedTokenId?: string): Promise<AuthUserResponse> {
    const accessToken = this.signToken({ sub: user.id, email: user.email, type: 'access' }, env.JWT_ACCESS_TOKEN_TTL);
    const refreshToken = this.signToken({ sub: user.id, email: user.email, type: 'refresh' }, env.JWT_REFRESH_TOKEN_TTL);

    await this.storeRefreshToken(user.id, refreshToken, replacedTokenId);

    return {
      user,
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenTtlMs,
      refreshExpiresIn: this.refreshTokenTtlMs,
    };
  }
}

export const authService = new AuthService();
