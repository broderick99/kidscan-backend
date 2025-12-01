# Kids Can Frontend Integration Guide

## Authentication Flow

### Overview
The authentication system differentiates between teens and homeowners, providing role-specific experiences and redirect paths based on user status.

### Authentication Endpoints

#### 1. Register
```
POST /api/v1/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "teen" | "homeowner",
  "phone": "+1234567890" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-token",
    "refreshToken": "refresh-token",
    "expiresIn": 86400,
    "user": {
      "id": 1,
      "email": "user@example.com",
      "role": "teen",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890",
      "emailVerified": false,
      "profileComplete": false,
      // Teen specific fields
      "identityVerified": false,
      "backgroundCheckStatus": null,
      // Homeowner specific fields
      "hasActiveService": false,
      "numberOfHomes": 0
    },
    "redirectTo": "/verify-email"
  }
}
```

#### 2. Login
```
POST /api/v1/auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:** Same as register

#### 3. Get User Status
```
GET /api/v1/auth/status
Headers: Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "profileComplete": false,
    "emailVerified": true,
    "redirectTo": "/complete-profile",
    "nextSteps": [
      "Complete your profile with parent information"
    ]
  }
}
```

### Redirect Logic

The `redirectTo` field provides the suggested path based on user status:

#### For Teens:
1. `/verify-email` - Email not verified
2. `/complete-profile` - Missing required profile fields (parent info)
3. `/verify-identity` - Identity not verified
4. `/teen/dashboard` - Everything complete

#### For Homeowners:
1. `/verify-email` - Email not verified
2. `/complete-profile` - Missing basic profile info
3. `/homeowner/add-home` - No homes registered
4. `/homeowner/dashboard` - Has homes registered

### Frontend Implementation Example

```typescript
// Login function
async function login(email: string, password: string) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Store tokens
    localStorage.setItem('accessToken', result.data.accessToken);
    localStorage.setItem('refreshToken', result.data.refreshToken);
    
    // Store user info
    localStorage.setItem('user', JSON.stringify(result.data.user));
    
    // Redirect based on backend suggestion
    window.location.href = result.data.redirectTo;
  }
}

// Check user status on app load
async function checkUserStatus() {
  const token = localStorage.getItem('accessToken');
  if (!token) return;
  
  const response = await fetch('/api/v1/auth/status', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Redirect if needed
    if (window.location.pathname !== result.data.redirectTo) {
      window.location.href = result.data.redirectTo;
    }
  }
}
```

### User Type Detection

The `user.role` field clearly indicates the user type:

```typescript
const user = JSON.parse(localStorage.getItem('user'));

if (user.role === 'teen') {
  // Show teen-specific UI
  // Access teen-specific fields like identityVerified, backgroundCheckStatus
} else if (user.role === 'homeowner') {
  // Show homeowner-specific UI
  // Access homeowner-specific fields like hasActiveService, numberOfHomes
}
```

### Token Management

#### Access Token
- Include in all API requests: `Authorization: Bearer {accessToken}`
- Valid for 24 hours
- Use for all authenticated endpoints

#### Refresh Token
- Use to get new access token when expired
- Valid for 7 days
- Endpoint: `POST /api/v1/auth/refresh`

```typescript
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  const result = await response.json();
  
  if (result.success) {
    localStorage.setItem('accessToken', result.data.accessToken);
    localStorage.setItem('refreshToken', result.data.refreshToken);
    return result.data.accessToken;
  }
  
  // Refresh failed, redirect to login
  window.location.href = '/login';
}
```

### Profile Completion Flow

After registration, guide users through profile completion:

1. **Email Verification** (both user types)
2. **Basic Profile** (firstName, lastName, phone)
3. **Teen Specific:**
   - Parent information (name, phone, email)
   - School information
   - Identity verification
4. **Homeowner Specific:**
   - Add first home address
   - Set up service preferences

### Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid credentials",
    "details": []
  }
}
```

Common error codes:
- `UNAUTHORIZED` - Invalid credentials or token
- `CONFLICT` - Email already exists
- `VALIDATION_ERROR` - Invalid input data
- `NOT_FOUND` - Resource not found

### Best Practices

1. **Always check `redirectTo`** - The backend knows the user's current state and where they should go
2. **Use the status endpoint** - Check on app load and after significant actions
3. **Handle token expiration** - Implement automatic refresh or redirect to login
4. **Store user role** - Use it to show role-specific UI elements
5. **Check `profileComplete`** - Show completion prompts if false
6. **Monitor `nextSteps`** - Display these as action items for the user

### Testing Different Flows

1. **New Teen Registration:**
   - Register with role: "teen"
   - Should redirect to `/verify-email`
   - After email verification → `/complete-profile`
   - After profile completion → `/verify-identity`
   - After identity verification → `/teen/dashboard`

2. **New Homeowner Registration:**
   - Register with role: "homeowner"
   - Should redirect to `/verify-email`
   - After email verification → `/complete-profile`
   - After profile completion → `/homeowner/add-home`
   - After adding home → `/homeowner/dashboard`

3. **Existing User Login:**
   - Login will check current status
   - Redirect to appropriate page based on completion status
   - Use `nextSteps` array to show what's needed