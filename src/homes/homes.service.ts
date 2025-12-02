import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';

@Injectable()
export class HomesService {
  constructor(private databaseService: DatabaseService) {}

  async create(homeownerId: number, createHomeDto: CreateHomeDto) {
    const result = await this.databaseService.query(
      `INSERT INTO homes (homeowner_id, name, address_line1, address_line2,
                         city, state, zip_code, special_instructions) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        homeownerId,
        createHomeDto.name,
        createHomeDto.addressLine1,
        createHomeDto.addressLine2,
        createHomeDto.city,
        createHomeDto.state,
        createHomeDto.zipCode,
        createHomeDto.specialInstructions,
      ]
    );
    return result.rows[0];
  }

  async findAll(homeownerId?: number) {
    let query = `
      SELECT h.*, 
             COUNT(DISTINCT s.id) as service_count,
             u.email as homeowner_email,
             p.first_name as homeowner_first_name,
             p.last_name as homeowner_last_name
      FROM homes h
      LEFT JOIN services s ON h.id = s.home_id AND s.status = 'active'
      LEFT JOIN users u ON h.homeowner_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
    `;
    
    const values = [];
    if (homeownerId) {
      query += ' WHERE h.homeowner_id = $1';
      values.push(homeownerId);
    }
    
    query += ' GROUP BY h.id, u.email, p.first_name, p.last_name ORDER BY h.created_at DESC';
    
    const result = await this.databaseService.query(query, values);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.databaseService.query(
      `SELECT h.*, 
              u.email as homeowner_email,
              p.first_name as homeowner_first_name,
              p.last_name as homeowner_last_name
       FROM homes h
       LEFT JOIN users u ON h.homeowner_id = u.id
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE h.id = $1`,
      [id]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Home not found');
    }
    
    return result.rows[0];
  }

  async findByHomeowner(homeownerId: number) {
    const result = await this.databaseService.query(
      `SELECT h.*, COUNT(s.id) as active_services
       FROM homes h
       LEFT JOIN services s ON h.id = s.home_id AND s.status = 'active'
       WHERE h.homeowner_id = $1
       GROUP BY h.id
       ORDER BY h.created_at DESC`,
      [homeownerId]
    );
    return result.rows;
  }

  async update(id: number, homeownerId: number, updateHomeDto: UpdateHomeDto, isAdmin = false) {
    // Verify ownership if not admin
    if (!isAdmin) {
      const home = await this.findOne(id);
      if (home.homeowner_id !== homeownerId) {
        throw new ForbiddenException('You can only update your own homes');
      }
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMapping = {
      addressLine1: 'address_line1',
      addressLine2: 'address_line2',
      zipCode: 'zip_code',
      specialInstructions: 'special_instructions',
      isActive: 'is_active',
      seekingHelper: 'seeking_helper',
      seekingHelperRequestedAt: 'seeking_helper_requested_at',
    };

    Object.entries(updateHomeDto).forEach(([key, value]) => {
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
      `UPDATE homes 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Home not found');
    }

    return result.rows[0];
  }

  async remove(id: number, homeownerId: number, isAdmin = false) {
    // Verify ownership if not admin
    if (!isAdmin) {
      const home = await this.findOne(id);
      if (home.homeowner_id !== homeownerId) {
        throw new ForbiddenException('You can only delete your own homes');
      }
    }

    // Check for active services
    const servicesResult = await this.databaseService.query(
      'SELECT COUNT(*) as count FROM services WHERE home_id = $1 AND status = \'active\'',
      [id]
    );

    if (parseInt(servicesResult.rows[0].count) > 0) {
      throw new ForbiddenException('Cannot delete home with active services');
    }

    const result = await this.databaseService.query(
      'DELETE FROM homes WHERE id = $1 RETURNING id',
      [id]
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Home not found');
    }

    return { message: 'Home deleted successfully' };
  }

  async getServices(homeId: number) {
    const result = await this.databaseService.query(
      `SELECT s.*, 
              u.email as teen_email,
              p.first_name as teen_first_name,
              p.last_name as teen_last_name,
              p.phone as teen_phone
       FROM services s
       LEFT JOIN users u ON s.teen_id = u.id
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE s.home_id = $1
       ORDER BY s.created_at DESC`,
      [homeId]
    );
    return result.rows;
  }
}