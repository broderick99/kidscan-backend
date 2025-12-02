import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DatabaseService } from '../database/database.service';

export interface PaymentMethodInfo {
  id: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

export interface BillingStatus {
  hasPaymentMethod: boolean;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'incomplete' | null;
  stripeCustomerId?: string;
  paymentMethod?: PaymentMethodInfo;
}

@Injectable()
export class BillingService {
  private stripe: Stripe;

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

  async createSetupIntent(userId: number): Promise<{ clientSecret: string; stripeCustomerId: string }> {
    try {
      // Get or create Stripe customer
      const customer = await this.getOrCreateCustomer(userId);

      // Create setup intent for saving payment method
      const setupIntent = await this.stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
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

      // Create a Checkout session in setup mode for saving payment methods
      const session = await this.stripe.checkout.sessions.create({
        mode: 'setup',
        customer: customer.id,
        payment_method_types: ['card'],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId.toString(),
          homeId: options.homeId?.toString() || '',
          planType: options.planType || 'single_can',
        },
        // Customer portal settings for managing payment methods later
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
      // Return existing customer
      return await this.stripe.customers.retrieve(user.stripe_customer_id) as Stripe.Customer;
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

      // Get payment methods
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

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
      if (hasPaymentMethod && paymentMethods.data[0].card) {
        const card = paymentMethods.data[0].card;
        paymentMethod = {
          id: paymentMethods.data[0].id,
          last4: card.last4,
          brand: card.brand,
          expMonth: card.exp_month,
          expYear: card.exp_year,
        };
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

  async createUsageSubscription(userId: number, homeId: number, planType: 'single_can' | 'double_can' | 'triple_can' = 'single_can'): Promise<{ subscriptionId: string }> {
    try {
      const customer = await this.getOrCreateCustomer(userId);
      
      // Get usage-based price for the specific plan type from Stripe
      const price = await this.getUsagePriceForPlan(planType);

      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price: price.id,
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
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
          subscription.items.data[0].id,
          subscription.status,
          homeId,
          userId
        ]
      );

      return { subscriptionId: subscription.id };
    } catch (error) {
      console.error('Error creating usage subscription:', error);
      throw new BadRequestException('Failed to create billing subscription');
    }
  }

  async reportTaskUsage(serviceId: number, taskId: number, amount: number): Promise<void> {
    try {
      // Get customer ID and home details
      const result = await this.databaseService.query(
        `SELECT h.stripe_subscription_id, h.homeowner_id, u.stripe_customer_id
         FROM services s
         JOIN homes h ON s.home_id = h.id
         JOIN users u ON h.homeowner_id = u.id
         WHERE s.id = $1`,
        [serviceId]
      );

      const service = result.rows[0];
      if (!service?.stripe_customer_id) {
        console.warn(`No Stripe customer found for service ${serviceId}`);
        return;
      }

      // Report one meter event per completed task (each task = one can completion)
      const meterEventId = `task_${taskId}_${Date.now()}`;
      
      await this.stripe.billing.meterEvents.create({
        event_name: 'can_completed', // Updated to reflect per-can billing
        payload: {
          stripe_customer_id: service.stripe_customer_id,
          value: '1', // One completed can
        },
        identifier: meterEventId,
        timestamp: Math.floor(Date.now() / 1000),
      });

      console.log(`✅ Reported meter usage for task ${taskId}, service ${serviceId} - event ID: ${meterEventId}`);
    } catch (error) {
      console.error('❌ Error reporting task usage to meter:', error);
      // Don't throw - we don't want to fail task completion if usage reporting fails
    }
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
    const billingStatus = await this.getBillingStatus(userId);
    // Only check if payment method exists, not subscription status
    // Subscription will be created after service creation
    return billingStatus.hasPaymentMethod;
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
        ['cancelling', homeId]
      );

      console.log(`Subscription ${home.stripe_subscription_id} set to cancel at period end`);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw new BadRequestException('Failed to cancel subscription');
    }
  }

  async getCurrentPeriodUsage(userId: number, homeId: number): Promise<{ usage: number; amount: number; period_start: number; period_end: number; pricing: any }> {
    try {
      // Get subscription ID and service details for this home
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
      
      const periodStart = (subscription as any).current_period_start;
      const periodEnd = (subscription as any).current_period_end;

      // Count completed tasks in current billing period from our database
      // This gives us usage that should match what we've sent to Stripe meter
      const usageResult = await this.databaseService.query(
        `SELECT COUNT(*) as completed_tasks
         FROM tasks t
         JOIN services s ON t.service_id = s.id
         WHERE s.home_id = $1 
           AND t.status = 'completed'
           AND t.completed_at >= to_timestamp($2)
           AND t.completed_at <= to_timestamp($3)`,
        [homeId, periodStart, periodEnd]
      );

      const completedTasks = parseInt(usageResult.rows[0]?.completed_tasks || '0');
      const pricePerCan = home.price_per_task || 2.50; // Fallback to $2.50
      const totalAmount = completedTasks * pricePerCan * 100; // Convert to cents
      
      return {
        usage: completedTasks,
        amount: Math.round(totalAmount),
        period_start: periodStart,
        period_end: periodEnd,
        pricing: {
          per_can: pricePerCan,
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
      // Get customer ID
      const result = await this.databaseService.query(
        `SELECT u.stripe_customer_id
         FROM homes h
         JOIN users u ON h.homeowner_id = u.id
         WHERE h.id = $1 AND h.homeowner_id = $2`,
        [homeId, userId]
      );

      const home = result.rows[0];
      if (!home?.stripe_customer_id) {
        throw new BadRequestException('No customer found for this home');
      }

      // Get current billing period for filtering
      const subscriptionResult = await this.databaseService.query(
        'SELECT stripe_subscription_id FROM homes WHERE id = $1',
        [homeId]
      );

      let periodStart = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60); // Default to 30 days ago
      
      if (subscriptionResult.rows[0]?.stripe_subscription_id) {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionResult.rows[0].stripe_subscription_id);
        periodStart = (subscription as any).current_period_start;
      }

      // For now, return a simplified response since meter events API may not be available in this Stripe version
      // You can implement this differently based on your Stripe API version
      return {
        events: [],
        total_events: 0
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
        'UPDATE homes SET stripe_subscription_item_id = $1 WHERE id = $2',
        [subscriptionItem.id, homeId]
      );

      console.log(`Subscription ${home.stripe_subscription_id} updated to ${newPlanType} plan`);
    } catch (error) {
      console.error('Error updating subscription plan:', error);
      throw new BadRequestException('Failed to update subscription plan');
    }
  }
}