# Integration Testing Guide for Kids Can

## Prerequisites

1. **Backend Setup**
   ```bash
   # Start the backend
   cd /Users/wes/Documents/Kids Can/kidscan-be
   npm install
   npm run start:dev
   ```
   Backend should be running on http://localhost:8080

2. **Database**
   - Ensure SQL Server is running with the configured database
   - Tables should be created automatically via TypeORM

3. **API Documentation**
   - Swagger UI available at: http://localhost:8080/api/docs

## Testing Flows

### Flow 1: Teen Registration and Profile Completion

**Step 1: Register as Teen**
```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teen1@example.com",
    "password": "SecurePass123!",
    "firstName": "Alex",
    "lastName": "Johnson",
    "role": "teen",
    "phone": "(555) 123-4567",
    "parentEmail": "parent@example.com",
    "parentPhone": "(555) 987-6543",
    "dateOfBirth": "2008-05-15",
    "school": "Lincoln High School",
    "bio": "Hardworking student looking for weekend jobs"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "teen1@example.com",
      "role": "teen",
      "profile": {
        "firstName": "Alex",
        "lastName": "Johnson",
        "phone": "(555) 123-4567",
        "profileCompletedAt": null
      }
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "redirectTo": "/profile/complete"
  }
}
```

**Step 2: Check Auth Status**
```bash
curl -X GET http://localhost:8080/api/v1/auth/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "isAuthenticated": true,
    "isProfileComplete": false,
    "isIdentityVerified": false,
    "missingFields": ["parentEmail", "parentPhone", "dateOfBirth"],
    "user": { /* user object */ },
    "redirectTo": "/profile/complete"
  }
}
```

### Flow 2: Homeowner Registration and Home Creation

**Step 1: Register as Homeowner**
```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "homeowner1@example.com",
    "password": "SecurePass123!",
    "firstName": "Sarah",
    "lastName": "Williams",
    "role": "homeowner",
    "phone": "(555) 555-1234"
  }'
```

**Step 2: Create a Home**
```bash
curl -X POST http://localhost:8080/api/v1/homes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "123 Main Street",
    "city": "Springfield",
    "state": "IL",
    "zipCode": "62701",
    "description": "Two-story house with large backyard",
    "specialInstructions": "Ring doorbell twice",
    "latitude": 39.7817,
    "longitude": -89.6501
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "homeownerId": 2,
    "address": "123 Main Street",
    "city": "Springfield",
    "state": "IL",
    "zipCode": "62701",
    "isActive": true,
    "createdAt": "2025-01-12T10:30:00.000Z"
  }
}
```

### Flow 3: Login and Token Refresh

**Step 1: Login**
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teen1@example.com",
    "password": "SecurePass123!"
  }'
```

**Step 2: Refresh Token**
```bash
curl -X POST http://localhost:8080/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Flow 4: Profile Updates

**Update Profile**
```bash
curl -X PATCH http://localhost:8080/api/v1/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parentEmail": "parent@example.com",
    "parentPhone": "(555) 987-6543",
    "dateOfBirth": "2008-05-15"
  }'
```

### Flow 5: Error Scenarios

**Test 1: Invalid Credentials**
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "wrong@example.com",
    "password": "wrongpassword"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": []
  }
}
```

**Test 2: Unauthorized Access**
```bash
curl -X GET http://localhost:8080/api/v1/homes
```

**Expected Response:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized",
    "details": []
  }
}
```

## Frontend Testing

### Manual Testing Steps

1. **Registration Flow**
   - Open http://localhost:3000/register (or your frontend URL)
   - Select "Teen" role
   - Fill all required fields
   - Submit form
   - Verify redirect to profile completion
   - Check localStorage for tokens

2. **Login Flow**
   - Open http://localhost:3000/login
   - Enter registered credentials
   - Submit form
   - Verify redirect based on profile status
   - Check network tab for API calls

3. **Token Refresh**
   - Login and wait for token to expire (or manually expire it)
   - Make any API request
   - Verify automatic refresh happens
   - Check new token in localStorage

4. **Protected Routes**
   - Try accessing /teen/dashboard without login → Should redirect to login
   - Login as homeowner, try accessing /teen/dashboard → Should see unauthorized
   - Login as teen with incomplete profile → Should redirect to profile completion

### Browser DevTools Testing

1. **Check Token Storage**
   ```javascript
   // In browser console
   localStorage.getItem('accessToken')
   localStorage.getItem('refreshToken')
   ```

2. **Test API Client**
   ```javascript
   // Import and test services directly
   import { authService } from './api/auth.service';
   
   // Test status check
   authService.getStatus().then(console.log).catch(console.error);
   
   // Test current user
   authService.getCurrentUser().then(console.log).catch(console.error);
   ```

3. **Monitor Network Requests**
   - Open Network tab in DevTools
   - Look for:
     - Authorization headers on requests
     - CORS headers in responses
     - 401 responses triggering refresh
     - Successful token refresh

## Expected Behaviors

### Successful Flows

1. **Teen Registration → Profile Completion → Identity Verification → Dashboard**
   - Register with all fields
   - Complete missing profile fields
   - Upload identity verification
   - Access teen dashboard

2. **Homeowner Registration → Home Creation → Teen Connection**
   - Register as homeowner
   - Create one or more homes
   - Browse and connect with teens

### Redirect Logic

Based on user state, expect these redirects:

| User State | Redirect To |
|------------|-------------|
| Not authenticated | /login |
| Teen - Profile incomplete | /profile/complete |
| Teen - Not verified | /identity/verify |
| Teen - Verified | /teen/dashboard |
| Homeowner - Profile incomplete | /profile/complete |
| Homeowner - Complete | /homeowner/dashboard |

### Error Handling

1. **Network Errors**: Display "Network error" message
2. **Validation Errors**: Display field-specific errors
3. **401 Errors**: Trigger token refresh, then retry
4. **403 Errors**: Redirect to unauthorized page
5. **500 Errors**: Display generic error message

## Automated Testing

### Unit Tests for Services
```typescript
// Example test for auth service
describe('AuthService', () => {
  it('should login successfully', async () => {
    const response = await authService.login({
      email: 'test@example.com',
      password: 'password123'
    });
    
    expect(response.user).toBeDefined();
    expect(response.accessToken).toBeDefined();
    expect(localStorage.getItem('accessToken')).toBe(response.accessToken);
  });
  
  it('should handle login errors', async () => {
    await expect(authService.login({
      email: 'wrong@example.com',
      password: 'wrong'
    })).rejects.toThrow('Invalid email or password');
  });
});
```

### Integration Tests
```typescript
// Example integration test
describe('Registration Flow', () => {
  it('should complete teen registration flow', async () => {
    // 1. Register
    const regResponse = await authService.register({
      email: 'newteen@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'Teen',
      role: 'teen',
      phone: '5551234567'
    });
    
    expect(regResponse.redirectTo).toBe('/profile/complete');
    
    // 2. Check status
    const status = await authService.getStatus();
    expect(status.isProfileComplete).toBe(false);
    expect(status.missingFields).toContain('parentEmail');
    
    // 3. Update profile
    await profileService.updateMyProfile({
      parentEmail: 'parent@example.com',
      parentPhone: '5559876543',
      dateOfBirth: new Date('2008-01-01')
    });
    
    // 4. Verify completion
    const newStatus = await authService.getStatus();
    expect(newStatus.isProfileComplete).toBe(true);
  });
});
```

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Check backend is running
   - Verify frontend URL is in CORS whitelist
   - Check browser console for specific CORS error

2. **401 Unauthorized**
   - Check token in localStorage
   - Verify token format in Authorization header
   - Check token expiration

3. **Network Errors**
   - Verify backend is running on port 8080
   - Check API base URL configuration
   - Test with curl first to isolate frontend issues

4. **Profile Completion Loop**
   - Check which fields are missing in status response
   - Verify all required fields are being sent in update
   - Check for validation errors in response

### Debug Mode

Enable debug logging:
```javascript
// In browser console
localStorage.setItem('DEBUG', 'true');

// In your API client
if (localStorage.getItem('DEBUG')) {
  console.log('Request:', config);
  console.log('Response:', response);
}
```