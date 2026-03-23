import { ServicesService } from './services.service';

describe('ServicesService', () => {
  it('cancels pending tasks when a homeowner cancels a service', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 44,
              home_id: 88,
              status: 'cancelled',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const databaseService = {
      transaction: jest.fn(async (callback: (dbClient: typeof client) => Promise<unknown>) => callback(client)),
      query: jest.fn(),
      getClient: jest.fn(),
    } as any;

    const billingService = {
      cancelSubscriptionAtPeriodEnd: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new ServicesService(databaseService, billingService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 44,
      teen_id: 12,
      home_id: 88,
      homeowner_id: 55,
      status: 'active',
    } as any);

    await service.update(44, 55, { status: 'cancelled' }, 'homeowner');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE services'),
      [ 'cancelled', 44 ],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tasks"),
      [44],
    );
    expect(billingService.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith(55, 88);
  });

  it('returns only active services for teen dashboard queries', async () => {
    const databaseService = {
      query: jest.fn(),
      transaction: jest.fn(),
      getClient: jest.fn(),
    } as any;

    const billingService = {} as any;
    const service = new ServicesService(databaseService, billingService);
    const findAllSpy = jest.spyOn(service, 'findAll').mockResolvedValue([]);

    await service.findByTeen(12);

    expect(findAllSpy).toHaveBeenCalledWith({ teenId: 12, status: 'active' });
  });
});
