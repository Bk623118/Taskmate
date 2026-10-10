import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SafeUser } from '../shared/types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const DUMMY_HASH =
  '$2a$12$RWi7FyBvurKin/H2pP2XAujijetQNRKepf7twyGumt.3MqOTAQsg.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterDto): Promise<{ user: SafeUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const password = await bcrypt.hash(input.password, 12);
    try {
      const user = await this.prisma.user.create({
        data: { name: input.name.trim(), email, password },
        select: { id: true, name: true, email: true },
      });
      return { user, token: await this.signToken(user.id) };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(input: LoginDto): Promise<{ user: SafeUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(
      input.password,
      user?.password ?? DUMMY_HASH,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return {
      user: { id: user.id, name: user.name, email: user.email },
      token: await this.signToken(user.id),
    };
  }

  private signToken(userId: number): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId },
      { algorithm: 'HS256', expiresIn: '7d' },
    );
  }
}
