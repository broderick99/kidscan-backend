jest.mock('../upload/upload.service', () => ({
  UploadService: class UploadService {},
}));

import { BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  it('filters upcoming tasks to active services only', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any;

    const service = new TasksService(
      databaseService,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findUpcoming(77, 14);

    expect(databaseService.query).toHaveBeenCalledWith(
      expect.stringContaining("AND s.status = 'active'"),
      [77],
    );
  });

  it('requires a completion photo before creating billable work', async () => {
    const databaseService = {
      query: jest.fn(),
      transaction: jest.fn(),
    } as any;

    const service = new TasksService(
      databaseService,
      {} as any,
      { uploadTaskPhoto: jest.fn() } as any,
      { processQueuedTaskUsage: jest.fn() } as any,
    );

    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 11,
      teen_id: 7,
      homeowner_id: 55,
      home_id: 88,
      service_id: 99,
      service_name: 'Double Can',
      status: 'pending',
    } as any);

    await expect(
      service.complete(11, 7, { notes: 'Done' }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(databaseService.transaction).not.toHaveBeenCalled();
  });

  it('creates a payment row and durable usage report before billing handoff', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 11,
              service_id: 99,
              price_per_task: 2.5,
              status: 'completed',
              completed_at: '2026-03-23T10:00:00.000Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 44 }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const databaseService = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (dbClient: typeof client) => Promise<unknown>) => callback(client)),
    } as any;

    const uploadService = {
      uploadTaskPhoto: jest.fn().mockResolvedValue({ url: 'https://example.com/photo.jpg' }),
    } as any;

    const billingService = {
      processQueuedTaskUsage: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new TasksService(
      databaseService,
      {} as any,
      uploadService,
      billingService,
    );

    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 11,
      teen_id: 7,
      homeowner_id: 55,
      home_id: 88,
      service_id: 99,
      service_name: 'Double Can',
      status: 'pending',
    } as any);

    const result = await service.complete(
      11,
      7,
      { notes: 'Done' },
      { originalname: 'proof.jpg' } as any,
    );

    expect(uploadService.uploadTaskPhoto).toHaveBeenCalledWith(expect.anything(), 11);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO payments'),
      [7, 2.5, 'Task completion: Double Can', 11],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO billing_usage_reports'),
      [
        11,
        44,
        99,
        88,
        55,
        2.5,
        '2026-03-23T10:00:00.000Z',
        'task_11',
      ],
    );
    expect(billingService.processQueuedTaskUsage).toHaveBeenCalledWith(11);
    expect(result.status).toBe('completed');
  });
});
