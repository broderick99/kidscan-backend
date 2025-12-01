import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { UpdateReferralDto } from './dto/update-referral.dto';

@Injectable()
export class ReferralsService {
  constructor(
    private databaseService: DatabaseService,
    private paymentsService: PaymentsService,
  ) {}

  async create(referrerId: number, createReferralDto: CreateReferralDto) {
    // Check if email is already registered
    const existingUser = await this.databaseService.query(
      'SELECT id FROM users WHERE email = $1',
      [createReferralDto.referredEmail]
    );

    if (existingUser.rows[0]) {
      throw new ConflictException('This email is already registered');
    }

    // Check if referral already exists
    const existingReferral = await this.databaseService.query(
      'SELECT id FROM referrals WHERE referrer_id = $1 AND referred_email = $2',
      [referrerId, createReferralDto.referredEmail]
    );

    if (existingReferral.rows[0]) {
      throw new ConflictException('You have already referred this email');
    }

    // Set expiration date (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const result = await this.databaseService.query(
      `INSERT INTO referrals (referrer_id, referred_email, status, reward_amount, expires_at) 
       VALUES ($1, $2, 'pending', $3, $4) 
       RETURNING *`,
      [
        referrerId,
        createReferralDto.referredEmail,
        createReferralDto.rewardAmount || 10.00,
        expiresAt,
      ]
    );
    
    return result.rows[0];
  }

  async findAll(filters?: {
    referrerId?: number;
    status?: string;
  }) {
    let query = `
      SELECT r.*,
             u.email as referrer_email,
             p.first_name as referrer_first_name,
             p.last_name as referrer_last_name,
             ru.email as referred_user_email,
             rp.first_name as referred_first_name,
             rp.last_name as referred_last_name
      FROM referrals r
      LEFT JOIN users u ON r.referrer_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN users ru ON r.referred_user_id = ru.id
      LEFT JOIN profiles rp ON ru.id = rp.user_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (filters?.referrerId) {
      query += ` AND r.referrer_id = $${paramCount}`;
      values.push(filters.referrerId);
      paramCount++;
    }

    if (filters?.status) {
      query += ` AND r.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    query += ' ORDER BY r.created_at DESC';
    
    const result = await this.databaseService.query(query, values);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.databaseService.query(
      `SELECT r.*,
              u.email as referrer_email,
              p.first_name as referrer_first_name,
              p.last_name as referrer_last_name,
              ru.email as referred_user_email,
              rp.first_name as referred_first_name,
              rp.last_name as referred_last_name
       FROM referrals r
       LEFT JOIN users u ON r.referrer_id = u.id
       LEFT JOIN profiles p ON u.id = p.user_id
       LEFT JOIN users ru ON r.referred_user_id = ru.id
       LEFT JOIN profiles rp ON ru.id = rp.user_id
       WHERE r.id = $1`,
      [id]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Referral not found');
    }
    
    return result.rows[0];
  }

  async findByReferrer(referrerId: number) {
    return this.findAll({ referrerId });
  }

  async update(id: number, updateReferralDto: UpdateReferralDto) {
    const referral = await this.findOne(id);
    
    // Only allow updating certain fields based on status
    if (referral.status !== 'pending' && updateReferralDto.status) {
      throw new BadRequestException('Cannot update status of non-pending referral');
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMapping = {
      referredUserId: 'referred_user_id',
      rewardAmount: 'reward_amount',
      expiresAt: 'expires_at',
      completedAt: 'completed_at',
    };

    Object.entries(updateReferralDto).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField = fieldMapping[key] || key;
        fields.push(`${dbField} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findOne(id);
    }

    values.push(id);
    const result = await this.databaseService.query(
      `UPDATE referrals 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Referral not found');
    }

    return result.rows[0];
  }

  async markAsRegistered(referredEmail: string, referredUserId: number) {
    const result = await this.databaseService.query(
      `UPDATE referrals 
       SET status = 'registered', 
           referred_user_id = $1
       WHERE referred_email = $2 
         AND status = 'pending'
         AND expires_at > NOW()
       RETURNING *`,
      [referredUserId, referredEmail]
    );

    return result.rows[0];
  }

  async complete(id: number) {
    const referral = await this.findOne(id);
    
    if (referral.status !== 'registered') {
      throw new BadRequestException('Referral must be in registered status to complete');
    }

    const result = await this.databaseService.transaction(async (client) => {
      // Update referral status
      const referralResult = await client.query(
        `UPDATE referrals 
         SET status = 'completed', 
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      // Create payment for referrer
      await this.paymentsService.create({
        teenId: referral.referrer_id,
        amount: referral.reward_amount,
        type: 'referral',
        status: 'pending',
        description: `Referral bonus for ${referral.referred_email}`,
        referenceId: id,
        referenceType: 'referral',
      });

      return referralResult.rows[0];
    });

    return result;
  }

  async expire() {
    const result = await this.databaseService.query(
      `UPDATE referrals 
       SET status = 'expired'
       WHERE status = 'pending' 
         AND expires_at <= NOW()
       RETURNING id`
    );

    return {
      expired: result.rowCount,
      referralIds: result.rows.map(r => r.id),
    };
  }

  async getStats(referrerId: number) {
    const result = await this.databaseService.query(
      `SELECT 
         COUNT(*) as total_referrals,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_referrals,
         COUNT(*) FILTER (WHERE status = 'registered') as registered_referrals,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_referrals,
         COUNT(*) FILTER (WHERE status = 'expired') as expired_referrals,
         COALESCE(SUM(reward_amount) FILTER (WHERE status = 'completed'), 0) as total_earned
       FROM referrals
       WHERE referrer_id = $1`,
      [referrerId]
    );
    
    return result.rows[0];
  }

  async getLeaderboard(limit = 10) {
    const result = await this.databaseService.query(
      `SELECT 
         u.id,
         u.email,
         p.first_name,
         p.last_name,
         p.avatar_url,
         COUNT(r.id) as total_referrals,
         COUNT(r.id) FILTER (WHERE r.status = 'completed') as successful_referrals,
         COALESCE(SUM(r.reward_amount) FILTER (WHERE r.status = 'completed'), 0) as total_earned
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       LEFT JOIN referrals r ON u.id = r.referrer_id
       WHERE u.role = 'teen'
       GROUP BY u.id, u.email, p.first_name, p.last_name, p.avatar_url
       HAVING COUNT(r.id) > 0
       ORDER BY successful_referrals DESC, total_referrals DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }
}