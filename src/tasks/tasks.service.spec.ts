jest.mock('../upload/upload.service', () => ({
  UploadService: class UploadService {},
}));

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
});
