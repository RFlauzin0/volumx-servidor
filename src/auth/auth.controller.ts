import { Controller, Post, Get, Patch, Body, UseGuards, Req, Query, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('Authentication')
@Controller('api')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register with email and password' })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('auth/login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@Req() req: Request) {
    return this.authService.getMe((req.user as any).id);
  }

  @Patch('auth/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile' })
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile((req.user as any).id, dto);
  }

  @Get('auth/google')
  @ApiOperation({ summary: 'Initiate Google OAuth' })
  @ApiQuery({ name: 'redirect_uri', required: true })
  async googleAuth(@Query('redirect_uri') redirectUri: string, @Res() res: Response) {
    const url = this.authService.getGoogleAuthUrl(redirectUri);
    return res.redirect(url);
  }

  @Get('auth/google/config')
  @ApiOperation({ summary: 'Google Sign-In settings for the app' })
  googleConfig() {
    return this.authService.getGoogleConfig();
  }

  @Post('auth/google/token')
  @ApiOperation({ summary: 'Log in with a Google ID token (native Google Sign-In)' })
  googleToken(@Body() body: any) {
    return this.authService.loginWithGoogleIdToken(body?.idToken);
  }

  @Get('auth/google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const redirectUrl = await this.authService.handleGoogleCallback(code, state);
      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error('Google callback error', error);
      // Send the error back to the app so it can show it, instead of leaving
      // the user stuck on a blank server page inside the login browser.
      const back = this.authService.redirectFromState(state);
      if (back) {
        const u = new URL(back);
        u.searchParams.set('error', 'google_auth_failed');
        return res.redirect(u.toString());
      }
      return res.redirect('/?error=google_auth_failed');
    }
  }
}
