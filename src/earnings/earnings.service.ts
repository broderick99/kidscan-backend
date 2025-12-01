import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EarningsService {
  constructor(private databaseService: DatabaseService) {}

  async findAll(teenId?: number, year?: number) {
    let query = `
      SELECT e.*,
             u.email as teen_email,
             p.first_name as teen_first_name,
             p.last_name as teen_last_name
      FROM earnings e
      LEFT JOIN users u ON e.teen_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (teenId) {
      query += ` AND e.teen_id = $${paramCount}`;
      values.push(teenId);
      paramCount++;
    }

    if (year) {
      query += ` AND EXTRACT(YEAR FROM e.period_start) = $${paramCount}`;
      values.push(year);
      paramCount++;
    }

    query += ' ORDER BY e.period_start DESC';
    
    const result = await this.databaseService.query(query, values);
    return result.rows;
  }

  async findByTeen(teenId: number, year?: number) {
    return this.findAll(teenId, year);
  }

  async getCurrentPeriod(teenId: number) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const result = await this.databaseService.query(
      `SELECT * FROM earnings 
       WHERE teen_id = $1 
         AND period_start = $2 
         AND period_end = $3`,
      [
        teenId,
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
      ]
    );

    if (!result.rows[0]) {
      // Create new earnings record if it doesn't exist
      const createResult = await this.databaseService.query(
        `INSERT INTO earnings (teen_id, period_start, period_end, total_earned, total_paid, pending_amount)
         VALUES ($1, $2, $3, 0, 0, 0)
         RETURNING *`,
        [
          teenId,
          periodStart.toISOString().split('T')[0],
          periodEnd.toISOString().split('T')[0],
        ]
      );
      return createResult.rows[0];
    }

    return result.rows[0];
  }

  async getYearToDate(teenId: number) {
    const currentYear = new Date().getFullYear();
    
    const result = await this.databaseService.query(
      `SELECT 
         COALESCE(SUM(total_earned), 0) as total_earned,
         COALESCE(SUM(total_paid), 0) as total_paid,
         COALESCE(SUM(pending_amount), 0) as pending_amount,
         COUNT(*) as periods_count
       FROM earnings
       WHERE teen_id = $1 
         AND EXTRACT(YEAR FROM period_start) = $2`,
      [teenId, currentYear]
    );
    
    return {
      year: currentYear,
      ...result.rows[0],
    };
  }

  async getBreakdown(teenId: number, periodStart: string, periodEnd: string) {
    const result = await this.databaseService.query(
      `SELECT 
         type,
         COUNT(*) as payment_count,
         COALESCE(SUM(amount), 0) as total_amount
       FROM payments
       WHERE teen_id = $1
         AND created_at >= $2
         AND created_at <= $3
         AND status = 'completed'
       GROUP BY type`,
      [teenId, periodStart, periodEnd]
    );

    const breakdown = result.rows.reduce((acc, row) => {
      acc[row.type] = {
        count: parseInt(row.payment_count),
        amount: parseFloat(row.total_amount),
      };
      return acc;
    }, {});

    // Get task details
    const taskResult = await this.databaseService.query(
      `SELECT 
         s.name as service_name,
         COUNT(t.id) as task_count,
         SUM(t.price_per_task) as total_earned
       FROM tasks t
       JOIN services s ON t.service_id = s.id
       WHERE s.teen_id = $1
         AND t.completed_at >= $2
         AND t.completed_at <= $3
         AND t.status = 'completed'
       GROUP BY s.id, s.name
       ORDER BY total_earned DESC`,
      [teenId, periodStart, periodEnd]
    );

    return {
      breakdown,
      tasksByService: taskResult.rows,
    };
  }

  async updatePendingAmounts() {
    // Update pending amounts for all earnings records
    const result = await this.databaseService.query(`
      UPDATE earnings e
      SET pending_amount = (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        WHERE p.teen_id = e.teen_id
          AND p.status = 'pending'
          AND p.created_at >= e.period_start
          AND p.created_at <= e.period_end
      )
      WHERE pending_amount != (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        WHERE p.teen_id = e.teen_id
          AND p.status = 'pending'
          AND p.created_at >= e.period_start
          AND p.created_at <= e.period_end
      )
      RETURNING *
    `);

    return {
      updated: result.rowCount,
      records: result.rows,
    };
  }

  async getTopEarners(limit = 10, period?: 'week' | 'month' | 'year') {
    let dateFilter = '';
    const now = new Date();

    switch (period) {
      case 'week':
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        dateFilter = `AND p.created_at >= '${weekAgo.toISOString()}'`;
        break;
      case 'month':
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        dateFilter = `AND p.created_at >= '${monthAgo.toISOString()}'`;
        break;
      case 'year':
        const yearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
        dateFilter = `AND p.created_at >= '${yearAgo.toISOString()}'`;
        break;
    }

    const result = await this.databaseService.query(
      `SELECT 
         u.id,
         u.email,
         pr.first_name,
         pr.last_name,
         pr.avatar_url,
         COALESCE(SUM(p.amount), 0) as total_earned,
         COUNT(DISTINCT p.id) as payment_count,
         COUNT(DISTINCT s.id) as active_services
       FROM users u
       LEFT JOIN profiles pr ON u.id = pr.user_id
       LEFT JOIN payments p ON u.id = p.teen_id AND p.status = 'completed' ${dateFilter}
       LEFT JOIN services s ON u.id = s.teen_id AND s.status = 'active'
       WHERE u.role = 'teen'
       GROUP BY u.id, u.email, pr.first_name, pr.last_name, pr.avatar_url
       ORDER BY total_earned DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }
}