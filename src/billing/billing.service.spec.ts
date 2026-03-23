const mockMeterEventsCreate = jest.fn();
const mockMetersRetrieve = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockTransfersCreate = jest.fn();
const mockInvoicePaymentsList = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();
const mockCustomersRetrieve = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockCheckoutSessionsCreate = jest.fn();
const mockSetupIntentsCreate = jest.fn();
const mockSetupIntentsRetrieve = jest.fn();
const mockPaymentMethodsList = jest.fn();
const mockPaymentMethodsRetrieve = jest.fn();
const mockPricesList = jest.fn();
const mockAccountsRetrieve = jest.fn();
const mockAccountsCreate = jest.fn();
const mockAccountsCreateLoginLink = jest.fn();
const mockAccountsUpdate = jest.fn();
const mockAccountLinksCreate = jest.fn();
const mockSubscriptionItemsUpdate = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    billing: {
      meterEvents: { create: mockMeterEventsCreate },
      meters: { retrieve: mockMetersRetrieve },
    },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      create: mockSubscriptionsCreate,
      update: mockSubscriptionsUpdate,
      list: mockSubscriptionsList,
    },
    customers: {
      retrieve: mockCustomersRetrieve,
      create: mockCustomersCreate,
      update: mockCustomersUpdate,
    },
    prices: { list: mockPricesList },
    paymentMethods: {
      list: mockPaymentMethodsList,
      retrieve: mockPaymentMethodsRetrieve,
    },
    billingPortal: { sessions: { create: jest.fn() } },
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    accounts: {
      retrieve: mockAccountsRetrieve,
      create: mockAccountsCreate,
      createLoginLink: mockAccountsCreateLoginLink,
      update: mockAccountsUpdate,
    },
    accountLinks: { create: mockAccountLinksCreate },
    invoicePayments: { list: mockInvoicePaymentsList },
    paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
    transfers: { create: mockTransfersCreate },
    webhooks: { constructEvent: jest.fn() },
    setupIntents: {
      retrieve: mockSetupIntentsRetrieve,
      create: mockSetupIntentsCreate,
    },
    subscriptionItems: { update: mockSubscriptionItemsUpdate },
  })),
}));

import { BillingService } from './billing.service';

describe('BillingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createService = (databaseService: any) =>
    new BillingService(
      {
        get: jest.fn((key: string) => {
          if (key === 'STRIPE_SECRET_KEY') {
            return 'sk_test_fake';
          }
          if (key === 'BILLING_USAGE_RETRY_INTERVAL_MS') {
            return '0';
          }
          if (key === 'BILLING_PAYOUT_RETRY_INTERVAL_MS') {
            return '0';
          }
          return undefined;
        }),
      } as any,
      databaseService,
    );

  it('reports a queued task usage record to Stripe and marks it reported', async () => {
    const databaseService = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              task_id: 11,
              retry_count: 1,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              task_id: 11,
              payment_id: 44,
              service_id: 99,
              home_id: 88,
              homeowner_id: 55,
              usage_value: '2.50',
              occurred_at: '2026-03-23T10:00:00.000Z',
              stripe_customer_id: null,
              stripe_subscription_id: null,
              stripe_meter_id: null,
              stripe_event_identifier: 'task_11',
              stripe_event_name: 'can_completed',
              stripe_value_key: 'value',
              status: 'processing',
              retry_count: 1,
              service_name: 'Double Can',
              home_subscription_id: 'sub_123',
              homeowner_customer_id: 'cus_123',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: {
              recurring: {
                meter: 'mtr_123',
              },
            },
          },
        ],
      },
    });
    mockMetersRetrieve.mockResolvedValue({
      event_name: 'can_completed',
      value_settings: { event_payload_key: 'value' },
    });
    mockMeterEventsCreate.mockResolvedValue({ id: 'mev_123' });

    const service = createService(databaseService);
    await service.processQueuedTaskUsage(11);

    expect(mockMeterEventsCreate).toHaveBeenCalledWith({
      event_name: 'can_completed',
      payload: {
        stripe_customer_id: 'cus_123',
        value: '2.50',
      },
      identifier: 'task_11',
      timestamp: Math.floor(new Date('2026-03-23T10:00:00.000Z').getTime() / 1000),
    });
    expect(databaseService.query).toHaveBeenLastCalledWith(
      expect.stringContaining("status = 'reported'"),
      [11, 'cus_123', 'sub_123', 'mtr_123', 'can_completed', 'value'],
    );
  });

  it('marks queued usage reports failed and schedules a retry when Stripe rejects them', async () => {
    const databaseService = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              task_id: 11,
              retry_count: 2,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              task_id: 11,
              payment_id: 44,
              service_id: 99,
              home_id: 88,
              homeowner_id: 55,
              usage_value: '2.50',
              occurred_at: '2026-03-23T10:00:00.000Z',
              stripe_customer_id: null,
              stripe_subscription_id: null,
              stripe_meter_id: null,
              stripe_event_identifier: 'task_11',
              stripe_event_name: 'can_completed',
              stripe_value_key: 'value',
              status: 'processing',
              retry_count: 2,
              service_name: 'Double Can',
              home_subscription_id: 'sub_123',
              homeowner_customer_id: 'cus_123',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: {
              recurring: {
                meter: 'mtr_123',
              },
            },
          },
        ],
      },
    });
    mockMetersRetrieve.mockResolvedValue({
      event_name: 'can_completed',
      value_settings: { event_payload_key: 'value' },
    });
    mockMeterEventsCreate.mockRejectedValue(new Error('Stripe is down'));

    const service = createService(databaseService);
    await service.processQueuedTaskUsage(11);

    expect(databaseService.query).toHaveBeenLastCalledWith(
      expect.stringContaining("status = 'failed'"),
      [11, 'Stripe is down', expect.any(Date)],
    );
  });

  it('marks invoice-settled teen earnings as pending payout balances', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 101 }, { id: 102 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const databaseService = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (dbClient: typeof client) => Promise<unknown>) => callback(client)),
    } as any;

    const service = createService(databaseService);
    const settledCount = await (service as any).markInvoiceSettledTaskPaymentsForHome(
      88,
      100,
      200,
      'in_123',
      'ch_123',
    );

    expect(settledCount).toBe(2);
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('p.stripe_invoice_id IS NULL'),
      [88, 100, 200],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('invoice_settled_at = CURRENT_TIMESTAMP'),
      [[101, 102], 'in_123', 'ch_123'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('pending_amount'),
      [[101, 102]],
    );
  });

  it('creates a Stripe transfer when a funded teen payment is payout-ready', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const databaseService = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 44, transfer_attempt_count: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 44,
              teen_id: 7,
              amount: '2.50',
              created_at: '2026-03-23T10:00:00.000Z',
              description: 'Task completion: Double Can',
              reference_id: 11,
              reference_type: 'task',
              stripe_invoice_id: 'in_123',
              invoice_settled_at: '2026-03-23T11:00:00.000Z',
              stripe_source_transaction_id: 'ch_123',
              stripe_transfer_group: null,
              stripe_transfer_id: null,
              transfer_attempt_count: 1,
              teen_connect_account_id: 'acct_123',
              teen_payouts_enabled: true,
              teen_onboarding_completed: true,
              teen_first_name: 'Audrey',
              teen_last_name: 'Ostler',
            },
          ],
        }),
      transaction: jest.fn(async (callback: (dbClient: typeof client) => Promise<unknown>) => callback(client)),
    } as any;

    mockTransfersCreate.mockResolvedValue({ id: 'tr_123' });

    const service = createService(databaseService);
    await service.processTeenPayoutTransfer(44);

    expect(mockTransfersCreate).toHaveBeenCalledWith({
      amount: 250,
      currency: 'usd',
      destination: 'acct_123',
      description: 'Task completion: Double Can',
      metadata: {
        paymentId: '44',
        teenId: '7',
        invoiceId: 'in_123',
        taskId: '11',
      },
      source_transaction: 'ch_123',
      transfer_group: 'invoice_in_123',
    });
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("status = 'completed'"),
      [44, 'tr_123', 'invoice_in_123', 'ch_123'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('total_paid'),
      [7, '2026-03-01', '2026-03-31', '2.50'],
    );
  });

  it('keeps funded teen payments pending when payout onboarding is incomplete', async () => {
    const databaseService = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 44, transfer_attempt_count: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 44,
              teen_id: 7,
              amount: '2.50',
              created_at: '2026-03-23T10:00:00.000Z',
              description: 'Task completion: Double Can',
              reference_id: 11,
              reference_type: 'task',
              stripe_invoice_id: 'in_123',
              invoice_settled_at: '2026-03-23T11:00:00.000Z',
              stripe_source_transaction_id: 'ch_123',
              stripe_transfer_group: null,
              stripe_transfer_id: null,
              transfer_attempt_count: 2,
              teen_connect_account_id: null,
              teen_payouts_enabled: false,
              teen_onboarding_completed: false,
              teen_first_name: 'Audrey',
              teen_last_name: 'Ostler',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
      transaction: jest.fn(),
    } as any;

    const service = createService(databaseService);
    await service.processTeenPayoutTransfer(44);

    expect(mockTransfersCreate).not.toHaveBeenCalled();
    const lastCall = databaseService.query.mock.calls.at(-1);
    expect(lastCall?.[0]).toContain('transfer_failure_reason');
    expect(lastCall?.[1]?.[0]).toBe(44);
    expect(lastCall?.[1]?.[1]).toBe('Teen payout onboarding is incomplete');
    expect(lastCall?.[1]?.[2]).toBeInstanceOf(Date);
  });

  it('replays due payout transfers in order', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 44 }, { id: 45 }],
      }),
    } as any;

    const service = createService(databaseService);
    const processSpy = jest
      .spyOn(service, 'processTeenPayoutTransfer')
      .mockResolvedValue(undefined);

    const processed = await service.retryPendingPayoutTransfers(2);

    expect(processed).toBe(2);
    expect(processSpy).toHaveBeenNthCalledWith(1, 44, false);
    expect(processSpy).toHaveBeenNthCalledWith(2, 45, false);
  });

  it('replays due queued usage reports in order', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [{ task_id: 11 }, { task_id: 12 }],
      }),
    } as any;

    const service = createService(databaseService);
    const processSpy = jest
      .spyOn(service, 'processQueuedTaskUsage')
      .mockResolvedValue(undefined);

    const processed = await service.retryPendingUsageReports(2);

    expect(processed).toBe(2);
    expect(processSpy).toHaveBeenNthCalledWith(1, 11, false);
    expect(processSpy).toHaveBeenNthCalledWith(2, 12, false);
  });

  it('resolves the source charge from an invoice payment intent when needed', async () => {
    const databaseService = {
      query: jest.fn(),
      transaction: jest.fn(),
    } as any;

    mockInvoicePaymentsList.mockResolvedValue({
      data: [
        {
          payment: {
            type: 'payment_intent',
            payment_intent: 'pi_123',
          },
        },
      ],
    });
    mockPaymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_123',
      latest_charge: 'ch_123',
    });

    const service = createService(databaseService);
    const sourceTransactionId = await (service as any).resolveInvoiceSourceTransaction('in_123');

    expect(sourceTransactionId).toBe('ch_123');
    expect(mockInvoicePaymentsList).toHaveBeenCalledWith({
      invoice: 'in_123',
      status: 'paid',
      limit: 10,
    });
    expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith('pi_123');
  });

  it('creates ACH-only checkout setup sessions for homeowners', async () => {
    const databaseService = {
      query: jest.fn(),
      transaction: jest.fn(),
    } as any;

    mockCheckoutSessionsCreate.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/cs_123',
    });

    const service = createService(databaseService);
    jest.spyOn(service, 'getOrCreateCustomer').mockResolvedValue({ id: 'cus_123' } as any);

    const result = await service.createCheckoutSetupSession(55, {
      homeId: 88,
      planType: 'double_can',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result).toEqual({
      sessionId: 'cs_123',
      url: 'https://checkout.stripe.test/cs_123',
    });
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'setup',
        customer: 'cus_123',
        payment_method_types: ['us_bank_account'],
        payment_method_options: {
          us_bank_account: {
            financial_connections: {
              permissions: ['payment_method'],
            },
          },
        },
      }),
    );
  });

  it('reports ACH billing status from saved bank accounts only', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [{ stripe_customer_id: 'cus_123' }],
      }),
      transaction: jest.fn(),
    } as any;

    mockPaymentMethodsList.mockResolvedValue({
      data: [
        {
          id: 'pm_ach_123',
          type: 'us_bank_account',
          us_bank_account: {
            last4: '6789',
            bank_name: 'First Hawaiian Bank',
            account_holder_type: 'individual',
            account_type: 'checking',
            routing_number: '110000000',
            status_details: null,
          },
        },
      ],
    });
    mockSubscriptionsList.mockResolvedValue({ data: [] });

    const service = createService(databaseService);
    const status = await service.getBillingStatus(55);

    expect(status).toEqual({
      hasPaymentMethod: true,
      subscriptionStatus: null,
      stripeCustomerId: 'cus_123',
      paymentMethod: {
        id: 'pm_ach_123',
        type: 'us_bank_account',
        last4: '6789',
        bankName: 'First Hawaiian Bank',
        accountHolderType: 'individual',
        accountType: 'checking',
        routingNumberLast4: '0000',
        verificationStatus: null,
      },
    });
    expect(mockPaymentMethodsList).toHaveBeenCalledWith({
      customer: 'cus_123',
      type: 'us_bank_account',
      limit: 10,
    });
  });

  it('surfaces missing teen payout-profile fields before Stripe onboarding starts', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            first_name: 'Audrey',
            last_name: 'Ostler',
            phone: null,
            date_of_birth: null,
            stripe_connect_account_id: null,
            stripe_connect_onboarding_completed: false,
            stripe_connect_charges_enabled: false,
            stripe_connect_payouts_enabled: false,
            stripe_connect_details_submitted: false,
            stripe_connect_requirements_due: [],
            stripe_connect_requirements_past_due: [],
          },
        ],
      }),
      transaction: jest.fn(),
    } as any;

    const service = createService(databaseService);
    const status = await service.getTeenConnectStatus(7, 'teen');

    expect(status.profileReady).toBe(false);
    expect(status.missingProfileFields).toEqual(['phone', 'date_of_birth']);
    expect(status.hasConnectAccount).toBe(false);
  });
});
