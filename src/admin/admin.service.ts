import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  constructor(private databaseService: DatabaseService) {}

  async getAdminStats() {
    const client = await this.databaseService.getClient();
    try {
      await client.query('BEGIN');

      // Get user counts by role
      const userCountsResult = await client.query(`
        SELECT role, COUNT(*) as count 
        FROM users 
        GROUP BY role
      `);

      // Get total counts
      const totalCountsResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM homes) as total_homes,
          (SELECT COUNT(*) FROM services WHERE status = 'active') as active_services,
          (SELECT COUNT(*) FROM tasks WHERE status = 'completed') as completed_tasks,
          (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_week,
          (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_month
      `);

      await client.query('COMMIT');

      const userCounts = userCountsResult.rows.reduce((acc, row) => {
        acc[row.role] = parseInt(row.count);
        return acc;
      }, {});

      return {
        users: userCounts,
        totals: totalCountsResult.rows[0],
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserStats() {
    const result = await this.databaseService.query(`
      SELECT 
        u.id,
        u.email,
        u.role,
        u.created_at,
        p.first_name,
        p.last_name,
        p.teen_code,
        p.phone,
        p.city,
        p.state,
        p.referred_by,
        CASE 
          WHEN u.role = 'teen' THEN (SELECT COUNT(*) FROM services WHERE teen_id = u.id AND status = 'active')
          WHEN u.role = 'homeowner' THEN (SELECT COUNT(*) FROM homes WHERE homeowner_id = u.id)
          ELSE 0
        END as item_count,
        CASE 
          WHEN u.role = 'teen' THEN (SELECT COUNT(*) FROM tasks t JOIN services s ON t.service_id = s.id WHERE s.teen_id = u.id AND t.status = 'completed')
          WHEN u.role = 'homeowner' THEN (SELECT COUNT(*) FROM tasks t JOIN services s ON t.service_id = s.id JOIN homes h ON s.home_id = h.id WHERE h.homeowner_id = u.id AND t.status = 'completed')
          ELSE 0
        END as completed_tasks
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
      LIMIT 100
    `);

    return result.rows;
  }

  async getServiceStats() {
    const servicesResult = await this.databaseService.query(`
      SELECT 
        s.*,
        h.name as home_name,
        h.city,
        h.state,
        ho.email as homeowner_email,
        t.email as teen_email,
        p_ho.first_name as homeowner_first_name,
        p_ho.last_name as homeowner_last_name,
        p_t.first_name as teen_first_name,
        p_t.last_name as teen_last_name,
        p_t.teen_code,
        (SELECT COUNT(*) FROM tasks WHERE service_id = s.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE service_id = s.id AND status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE service_id = s.id AND status = 'pending') as pending_tasks
      FROM services s
      JOIN homes h ON s.home_id = h.id
      JOIN users ho ON h.homeowner_id = ho.id
      JOIN users t ON s.teen_id = t.id
      LEFT JOIN profiles p_ho ON ho.id = p_ho.user_id
      LEFT JOIN profiles p_t ON t.id = p_t.user_id
      ORDER BY s.created_at DESC
    `);

    const statsResult = await this.databaseService.query(`
      SELECT 
        COUNT(DISTINCT s.id) as total_services,
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END) as active_services,
        COUNT(DISTINCT CASE WHEN s.status = 'cancelled' THEN s.id END) as cancelled_services,
        COUNT(DISTINCT s.teen_id) as active_teens,
        COUNT(DISTINCT h.homeowner_id) as active_homeowners,
        AVG(s.price_per_task) as avg_price_per_task
      FROM services s
      JOIN homes h ON s.home_id = h.id
      WHERE s.status = 'active'
    `);

    return {
      services: servicesResult.rows,
      stats: statsResult.rows[0]
    };
  }

  async getRevenueStats() {
    // Get monthly revenue projections based on active services
    const monthlyResult = await this.databaseService.query(`
      SELECT 
        DATE_TRUNC('month', s.created_at) as month,
        COUNT(DISTINCT s.id) as active_services,
        SUM(s.price_per_task * 4) as monthly_revenue_projection,
        COUNT(DISTINCT s.teen_id) as active_teens,
        COUNT(DISTINCT h.homeowner_id) as active_homeowners
      FROM services s
      JOIN homes h ON s.home_id = h.id
      WHERE s.status = 'active'
      GROUP BY DATE_TRUNC('month', s.created_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    // Get task completion revenue (actual)
    const taskRevenueResult = await this.databaseService.query(`
      SELECT 
        DATE_TRUNC('month', t.completed_at) as month,
        COUNT(*) as completed_tasks,
        SUM(s.price_per_task) as actual_revenue
      FROM tasks t
      JOIN services s ON t.service_id = s.id
      WHERE t.status = 'completed' AND t.completed_at IS NOT NULL
      GROUP BY DATE_TRUNC('month', t.completed_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    // Get current month projection
    const currentMonthResult = await this.databaseService.query(`
      SELECT 
        COUNT(DISTINCT s.id) * 4 as projected_tasks,
        SUM(s.price_per_task) * 4 as projected_revenue
      FROM services s
      WHERE s.status = 'active'
    `);

    return {
      monthly: monthlyResult.rows,
      taskRevenue: taskRevenueResult.rows,
      currentMonthProjection: currentMonthResult.rows[0]
    };
  }

  async getGrowthMetrics() {
    // User growth over time
    const userGrowthResult = await this.databaseService.query(`
      SELECT 
        DATE_TRUNC('week', created_at) as week,
        role,
        COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '3 months'
      GROUP BY DATE_TRUNC('week', created_at), role
      ORDER BY week DESC
    `);

    // Service growth
    const serviceGrowthResult = await this.databaseService.query(`
      SELECT 
        DATE_TRUNC('week', created_at) as week,
        COUNT(*) as new_services,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_services
      FROM services
      WHERE created_at >= NOW() - INTERVAL '3 months'
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week DESC
    `);

    // Referral effectiveness
    const referralResult = await this.databaseService.query(`
      SELECT 
        referrer.teen_code,
        referrer.first_name,
        referrer.last_name,
        COUNT(DISTINCT referred.user_id) as total_referrals,
        COUNT(DISTINCT CASE WHEN u.role = 'homeowner' THEN referred.user_id END) as homeowner_referrals,
        COUNT(DISTINCT CASE WHEN u.role = 'teen' THEN referred.user_id END) as teen_referrals
      FROM profiles referrer
      JOIN profiles referred ON referrer.user_id = referred.referred_by
      JOIN users u ON referred.user_id = u.id
      GROUP BY referrer.teen_code, referrer.first_name, referrer.last_name
      ORDER BY total_referrals DESC
      LIMIT 20
    `);

    return {
      userGrowth: userGrowthResult.rows,
      serviceGrowth: serviceGrowthResult.rows,
      topReferrers: referralResult.rows
    };
  }

  async getRecentActivity() {
    // Recent signups
    const recentSignupsResult = await this.databaseService.query(`
      SELECT 
        u.id,
        u.email,
        u.role,
        u.created_at,
        p.first_name,
        p.last_name,
        p.teen_code,
        referrer.teen_code as referred_by_code
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN profiles referrer ON p.referred_by = referrer.user_id
      ORDER BY u.created_at DESC
      LIMIT 20
    `);

    // Recent tasks
    const recentTasksResult = await this.databaseService.query(`
      SELECT 
        t.id,
        t.status,
        t.scheduled_date,
        t.completed_at,
        t.notes,
        s.name as service_name,
        h.name as home_name,
        teen.first_name as teen_first_name,
        teen.last_name as teen_last_name,
        homeowner.first_name as homeowner_first_name,
        homeowner.last_name as homeowner_last_name
      FROM tasks t
      JOIN services s ON t.service_id = s.id
      JOIN homes h ON s.home_id = h.id
      JOIN profiles teen ON s.teen_id = teen.user_id
      JOIN profiles homeowner ON h.homeowner_id = homeowner.user_id
      WHERE t.updated_at >= NOW() - INTERVAL '7 days'
      ORDER BY t.updated_at DESC
      LIMIT 20
    `);

    // Recent services
    const recentServicesResult = await this.databaseService.query(`
      SELECT 
        s.id,
        s.name,
        s.status,
        s.created_at,
        s.price_per_task,
        h.name as home_name,
        teen.first_name as teen_first_name,
        teen.last_name as teen_last_name,
        teen.teen_code,
        homeowner.first_name as homeowner_first_name,
        homeowner.last_name as homeowner_last_name
      FROM services s
      JOIN homes h ON s.home_id = h.id
      JOIN profiles teen ON s.teen_id = teen.user_id
      JOIN profiles homeowner ON h.homeowner_id = homeowner.user_id
      ORDER BY s.created_at DESC
      LIMIT 10
    `);

    return {
      recentSignups: recentSignupsResult.rows,
      recentTasks: recentTasksResult.rows,
      recentServices: recentServicesResult.rows
    };
  }
}