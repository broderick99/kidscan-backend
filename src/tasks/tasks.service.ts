import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ServicesService } from '../services/services.service';
import { UploadService } from '../upload/upload.service';
import { BillingService } from '../billing/billing.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private databaseService: DatabaseService,
    private servicesService: ServicesService,
    private uploadService: UploadService,
    private billingService: BillingService,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: number, userRole: string) {
    // Verify service exists and is active
    const service = await this.servicesService.findOne(createTaskDto.serviceId);
    if (service.status !== 'active') {
      throw new BadRequestException('Cannot create task for inactive service');
    }

    // Check homeowner billing status before creating tasks
    const homeownerResult = await this.databaseService.query(
      `SELECT h.homeowner_id FROM homes h
       JOIN services s ON s.home_id = h.id
       WHERE s.id = $1`,
      [createTaskDto.serviceId]
    );

    if (homeownerResult.rows.length === 0) {
      throw new NotFoundException('Service not found');
    }

    const homeownerId = homeownerResult.rows[0].homeowner_id;
    const hasValidBilling = await this.billingService.validatePaymentMethod(homeownerId);
    
    if (!hasValidBilling) {
      throw new BadRequestException('Cannot create tasks - homeowner billing setup required');
    }

    // If homeowner, verify they own the home associated with the service
    if (userRole === 'homeowner') {
      const homeCheck = await this.databaseService.query(
        `SELECT h.id FROM homes h
         JOIN services s ON s.home_id = h.id
         WHERE s.id = $1 AND h.homeowner_id = $2`,
        [createTaskDto.serviceId, userId]
      );
      
      if (homeCheck.rows.length === 0) {
        throw new ForbiddenException('You can only create tasks for services on your own homes');
      }
    }

    const result = await this.databaseService.query(
      `INSERT INTO tasks (service_id, scheduled_date, status, notes, price_per_task) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [
        createTaskDto.serviceId,
        createTaskDto.scheduledDate,
        createTaskDto.status || 'pending',
        createTaskDto.notes,
        service.price_per_task, // Store current service price at task creation
      ]
    );
    return result.rows[0];
  }

  async findAll(filters?: {
    serviceId?: number;
    teenId?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) {
    let query = `
      SELECT t.*,
             s.name as service_name, s.price_per_task as service_price_per_task, s.teen_id, s.home_id,
             h.name as home_name, h.address_line1, h.city, h.state,
             ut.email as teen_email, pt.first_name as teen_first_name, pt.last_name as teen_last_name
      FROM tasks t
      JOIN services s ON t.service_id = s.id
      JOIN homes h ON s.home_id = h.id
      LEFT JOIN users ut ON s.teen_id = ut.id
      LEFT JOIN profiles pt ON ut.id = pt.user_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (filters?.serviceId) {
      query += ` AND t.service_id = $${paramCount}`;
      values.push(filters.serviceId);
      paramCount++;
    }

    if (filters?.teenId) {
      query += ` AND s.teen_id = $${paramCount}`;
      values.push(filters.teenId);
      paramCount++;
    }

    if (filters?.status) {
      query += ` AND t.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters?.startDate) {
      query += ` AND t.scheduled_date >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters?.endDate) {
      query += ` AND t.scheduled_date <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    query += ' ORDER BY t.scheduled_date DESC';
    
    const result = await this.databaseService.query(query, values);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.databaseService.query(
      `SELECT t.*,
              s.name as service_name, s.price_per_task as service_price_per_task, s.teen_id, s.home_id,
              s.frequency, s.description as service_description,
              h.name as home_name, h.address_line1, h.address_line2, 
              h.city, h.state, h.zip_code, h.special_instructions, h.homeowner_id,
              ut.email as teen_email, pt.first_name as teen_first_name, 
              pt.last_name as teen_last_name, pt.phone as teen_phone
       FROM tasks t
       JOIN services s ON t.service_id = s.id
       JOIN homes h ON s.home_id = h.id
       LEFT JOIN users ut ON s.teen_id = ut.id
       LEFT JOIN profiles pt ON ut.id = pt.user_id
       WHERE t.id = $1`,
      [id]
    );
    
    if (!result.rows[0]) {
      throw new NotFoundException('Task not found');
    }
    
    return result.rows[0];
  }

  async findByTeen(teenId: number, status?: string) {
    return this.findAll({ teenId, status });
  }

  async findUpcoming(teenId: number, days = 7) {
    const result = await this.databaseService.query(
      `SELECT t.*,
              s.name as service_name, s.price_per_task as service_price_per_task,
              h.name as home_name, h.address_line1, h.city, h.state
       FROM tasks t
       JOIN services s ON t.service_id = s.id
       JOIN homes h ON s.home_id = h.id
       WHERE s.teen_id = $1 
         AND t.status = 'pending'
         AND t.scheduled_date >= CURRENT_DATE
         AND t.scheduled_date <= CURRENT_DATE + INTERVAL '${days} days'
       ORDER BY t.scheduled_date ASC`,
      [teenId]
    );
    return result.rows;
  }

  async update(id: number, userId: number, updateTaskDto: UpdateTaskDto, userRole: string) {
    // Verify permissions
    const task = await this.findOne(id);
    
    if (userRole === 'teen' && task.teen_id !== userId) {
      throw new ForbiddenException('You can only update your own tasks');
    } else if (userRole === 'homeowner' && task.homeowner_id !== userId) {
      throw new ForbiddenException('You can only update tasks for your homes');
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMapping = {
      scheduledDate: 'scheduled_date',
      photoUrl: 'photo_url',
    };

    Object.entries(updateTaskDto).forEach(([key, value]) => {
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
      `UPDATE tasks 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Task not found');
    }

    return result.rows[0];
  }

  async complete(id: number, teenId: number, completeTaskDto: CompleteTaskDto, photo?: Express.Multer.File) {
    // Task completion with photo upload

    // Verify ownership
    const task = await this.findOne(id);
    // Verify task ownership and status
    
    if (task.teen_id !== teenId) {
      // Ownership check failed
      throw new ForbiddenException('You can only complete your own tasks');
    }

    if (task.status !== 'pending') {
      // Task is not in pending status
      throw new BadRequestException('Task is not pending');
    }

    const result = await this.databaseService.transaction(async (client) => {
      let photoUrl: string | undefined = completeTaskDto.photoUrl;

      // Handle photo upload if file is provided
      if (photo) {
        try {
          // Upload photo to S3
          const uploadResult = await this.uploadService.uploadTaskPhoto(photo, id);
          photoUrl = uploadResult.url;
          // Photo uploaded successfully
        } catch (error) {
          console.error('Failed to upload task photo:', error);
          // Don't fail the entire task completion if photo upload fails
          // Just log the error and continue without photo
        }
      } else {
        // No photo provided
      }

      // Update task
      const taskResult = await client.query(
        `UPDATE tasks 
         SET status = 'completed', 
             completed_at = CURRENT_TIMESTAMP,
             photo_url = $1,
             notes = $2
         WHERE id = $3
         RETURNING *`,
        [photoUrl, completeTaskDto.notes, id]
      );

      // Create payment record using the task's stored price_per_task
      const taskDetails = taskResult.rows[0];
      await client.query(
        `INSERT INTO payments (teen_id, amount, type, status, description, reference_id, reference_type)
         VALUES ($1, $2, 'task_completion', 'pending', $3, $4, 'task')`,
        [
          teenId,
          taskDetails.price_per_task, // Use the stored price from the updated task
          `Task completion: ${task.service_name}`,
          id,
        ]
      );

      return taskResult.rows[0];
    });

    // Report usage to Stripe after successful task completion
    try {
      await this.billingService.reportTaskUsage(
        task.service_id,
        result.id,
        result.price_per_task
      );
    } catch (error) {
      console.error('Failed to report task usage to Stripe:', error);
      // Don't fail task completion if usage reporting fails
    }

    return result;
  }

  async cancel(id: number, userId: number, userRole: string) {
    // Verify permissions
    const task = await this.findOne(id);
    
    if (userRole === 'teen' && task.teen_id !== userId) {
      throw new ForbiddenException('You can only cancel your own tasks');
    } else if (userRole === 'homeowner' && task.homeowner_id !== userId) {
      throw new ForbiddenException('You can only cancel tasks for your homes');
    }

    if (task.status !== 'pending') {
      throw new BadRequestException('Only pending tasks can be cancelled');
    }

    const result = await this.databaseService.query(
      `UPDATE tasks 
       SET status = 'cancelled'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Task not found');
    }

    return result.rows[0];
  }

  async generateRecurringTasks(serviceId: number, endDate: Date) {
    const service = await this.servicesService.findOne(serviceId);
    
    if (service.frequency === 'onetime') {
      throw new BadRequestException('Cannot generate recurring tasks for one-time service');
    }

    // Check homeowner billing status before generating tasks
    const homeownerResult = await this.databaseService.query(
      `SELECT h.homeowner_id FROM homes h
       JOIN services s ON s.home_id = h.id
       WHERE s.id = $1`,
      [serviceId]
    );

    if (homeownerResult.rows.length === 0) {
      throw new NotFoundException('Service not found');
    }

    const homeownerId = homeownerResult.rows[0].homeowner_id;
    const hasValidBilling = await this.billingService.validatePaymentMethod(homeownerId);
    
    if (!hasValidBilling) {
      console.log(`Skipping task generation for service ${serviceId} - billing setup required`);
      return { 
        message: 'Task generation skipped - homeowner billing setup required',
        tasksGenerated: 0
      };
    }

    // Get last scheduled task
    const lastTaskResult = await this.databaseService.query(
      `SELECT scheduled_date FROM tasks 
       WHERE service_id = $1 
       ORDER BY scheduled_date DESC 
       LIMIT 1`,
      [serviceId]
    );

    let startDate = new Date(service.start_date);
    if (lastTaskResult.rows[0]) {
      startDate = new Date(lastTaskResult.rows[0].scheduled_date);
    }

    const tasks = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Calculate next date based on frequency
      switch (service.frequency) {
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'biweekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
      }

      if (currentDate <= endDate) {
        tasks.push({
          serviceId,
          scheduledDate: currentDate.toISOString().split('T')[0],
        });
      }
    }

    // Bulk insert tasks
    if (tasks.length > 0) {
      const values = tasks.flatMap(task => [task.serviceId, task.scheduledDate, service.price_per_task]);
      const placeholders = tasks
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, 'pending', $${i * 3 + 3})`)
        .join(', ');

      await this.databaseService.query(
        `INSERT INTO tasks (service_id, scheduled_date, status, price_per_task) VALUES ${placeholders}`,
        values
      );
    }

    return { message: `Generated ${tasks.length} recurring tasks` };
  }
}