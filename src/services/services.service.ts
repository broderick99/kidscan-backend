import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { BillingService } from '../billing/billing.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ChangePlanDto } from './dto/change-plan.dto';

@Injectable()
export class ServicesService {
  constructor(
    private databaseService: DatabaseService,
    private billingService: BillingService,
  ) {}

  async create(createServiceDto: CreateServiceDto, userId: number, userRole: string) {
    // If homeowner, verify they own the home and have valid payment method
    if (userRole === 'homeowner') {
      const homeCheck = await this.databaseService.query(
        'SELECT id FROM homes WHERE id = $1 AND homeowner_id = $2',
        [createServiceDto.homeId, userId]
      );
      
      if (homeCheck.rows.length === 0) {
        throw new ForbiddenException('You can only create services for your own homes');
      }

      // Check if homeowner has valid payment method and active billing
      const hasValidPayment = await this.billingService.validatePaymentMethod(userId);
      if (!hasValidPayment) {
        throw new BadRequestException('Valid payment method required to create services. Please set up automatic billing first.');
      }
    }

    const client = await this.databaseService.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get pricing from Stripe to ensure consistency with meter billing
      let pricePerTask = createServiceDto.pricePerTask;
      try {
        const pricing = await this.billingService.getPricingInfo();
        // Determine plan type from service name or use single_can as default
        let planType: 'single_can' | 'double_can' | 'triple_can' = 'single_can';
        if (createServiceDto.name?.includes('Double')) {
          planType = 'double_can';
        } else if (createServiceDto.name?.includes('Triple')) {
          planType = 'triple_can';
        }
        
        const stripePriceData = pricing[planType];
        if (stripePriceData) {
          pricePerTask = stripePriceData.amount / 100; // Convert cents to dollars
        }
      } catch (error) {
        console.warn('Could not fetch Stripe pricing, using provided price:', error);
      }

      // Create the service
      const result = await client.query(
        `INSERT INTO services (teen_id, home_id, name, description, frequency,
                              price_per_task, status, start_date, end_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING *`,
        [
          createServiceDto.teenId,
          createServiceDto.homeId,
          createServiceDto.name,
          createServiceDto.description,
          createServiceDto.frequency,
          pricePerTask,
          createServiceDto.status || 'active',
          createServiceDto.startDate,
          createServiceDto.endDate,
        ]
      );
      
      const service = result.rows[0];
      
      // Insert pickup days if provided
      if (createServiceDto.pickupDays && createServiceDto.pickupDays.length > 0) {
        for (const pickupDay of createServiceDto.pickupDays) {
          await client.query(
            `INSERT INTO service_pickup_days (service_id, day_of_week, can_number) 
             VALUES ($1, $2, $3)`,
            [service.id, pickupDay.dayOfWeek, pickupDay.canNumber]
          );
        }
      }
      
      await client.query('COMMIT');
      
      // Create Stripe subscription for homeowner after service creation
      if (userRole === 'homeowner') {
        try {
          // Determine plan type from service name or price
          let planType: 'single_can' | 'double_can' | 'triple_can' = 'single_can';
          if (service.name?.includes('Double')) {
            planType = 'double_can';
          } else if (service.name?.includes('Triple')) {
            planType = 'triple_can';
          }
          
          const subscriptionResult = await this.billingService.createUsageSubscription(
            userId, 
            createServiceDto.homeId, 
            planType
          );
          
          console.log(`✅ Created Stripe subscription ${subscriptionResult.subscriptionId} for service ${service.id}`);
        } catch (error) {
          console.error('⚠️ Failed to create Stripe subscription for service:', error);
          // Don't fail service creation if billing fails - service still works, billing can be fixed later
        }
      }
      
      return service;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findAll(filters?: { teenId?: number; homeId?: number; status?: string }) {
    let query = `
      SELECT s.*,
             h.name as home_name, h.address_line1, h.city, h.state,
             ut.email as teen_email, pt.first_name as teen_first_name, pt.last_name as teen_last_name, pt.phone as teen_phone,
             uh.email as homeowner_email, ph.first_name as homeowner_first_name, ph.last_name as homeowner_last_name
      FROM services s
      LEFT JOIN homes h ON s.home_id = h.id
      LEFT JOIN users ut ON s.teen_id = ut.id
      LEFT JOIN profiles pt ON ut.id = pt.user_id
      LEFT JOIN users uh ON h.homeowner_id = uh.id
      LEFT JOIN profiles ph ON uh.id = ph.user_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (filters?.teenId) {
      query += ` AND s.teen_id = $${paramCount}`;
      values.push(filters.teenId);
      paramCount++;
    }

    if (filters?.homeId) {
      query += ` AND s.home_id = $${paramCount}`;
      values.push(filters.homeId);
      paramCount++;
    }

    if (filters?.status) {
      query += ` AND s.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    query += ' ORDER BY s.created_at DESC';
    
    const result = await this.databaseService.query(query, values);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.databaseService.query(
      `SELECT s.*,
              h.name as home_name, h.address_line1, h.city, h.state, h.zip_code,
              h.special_instructions, h.homeowner_id,
              ut.email as teen_email, pt.first_name as teen_first_name, pt.last_name as teen_last_name, pt.phone as teen_phone,
              uh.email as homeowner_email, ph.first_name as homeowner_first_name, ph.last_name as homeowner_last_name
       FROM services s
       LEFT JOIN homes h ON s.home_id = h.id
       LEFT JOIN users ut ON s.teen_id = ut.id
       LEFT JOIN profiles pt ON ut.id = pt.user_id
       LEFT JOIN users uh ON h.homeowner_id = uh.id
       LEFT JOIN profiles ph ON uh.id = ph.user_id
       WHERE s.id = $1`,
      [id]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Service not found');
    }
    
    const service = result.rows[0];
    
    // Fetch pickup days for this service
    const pickupDaysResult = await this.databaseService.query(
      `SELECT day_of_week, can_number 
       FROM service_pickup_days 
       WHERE service_id = $1 
       ORDER BY can_number`,
      [id]
    );
    
    service.pickupDays = pickupDaysResult.rows;
    
    return service;
  }

  async findByTeen(teenId: number) {
    return this.findAll({ teenId });
  }

  async findByHomeowner(homeownerId: number) {
    const result = await this.databaseService.query(
      `SELECT s.*,
              h.name as home_name, h.address_line1, h.city, h.state,
              ut.email as teen_email, pt.first_name as teen_first_name, pt.last_name as teen_last_name
       FROM services s
       JOIN homes h ON s.home_id = h.id
       LEFT JOIN users ut ON s.teen_id = ut.id
       LEFT JOIN profiles pt ON ut.id = pt.user_id
       WHERE h.homeowner_id = $1
       ORDER BY s.created_at DESC`,
      [homeownerId]
    );
    return result.rows;
  }

  async update(id: number, userId: number, updateServiceDto: UpdateServiceDto, userRole: string) {
    // Verify ownership/permission
    const service = await this.findOne(id);
    
    if (userRole === 'teen' && service.teen_id !== userId) {
      throw new ForbiddenException('You can only update your own services');
    } else if (userRole === 'homeowner' && service.homeowner_id !== userId) {
      throw new ForbiddenException('You can only update services for your homes');
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMapping = {
      pricePerTask: 'price_per_task',
      startDate: 'start_date',
      endDate: 'end_date',
    };

    Object.entries(updateServiceDto).forEach(([key, value]) => {
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
      `UPDATE services 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Service not found');
    }

    // If service is being cancelled, also cancel the Stripe subscription at period end
    if (updateServiceDto.status === 'cancelled') {
      try {
        await this.billingService.cancelSubscriptionAtPeriodEnd(userId, service.home_id);
        console.log(`🚫 Billing subscription cancellation scheduled for service ${id}, home ${service.home_id}`);
      } catch (error) {
        console.error('⚠️ Failed to cancel billing subscription:', error);
        // Don't fail the entire service cancellation if billing fails
        // The service is still cancelled, but billing might need manual cleanup
      }
    }

    return result.rows[0];
  }

  async remove(id: number, userId: number, userRole: string) {
    // Verify ownership/permission
    const service = await this.findOne(id);
    
    if (userRole === 'teen' && service.teen_id !== userId) {
      throw new ForbiddenException('You can only delete your own services');
    } else if (userRole === 'homeowner' && service.homeowner_id !== userId) {
      throw new ForbiddenException('You can only delete services for your homes');
    }

    // Check for incomplete tasks
    const tasksResult = await this.databaseService.query(
      'SELECT COUNT(*) as count FROM tasks WHERE service_id = $1 AND status = \'pending\'',
      [id]
    );

    if (parseInt(tasksResult.rows[0].count) > 0) {
      throw new ForbiddenException('Cannot delete service with pending tasks');
    }

    // Soft delete by setting status to cancelled
    const result = await this.databaseService.query(
      `UPDATE services 
       SET status = 'cancelled', end_date = CURRENT_DATE 
       WHERE id = $1 
       RETURNING id`,
      [id]
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Service not found');
    }

    return { message: 'Service cancelled successfully' };
  }

  async getUpcomingTasks(serviceId: number, limit = 10) {
    const result = await this.databaseService.query(
      `SELECT * FROM tasks 
       WHERE service_id = $1 AND status = 'pending' 
       ORDER BY scheduled_date ASC 
       LIMIT $2`,
      [serviceId, limit]
    );
    return result.rows;
  }

  async getCompletedTasks(serviceId: number, limit = 10) {
    const result = await this.databaseService.query(
      `SELECT * FROM tasks 
       WHERE service_id = $1 AND status = 'completed' 
       ORDER BY completed_at DESC 
       LIMIT $2`,
      [serviceId, limit]
    );
    return result.rows;
  }

  async getStats(serviceId: number) {
    const result = await this.databaseService.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
         COUNT(*) FILTER (WHERE status = 'missed') as missed_tasks,
         SUM(CASE WHEN status = 'completed' THEN price_per_task ELSE 0 END) as total_earned
       FROM tasks t
       JOIN services s ON t.service_id = s.id
       WHERE t.service_id = $1`,
      [serviceId]
    );
    return result.rows[0];
  }

  async changePlan(id: number, userId: number, changePlanDto: ChangePlanDto, userRole: string) {
    // Get service details
    const service = await this.findOne(id);
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Verify homeowner owns the home associated with this service
    if (userRole === 'homeowner' && service.homeowner_id !== userId) {
      throw new ForbiddenException('You can only change plans for services at your own homes');
    }

    // Update the service price_per_task and optionally the name
    let serviceName: string;
    switch (changePlanDto.planType) {
      case 'single_can':
        serviceName = 'Trash Service - Single Can';
        break;
      case 'double_can':
        serviceName = 'Trash Service - Double Can';
        break;
      case 'triple_can':
        serviceName = 'Trash Service - Triple Can';
        break;
      default:
        serviceName = 'Trash Service';
    }

    const client = await this.databaseService.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get pricing from Stripe to ensure consistency
      const pricing = await this.billingService.getPricingInfo();
      const stripePriceData = pricing[changePlanDto.planType];
      const pricePerTask = stripePriceData ? stripePriceData.amount / 100 : changePlanDto.pricePerTask;

      // Update the service
      await client.query(
        `UPDATE services 
         SET price_per_task = $1, 
             name = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [pricePerTask, serviceName, id]
      );
      
      // Update pickup days if provided
      if (changePlanDto.pickupDays) {
        console.log('🔄 Starting changePlan process for service:', id);
        console.log('📅 Pickup days received:', JSON.stringify(changePlanDto.pickupDays, null, 2));
        
        // Check existing tasks before deletion
        const existingTasksResult = await client.query(
          'SELECT id, scheduled_date, status FROM tasks WHERE service_id = $1 ORDER BY scheduled_date',
          [id]
        );
        console.log('📋 Existing tasks before deletion:', existingTasksResult.rows);
        
        // Delete existing pickup days
        await client.query(
          'DELETE FROM service_pickup_days WHERE service_id = $1',
          [id]
        );
        console.log('🗑️ Deleted existing pickup days for service:', id);
        
        // Insert new pickup days
        for (const pickupDay of changePlanDto.pickupDays) {
          await client.query(
            `INSERT INTO service_pickup_days (service_id, day_of_week, can_number) 
             VALUES ($1, $2, $3)`,
            [id, pickupDay.dayOfWeek, pickupDay.canNumber]
          );
          console.log('➕ Inserted pickup day:', pickupDay);
        }
        
        // Delete all pending tasks for the current month to regenerate them based on new schedule
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        console.log('📅 Now:', now.toISOString());
        console.log('📅 Start of month for deletion:', startOfMonth.toISOString());
        console.log('📅 End of month for deletion:', endOfMonth.toISOString());
        
        const deleteResult = await client.query(
          `DELETE FROM tasks 
           WHERE service_id = $1 
           AND status = 'pending' 
           AND scheduled_date >= $2 
           AND scheduled_date <= $3
           RETURNING *`,
          [id, startOfMonth.toISOString().split('T')[0], endOfMonth.toISOString().split('T')[0]]
        );
        console.log('🗑️ Deleted future pending tasks:', deleteResult.rows);
        console.log('🔢 Number of tasks deleted:', deleteResult.rowCount);
        
        // Check remaining tasks after deletion
        const remainingTasksResult = await client.query(
          'SELECT id, scheduled_date, status FROM tasks WHERE service_id = $1 ORDER BY scheduled_date',
          [id]
        );
        console.log('📋 Remaining tasks after deletion:', remainingTasksResult.rows);
        
        // Generate new tasks based on new pickup schedule for the current month
        const tasksToInsert = [];
        
        console.log('📅 Date range for task generation:');
        console.log('  Now:', now.toISOString());
        console.log('  Start of month:', startOfMonth.toISOString());
        console.log('  End of month:', endOfMonth.toISOString());
        
        for (const pickupDay of changePlanDto.pickupDays) {
          console.log('🔄 Processing pickup day:', pickupDay);
          const dayOfWeek = this.getDayOfWeekNumber(pickupDay.dayOfWeek);
          console.log('📅 Day of week number:', dayOfWeek, 'for', pickupDay.dayOfWeek);
          
          // Find the first occurrence of this day of week in the current month
          let currentDate = new Date(startOfMonth);
          const currentDayOfWeek = currentDate.getDay();
          console.log('📅 Start of month day of week:', currentDayOfWeek, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currentDayOfWeek]);
          console.log('📅 Target day of week:', dayOfWeek, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]);
          
          // Find first occurrence of target day in the month
          while (currentDate.getDay() !== dayOfWeek && currentDate <= endOfMonth) {
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          if (currentDate <= endOfMonth) {
            console.log('📅 First pickup date in month:', currentDate.toISOString(), currentDate.toDateString());
            
            // Service happens the evening before pickup day
            let serviceDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 1);
            console.log('📅 First service date (day before pickup):', serviceDate.toISOString(), serviceDate.toDateString());
            
            // Generate weekly tasks for this pickup day throughout the month
            while (serviceDate <= endOfMonth) {
              const scheduledDateStr = serviceDate.toISOString().split('T')[0];
              console.log('📅 Service date:', scheduledDateStr, serviceDate.toDateString());
              tasksToInsert.push({
                serviceId: id,
                scheduledDate: scheduledDateStr,
                canNumber: pickupDay.canNumber
              });
              
              // Move to next week - create new date to avoid mutation issues
              serviceDate = new Date(serviceDate.getFullYear(), serviceDate.getMonth(), serviceDate.getDate() + 7);
            }
          }
        }
        
        console.log('📋 Tasks to insert:', JSON.stringify(tasksToInsert, null, 2));
        console.log('🔢 Total tasks to insert:', tasksToInsert.length);
        
        // Bulk insert new tasks
        if (tasksToInsert.length > 0) {
          const values = tasksToInsert.flatMap(task => [
            task.serviceId, 
            task.scheduledDate, 
            'pending',
            `Trash pickup - Can ${task.canNumber}`,
            changePlanDto.pricePerTask  // Store the current price per task
          ]);
          const placeholders = tasksToInsert
            .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
            .join(', ');

          console.log('🔧 SQL query values:', values);
          console.log('🔧 SQL placeholders:', placeholders);

          const insertResult = await client.query(
            `INSERT INTO tasks (service_id, scheduled_date, status, notes, price_per_task) VALUES ${placeholders} RETURNING *`,
            values
          );
          console.log('✅ Inserted new tasks:', insertResult.rows);
          console.log('🔢 Number of tasks inserted:', insertResult.rowCount);
        } else {
          console.log('⚠️ No tasks to insert');
        }
        
        // Final check - show all tasks after insertion
        const finalTasksResult = await client.query(
          'SELECT id, scheduled_date, status, notes FROM tasks WHERE service_id = $1 ORDER BY scheduled_date',
          [id]
        );
        console.log('📋 Final tasks after insertion:', finalTasksResult.rows);
      }
      
      await client.query('COMMIT');

      // Update Stripe subscription if plan type changed
      try {
        await this.billingService.updateSubscriptionPlan(userId, service.home_id, changePlanDto.planType);
        console.log(`💳 Updated Stripe subscription for service ${id} to ${changePlanDto.planType}`);
      } catch (error) {
        console.error('⚠️ Failed to update Stripe subscription plan:', error);
        // Don't fail the entire plan change if billing fails - the service is already updated
        // This allows manual Stripe cleanup if needed
      }
      
      // Get updated service
      return this.findOne(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private getDayOfWeekNumber(dayOfWeek: string): number {
    const days = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6
    };
    return days[dayOfWeek.toLowerCase()] ?? 0;
  }
}