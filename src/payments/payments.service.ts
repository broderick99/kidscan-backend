import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private databaseService: DatabaseService) {}

  async create(createPaymentDto: CreatePaymentDto) {
    const result = await this.databaseService.query(
      `INSERT INTO payments (teen_id, amount, type, status, description, reference_id, reference_type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        createPaymentDto.teenId,
        createPaymentDto.amount,
        createPaymentDto.type,
        createPaymentDto.status || 'pending',
        createPaymentDto.description,
        createPaymentDto.referenceId,
        createPaymentDto.referenceType,
      ]
    );
    return result.rows[0];
  }

  async findAll(filters?: {
    teenId?: number;
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }) {
    let query = `
      SELECT p.*,
             u.email as teen_email,
             pr.first_name as teen_first_name,
             pr.last_name as teen_last_name
      FROM payments p
      LEFT JOIN users u ON p.teen_id = u.id
      LEFT JOIN profiles pr ON u.id = pr.user_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (filters?.teenId) {
      query += ` AND p.teen_id = $${paramCount}`;
      values.push(filters.teenId);
      paramCount++;
    }

    if (filters?.status) {
      query += ` AND p.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters?.type) {
      query += ` AND p.type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    if (filters?.startDate) {
      query += ` AND p.created_at >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters?.endDate) {
      query += ` AND p.created_at <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    query += ' ORDER BY p.created_at DESC';
    
    const result = await this.databaseService.query(query, values);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.databaseService.query(
      `SELECT p.*,
              u.email as teen_email,
              pr.first_name as teen_first_name,
              pr.last_name as teen_last_name,
              pr.phone as teen_phone
       FROM payments p
       LEFT JOIN users u ON p.teen_id = u.id
       LEFT JOIN profiles pr ON u.id = pr.user_id
       WHERE p.id = $1`,
      [id]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Payment not found');
    }
    
    return result.rows[0];
  }

  async findByTeen(teenId: number) {
    return this.findAll({ teenId });
  }

  async process(id: number, processPaymentDto: ProcessPaymentDto) {
    const payment = await this.findOne(id);
    
    if (payment.status !== 'pending') {
      throw new BadRequestException('Only pending payments can be processed');
    }

    const result = await this.databaseService.transaction(async (client) => {
      // Update payment status
      const paymentResult = await client.query(
        `UPDATE payments 
         SET status = $1, 
             processed_at = CURRENT_TIMESTAMP,
             failure_reason = $2
         WHERE id = $3
         RETURNING *`,
        [
          processPaymentDto.status,
          processPaymentDto.failureReason,
          id,
        ]
      );

      // If payment is completed, update earnings
      if (processPaymentDto.status === 'completed') {
        // Get current period (current month)
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Update or insert earnings record
        await client.query(
          `INSERT INTO earnings (teen_id, period_start, period_end, total_earned, total_paid)
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT (teen_id, period_start, period_end)
           DO UPDATE SET 
             total_earned = earnings.total_earned + $4,
             total_paid = earnings.total_paid + $4`,
          [
            payment.teen_id,
            periodStart.toISOString().split('T')[0],
            periodEnd.toISOString().split('T')[0],
            payment.amount,
          ]
        );
      }

      return paymentResult.rows[0];
    });

    return result;
  }

  async processBatch(paymentIds: number[]) {
    const results = await Promise.all(
      paymentIds.map(async (id) => {
        try {
          return await this.process(id, { status: 'completed' });
        } catch (error) {
          return {
            id,
            error: error.message,
          };
        }
      })
    );

    return {
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error),
    };
  }

  async getPendingPayments(teenId?: number) {
    const filters: any = { status: 'pending' };
    if (teenId) {
      filters.teenId = teenId;
    }
    return this.findAll(filters);
  }

  async getPaymentSummary(teenId: number, startDate?: string, endDate?: string) {
    let query = `
      SELECT 
        COUNT(*) as total_payments,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_payments,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_payments,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_payments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) as total_paid,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(amount) FILTER (WHERE type = 'task_completion'), 0) as task_earnings,
        COALESCE(SUM(amount) FILTER (WHERE type = 'bonus'), 0) as bonus_earnings,
        COALESCE(SUM(amount) FILTER (WHERE type = 'referral'), 0) as referral_earnings
      FROM payments
      WHERE teen_id = $1
    `;
    
    const values: any[] = [teenId];
    let paramCount = 2;

    if (startDate) {
      query += ` AND created_at >= $${paramCount}`;
      values.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramCount}`;
      values.push(endDate);
      paramCount++;
    }

    const result = await this.databaseService.query(query, values);
    return result.rows[0];
  }
}