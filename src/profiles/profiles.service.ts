import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { generateTeenCode } from '../common/utils/teen-code.util';

@Injectable()
export class ProfilesService {
  constructor(private databaseService: DatabaseService) {}

  async create(userId: number, createProfileDto: CreateProfileDto) {
    const result = await this.databaseService.query(
      `INSERT INTO profiles (user_id, first_name, last_name, phone, date_of_birth,
                            avatar_url, bio, address_line1, address_line2,
                            city, state, zip_code) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *, teen_code`,
      [
        userId,
        createProfileDto.firstName,
        createProfileDto.lastName,
        createProfileDto.phone,
        createProfileDto.dateOfBirth,
        createProfileDto.avatarUrl,
        createProfileDto.bio,
        createProfileDto.addressLine1,
        createProfileDto.addressLine2,
        createProfileDto.city,
        createProfileDto.state,
        createProfileDto.zipCode,
      ]
    );
    return result.rows[0];
  }

  async findByUserId(userId: number) {
    const result = await this.databaseService.query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [userId]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Profile not found');
    }
    
    return result.rows[0];
  }

  async update(userId: number, updateProfileDto: UpdateProfileDto) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMapping = {
      firstName: 'first_name',
      lastName: 'last_name',
      dateOfBirth: 'date_of_birth',
      avatarUrl: 'avatar_url',
      addressLine1: 'address_line1',
      addressLine2: 'address_line2',
      zipCode: 'zip_code',
    };

    Object.entries(updateProfileDto).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField = fieldMapping[key] || key;
        fields.push(`${dbField} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findByUserId(userId);
    }

    values.push(userId);
    const result = await this.databaseService.query(
      `UPDATE profiles 
       SET ${fields.join(', ')}
       WHERE user_id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Profile not found');
    }

    return result.rows[0];
  }

  async uploadAvatar(userId: number, avatarUrl: string) {
    const result = await this.databaseService.query(
      `UPDATE profiles 
       SET avatar_url = $1
       WHERE user_id = $2
       RETURNING *`,
      [avatarUrl, userId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Profile not found');
    }

    return result.rows[0];
  }

  async generateTeenCode(userId: number, userRole: string) {
    // Check if user is a teen
    if (userRole !== 'teen') {
      throw new BadRequestException('Only teens can have teen codes');
    }

    // Check if user already has a teen code
    const profile = await this.findByUserId(userId);
    if (profile.teen_code) {
      throw new BadRequestException('User already has a teen code');
    }

    // Generate a unique teen code
    let teenCode = null;
    let attempts = 0;
    
    while (attempts < 10) {
      teenCode = generateTeenCode();
      const existing = await this.databaseService.query(
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

    // Update the profile with the teen code
    const result = await this.databaseService.query(
      `UPDATE profiles 
       SET teen_code = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING *`,
      [teenCode, userId]
    );

    return result.rows[0];
  }

  async findByTeenCode(teenCode: string) {
    const result = await this.databaseService.query(
      `SELECT p.*, u.role 
       FROM profiles p
       JOIN users u ON p.user_id = u.id
       WHERE p.teen_code = $1`,
      [teenCode.toUpperCase()]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Teen not found with this code');
    }
    
    // Verify this is actually a teen account
    if (result.rows[0].role !== 'teen') {
      throw new BadRequestException('This code does not belong to a teen');
    }
    
    return result.rows[0];
  }

  async getReferralStats(userId: number) {
    // Get the teen's profile to get their user_id
    const profile = await this.findByUserId(userId);
    
    // Count friend referrals (teens who were referred by this teen)
    const friendResult = await this.databaseService.query(
      `SELECT COUNT(*) as count
       FROM profiles p
       JOIN users u ON p.user_id = u.id
       WHERE p.referred_by = $1 AND u.role = 'teen'`,
      [userId]
    );
    
    // Count neighbor referrals (homeowners who have services with this teen)
    const neighborResult = await this.databaseService.query(
      `SELECT COUNT(DISTINCT s.home_id) as count
       FROM services s
       WHERE s.teen_id = $1 AND s.status = 'active'`,
      [userId]
    );
    
    return {
      friendReferrals: parseInt(friendResult.rows[0].count) || 0,
      neighborReferrals: parseInt(neighborResult.rows[0].count) || 0,
      teenCode: profile.teen_code
    };
  }
}