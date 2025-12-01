# Kids Can Backend API Implementation Plan

## Current Implementation Status

### ✅ Completed Modules (Phase 1)

1. **Authentication Module**
   - JWT-based authentication with refresh tokens
   - Login, register, logout, refresh endpoints
   - Password hashing with bcrypt
   - Role-based guards (Teen, Homeowner, Admin)
   - Full test coverage

2. **Users & Profiles Modules**
   - User profile management
   - Teen-specific fields (parent info, school, grade)
   - Identity verification support
   - Background check status tracking
   - Profile CRUD operations with tests

3. **Homes Module**
   - Home registration for homeowners
   - Address management with geolocation
   - Special instructions and gate codes
   - Nearby homes search
   - QR code pairing preparation
   - Full test coverage

4. **Database Setup**
   - Complete schema with all tables
   - Migration system configured
   - Indexes for performance
   - SQL Server integration

### 🚧 Next Steps (Phase 2)
- Services module (linking teens to homes)
- Tasks module (individual pickup instances)
- Automated task generation from services

## Overview
Kids Can is a platform connecting teens who provide trash can services with homeowners. The service involves teens taking homeowners' garbage cans to the curb weekly for $10-15/month.

## Core Entities & API Modules

### 1. Authentication & User Management
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
PUT    /api/v1/users/:id
GET    /api/v1/users/:id/profile
POST   /api/v1/users/:id/verify-identity
```

### 2. Service Management
```
POST   /api/v1/services                    # Create service request
GET    /api/v1/services                    # List services
GET    /api/v1/services/:id                # Get service details
PUT    /api/v1/services/:id                # Update service
DELETE /api/v1/services/:id                # Cancel service
POST   /api/v1/services/:id/assign-teen    # Assign teen to service
```

### 3. Tasks Management
```
GET    /api/v1/tasks                       # List tasks (filtered by teen/date)
GET    /api/v1/tasks/:id                   # Get task details
POST   /api/v1/tasks/:id/complete          # Complete task with photo proof
POST   /api/v1/tasks/:id/report-issue      # Report task issue
GET    /api/v1/tasks/upcoming              # Get upcoming tasks for the week
```

### 4. Homes Management
```
POST   /api/v1/homes                       # Register new home
GET    /api/v1/homes                       # List homes (for teen or homeowner)
GET    /api/v1/homes/:id                   # Get home details
PUT    /api/v1/homes/:id                   # Update home info
DELETE /api/v1/homes/:id                   # Remove home
POST   /api/v1/homes/:id/pair-teen         # Pair teen with home (QR code)
```

### 5. Payment & Earnings
```
GET    /api/v1/payments                    # List payments
POST   /api/v1/payments                    # Process payment
GET    /api/v1/payments/:id                # Get payment details
GET    /api/v1/earnings                    # Teen earnings summary
GET    /api/v1/earnings/history            # Teen earnings history
POST   /api/v1/payouts/request             # Teen payout request
```

### 6. Referral System
```
POST   /api/v1/referrals                   # Create referral
GET    /api/v1/referrals                   # List referrals
GET    /api/v1/referrals/:code             # Get referral by code
POST   /api/v1/referrals/:code/apply       # Apply referral code
GET    /api/v1/referrals/rewards           # Get referral rewards
```

### 7. Messaging/Communication
```
GET    /api/v1/messages                    # List conversations
GET    /api/v1/messages/:conversationId    # Get messages in conversation
POST   /api/v1/messages                    # Send message
PUT    /api/v1/messages/:id/read           # Mark message as read
```

### 8. Notifications
```
GET    /api/v1/notifications               # List notifications
PUT    /api/v1/notifications/:id/read      # Mark as read
POST   /api/v1/notifications/preferences   # Update notification preferences
```

### 9. Analytics (Homeowner)
```
GET    /api/v1/analytics/service-history   # Service completion stats
GET    /api/v1/analytics/spending          # Spending analysis
GET    /api/v1/analytics/teen-performance  # Teen performance metrics
```

### 10. Admin/Support
```
POST   /api/v1/support/tickets             # Create support ticket
GET    /api/v1/support/tickets             # List tickets
POST   /api/v1/reports/issue               # Report an issue
```

## Database Schema Requirements

### Core Tables:
1. **users** - Base user authentication (email, password_hash, role, etc.)
2. **profiles** - User profile details (first_name, last_name, phone, user_type, etc.)
3. **homes** - Homeowner addresses and service details
4. **services** - Service subscriptions linking homes to teens (pickup_day, pickup_time, status)
5. **tasks** - Individual pickup tasks generated from services (scheduled_date, completed_at, photo_url, status)
6. **payments** - Payment transactions
7. **earnings** - Teen earnings tracking
8. **referrals** - Referral tracking
9. **messages** - In-app messaging
10. **notifications** - Push/email notifications

## Services vs Tasks Distinction

**Services**: The ongoing subscription/contract
- Example: "Teen Alex services the Johnson home every Monday at 7am"
- Contains: home_id, teen_id, pickup_day, pickup_time, status, price

**Tasks**: Individual pickup instances generated from services  
- Example: "Pickup at Johnson home on Feb 3rd at 7am"
- Contains: service_id, scheduled_date, completed_at, photo_url, status
- Auto-generated weekly from active services
- Tracks completion, photos, and exceptions

## Key Features to Implement

1. **QR Code Pairing** - Generate unique QR codes for teens to pair with homeowners
2. **Photo Proof System** - Store and serve completion photos
3. **Automated Task Generation** - Create weekly tasks from active services
4. **Payment Processing** - Integrate with payment gateway (Stripe)
5. **Background Checks** - Teen verification system
6. **Rating System** - Two-way ratings between teens and homeowners
7. **Geolocation** - Match teens with nearby homes
8. **Push Notifications** - Task reminders and updates

## Security Considerations
- JWT-based authentication with refresh tokens (self-managed, not Supabase)
- Role-based access control (teen vs homeowner)
- API rate limiting
- Input validation and sanitization
- Secure file upload for photos
- PII data encryption
- GDPR compliance for user data

## Integration Points
- Stripe/Payment Gateway
- SMS/Email service (Twilio/SendGrid)
- Push notification service
- Maps/Geocoding API
- Background check service
- Cloud storage for photos (AWS S3 or similar)

## Implementation Priority

### Phase 1: Core Foundation ✅
- ✅ Auth system (self-managed JWT)
- ✅ Users & Profiles
- ✅ Homes
- ✅ Basic CRUD operations

**Completed Features:**
- JWT authentication with refresh tokens
- User registration and login
- Profile management with teen/homeowner specific fields
- Homes CRUD with geolocation support
- Role-based access control
- Comprehensive unit tests for all modules

### Phase 2: Service Operations
- Services management
- Task generation and tracking
- Photo upload system

### Phase 3: Financial
- Payment processing
- Earnings tracking
- Payout system

### Phase 4: Communication
- Messaging system
- Notifications
- Email/SMS integration

### Phase 5: Advanced Features
- Analytics dashboard
- Referral system
- Admin tools
- Support system

## API Response Format
All API responses should follow a consistent format:
```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "metadata": {
    "timestamp": "2024-02-03T12:00:00Z",
    "requestId": "uuid"
  }
}
```

## Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": []
  },
  "metadata": {
    "timestamp": "2024-02-03T12:00:00Z",
    "requestId": "uuid"
  }
}
```

## Testing Strategy

### Unit Testing Requirements

#### 1. Controller Tests (for each endpoint)
- **Happy Path Tests**: Valid inputs return expected results
- **Validation Tests**: Invalid inputs return proper error messages
- **Authorization Tests**: Ensure proper role-based access
- **Edge Cases**: Null values, empty arrays, boundary conditions

Example test structure for each controller:
```typescript
describe('TasksController', () => {
  describe('GET /api/v1/tasks', () => {
    it('should return tasks for authenticated teen');
    it('should return empty array when no tasks exist');
    it('should filter tasks by date range when provided');
    it('should return 401 when not authenticated');
    it('should return 403 when accessed by homeowner');
  });
  
  describe('POST /api/v1/tasks/:id/complete', () => {
    it('should mark task as complete with photo');
    it('should return 400 when photo is missing');
    it('should return 404 when task not found');
    it('should return 403 when task belongs to different teen');
    it('should prevent duplicate completions');
  });
});
```

#### 2. Service Layer Tests
- **Business Logic Tests**: Verify calculations, task generation, scheduling
- **Integration Tests**: Service interactions with repositories
- **Mock External Services**: Payment processing, email/SMS, storage
- **Error Handling**: Graceful handling of database/external service failures

Example service tests:
```typescript
describe('TaskService', () => {
  describe('generateWeeklyTasks', () => {
    it('should create tasks for all active services');
    it('should skip holiday dates');
    it('should handle timezone differences');
    it('should not duplicate existing tasks');
    it('should notify teens of new tasks');
  });
  
  describe('calculateEarnings', () => {
    it('should calculate base rate correctly');
    it('should apply tips when present');
    it('should handle partial months');
    it('should account for missed pickups');
  });
});
```

#### 3. Repository Tests
- **Database Operations**: CRUD operations work correctly
- **Query Tests**: Complex queries return expected results
- **Transaction Tests**: Multi-step operations maintain consistency
- **Performance Tests**: Queries are optimized (use indexes)

#### 4. Authentication & Authorization Tests
- **JWT Token Tests**: Generation, validation, expiration
- **Role-Based Access**: Teen vs Homeowner permissions
- **Session Management**: Refresh tokens, logout
- **Security Tests**: Password hashing, SQL injection prevention

#### 5. Integration Tests
- **End-to-End Flows**: Complete user journeys
- **API Contract Tests**: Response format consistency
- **Database Integration**: Real database connections
- **External Service Integration**: Payment, notifications

### Test Coverage Goals
- **Minimum 80% code coverage** for all modules
- **100% coverage** for critical paths (auth, payments, task completion)
- **All edge cases covered** for financial calculations

### Testing Tools & Setup
```json
{
  "devDependencies": {
    "@nestjs/testing": "^10.0.0",
    "supertest": "^6.3.3",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0",
    "jest-mock-extended": "^3.0.4"
  }
}
```

### Test Database Strategy
- Use in-memory database for unit tests
- Separate test database for integration tests
- Database seeding for consistent test data
- Cleanup after each test run

### Continuous Testing
- Pre-commit hooks run relevant tests
- CI/CD pipeline runs full test suite
- Performance benchmarks on critical endpoints
- Load testing for scalability

### Test File Organization
```
src/
├── auth/
│   ├── auth.controller.ts
│   ├── auth.controller.spec.ts
│   ├── auth.service.ts
│   ├── auth.service.spec.ts
│   └── auth.e2e-spec.ts
├── tasks/
│   ├── tasks.controller.ts
│   ├── tasks.controller.spec.ts
│   ├── tasks.service.ts
│   ├── tasks.service.spec.ts
│   └── tasks.e2e-spec.ts
└── test/
    ├── fixtures/
    ├── mocks/
    └── utils/
```

### Mock Data Factories
Create factories for generating test data:
```typescript
// test/factories/user.factory.ts
export const createMockUser = (overrides = {}) => ({
  id: 1,
  email: 'test@example.com',
  role: 'teen',
  ...overrides
});

// test/factories/task.factory.ts
export const createMockTask = (overrides = {}) => ({
  id: 1,
  serviceId: 1,
  scheduledDate: new Date(),
  status: 'pending',
  ...overrides
});
```

### Performance Testing
- Response time benchmarks for each endpoint
- Database query optimization tests
- Concurrent user load testing
- Memory usage monitoring