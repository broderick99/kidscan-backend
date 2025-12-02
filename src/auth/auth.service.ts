import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../email/email.service';
import { generateTeenCode } from '../common/utils/teen-code.util';
import { SendMagicLinkDto } from './dto/magic-link.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private databaseService: DatabaseService,
    private emailService: EmailService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(password, user.password_hash)) {
      const { password_hash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role 
    };
    
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.generateRefreshToken();
    
    // Store refresh token
    await this.storeRefreshToken(user.id, refreshToken);
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(data: {
    email: string;
    password: string;
    role: string;
    firstName: string;
    lastName: string;
    phone?: string;
    referredByTeenCode?: string;
  }) {
    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);
    
    // Create user and profile in transaction
    const result = await this.databaseService.transaction(async (client) => {
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, role, is_active, email_verified, created_at`,
        [data.email, hashedPassword, data.role]
      );
      const user = userResult.rows[0];
      
      // Generate teen code if registering as a teen
      let teenCode = null;
      if (data.role === 'teen') {
        // Keep trying until we get a unique code
        let attempts = 0;
        while (attempts < 10) {
          teenCode = generateTeenCode();
          const existing = await client.query(
            'SELECT id FROM profiles WHERE teen_code = $1',
            [teenCode]
          );
          if (existing.rows.length === 0) break;
          attempts++;
        }
        if (attempts === 10) {
          // Fallback to 5 character code if we can't find a unique 4 character one
          teenCode = generateTeenCode() + Math.floor(Math.random() * 10);
        }
      }

      // Look up referrer if teen code provided
      let referredBy = null;
      if (data.referredByTeenCode) {
        const referrerResult = await client.query(
          `SELECT user_id FROM profiles WHERE teen_code = $1`,
          [data.referredByTeenCode.toUpperCase()]
        );
        if (referrerResult.rows.length > 0) {
          referredBy = referrerResult.rows[0].user_id;
        }
      }

      // Create profile
      await client.query(
        `INSERT INTO profiles (user_id, first_name, last_name, phone, teen_code, referred_by) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, data.firstName, data.lastName, data.phone, teenCode, referredBy]
      );
      
      return user;
    });
    
    // Log them in
    return this.login(result);
  }

  async refresh(refreshToken: string) {
    // Verify refresh token exists and is valid
    const result = await this.databaseService.query(
      `SELECT user_id FROM refresh_tokens 
       WHERE token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );
    
    if (!result.rows[0]) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    
    // Get user
    const user = await this.usersService.findById(result.rows[0].user_id);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    
    // Generate new tokens
    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role 
    };
    
    const newAccessToken = this.jwtService.sign(payload);
    const newRefreshToken = this.generateRefreshToken();
    
    // Delete old refresh token and store new one
    await this.databaseService.transaction(async (client) => {
      await client.query(
        'DELETE FROM refresh_tokens WHERE token = $1',
        [refreshToken]
      );
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) 
         VALUES ($1, $2, $3)`,
        [user.id, newRefreshToken, this.getRefreshTokenExpiry()]
      );
    });
    
    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    await this.databaseService.query(
      'DELETE FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );
  }

  private generateRefreshToken(): string {
    return Buffer.from(
      `${Date.now()}-${Math.random().toString(36).substring(2)}`
    ).toString('base64');
  }

  private async storeRefreshToken(userId: number, token: string) {
    await this.databaseService.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) 
       VALUES ($1, $2, $3)`,
      [userId, token, this.getRefreshTokenExpiry()]
    );
  }

  private getRefreshTokenExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7); // 7 days
    return expiry;
  }

  async sendMagicLink(dto: SendMagicLinkDto) {
    const { email, mode, firstName, lastName, role, phone, referredByTeenCode } = dto;

    // Check if user exists for signin mode
    if (mode === 'signin') {
      const existingUser = await this.usersService.findByEmail(email);
      if (!existingUser) {
        throw new BadRequestException('No account found with this email address');
      }
    } else {
      // For signup mode, check if user already exists
      const existingUser = await this.usersService.findByEmail(email);
      if (existingUser) {
        throw new BadRequestException('An account with this email already exists');
      }

      // Validate required fields for signup
      if (!firstName || !lastName || !role) {
        throw new BadRequestException('First name, last name, and role are required for signup');
      }
    }

    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 15); // 15 minutes expiry

    // Store magic link in database
    await this.databaseService.query(
      `INSERT INTO magic_links (email, token, mode, user_data, expires_at) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        email,
        token,
        mode,
        mode === 'signup' ? JSON.stringify({ firstName, lastName, role, phone, referredByTeenCode }) : null,
        expires,
      ]
    );

    // Generate magic link URL
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
    const magicLink = `${frontendUrl}/auth/verify?token=${token}`;

    // Send email
    await this.emailService.sendMagicLink(email, magicLink, mode);

    return { success: true, message: 'Magic link sent successfully' };
  }

  async verifyMagicLink(token: string) {
    // Find valid magic link
    const result = await this.databaseService.query(
      `SELECT * FROM magic_links 
       WHERE token = $1 AND expires_at > NOW() AND used = false`,
      [token]
    );

    if (!result.rows[0]) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    const magicLinkData = result.rows[0];

    // Mark as used
    await this.databaseService.query(
      `UPDATE magic_links SET used = true WHERE id = $1`,
      [magicLinkData.id]
    );

    if (magicLinkData.mode === 'signin') {
      // Sign in existing user
      const user = await this.usersService.findByEmail(magicLinkData.email);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return this.login(user);
    } else {
      // Create new user for signup
      const userData = magicLinkData.user_data;
      
      // Generate a random password (user won't need it for magic link auth)
      const randomPassword = randomBytes(32).toString('hex');
      
      const authResult = await this.register({
        email: magicLinkData.email,
        password: randomPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        role: userData.role,
        referredByTeenCode: userData.referredByTeenCode,
      });

      // Add a flag to indicate this is a new signup that might need onboarding
      return {
        ...authResult,
        isNewSignup: true,
        userRole: userData.role,
      };
    }
  }

  async cleanupExpiredMagicLinks() {
    await this.databaseService.query(
      `DELETE FROM magic_links WHERE expires_at < NOW()`
    );
  }
}