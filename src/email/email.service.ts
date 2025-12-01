import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async sendMagicLink(email: string, magicLink: string, mode: 'signin' | 'signup') {
    const appName = 'Kids Can';
    const subject = mode === 'signin' 
      ? `Sign in to ${appName}` 
      : `Complete your ${appName} account setup`;

    const text = mode === 'signin'
      ? `Click the link below to sign in to your ${appName} account:\n\n${magicLink}\n\nThis link will expire in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`
      : `Welcome to ${appName}! Click the link below to complete your account setup:\n\n${magicLink}\n\nThis link will expire in 15 minutes.\n\nIf you didn't create an account, you can safely ignore this email.`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="min-width: 100%; background-color: #f8f9fa;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding: 40px 20px 20px; border-bottom: 1px solid #e9ecef;">
                      <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #14b8a6;">Kids Can</h1>
                      <p style="margin: 8px 0 0; font-size: 14px; color: #6c757d;">Connecting teens with trash service opportunities</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 40px 30px;">
                      <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #212529; text-align: center;">
                        ${mode === 'signin' ? 'Sign in to your account' : 'Complete your account setup'}
                      </h2>
                      
                      <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.5; color: #495057; text-align: center;">
                        ${mode === 'signin' 
                          ? 'Click the button below to securely sign in to your Kids Can account.'
                          : 'Welcome to Kids Can! Click the button below to complete setting up your account and get started.'}
                      </p>
                      
                      <!-- CTA Button -->
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td align="center">
                            <a href="${magicLink}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: ${mode === 'signin' ? '#14b8a6' : '#10b981'}; text-decoration: none; border-radius: 6px; transition: background-color 0.3s;">
                              ${mode === 'signin' ? 'Sign In to Kids Can' : 'Complete Setup'}
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Alternative Link -->
                      <p style="margin: 30px 0 0; font-size: 14px; color: #6c757d; text-align: center;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 8px 0 0; font-size: 14px; color: #14b8a6; word-break: break-all; text-align: center;">
                        ${magicLink}
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e9ecef; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                      <p style="margin: 0 0 8px; font-size: 13px; color: #6c757d; text-align: center;">
                        <strong>This link will expire in 15 minutes</strong> for your security.
                      </p>
                      <p style="margin: 0; font-size: 13px; color: #6c757d; text-align: center;">
                        ${mode === 'signin' 
                          ? "If you didn't request this sign-in link, you can safely ignore this email."
                          : "If you didn't create a Kids Can account, you can safely ignore this email."}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    // Log in development
    if (this.configService.get('NODE_ENV') === 'development' && !this.resend) {
      console.log('=== MAGIC LINK EMAIL ===');
      console.log(`To: ${email}`);
      console.log(`Subject: ${subject}`);
      console.log(`Magic Link: ${magicLink}`);
      console.log('========================');
      console.log('⚠️  Resend API key not configured. Set RESEND_API_KEY to send real emails.');
      return { success: true };
    }

    // Send email via Resend
    try {
      if (!this.resend) {
        throw new Error('Email service not configured. Please set RESEND_API_KEY.');
      }

      const fromEmail = this.configService.get<string>('EMAIL_FROM') || 'noreply@kidscan.app';
      
      await this.resend.emails.send({
        from: fromEmail,
        to: email,
        subject,
        text,
        html,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to send magic link email:', error);
      throw new Error('Failed to send email. Please try again.');
    }
  }

  async sendWelcomeEmail(email: string, firstName: string) {
    const appName = 'Kids Can';
    const subject = `Welcome to ${appName}!`;
    const text = `Hi ${firstName},\n\nWelcome to ${appName}! We're excited to have you join our community.\n\nBest regards,\nThe ${appName} Team`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="min-width: 100%; background-color: #f8f9fa;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding: 40px 20px 20px; border-bottom: 1px solid #e9ecef;">
                      <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #14b8a6;">Kids Can</h1>
                      <p style="margin: 8px 0 0; font-size: 14px; color: #6c757d;">Connecting teens with trash service opportunities</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 40px 30px;">
                      <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #212529;">Welcome to Kids Can, ${firstName}!</h2>
                      
                      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #495057;">
                        We're thrilled to have you join our community. Kids Can connects responsible teens with homeowners who need help with their trash service.
                      </p>
                      
                      <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #495057;">
                        Whether you're a teen looking to earn money or a homeowner seeking reliable help, you're in the right place!
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e9ecef; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                      <p style="margin: 0; font-size: 13px; color: #6c757d; text-align: center;">
                        Best regards,<br>The Kids Can Team
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    
    // Log in development
    if (this.configService.get('NODE_ENV') === 'development' && !this.resend) {
      console.log('=== WELCOME EMAIL ===');
      console.log(`To: ${email}`);
      console.log(`Subject: ${subject}`);
      console.log('=====================');
      return { success: true };
    }

    // Send email via Resend
    try {
      if (!this.resend) {
        // Skip welcome email if email service not configured
        console.warn('Welcome email skipped - Resend not configured');
        return { success: true };
      }

      const fromEmail = this.configService.get<string>('EMAIL_FROM') || 'noreply@kidscan.app';
      
      await this.resend.emails.send({
        from: fromEmail,
        to: email,
        subject,
        text,
        html,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Don't throw error for welcome emails - they're not critical
      return { success: false };
    }
  }
}