import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DatabaseService } from '../database/database.service';

export interface PaymentMethodInfo {
  id: string;
  type: 'us_bank_account';
  last4: string;
  bankName?: string | null;
  accountHolderType?: string | null;
  accountType?: string | null;
  routingNumberLast4?: string | null;
  verificationStatus?: string | null;
}

export interface BillingStatus {
  hasPaymentMethod: boolean;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'incomplete' | null;
  stripeCustomerId?: string;
  paymentMethod?: PaymentMethodInfo;
}

export interface TeenConnectStatus {
  hasConnectAccount: boolean;
  accountId?: string;
  onboardingCompleted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  requirementsPastDue: string[];
  profileReady: boolean;
  missingProfileFields: string[];
}

type HomeBillingStatus = 'setup_required' | 'active' | 'past_due' | 'canceled' | 'suspended';
type UsageReportStatus = 'pending' | 'processing' | 'reported' | 'failed';

interface BillingUsageReportRecord {
  id: number;
  task_id: number;
  payment_id: number | null;
  service_id: number;
  home_id: number;
  homeowner_id: number;
  usage_value: string | number;
  occurred_at: string | Date;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_meter_id: string | null;
  stripe_event_identifier: string;
  stripe_event_name: string;
  stripe_value_key: string;
  status: UsageReportStatus;
  retry_count: number;
}

interface HydratedBillingUsageReportRecord extends BillingUsageReportRecord {
  service_name: string | null;
  home_subscription_id: string | null;
  homeowner_customer_id: string | null;
}

interface BillingPayoutClaimRecord {
  id: number;
  transfer_attempt_count: number;
}

interface HydratedBillingPayoutRecord {
  id: number;
  teen_id: number;
  amount: string | number;
  created_at: string | Date;
  description: string | null;
  reference_id: number | null;
  reference_type: string | null;
  stripe_invoice_id: string | null;
  invoice_settled_at: string | Date | null;
  stripe_source_transaction_id: string | null;
  stripe_transfer_group: string | null;
  stripe_transfer_id: string | null;
  transfer_attempt_count: number;
  teen_connect_account_id: string | null;
  teen_payouts_enabled: boolean;
  teen_onboarding_completed: boolean;
  teen_first_name: string | null;
  teen_last_name: string | null;
}

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private stripe: Stripe;
  private usageRetryTimer?: NodeJS.Timeout;
  private payoutRetryTimer?: NodeJS.Timeout;

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-11-17.clover' as any,
    });
  }

  onModuleInit() {
    this.startUsageRetryLoop();
    this.startPayoutRetryLoop();
  }

  onModuleDestroy() {
    if (this.usageRetryTimer) {
      clearInterval(this.usageRetryTimer);
      this.usageRetryTimer = undefined;
    }
    if (this.payoutRetryTimer) {
      clearInterval(this.payoutRetryTimer);
      this.payoutRetryTimer = undefined;
    }
  }

  async handleStripeWebhook(signature: string, rawBody: Buffer): Promise<void> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook is not configured');
    }

    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    if (!rawBody) {
      throw new BadRequestException('Missing webhook payload');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error: any) {
      console.error('Invalid Stripe webhook signature:', error?.message || error);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case 'account.updated':
          await this.handleConnectedAccountUpdated(event.data.object as Stripe.Account);
          break;
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        default:
          console.log(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (error) {
      // Let Stripe retry transient failures.
      console.error(`Error handling Stripe event ${event.type}:`, error);
      throw error;
    }
  }

  async createSetupIntent(userId: number): Promise<{ clientSecret: string; stripeCustomerId: string }> {
    try {
      const customer = await this.getOrCreateCustomer(userId);
      const setupIntent = await this.stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['us_bank_account'],
        payment_method_options: {
          us_bank_account: {
            financial_connections: {
              permissions: ['payment_method'],
            },
          },
        },
        usage: 'off_session',
        metadata: {
          userId: userId.toString(),
        },
      });

      return {
        clientSecret: setupIntent.client_secret!,
        stripeCustomerId: customer.id,
      };
    } catch (error) {
      console.error('Error creating setup intent:', error);
      throw new BadRequestException('Failed to create payment setup');
    }
  }

  async createCheckoutSetupSession(userId: number, options: {
    homeId?: number;
    planType?: 'single_can' | 'double_can' | 'triple_can';
    successUrl?: string;
    cancelUrl?: string;
  }) {
    try {
      const customer = await this.getOrCreateCustomer(userId);
      
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const successUrl = options.successUrl || `${frontendUrl}/dashboard?payment=success`;
      const cancelUrl = options.cancelUrl || `${frontendUrl}/dashboard?payment=cancelled`;

      const session = await this.stripe.checkout.sessions.create({
        mode: 'setup',
        customer: customer.id,
        payment_method_types: ['us_bank_account'],
        payment_method_options: {
          us_bank_account: {
            financial_connections: {
              permissions: ['payment_method'],
            },
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId.toString(),
          homeId: options.homeId?.toString() || '',
          planType: options.planType || 'single_can',
        },
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  async createCustomerPortalSession(userId: number, returnUrl?: string) {
    try {
      const customer = await this.getOrCreateCustomer(userId);
      
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const portalReturnUrl = returnUrl || `${frontendUrl}/dashboard`;

      // Create a portal session for the customer
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: portalReturnUrl,
      });

      return {
        url: session.url,
      };
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      throw new BadRequestException('Failed to create customer portal session');
    }
  }

  async getOrCreateCustomer(userId: number): Promise<Stripe.Customer> {
    // Check if customer already exists in our database
    const result = await this.databaseService.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];
    if (user?.stripe_customer_id) {
      try {
        const existingCustomer = await this.stripe.customers.retrieve(user.stripe_customer_id);
        if (!('deleted' in existingCustomer) || !existingCustomer.deleted) {
          return existingCustomer as Stripe.Customer;
        }

        console.warn(`Stripe customer ${user.stripe_customer_id} for user ${userId} is deleted. Recreating customer.`);
      } catch (error) {
        if (!this.isMissingStripeCustomerError(error)) {
          throw error;
        }

        console.warn(`Stripe customer ${user.stripe_customer_id} for user ${userId} was not found. Recreating customer.`);
      }

      await this.databaseService.query(
        'UPDATE users SET stripe_customer_id = NULL WHERE id = $1',
        [userId]
      );
    }

    // Get user details for creating customer
    const userResult = await this.databaseService.query(
      `SELECT u.email, p.first_name, p.last_name, p.phone
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [userId]
    );

    const userData = userResult.rows[0];
    if (!userData) {
      console.error(`User not found for ID: ${userId}`);
      throw new NotFoundException(`User not found for ID: ${userId}`);
    }

    console.log('User data found:', { 
      userId, 
      email: userData.email, 
      firstName: userData.first_name,
      lastName: userData.last_name,
      phone: userData.phone 
    });

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      email: userData.email,
      name: userData.first_name && userData.last_name 
        ? `${userData.first_name} ${userData.last_name}`
        : undefined,
      phone: userData.phone,
      metadata: {
        userId: userId.toString(),
      },
    });

    // Save customer ID to database
    await this.databaseService.query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [customer.id, userId]
    );

    return customer;
  }

  private isMissingStripeCustomerError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const stripeError = error as {
      code?: string;
      message?: string;
      raw?: { code?: string };
      statusCode?: number;
    };

    return stripeError.statusCode === 404
      || stripeError.code === 'resource_missing'
      || stripeError.raw?.code === 'resource_missing'
      || stripeError.message?.includes('No such customer:') === true;
  }

  async getBillingStatus(userId: number): Promise<BillingStatus> {
    try {
      const result = await this.databaseService.query(
        'SELECT stripe_customer_id FROM users WHERE id = $1',
        [userId]
      );

      const user = result.rows[0];
      if (!user?.stripe_customer_id) {
        return {
          hasPaymentMethod: false,
          subscriptionStatus: null,
        };
      }

      const customerId = user.stripe_customer_id;

      const paymentMethods = await this.listCustomerAchPaymentMethods(customerId);

      // Get active subscriptions
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 1,
      });

      const hasPaymentMethod = paymentMethods.data.length > 0;
      const activeSubscription = subscriptions.data.find(sub => 
        ['active', 'past_due', 'incomplete'].includes(sub.status)
      );

      let paymentMethod: PaymentMethodInfo | undefined;
      if (hasPaymentMethod) {
        paymentMethod = this.mapAchPaymentMethodInfo(paymentMethods.data[0]);
      }

      return {
        hasPaymentMethod,
        subscriptionStatus: activeSubscription?.status as any || null,
        stripeCustomerId: customerId,
        paymentMethod,
      };
    } catch (error) {
      console.error('Error getting billing status:', error);
      return {
        hasPaymentMethod: false,
        subscriptionStatus: null,
      };
    }
  }

  async getTeenConnectStatus(userId: number, userRole: string): Promise<TeenConnectStatus> {
    this.assertTeenRole(userRole);

    const profileResult = await this.databaseService.query(
      `SELECT
         first_name,
         last_name,
         phone,
         date_of_birth,
         stripe_connect_account_id,
         stripe_connect_onboarding_completed,
         stripe_connect_charges_enabled,
         stripe_connect_payouts_enabled,
         stripe_connect_details_submitted,
         stripe_connect_requirements_due,
         stripe_connect_requirements_past_due
       FROM profiles
       WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      throw new NotFoundException('Profile not found');
    }

    const profile = profileResult.rows[0];
    const accountId = profile.stripe_connect_account_id as string | null;
    const missingProfileFields = this.getMissingTeenPayoutProfileFields(profile);

    if (!accountId) {
      return this.getDefaultTeenConnectStatus(missingProfileFields);
    }

    try {
      const account = await this.stripe.accounts.retrieve(accountId, {}) as Stripe.Account | Stripe.DeletedAccount;
      if ('deleted' in account && account.deleted) {
        await this.clearTeenConnectAccount(userId);
        return this.getDefaultTeenConnectStatus(missingProfileFields);
      }

      return this.syncTeenConnectStatusForUser(userId, account as Stripe.Account);
    } catch (error: any) {
      if (error?.code === 'resource_missing') {
        await this.clearTeenConnectAccount(userId);
        return this.getDefaultTeenConnectStatus(missingProfileFields);
      }

      console.error(`Failed to retrieve Connect account ${accountId}:`, error);

      return {
        hasConnectAccount: true,
        accountId,
        onboardingCompleted: !!profile.stripe_connect_onboarding_completed,
        chargesEnabled: !!profile.stripe_connect_charges_enabled,
        payoutsEnabled: !!profile.stripe_connect_payouts_enabled,
        detailsSubmitted: !!profile.stripe_connect_details_submitted,
        requirementsDue: this.safeArray(profile.stripe_connect_requirements_due),
        requirementsPastDue: this.safeArray(profile.stripe_connect_requirements_past_due),
        profileReady: missingProfileFields.length === 0,
        missingProfileFields,
      };
    }
  }

  async createTeenConnectOnboardingLink(
    userId: number,
    userRole: string,
    options?: {
      returnUrl?: string;
      refreshUrl?: string;
    },
  ): Promise<{ url: string; status: TeenConnectStatus }> {
    this.assertTeenRole(userRole);

    const account = await this.getOrCreateTeenConnectAccount(userId);
    const status = await this.syncTeenConnectStatusForUser(userId, account);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const returnUrl = options?.returnUrl || `${frontendUrl}/dashboard?connect=return`;
    const refreshUrl = options?.refreshUrl || `${frontendUrl}/dashboard?connect=refresh`;

    const link = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return {
      url: link.url,
      status,
    };
  }

  async createTeenConnectDashboardLink(
    userId: number,
    userRole: string,
  ): Promise<{ url: string; status: TeenConnectStatus }> {
    this.assertTeenRole(userRole);

    const account = await this.getOrCreateTeenConnectAccount(userId);
    const status = await this.syncTeenConnectStatusForUser(userId, account);

    const loginLink = await this.stripe.accounts.createLoginLink(account.id);
    return {
      url: loginLink.url,
      status,
    };
  }

  private async getOrCreateTeenConnectAccount(userId: number): Promise<Stripe.Account> {
    const userProfileResult = await this.databaseService.query(
      `SELECT
         u.id,
         u.email,
         u.role,
         p.first_name,
         p.last_name,
         p.phone,
         p.date_of_birth,
         p.stripe_connect_account_id
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userProfileResult.rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const userProfile = userProfileResult.rows[0];
    if (userProfile.role !== 'teen') {
      throw new ForbiddenException('Only teen users can set up payouts');
    }
    const missingProfileFields = this.getMissingTeenPayoutProfileFields(userProfile);
    if (missingProfileFields.length > 0) {
      throw new BadRequestException(
        `Please complete your payout profile before setting up payouts: ${missingProfileFields
          .map((field) => this.formatPayoutProfileField(field))
          .join(', ')}`,
      );
    }

    const existingAccountId = userProfile.stripe_connect_account_id as string | null;
    if (existingAccountId) {
      try {
        const existingAccount = await this.stripe.accounts.retrieve(existingAccountId, {}) as Stripe.Account | Stripe.DeletedAccount;
        if ('deleted' in existingAccount && existingAccount.deleted) {
          await this.clearTeenConnectAccount(userId);
        } else {
          return existingAccount as Stripe.Account;
        }
      } catch (error: any) {
        if (error?.code === 'resource_missing') {
          await this.clearTeenConnectAccount(userId);
        } else {
          console.error(`Error retrieving Connect account ${existingAccountId}:`, error);
          throw new BadRequestException('Unable to verify payout account. Please try again.');
        }
      }
    }

    const connectCountry = (this.configService.get<string>('STRIPE_CONNECT_COUNTRY') || 'US').toUpperCase();
    const dateOfBirth = this.parseDateOfBirth(userProfile.date_of_birth);
    const account = await this.stripe.accounts.create({
      type: 'express',
      country: connectCountry,
      email: userProfile.email,
      business_type: 'individual',
      capabilities: {
        transfers: { requested: true },
      },
      individual: {
        first_name: userProfile.first_name,
        last_name: userProfile.last_name,
        email: userProfile.email,
        phone: userProfile.phone || undefined,
        dob: dateOfBirth || undefined,
      },
      metadata: {
        userId: userId.toString(),
        role: 'teen',
      },
    });

    await this.databaseService.query(
      `UPDATE profiles
       SET stripe_connect_account_id = $1,
           stripe_connect_last_synced_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [account.id, userId]
    );

    return account;
  }

  async createUsageSubscription(userId: number, homeId: number, planType: 'single_can' | 'double_can' | 'triple_can' = 'single_can'): Promise<{ subscriptionId: string }> {
    try {
      const customer = await this.getOrCreateCustomer(userId);

      const homeResult = await this.databaseService.query(
        `SELECT stripe_subscription_id
         FROM homes
         WHERE id = $1 AND homeowner_id = $2`,
        [homeId, userId]
      );

      if (homeResult.rows.length === 0) {
        throw new NotFoundException('Home not found');
      }

      const defaultPaymentMethodId = await this.getOrSetDefaultPaymentMethod(customer.id);
      if (!defaultPaymentMethodId) {
        throw new BadRequestException('No default payment method on file. Please set up billing first.');
      }

      // Get usage-based price for the specific plan type from Stripe
      const price = await this.getUsagePriceForPlan(planType);

      const existingSubscriptionId: string | null = homeResult.rows[0].stripe_subscription_id || null;
      if (existingSubscriptionId) {
        try {
          const existingSubscription = await this.stripe.subscriptions.retrieve(existingSubscriptionId);

          if (existingSubscription.status !== 'canceled') {
            const existingItem = existingSubscription.items.data[0];

            if (existingItem?.price?.id !== price.id) {
              await this.stripe.subscriptionItems.update(existingItem.id, {
                price: price.id,
                proration_behavior: 'none',
              });
            }

            await this.stripe.subscriptions.update(existingSubscription.id, {
              default_payment_method: defaultPaymentMethodId,
              collection_method: 'charge_automatically',
              payment_settings: {
                payment_method_types: ['us_bank_account'],
                save_default_payment_method: 'on_subscription',
              },
            });

            await this.databaseService.query(
              `UPDATE homes
               SET stripe_subscription_item_id = $1,
                   billing_status = $2
               WHERE id = $3 AND homeowner_id = $4`,
              [
                existingItem.id,
                this.mapStripeStatusToHomeBillingStatus(existingSubscription.status),
                homeId,
                userId,
              ]
            );

            return { subscriptionId: existingSubscription.id };
          }
        } catch (error: any) {
          // If the stored subscription is invalid/missing, create a fresh one.
          if (error?.code !== 'resource_missing') {
            console.warn('Error retrieving existing subscription, creating a new one:', error);
          }
        }
      }

      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [
          {
            price: price.id,
          },
        ],
        default_payment_method: defaultPaymentMethodId,
        payment_behavior: 'allow_incomplete',
        payment_settings: {
          payment_method_types: ['us_bank_account'],
          save_default_payment_method: 'on_subscription',
        },
        collection_method: 'charge_automatically',
        metadata: {
          userId: userId.toString(),
          homeId: homeId.toString(),
        },
      });

      // Store subscription details
      await this.databaseService.query(
        `UPDATE homes
         SET stripe_subscription_id = $1,
             stripe_subscription_item_id = $2,
             billing_status = $3
         WHERE id = $4 AND homeowner_id = $5`,
        [
          subscription.id,
          subscription.items.data[0]?.id || null,
          this.mapStripeStatusToHomeBillingStatus(subscription.status),
          homeId,
          userId,
        ]
      );

      return { subscriptionId: subscription.id };
    } catch (error) {
      console.error('Error creating usage subscription:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to create billing subscription');
    }
  }

  async processQueuedTaskUsage(taskId: number, force = true): Promise<void> {
    const claimedReport = await this.claimUsageReport(taskId, force);
    if (!claimedReport) {
      return;
    }

    try {
      const hydratedReport = await this.loadUsageReport(taskId);
      if (!hydratedReport) {
        throw new Error(`Usage report for task ${taskId} was not found after claim`);
      }

      const metadata = await this.resolveUsageReportMetadata(hydratedReport);
      await this.persistUsageReportMetadata(taskId, metadata);

      const payload: Record<string, string> = {
        stripe_customer_id: metadata.stripeCustomerId,
      };
      payload[metadata.valueKey] = String(hydratedReport.usage_value);

      await this.stripe.billing.meterEvents.create({
        event_name: metadata.eventName,
        payload,
        identifier: hydratedReport.stripe_event_identifier,
        timestamp: Math.floor(this.toDate(hydratedReport.occurred_at).getTime() / 1000),
      });

      await this.databaseService.query(
        `UPDATE billing_usage_reports
         SET status = 'reported',
             stripe_customer_id = $2,
             stripe_subscription_id = $3,
             stripe_meter_id = $4,
             stripe_event_name = $5,
             stripe_value_key = $6,
             reported_at = CURRENT_TIMESTAMP,
             next_retry_at = CURRENT_TIMESTAMP,
             last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE task_id = $1`,
        [
          taskId,
          metadata.stripeCustomerId,
          metadata.subscriptionId,
          metadata.meterId,
          metadata.eventName,
          metadata.valueKey,
        ]
      );

      console.log(`✅ Reported queued meter usage for task ${taskId}`);
    } catch (error) {
      console.error(`❌ Error reporting queued task usage for task ${taskId}:`, error);

      const nextRetryAt = this.computeNextUsageRetryAt(claimedReport.retry_count);
      await this.databaseService.query(
        `UPDATE billing_usage_reports
         SET status = 'failed',
             last_error = $2,
             next_retry_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE task_id = $1`,
        [
          taskId,
          this.formatStripeError(error),
          nextRetryAt,
        ]
      );
    }
  }

  async retryPendingUsageReports(limit = 25): Promise<number> {
    const result = await this.databaseService.query(
      `SELECT task_id
       FROM billing_usage_reports
       WHERE status IN ('pending', 'failed')
         AND next_retry_at <= CURRENT_TIMESTAMP
       ORDER BY occurred_at ASC
       LIMIT $1`,
      [limit]
    );

    for (const row of result.rows) {
      await this.processQueuedTaskUsage(Number(row.task_id), false);
    }

    return result.rows.length;
  }

  async processTeenPayoutTransfer(paymentId: number, force = true): Promise<void> {
    const claimedPayment = await this.claimPayoutPayment(paymentId, force);
    if (!claimedPayment) {
      return;
    }

    try {
      const payoutPayment = await this.loadPayoutPayment(paymentId);
      if (!payoutPayment) {
        throw new Error(`Payout payment ${paymentId} was not found after claim`);
      }

      if (!payoutPayment.stripe_invoice_id || !payoutPayment.invoice_settled_at) {
        await this.databaseService.query(
          `UPDATE payments
           SET status = 'pending',
               transfer_failure_reason = $2,
               transfer_next_retry_at = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            paymentId,
            'Payment is not yet tied to a paid homeowner invoice',
            this.computeNextPayoutRetryAt(claimedPayment.transfer_attempt_count, true),
          ]
        );
        return;
      }

      if (
        !payoutPayment.teen_connect_account_id
        || !payoutPayment.teen_payouts_enabled
        || !payoutPayment.teen_onboarding_completed
      ) {
        await this.databaseService.query(
          `UPDATE payments
           SET status = 'pending',
               transfer_failure_reason = $2,
               transfer_next_retry_at = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            paymentId,
            'Teen payout onboarding is incomplete',
            this.computeNextPayoutRetryAt(claimedPayment.transfer_attempt_count, true),
          ]
        );
        return;
      }

      const sourceTransactionId =
        payoutPayment.stripe_source_transaction_id
        || await this.resolveInvoiceSourceTransaction(payoutPayment.stripe_invoice_id);
      const transferGroup =
        payoutPayment.stripe_transfer_group
        || `invoice_${payoutPayment.stripe_invoice_id}`;

      const transfer = await this.stripe.transfers.create({
        amount: this.amountToCents(payoutPayment.amount),
        currency: 'usd',
        destination: payoutPayment.teen_connect_account_id,
        description:
          payoutPayment.description
          || `Kids Can teen payout for payment ${paymentId}`,
        metadata: {
          paymentId: String(paymentId),
          teenId: String(payoutPayment.teen_id),
          invoiceId: payoutPayment.stripe_invoice_id,
          taskId: payoutPayment.reference_id ? String(payoutPayment.reference_id) : '',
        },
        source_transaction: sourceTransactionId || undefined,
        transfer_group: transferGroup,
      });

      await this.recordSuccessfulTeenPayout(
        payoutPayment,
        transfer.id,
        transferGroup,
        sourceTransactionId,
      );
    } catch (error) {
      console.error(`❌ Error creating payout transfer for payment ${paymentId}:`, error);

      await this.databaseService.query(
        `UPDATE payments
         SET status = 'pending',
             transfer_failure_reason = $2,
             transfer_next_retry_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          paymentId,
          this.formatStripeError(error),
          this.computeNextPayoutRetryAt(claimedPayment.transfer_attempt_count),
        ]
      );
    }
  }

  async retryPendingPayoutTransfers(limit = 25): Promise<number> {
    const result = await this.databaseService.query(
      `SELECT id
       FROM payments
       WHERE type = 'task_completion'
         AND status = 'pending'
         AND invoice_settled_at IS NOT NULL
         AND stripe_transfer_id IS NULL
         AND COALESCE(transfer_next_retry_at, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
       ORDER BY invoice_settled_at ASC, id ASC
       LIMIT $1`,
      [limit]
    );

    for (const row of result.rows) {
      await this.processTeenPayoutTransfer(Number(row.id), false);
    }

    return result.rows.length;
  }

  private async processInvoiceSettledPayoutTransfers(invoiceId: string, limit = 100): Promise<number> {
    const result = await this.databaseService.query(
      `SELECT id
       FROM payments
       WHERE type = 'task_completion'
         AND status = 'pending'
         AND stripe_invoice_id = $1
         AND stripe_transfer_id IS NULL
       ORDER BY id ASC
       LIMIT $2`,
      [invoiceId, limit]
    );

    for (const row of result.rows) {
      await this.processTeenPayoutTransfer(Number(row.id), true);
    }

    return result.rows.length;
  }

  private startUsageRetryLoop(): void {
    const configuredInterval = Number(this.configService.get<string>('BILLING_USAGE_RETRY_INTERVAL_MS') || '300000');
    if (!Number.isFinite(configuredInterval) || configuredInterval <= 0) {
      console.warn('Billing usage retry loop is disabled due to invalid interval configuration.');
      return;
    }

    void this.retryPendingUsageReports().catch((error) => {
      console.error('Failed initial billing usage retry sweep:', error);
    });

    this.usageRetryTimer = setInterval(() => {
      void this.retryPendingUsageReports().catch((error) => {
        console.error('Failed to retry pending billing usage reports:', error);
      });
    }, configuredInterval);
  }

  private startPayoutRetryLoop(): void {
    const configuredInterval = Number(this.configService.get<string>('BILLING_PAYOUT_RETRY_INTERVAL_MS') || '300000');
    if (!Number.isFinite(configuredInterval) || configuredInterval <= 0) {
      console.warn('Billing payout retry loop is disabled due to invalid interval configuration.');
      return;
    }

    void this.retryPendingPayoutTransfers().catch((error) => {
      console.error('Failed initial payout retry sweep:', error);
    });

    this.payoutRetryTimer = setInterval(() => {
      void this.retryPendingPayoutTransfers().catch((error) => {
        console.error('Failed to retry pending payout transfers:', error);
      });
    }, configuredInterval);
  }

  private async claimUsageReport(taskId: number, force: boolean): Promise<BillingUsageReportRecord | null> {
    const result = await this.databaseService.query(
      `UPDATE billing_usage_reports
       SET status = 'processing',
           retry_count = retry_count + 1,
           attempted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE task_id = $1
         AND status IN ('pending', 'failed')
         AND ($2::boolean OR next_retry_at <= CURRENT_TIMESTAMP)
       RETURNING *`,
      [taskId, force]
    );

    return (result.rows[0] as BillingUsageReportRecord | undefined) || null;
  }

  private async claimPayoutPayment(paymentId: number, force: boolean): Promise<BillingPayoutClaimRecord | null> {
    const result = await this.databaseService.query(
      `UPDATE payments
       SET status = 'processing',
           transfer_attempt_count = transfer_attempt_count + 1,
           transfer_attempted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND type = 'task_completion'
         AND stripe_transfer_id IS NULL
         AND invoice_settled_at IS NOT NULL
         AND (
           status = 'pending'
           OR (
             status = 'processing'
             AND transfer_attempted_at <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
           )
         )
         AND ($2::boolean OR COALESCE(transfer_next_retry_at, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP)
       RETURNING id, transfer_attempt_count`,
      [paymentId, force]
    );

    return (result.rows[0] as BillingPayoutClaimRecord | undefined) || null;
  }

  private async loadUsageReport(taskId: number): Promise<HydratedBillingUsageReportRecord | null> {
    const result = await this.databaseService.query(
      `SELECT
         bur.*,
         s.name AS service_name,
         h.stripe_subscription_id AS home_subscription_id,
         u.stripe_customer_id AS homeowner_customer_id
       FROM billing_usage_reports bur
       JOIN services s ON bur.service_id = s.id
       JOIN homes h ON bur.home_id = h.id
       JOIN users u ON bur.homeowner_id = u.id
       WHERE bur.task_id = $1
       LIMIT 1`,
      [taskId]
    );

    return (result.rows[0] as HydratedBillingUsageReportRecord | undefined) || null;
  }

  private async loadPayoutPayment(paymentId: number): Promise<HydratedBillingPayoutRecord | null> {
    const result = await this.databaseService.query(
      `SELECT
         p.id,
         p.teen_id,
         p.amount,
         p.created_at,
         p.description,
         p.reference_id,
         p.reference_type,
         p.stripe_invoice_id,
         p.invoice_settled_at,
         p.stripe_source_transaction_id,
         p.stripe_transfer_group,
         p.stripe_transfer_id,
         p.transfer_attempt_count,
         teen_profile.stripe_connect_account_id AS teen_connect_account_id,
         COALESCE(teen_profile.stripe_connect_payouts_enabled, FALSE) AS teen_payouts_enabled,
         COALESCE(teen_profile.stripe_connect_onboarding_completed, FALSE) AS teen_onboarding_completed,
         teen_profile.first_name AS teen_first_name,
         teen_profile.last_name AS teen_last_name
       FROM payments p
       LEFT JOIN profiles teen_profile ON teen_profile.user_id = p.teen_id
       WHERE p.id = $1
       LIMIT 1`,
      [paymentId]
    );

    return (result.rows[0] as HydratedBillingPayoutRecord | undefined) || null;
  }

  private async resolveInvoiceSourceTransaction(invoiceOrId: Stripe.Invoice | string): Promise<string | null> {
    const invoiceId = typeof invoiceOrId === 'string' ? invoiceOrId : invoiceOrId.id;
    const invoicePayments = typeof invoiceOrId === 'string'
      ? await this.stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 10 })
      : (invoiceOrId.payments?.data?.length
          ? invoiceOrId.payments
          : await this.stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 10 }));

    for (const invoicePayment of invoicePayments.data || []) {
      const chargeId = await this.getChargeIdFromInvoicePayment(invoicePayment);
      if (chargeId) {
        return chargeId;
      }
    }

    return null;
  }

  private async getChargeIdFromInvoicePayment(invoicePayment: Stripe.InvoicePayment): Promise<string | null> {
    if (invoicePayment.payment.type === 'charge') {
      const chargeRef = invoicePayment.payment.charge;
      return typeof chargeRef === 'string' ? chargeRef : chargeRef?.id || null;
    }

    if (invoicePayment.payment.type === 'payment_intent') {
      const paymentIntentRef = invoicePayment.payment.payment_intent;
      if (!paymentIntentRef) {
        return null;
      }

      const paymentIntent = typeof paymentIntentRef === 'string'
        ? await this.stripe.paymentIntents.retrieve(paymentIntentRef)
        : paymentIntentRef;
      const latestCharge = paymentIntent.latest_charge;
      return typeof latestCharge === 'string' ? latestCharge : latestCharge?.id || null;
    }

    return null;
  }

  private async markInvoiceSettledTaskPaymentsForHome(
    homeId: number,
    periodStart: number,
    periodEnd: number,
    invoiceId: string,
    sourceTransactionId: string | null,
  ): Promise<number> {
    return this.databaseService.transaction(async (client) => {
      const paymentResult = await client.query(
        `SELECT p.id
         FROM payments p
         JOIN tasks t ON p.reference_type = 'task' AND p.reference_id = t.id
         JOIN services s ON t.service_id = s.id
         JOIN billing_usage_reports bur ON bur.task_id = t.id
         WHERE s.home_id = $1
           AND p.status = 'pending'
           AND p.type = 'task_completion'
           AND p.stripe_invoice_id IS NULL
           AND t.status = 'completed'
           AND bur.status = 'reported'
           AND t.completed_at >= to_timestamp($2)
           AND t.completed_at < to_timestamp($3)
         FOR UPDATE`,
        [homeId, periodStart, periodEnd]
      );

      const paymentIds = paymentResult.rows.map((row) => Number(row.id));
      if (paymentIds.length === 0) {
        return 0;
      }

      await client.query(
        `UPDATE payments
         SET stripe_invoice_id = $2,
             invoice_settled_at = CURRENT_TIMESTAMP,
             stripe_source_transaction_id = COALESCE($3, stripe_source_transaction_id),
             transfer_next_retry_at = CURRENT_TIMESTAMP,
             transfer_failure_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [paymentIds, invoiceId, sourceTransactionId]
      );

      await client.query(
        `INSERT INTO earnings (teen_id, period_start, period_end, total_earned, total_paid, pending_amount)
         SELECT
           p.teen_id,
           DATE_TRUNC('month', p.created_at)::date AS period_start,
           (DATE_TRUNC('month', p.created_at) + INTERVAL '1 month - 1 day')::date AS period_end,
           SUM(p.amount) AS total_earned,
           0 AS total_paid,
           SUM(p.amount) AS pending_amount
         FROM payments p
         WHERE p.id = ANY($1::int[])
         GROUP BY p.teen_id, DATE_TRUNC('month', p.created_at)::date
         ON CONFLICT (teen_id, period_start, period_end)
         DO UPDATE SET
           total_earned = earnings.total_earned + EXCLUDED.total_earned,
           pending_amount = earnings.pending_amount + EXCLUDED.pending_amount,
           updated_at = CURRENT_TIMESTAMP`,
        [paymentIds]
      );

      return paymentIds.length;
    });
  }

  private async resolveUsageReportMetadata(
    report: HydratedBillingUsageReportRecord,
  ): Promise<{
    stripeCustomerId: string;
    subscriptionId: string;
    meterId: string | null;
    eventName: string;
    valueKey: string;
  }> {
    let stripeCustomerId = report.stripe_customer_id || report.homeowner_customer_id || null;
    if (!stripeCustomerId) {
      const customer = await this.getOrCreateCustomer(report.homeowner_id);
      stripeCustomerId = customer.id;
    }

    let subscriptionId = report.stripe_subscription_id || report.home_subscription_id || null;
    if (!subscriptionId) {
      const inferredPlanType = this.inferPlanTypeFromServiceName(report.service_name || undefined);
      const subscriptionResult = await this.createUsageSubscription(
        report.homeowner_id,
        report.home_id,
        inferredPlanType
      );
      subscriptionId = subscriptionResult.subscriptionId;
    }

    let eventName = report.stripe_event_name || 'can_completed';
    let valueKey = report.stripe_value_key || 'value';
    let meterId = report.stripe_meter_id || null;

    if (subscriptionId) {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const recurring = subscription.items.data[0]?.price?.recurring as { meter?: string | null } | undefined;
      meterId = recurring?.meter || meterId;

      if (meterId) {
        const meter = await this.stripe.billing.meters.retrieve(meterId);
        eventName = meter.event_name || eventName;
        valueKey = meter.value_settings?.event_payload_key || valueKey;
      }
    }

    if (!stripeCustomerId || !subscriptionId) {
      throw new Error(`Unable to resolve billing metadata for task ${report.task_id}`);
    }

    return {
      stripeCustomerId,
      subscriptionId,
      meterId,
      eventName,
      valueKey,
    };
  }

  private async persistUsageReportMetadata(
    taskId: number,
    metadata: {
      stripeCustomerId: string;
      subscriptionId: string;
      meterId: string | null;
      eventName: string;
      valueKey: string;
    },
  ): Promise<void> {
    await this.databaseService.query(
      `UPDATE billing_usage_reports
       SET stripe_customer_id = $2,
           stripe_subscription_id = $3,
           stripe_meter_id = $4,
           stripe_event_name = $5,
           stripe_value_key = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE task_id = $1`,
      [
        taskId,
        metadata.stripeCustomerId,
        metadata.subscriptionId,
        metadata.meterId,
        metadata.eventName,
        metadata.valueKey,
      ]
    );
  }

  private async recordSuccessfulTeenPayout(
    payoutPayment: HydratedBillingPayoutRecord,
    transferId: string,
    transferGroup: string,
    sourceTransactionId: string | null,
  ): Promise<void> {
    const paymentCreatedAt = this.toDate(payoutPayment.created_at);
    const periodStart = new Date(paymentCreatedAt.getFullYear(), paymentCreatedAt.getMonth(), 1);
    const periodEnd = new Date(paymentCreatedAt.getFullYear(), paymentCreatedAt.getMonth() + 1, 0);

    await this.databaseService.transaction(async (client) => {
      await client.query(
        `UPDATE payments
         SET status = 'completed',
             processed_at = CURRENT_TIMESTAMP,
             stripe_transfer_id = $2,
             stripe_transfer_group = $3,
             stripe_source_transaction_id = COALESCE($4, stripe_source_transaction_id),
             transfer_failure_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [payoutPayment.id, transferId, transferGroup, sourceTransactionId]
      );

      await client.query(
        `INSERT INTO earnings (teen_id, period_start, period_end, total_earned, total_paid, pending_amount)
         VALUES ($1, $2, $3, 0, $4, 0)
         ON CONFLICT (teen_id, period_start, period_end)
         DO UPDATE SET
           total_paid = earnings.total_paid + EXCLUDED.total_paid,
           pending_amount = GREATEST(0, earnings.pending_amount - EXCLUDED.total_paid),
           updated_at = CURRENT_TIMESTAMP`,
        [
          payoutPayment.teen_id,
          periodStart.toISOString().split('T')[0],
          periodEnd.toISOString().split('T')[0],
          payoutPayment.amount,
        ]
      );
    });
  }

  private computeNextUsageRetryAt(retryCount: number): Date {
    const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(retryCount - 1, 5)));
    return new Date(Date.now() + delayMinutes * 60 * 1000);
  }

  private computeNextPayoutRetryAt(retryCount: number, blocked = false): Date {
    const baseMinutes = blocked ? 60 : 5;
    const ceilingMinutes = blocked ? 24 * 60 : 12 * 60;
    const multiplier = 2 ** Math.min(Math.max(retryCount - 1, 0), 5);
    const delayMinutes = Math.min(ceilingMinutes, baseMinutes * multiplier);
    return new Date(Date.now() + delayMinutes * 60 * 1000);
  }

  private amountToCents(amount: string | number): number {
    return Math.round(Number(amount || 0) * 100);
  }

  private formatStripeError(error: unknown): string {
    if (!error) {
      return 'Unknown Stripe usage reporting error';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private toDate(value: string | Date): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private async getUsagePriceForPlan(planType: 'single_can' | 'double_can' | 'triple_can'): Promise<Stripe.Price> {
    // Fetch pricing from Stripe products using lookup keys
    const lookupKeys = {
      single_can: 'kids_can_single_can_task_price',
      double_can: 'kids_can_double_can_task_price', 
      triple_can: 'kids_can_triple_can_task_price',
    };

    try {
      // Fetch price from Stripe using lookup key
      const prices = await this.stripe.prices.list({
        lookup_keys: [lookupKeys[planType]],
        limit: 1,
        active: true,
      });

      if (prices.data.length > 0) {
        console.log(`Found ${planType} price using lookup key:`, {
          priceId: prices.data[0].id,
          amount: prices.data[0].unit_amount,
          lookupKey: lookupKeys[planType]
        });
        return prices.data[0];
      }

      // If price doesn't exist, throw error
      throw new Error(`Price for plan type ${planType} not found in Stripe. Please ensure price has lookup key: ${lookupKeys[planType]}`);
    } catch (error) {
      console.error(`Error fetching ${planType} price from Stripe:`, error);
      throw new BadRequestException(`Pricing configuration error for ${planType}. Please contact support.`);
    }
  }

  async getAllAvailableProducts(): Promise<{ products: any[]; prices: any[] }> {
    try {
      // Fetch all active products
      const products = await this.stripe.products.list({
        active: true,
        limit: 100,
      });

      // Fetch all active prices
      const prices = await this.stripe.prices.list({
        active: true,
        limit: 100,
      });

      return {
        products: products.data,
        prices: prices.data,
      };
    } catch (error) {
      console.error('Error fetching products from Stripe:', error);
      throw new BadRequestException('Unable to fetch products from Stripe.');
    }
  }

  async getPricingInfo(): Promise<Record<string, { amount: number; currency: string; planType: string; productName: string; priceId: string }>> {
    try {
      const { products, prices } = await this.getAllAvailableProducts();
      const pricing: Record<string, { amount: number; currency: string; planType: string; productName: string; priceId: string }> = {};

      // Find actual Stripe products and match them to plan types
      for (const price of prices) {
        if (price.type === 'recurring') {
          const product = products.find(p => p.id === price.product);
          if (product) {
            const productName = product.name.toLowerCase();
            let planType: string | null = null;
            
            // Match products based on name patterns
            if (productName.includes('single') || productName.includes('one') || productName.includes('1')) {
              planType = 'single_can';
            } else if (productName.includes('double') || productName.includes('two') || productName.includes('2')) {
              planType = 'double_can';
            } else if (productName.includes('triple') || productName.includes('three') || productName.includes('3')) {
              planType = 'triple_can';
            }

            if (planType) {
              pricing[planType] = {
                amount: price.unit_amount || 0, // Per-can price from Stripe
                currency: price.currency,
                planType,
                productName: product.name,
                priceId: price.id,
              };
            }
          }
        }
      }

      console.log('📊 Fetched pricing from Stripe:', pricing);
      return pricing;
    } catch (error) {
      console.error('Error fetching pricing info from Stripe:', error);
      throw new BadRequestException('Unable to fetch current pricing. Please try again later.');
    }
  }

  // Legacy method - kept for backward compatibility
  private async getOrCreateUsagePrice(): Promise<Stripe.Price> {
    return this.getUsagePriceForPlan('single_can');
  }

  async validatePaymentMethod(userId: number): Promise<boolean> {
    try {
      const result = await this.databaseService.query(
        'SELECT stripe_customer_id FROM users WHERE id = $1',
        [userId]
      );

      const customerId = result.rows[0]?.stripe_customer_id;
      if (!customerId) {
        return false;
      }

      const defaultPaymentMethodId = await this.getOrSetDefaultPaymentMethod(customerId);
      return !!defaultPaymentMethodId;
    } catch (error) {
      console.error('Error validating payment method:', error);
      return false;
    }
  }

  async cancelSubscriptionAtPeriodEnd(userId: number, homeId: number): Promise<void> {
    try {
      // Get the subscription ID for this home
      const result = await this.databaseService.query(
        'SELECT stripe_subscription_id FROM homes WHERE id = $1 AND homeowner_id = $2',
        [homeId, userId]
      );

      const home = result.rows[0];
      if (!home?.stripe_subscription_id) {
        console.warn(`No subscription found for home ${homeId} and user ${userId}`);
        return;
      }

      // Cancel subscription at period end (allows final billing cycle)
      await this.stripe.subscriptions.update(home.stripe_subscription_id, {
        cancel_at_period_end: true,
        metadata: {
          cancelled_by_user: 'true',
          cancelled_at: new Date().toISOString(),
        },
      });

      // Update billing status in database
      await this.databaseService.query(
        'UPDATE homes SET billing_status = $1 WHERE id = $2',
        ['canceled', homeId]
      );

      console.log(`Subscription ${home.stripe_subscription_id} set to cancel at period end`);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw new BadRequestException('Failed to cancel subscription');
    }
  }

  async getCurrentPeriodUsage(userId: number, homeId: number): Promise<{ usage: number; amount: number; period_start: number; period_end: number; pricing: any }> {
    try {
      // Get subscription ID and current service pricing for this home
      const result = await this.databaseService.query(
        `SELECT h.stripe_subscription_id, s.price_per_task 
         FROM homes h
         LEFT JOIN services s ON s.home_id = h.id AND s.status = 'active'
         WHERE h.id = $1 AND h.homeowner_id = $2
         LIMIT 1`,
        [homeId, userId]
      );

      const home = result.rows[0];
      if (!home?.stripe_subscription_id) {
        // Return empty usage data for homes without subscriptions
        return {
          usage: 0,
          amount: 0,
          period_start: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // 30 days ago
          period_end: Math.floor(Date.now() / 1000),
          pricing: home?.price_per_task || 0
        };
      }

      // Get the current subscription for billing period info
      const subscription = await this.stripe.subscriptions.retrieve(home.stripe_subscription_id);
      const { start: periodStart, end: periodEnd } = this.getSubscriptionPeriodBounds(subscription);

      // Count completed tasks in current billing period from our database
      // This gives us usage that should match what we've sent to Stripe meter
      const usageResult = await this.databaseService.query(
        `SELECT
           COUNT(*) as completed_tasks,
           COALESCE(SUM(t.price_per_task), 0) as total_amount
         FROM tasks t
         JOIN services s ON t.service_id = s.id
         WHERE s.home_id = $1 
           AND t.status = 'completed'
           AND t.completed_at >= to_timestamp($2)
           AND t.completed_at <= to_timestamp($3)`,
        [homeId, periodStart, periodEnd]
      );

      const completedTasks = parseInt(usageResult.rows[0]?.completed_tasks || '0', 10);
      const totalAmount = Math.round(Number(usageResult.rows[0]?.total_amount || 0) * 100);
      const currentPricePerCan = Number(home.price_per_task || 0);
      
      return {
        usage: completedTasks,
        amount: totalAmount,
        period_start: periodStart,
        period_end: periodEnd,
        pricing: {
          per_can: currentPricePerCan,
          currency: 'usd'
        }
      };
    } catch (error) {
      console.error('Error fetching current period usage:', error);
      throw new BadRequestException('Unable to fetch usage data');
    }
  }

  async getCurrentMeterEvents(userId: number, homeId: number): Promise<{ events: any[]; total_events: number }> {
    try {
      const periodResult = await this.databaseService.query(
        `SELECT stripe_subscription_id
         FROM homes
         WHERE id = $1 AND homeowner_id = $2
         LIMIT 1`,
        [homeId, userId]
      );

      if (periodResult.rows.length === 0) {
        throw new NotFoundException('Home not found');
      }

      let periodStart = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      if (periodResult.rows[0]?.stripe_subscription_id) {
        const subscription = await this.stripe.subscriptions.retrieve(periodResult.rows[0].stripe_subscription_id);
        periodStart = this.getSubscriptionPeriodBounds(subscription).start;
      }

      const eventsResult = await this.databaseService.query(
        `SELECT
           task_id,
           payment_id,
           usage_value,
           occurred_at,
           stripe_event_identifier,
           stripe_event_name,
           stripe_value_key,
           status,
           retry_count,
           attempted_at,
           reported_at,
           next_retry_at,
           last_error
         FROM billing_usage_reports
         WHERE home_id = $1
           AND occurred_at >= to_timestamp($2)
         ORDER BY occurred_at DESC`,
        [homeId, periodStart]
      );

      return {
        events: eventsResult.rows,
        total_events: eventsResult.rows.length,
      };
    } catch (error) {
      console.error('Error fetching meter events:', error);
      throw new BadRequestException('Unable to fetch meter events');
    }
  }

  async updateSubscriptionPlan(userId: number, homeId: number, newPlanType: 'single_can' | 'double_can' | 'triple_can'): Promise<void> {
    try {
      // Get the subscription ID for this home
      const result = await this.databaseService.query(
        'SELECT stripe_subscription_id, stripe_subscription_item_id FROM homes WHERE id = $1 AND homeowner_id = $2',
        [homeId, userId]
      );

      const home = result.rows[0];
      if (!home?.stripe_subscription_id) {
        console.warn(`No subscription found for home ${homeId} and user ${userId}`);
        return;
      }

      // Get the new price for the plan type from Stripe
      const newPrice = await this.getUsagePriceForPlan(newPlanType);

      // Update the subscription item with the new price
      const subscription = await this.stripe.subscriptions.retrieve(home.stripe_subscription_id);
      const subscriptionItem = subscription.items.data[0];

      await this.stripe.subscriptionItems.update(subscriptionItem.id, {
        price: newPrice.id,
        proration_behavior: 'create_prorations', // Prorate the change
      });

      // Update the database with new subscription item ID
      await this.databaseService.query(
        'UPDATE homes SET stripe_subscription_item_id = $1, billing_status = $2 WHERE id = $3',
        [
          subscriptionItem.id,
          this.mapStripeStatusToHomeBillingStatus(subscription.status),
          homeId,
        ]
      );

      console.log(`Subscription ${home.stripe_subscription_id} updated to ${newPlanType} plan`);
    } catch (error) {
      console.error('Error updating subscription plan:', error);
      throw new BadRequestException('Failed to update subscription plan');
    }
  }

  private assertTeenRole(userRole: string): void {
    if (userRole !== 'teen') {
      throw new ForbiddenException('Only teen users can access payout onboarding');
    }
  }

  private getDefaultTeenConnectStatus(missingProfileFields: string[] = []): TeenConnectStatus {
    return {
      hasConnectAccount: false,
      onboardingCompleted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
      requirementsPastDue: [],
      profileReady: missingProfileFields.length === 0,
      missingProfileFields,
    };
  }

  private safeArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }
    return [];
  }

  private async listCustomerAchPaymentMethods(customerId: string, limit = 10) {
    return this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account',
      limit,
    });
  }

  private isUsBankAccountPaymentMethod(paymentMethod: Stripe.PaymentMethod | null | undefined): boolean {
    return !!paymentMethod && paymentMethod.type === 'us_bank_account' && !!paymentMethod.us_bank_account;
  }

  private mapAchPaymentMethodInfo(paymentMethod: Stripe.PaymentMethod): PaymentMethodInfo | undefined {
    if (!this.isUsBankAccountPaymentMethod(paymentMethod)) {
      return undefined;
    }

    const bankAccount = paymentMethod.us_bank_account!;
    return {
      id: paymentMethod.id,
      type: 'us_bank_account',
      last4: bankAccount.last4 || '----',
      bankName: bankAccount.bank_name || null,
      accountHolderType: bankAccount.account_holder_type || null,
      accountType: bankAccount.account_type || null,
      routingNumberLast4: bankAccount.routing_number?.slice(-4) || null,
      verificationStatus: bankAccount.status_details?.blocked ? 'blocked' : null,
    };
  }

  private getMissingTeenPayoutProfileFields(profile: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    date_of_birth?: string | Date | null;
  }): string[] {
    const missing: string[] = [];

    if (!profile.first_name) {
      missing.push('first_name');
    }
    if (!profile.last_name) {
      missing.push('last_name');
    }
    if (!profile.phone) {
      missing.push('phone');
    }
    if (!profile.date_of_birth) {
      missing.push('date_of_birth');
    }

    return missing;
  }

  private formatPayoutProfileField(field: string): string {
    switch (field) {
      case 'first_name':
        return 'first name';
      case 'last_name':
        return 'last name';
      case 'date_of_birth':
        return 'date of birth';
      default:
        return field.replace(/_/g, ' ');
    }
  }

  private parseDateOfBirth(value: string | Date | null | undefined): { day: number; month: number; year: number } | null {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return {
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
    };
  }

  private async getTeenPayoutProfile(userId: number): Promise<{
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    date_of_birth: string | Date | null;
  }> {
    const profileResult = await this.databaseService.query(
      `SELECT first_name, last_name, phone, date_of_birth
       FROM profiles
       WHERE user_id = $1`,
      [userId],
    );

    if (profileResult.rows.length === 0) {
      throw new NotFoundException('Profile not found');
    }

    return profileResult.rows[0];
  }

  private async clearTeenConnectAccount(userId: number): Promise<void> {
    await this.databaseService.query(
      `UPDATE profiles
       SET stripe_connect_account_id = NULL,
           stripe_connect_onboarding_completed = FALSE,
           stripe_connect_charges_enabled = FALSE,
           stripe_connect_payouts_enabled = FALSE,
           stripe_connect_details_submitted = FALSE,
           stripe_connect_requirements_due = '[]'::jsonb,
           stripe_connect_requirements_past_due = '[]'::jsonb,
           stripe_connect_last_synced_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
  }

  private buildTeenConnectStatusFromAccount(account: Stripe.Account, missingProfileFields: string[] = []): TeenConnectStatus {
    const requirementsDue = this.safeArray(account.requirements?.currently_due || []);
    const requirementsPastDue = this.safeArray(account.requirements?.past_due || []);

    return {
      hasConnectAccount: true,
      accountId: account.id,
      onboardingCompleted:
        !!account.details_submitted &&
        requirementsDue.length === 0 &&
        requirementsPastDue.length === 0,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
      requirementsDue,
      requirementsPastDue,
      profileReady: missingProfileFields.length === 0,
      missingProfileFields,
    };
  }

  private async syncTeenConnectStatusForUser(
    userId: number,
    account: Stripe.Account,
  ): Promise<TeenConnectStatus> {
    const payoutProfile = await this.getTeenPayoutProfile(userId);
    const status = this.buildTeenConnectStatusFromAccount(
      account,
      this.getMissingTeenPayoutProfileFields(payoutProfile),
    );

    await this.databaseService.query(
      `UPDATE profiles
       SET stripe_connect_account_id = $1,
           stripe_connect_onboarding_completed = $2,
           stripe_connect_charges_enabled = $3,
           stripe_connect_payouts_enabled = $4,
           stripe_connect_details_submitted = $5,
           stripe_connect_requirements_due = $6::jsonb,
           stripe_connect_requirements_past_due = $7::jsonb,
           stripe_connect_last_synced_at = CURRENT_TIMESTAMP
       WHERE user_id = $8`,
      [
        account.id,
        status.onboardingCompleted,
        status.chargesEnabled,
        status.payoutsEnabled,
        status.detailsSubmitted,
        JSON.stringify(status.requirementsDue),
        JSON.stringify(status.requirementsPastDue),
        userId,
      ]
    );

    return status;
  }

  private async handleConnectedAccountUpdated(account: Stripe.Account): Promise<void> {
    const profileResult = await this.databaseService.query(
      `SELECT user_id
       FROM profiles
       WHERE stripe_connect_account_id = $1
       LIMIT 1`,
      [account.id]
    );

    if (profileResult.rows.length === 0) {
      return;
    }

    const userId = profileResult.rows[0].user_id as number;
    await this.syncTeenConnectStatusForUser(userId, account);
  }

  private inferPlanTypeFromServiceName(serviceName?: string): 'single_can' | 'double_can' | 'triple_can' {
    if (!serviceName) {
      return 'single_can';
    }

    const normalized = serviceName.toLowerCase();
    if (normalized.includes('triple') || normalized.includes('3')) {
      return 'triple_can';
    }
    if (normalized.includes('double') || normalized.includes('2')) {
      return 'double_can';
    }
    return 'single_can';
  }

  private mapStripeStatusToHomeBillingStatus(status: Stripe.Subscription.Status | string): HomeBillingStatus {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'active';
      case 'past_due':
        return 'past_due';
      case 'canceled':
        return 'canceled';
      case 'incomplete':
      case 'incomplete_expired':
      case 'unpaid':
      case 'paused':
      default:
        return 'suspended';
    }
  }

  private getSubscriptionPeriodBounds(subscription: Stripe.Subscription): { start: number; end: number } {
    const topLevelStart = (subscription as any).current_period_start as number | null | undefined;
    const topLevelEnd = (subscription as any).current_period_end as number | null | undefined;

    if (topLevelStart && topLevelEnd) {
      return { start: topLevelStart, end: topLevelEnd };
    }

    const firstItem = subscription.items.data[0] as Stripe.SubscriptionItem & {
      current_period_start?: number | null;
      current_period_end?: number | null;
    };

    const itemStart = firstItem?.current_period_start;
    const itemEnd = firstItem?.current_period_end;

    if (itemStart && itemEnd) {
      return { start: itemStart, end: itemEnd };
    }

    const anchor = subscription.billing_cycle_anchor || subscription.start_date || Math.floor(Date.now() / 1000);
    return {
      start: anchor,
      end: anchor + (30 * 24 * 60 * 60),
    };
  }

  private async getOrSetDefaultPaymentMethod(customerId: string): Promise<string | null> {
    const customerResponse = await this.stripe.customers.retrieve(customerId);
    if ('deleted' in customerResponse && customerResponse.deleted) {
      return null;
    }

    const customer = customerResponse as Stripe.Customer;
    const existingDefault = customer.invoice_settings?.default_payment_method;
    const existingDefaultId =
      typeof existingDefault === 'string' ? existingDefault : existingDefault?.id;

    if (existingDefaultId) {
      try {
        const existingPaymentMethod = await this.stripe.paymentMethods.retrieve(existingDefaultId);
        if (this.isUsBankAccountPaymentMethod(existingPaymentMethod)) {
          return existingDefaultId;
        }
      } catch (error: any) {
        if (error?.code !== 'resource_missing') {
          throw error;
        }
      }
    }

    const paymentMethods = await this.listCustomerAchPaymentMethods(customerId, 1);

    if (paymentMethods.data.length === 0) {
      return null;
    }

    const fallbackPaymentMethodId = paymentMethods.data[0].id;

    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: fallbackPaymentMethodId,
      },
    });

    return fallbackPaymentMethodId;
  }

  private extractInvoicePeriod(invoice: Stripe.Invoice): { start: number; end: number } {
    const starts: number[] = [];
    const ends: number[] = [];

    for (const line of invoice.lines?.data || []) {
      if (line.period?.start) {
        starts.push(line.period.start);
      }
      if (line.period?.end) {
        ends.push(line.period.end);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const start = starts.length > 0
      ? Math.min(...starts)
      : ((invoice as any).period_start || now - (30 * 24 * 60 * 60));
    const end = ends.length > 0
      ? Math.max(...ends)
      : ((invoice as any).period_end || now);

    return { start, end };
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    if (session.mode !== 'setup') {
      return;
    }

    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const setupIntentId =
      typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent?.id;

    if (!customerId || !setupIntentId) {
      return;
    }

    const setupIntent = await this.stripe.setupIntents.retrieve(setupIntentId, {
      expand: ['payment_method'],
    });

    const paymentMethod =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!paymentMethod) {
      return;
    }

    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethod,
      },
    });

    console.log(`Set default payment method for customer ${customerId} from setup checkout.`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const homeResult = await this.databaseService.query(
      `SELECT id
       FROM homes
       WHERE stripe_subscription_id = $1
       LIMIT 1`,
      [subscription.id]
    );

    if (homeResult.rows.length === 0) {
      return;
    }

    await this.databaseService.query(
      `UPDATE homes
       SET billing_status = $1,
           stripe_subscription_item_id = $2
       WHERE id = $3`,
      [
        this.mapStripeStatusToHomeBillingStatus(subscription.status),
        subscription.items.data[0]?.id || null,
        homeResult.rows[0].id,
      ]
    );
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionRef = invoice.parent?.subscription_details?.subscription;
    const subscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : subscriptionRef?.id;

    if (!subscriptionId) {
      return;
    }

    const homeResult = await this.databaseService.query(
      `SELECT id
       FROM homes
       WHERE stripe_subscription_id = $1
       LIMIT 1`,
      [subscriptionId]
    );

    if (homeResult.rows.length === 0) {
      return;
    }

    const homeId = homeResult.rows[0].id as number;
    const { start, end } = this.extractInvoicePeriod(invoice);
    await this.retryPendingUsageReports(100);
    const sourceTransactionId = await this.resolveInvoiceSourceTransaction(invoice);
    const settledCount = await this.markInvoiceSettledTaskPaymentsForHome(
      homeId,
      start,
      end,
      invoice.id,
      sourceTransactionId,
    );
    const transferredCount = await this.processInvoiceSettledPayoutTransfers(invoice.id, 100);

    await this.databaseService.query(
      'UPDATE homes SET billing_status = $1 WHERE id = $2',
      ['active', homeId]
    );

    console.log(
      `Invoice paid for subscription ${subscriptionId}; invoice-settled ${settledCount} teen payment(s) and created ${transferredCount} transfer(s) for home ${homeId}.`
    );
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionRef = invoice.parent?.subscription_details?.subscription;
    const subscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : subscriptionRef?.id;

    if (!subscriptionId) {
      return;
    }

    await this.databaseService.query(
      `UPDATE homes
       SET billing_status = $1
       WHERE stripe_subscription_id = $2`,
      ['past_due', subscriptionId]
    );
  }
}
