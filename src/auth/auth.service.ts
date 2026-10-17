import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import * as s3 from '../lib/s3';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private signToken(user: { id: string; email: string }) {
    return this.jwt.sign({ sub: user.id, email: user.email });
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: hashed, name: dto.name },
    });

    return { token: this.signToken(user), user: { id: user.id, email: user.email, name: user.name } };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return { token: this.signToken(user), user: { id: user.id, email: user.email, name: user.name } };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        avatarDisplayUrl: await this.resolveAvatarUrl(user.avatarUrl),
      },
    };
  }

  /**
   * user.avatarUrl stores the S3 cloud_storage_path (not a browsable URL).
   * This turns it into something an <Image> can actually load. Plain http(s)
   * values are passed through untouched so Google SSO avatars keep working.
   */
  private async resolveAvatarUrl(path?: string | null): Promise<string | null> {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    try {
      return await s3.getFileUrl(path, true);
    } catch (e) {
      return null;
    }
  }

  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    const payload: { name?: string; avatarUrl?: string } = {};
    if (typeof data?.name === 'string' && data.name.trim()) payload.name = data.name.trim();
    if (typeof data?.avatarUrl === 'string') payload.avatarUrl = data.avatarUrl;
    const user = await this.prisma.user.update({ where: { id: userId }, data: payload });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        avatarDisplayUrl: await this.resolveAvatarUrl(user.avatarUrl),
      },
    };
  }

  // Google SSO
  /**
   * Where the login result (token + user) may be sent back to. Without this
   * check any site could start a login with its own redirect_uri and receive
   * the user's token. Allowed: the app's own scheme(s) and the server origin.
   */
  private isAllowedRedirect(redirectUri: string): boolean {
    const origin = (this.config.get<string>('APP_ORIGIN') || '').replace(/\/$/, '');
    const extra = (this.config.get<string>('GOOGLE_ALLOWED_REDIRECTS') || 'volumx:')
      .split(',').map((x) => x.trim()).filter(Boolean);
    const allowed = [...extra, ...(origin ? [`${origin}/`] : [])];
    return allowed.some((prefix) => redirectUri?.startsWith(prefix));
  }

  /** Best-effort: the app redirect inside a state, for sending errors back to the phone. */
  redirectFromState(state?: string): string | null {
    try {
      const { redirectUri } = this.verifyState(state ?? '');
      return redirectUri && this.isAllowedRedirect(redirectUri) ? redirectUri : null;
    } catch {
      return null;
    }
  }

  getGoogleAuthUrl(redirectUri: string) {
    if (!this.isAllowedRedirect(redirectUri)) {
      throw new BadRequestException('redirect_uri não permitido');
    }
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new BadRequestException('Login Google não configurado no servidor (GOOGLE_CLIENT_ID).');
    const appOrigin = this.config.get<string>('APP_ORIGIN') || 'http://localhost:3000/';
    const callbackUrl = new URL('/api/auth/google/callback', appOrigin).toString();

    const state = this.signState({ redirectUri });

    const params = new URLSearchParams({
      client_id: clientId || '',
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(code: string, state: string) {
    const { redirectUri } = this.verifyState(state);
    if (!this.isAllowedRedirect(redirectUri)) throw new BadRequestException('redirect_uri não permitido');
    const appOrigin = this.config.get<string>('APP_ORIGIN') || 'http://localhost:3000/';
    const callbackUrl = new URL('/api/auth/google/callback', appOrigin).toString();

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) {
      this.logger.error('Google token exchange failed', tokenData);
      throw new BadRequestException('Google authentication failed');
    }

    // Verify ID token
    const { OAuth2Client } = await import('google-auth-library');
    const oauth2Client = new OAuth2Client(clientId);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokenData.id_token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email_verified) {
      throw new BadRequestException('Email not verified by Google');
    }

    const user = await this.upsertGoogleUser(payload);
    const token = this.signToken(user);
    const userJson = encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, name: user.name }));

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('user', userJson);
    return redirectUrl.toString();
  }

  /** What the app needs to start native Google Sign-In. */
  getGoogleConfig() {
    const webClientId = this.config.get<string>('GOOGLE_CLIENT_ID') || null;
    return { enabled: !!webClientId, webClientId };
  }

  /**
   * Native Google Sign-In: the phone signs in with Google directly and sends
   * the ID token here. Unlike the browser redirect flow, this needs no public
   * HTTPS address for the server — it works with a server on the home Wi-Fi.
   */
  async loginWithGoogleIdToken(idToken: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new BadRequestException('Login Google não configurado no servidor.');
    if (!idToken) throw new BadRequestException('Token do Google ausente.');
    const { OAuth2Client } = await import('google-auth-library');
    const oauth2Client = new OAuth2Client(clientId);
    let payload: any;
    try {
      const ticket = await oauth2Client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch (e: any) {
      this.logger.warn(`Google ID token rejected: ${e?.message}`);
      throw new UnauthorizedException('Login Google inválido. Tente de novo.');
    }
    if (!payload?.email || !payload.email_verified) throw new UnauthorizedException('E-mail do Google não verificado.');
    const user = await this.upsertGoogleUser(payload);
    return { token: this.signToken(user), user: { id: user.id, email: user.email, name: user.name } };
  }

  private async upsertGoogleUser(payload: { sub: string; email?: string; name?: string; picture?: string }) {
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
    });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: payload.sub,
          avatarUrl: user.avatarUrl || payload.picture,
          name: user.name || payload.name || payload.email!,
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: payload.email!,
          name: payload.name || payload.email!,
          googleId: payload.sub,
          avatarUrl: payload.picture,
        },
      });
    }
    return user;
  }

  private signState(data: Record<string, string>): string {
    const payload = JSON.stringify(data);
    const encoded = Buffer.from(payload).toString('base64url');
    const secret = this.config.get<string>('JWT_SECRET')!;
    const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  private verifyState(state: string): Record<string, string> {
    const [encoded, sig] = (state ?? '').split('.');
    if (!encoded || !sig) throw new BadRequestException('Invalid state parameter');
    const secret = this.config.get<string>('JWT_SECRET')!;
    const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    if (sig !== expected) throw new BadRequestException('Invalid state parameter');
    return JSON.parse(Buffer.from(encoded, 'base64url').toString());
  }
}
