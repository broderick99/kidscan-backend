import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private databaseService: DatabaseService) {}

  async create(createUserDto: CreateUserDto) {
    const result = await this.databaseService.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, role, is_active, email_verified, created_at`,
      [createUserDto.email, createUserDto.password_hash, createUserDto.role]
    );
    return result.rows[0];
  }

  async findAll() {
    const result = await this.databaseService.query(
      `SELECT u.id, u.email, u.role, u.is_active, u.email_verified, 
              u.created_at, u.updated_at,
              p.first_name, p.last_name, p.phone, p.avatar_url
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       ORDER BY u.created_at DESC`
    );
    return result.rows;
  }

  async findById(id: number) {
    const result = await this.databaseService.query(
      `SELECT u.id, u.email, u.role, u.is_active, u.email_verified, 
              u.created_at, u.updated_at, u.password_hash,
              p.first_name, p.last_name, p.phone, p.date_of_birth,
              p.avatar_url, p.bio, p.address_line1, p.address_line2,
              p.city, p.state, p.zip_code
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [id]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('User not found');
    }
    
    return result.rows[0];
  }

  async findByEmail(email: string) {
    const result = await this.databaseService.query(
      `SELECT u.*, p.first_name, p.last_name
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.email = $1`,
      [email]
    );
    return result.rows[0];
  }

  async findTeenByCode(code: string) {
    const result = await this.databaseService.query(
      `SELECT u.id, u.email, u.role, p.first_name, p.last_name, p.teen_code
       FROM users u
       INNER JOIN profiles p ON u.id = p.user_id
       WHERE p.teen_code = $1 AND u.role = 'teen'`,
      [code]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Teen not found with this code');
    }
    
    return result.rows[0];
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updateUserDto).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await this.databaseService.query(
      `UPDATE users 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, email, role, is_active, email_verified, created_at, updated_at`,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundException('User not found');
    }

    return result.rows[0];
  }

  async remove(id: number) {
    const result = await this.databaseService.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (!result.rows[0]) {
      throw new NotFoundException('User not found');
    }

    return { message: 'User deleted successfully' };
  }

  async findByRole(role: string) {
    const result = await this.databaseService.query(
      `SELECT u.id, u.email, u.role, u.is_active, u.created_at,
              p.first_name, p.last_name, p.phone, p.avatar_url
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.role = $1
       ORDER BY u.created_at DESC`,
      [role]
    );
    return result.rows;
  }
}