import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SafeUser } from '../shared/types.js';

export const ACCESS_COOKIE = 'access_token';

type AuthRequest = Request & { user?: SafeUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException();
    }

    let payload: { sub?: unknown };
    try {
      payload = await this.jwtService.verifyAsync<{ sub?: unknown }>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      response.clearCookie(ACCESS_COOKIE, { path: '/' });
      throw new UnauthorizedException();
    }
    if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub)) {
      response.clearCookie(ACCESS_COOKIE, { path: '/' });
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      response.clearCookie(ACCESS_COOKIE, { path: '/' });
      throw new UnauthorizedException();
    }
    request.user = user;
    return true;
  }
}
