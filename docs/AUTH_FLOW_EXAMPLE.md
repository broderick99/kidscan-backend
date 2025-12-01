# Authentication Flow Examples

## Teen Registration & Login Flow

### 1. Teen Signs Up
```javascript
// Frontend: User selects "I'm a Teen" and fills out form
const response = await fetch('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'teen@example.com',
    password: 'SecurePass123!',
    firstName: 'Alex',
    lastName: 'Johnson',
    role: 'teen',
    phone: '+1234567890'
  })
});

// Backend Response:
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "id": 1,
      "email": "teen@example.com",
      "role": "teen",
      "firstName": "Alex",
      "lastName": "Johnson",
      "emailVerified": false,
      "profileComplete": false,
      "identityVerified": false,
      "backgroundCheckStatus": null
    },
    "redirectTo": "/verify-email"  // ← Frontend should redirect here
  }
}
```

### 2. Teen Completes Email Verification
After email verification, teen logs in:

```javascript
// Frontend: Teen logs in after verifying email
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'teen@example.com',
    password: 'SecurePass123!'
  })
});

// Backend Response:
{
  "success": true,
  "data": {
    "user": {
      "role": "teen",
      "emailVerified": true,      // ← Now verified
      "profileComplete": false,   // ← Still needs parent info
      ...
    },
    "redirectTo": "/complete-profile"  // ← Now redirects to profile completion
  }
}
```

### 3. Teen Completes Profile
After adding parent information:

```javascript
// Frontend: Check status after profile update
const response = await fetch('/api/v1/auth/status', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});

// Backend Response:
{
  "success": true,
  "data": {
    "profileComplete": true,      // ← Profile now complete
    "emailVerified": true,
    "redirectTo": "/verify-identity",  // ← Next step: identity verification
    "nextSteps": ["Verify your identity"]
  }
}
```

### 4. Final Teen Dashboard Access
After identity verification:

```javascript
// Backend Response on login/status:
{
  "user": {
    "role": "teen",
    "emailVerified": true,
    "profileComplete": true,
    "identityVerified": true,     // ← All requirements met
    ...
  },
  "redirectTo": "/teen/dashboard"  // ← Can access teen dashboard
}
```

## Homeowner Registration & Login Flow

### 1. Homeowner Signs Up
```javascript
// Frontend: User selects "I'm a Homeowner" and fills out form
const response = await fetch('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'homeowner@example.com',
    password: 'SecurePass123!',
    firstName: 'Sarah',
    lastName: 'Smith',
    role: 'homeowner',
    phone: '+1234567890'
  })
});

// Backend Response:
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "email": "homeowner@example.com",
      "role": "homeowner",        // ← Homeowner role
      "firstName": "Sarah",
      "lastName": "Smith",
      "emailVerified": false,
      "profileComplete": true,     // ← Basic info is enough
      "hasActiveService": false,   // ← No service yet
      "numberOfHomes": 0          // ← No homes registered
    },
    "redirectTo": "/verify-email"
  }
}
```

### 2. Homeowner After Email Verification
```javascript
// Backend Response on login:
{
  "user": {
    "role": "homeowner",
    "emailVerified": true,
    "profileComplete": true,
    "hasActiveService": false,
    "numberOfHomes": 0            // ← No homes yet
  },
  "redirectTo": "/homeowner/add-home"  // ← Redirects to add first home
}
```

### 3. Homeowner With Homes
After adding a home:

```javascript
// Backend Response:
{
  "user": {
    "role": "homeowner",
    "emailVerified": true,
    "profileComplete": true,
    "hasActiveService": false,    // ← Has home but no teen assigned
    "numberOfHomes": 1            // ← Has 1 home
  },
  "redirectTo": "/homeowner/dashboard"  // ← Can access dashboard
}
```

## Frontend Route Guards Example

```typescript
// React Router example
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ children, allowedRoles }) {
  const [loading, setLoading] = useState(true);
  const [redirect, setRedirect] = useState(null);
  
  useEffect(() => {
    checkUserStatus();
  }, []);
  
  async function checkUserStatus() {
    try {
      const response = await fetch('/api/v1/auth/status', {
        headers: { 'Authorization': `Bearer ${getAccessToken()}` }
      });
      
      if (!response.ok) {
        setRedirect('/login');
        return;
      }
      
      const result = await response.json();
      const user = JSON.parse(localStorage.getItem('user'));
      
      // Check if user role is allowed
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        setRedirect('/unauthorized');
        return;
      }
      
      // Use backend's redirect suggestion
      if (result.data.redirectTo !== window.location.pathname) {
        setRedirect(result.data.redirectTo);
        return;
      }
      
      setLoading(false);
    } catch (error) {
      setRedirect('/login');
    }
  }
  
  if (loading) return <LoadingSpinner />;
  if (redirect) return <Navigate to={redirect} />;
  
  return children;
}

// Usage
<Route path="/teen/dashboard" element={
  <ProtectedRoute allowedRoles={['teen']}>
    <TeenDashboard />
  </ProtectedRoute>
} />

<Route path="/homeowner/dashboard" element={
  <ProtectedRoute allowedRoles={['homeowner']}>
    <HomeownerDashboard />
  </ProtectedRoute>
} />
```

## Key Points

1. **Always trust `redirectTo`** - The backend knows the complete user state
2. **Role is permanent** - Set during registration, determines entire experience
3. **Progressive completion** - Users complete requirements step by step
4. **Different requirements** - Teens need parent info & identity verification, homeowners need homes
5. **Use status endpoint** - Check on app load and navigation to ensure correct routing