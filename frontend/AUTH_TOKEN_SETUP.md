# Authentication Token & Route Protection Setup

## Changes Made

### 1. Route Protection ✅
- **Created `ProtectedRoute.js`**: Protects routes requiring authentication
  - Redirects to `/login` if user is not authenticated
  - Redirects to `/dashboard` if user is already logged in (for login/register pages)
  - Saves the attempted route so users return there after login

- **Updated `router.js`**: Wrapped routes with `ProtectedRoute`
  - `/login` and `/register`: Redirect to dashboard if already logged in
  - `/dashboard` and all child routes: Require authentication

- **Updated `LoginForm.js`**: Redirects to originally requested page
  - Uses `location.state.from` to redirect back to where user was trying to go
  - Falls back to `/dashboard` if no previous route

### 2. Token Authentication System ✅
- **Updated `authTokenGenerator.js`**: All functions now use `auth_uid` instead of `user_id`
  - `storeAuthToken()`: Fetches auth_uid from profiles, stores in database
  - `validateAuthToken()`: Added detailed logging to debug issues
  - `getActiveToken()`: Fetches auth_uid before querying
  - `clearExpiredTokens()`: Uses auth_uid for deletion

- **Created Migration**: `20251030_migrate_auth_tokens_to_auth_uid.sql`
  - Renames `user_id` column to `auth_uid`
  - Updates foreign key to reference `auth.users(id)`
  - Recreates RLS policies with proper auth_uid checks
  - Adds indexes and triggers

## How to Run the Migration

### Option 1: Supabase Dashboard (Recommended)
1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the contents of `supabase/migrations/20251030_migrate_auth_tokens_to_auth_uid.sql`
4. Paste into the editor and click **Run**

### Option 2: Supabase CLI
```powershell
cd c:\Users\Private\Documents\dashboard\frontend\supabase
supabase db push
```

## Testing the Token System

### Before Testing
1. **Run the migration** (see above)
2. **Clear your browser's localStorage**: 
   - Open DevTools (F12)
   - Go to Application > Local Storage
   - Right-click and "Clear"
3. **Logout if logged in**

### Test Scenario 1: Normal Login with Token Generation
1. Navigate to `/login`
2. Enter credentials and click "Sign In"
3. Choose "Yes, Record Time" when prompted
4. Complete biometric authentication (face recognition)
5. **Expected**: 
   - Token modal should appear showing 6-digit code
   - Console should show: `[storeAuthToken] Token stored successfully`
   - After 1 second, redirect to dashboard

### Test Scenario 2: Token Validation
1. Login normally (as above) and note the 6-digit token
2. Logout
3. Go back to login page
4. Click "Use Authentication Code" button
5. Enter the 6-digit token
6. **Expected**: 
   - Console logs should show validation steps
   - If valid: "✅ Authentication successful!"
   - If invalid: "Invalid or expired authentication code"

### Test Scenario 3: Route Protection
1. **While logged out**:
   - Try to navigate to `/dashboard`
   - **Expected**: Redirected to `/login`
   - After login, **Expected**: Redirected back to `/dashboard`

2. **While logged in**:
   - Try to navigate to `/login`
   - **Expected**: Immediately redirected to `/dashboard`

3. **Deep link protection**:
   - While logged out, navigate to `/dashboard/students/create`
   - **Expected**: Redirected to `/login`
   - After login, **Expected**: Redirected back to `/dashboard/students/create`

## Debugging

### Check Console Logs
The `validateAuthToken` function now has detailed logging:
- `[validateAuthToken] Starting validation for profileId: ...`
- `[validateAuthToken] Got auth_uid: ...`
- `[validateAuthToken] Database query result: ...`
- `[validateAuthToken] Database validation: ...`

### Common Issues

#### Issue: "Invalid or expired authentication code"
**Possible Causes**:
1. **Migration not run**: Table still has `user_id` column
   - **Fix**: Run the migration
   
2. **Token already used**: Tokens are single-use only
   - **Fix**: Generate a new token by logging in again
   
3. **Token expired**: Tokens expire after 60 minutes
   - **Fix**: Generate a new token
   
4. **Database query failing**: Check console for errors
   - **Fix**: Look at console logs for `[validateAuthToken] Database query result`

5. **No auth_uid in profiles**: User profile doesn't have auth_uid set
   - **Fix**: Check profiles table, ensure auth_uid is populated

#### Issue: Still able to access protected routes when logged out
**Possible Causes**:
1. **Old session in localStorage**: Browser cache
   - **Fix**: Clear localStorage and refresh
   
2. **Supabase session still active**: Token not expired
   - **Fix**: Call logout explicitly

#### Issue: Token not showing after biometric login
**Possible Causes**:
1. **Navigation too fast**: Modal closes before visible
   - **Fix**: Already implemented 1-second delay
   
2. **Token generation failed**: Check console logs
   - **Fix**: Look for `[storeAuthToken]` errors

### Check Database
```sql
-- Check if column was renamed
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'auth_tokens';

-- Should show: auth_uid (not user_id)

-- Check for stored tokens
SELECT * FROM auth_tokens;

-- Check foreign key
SELECT constraint_name, table_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'auth_tokens';
```

### Check localStorage
```javascript
// In browser console
// List all auth tokens in localStorage
Object.keys(localStorage)
  .filter(key => key.startsWith('auth_token_'))
  .forEach(key => {
    console.log(key, JSON.parse(localStorage.getItem(key)));
  });
```

## Migration Rollback (If Needed)

If you need to rollback the migration:

```sql
-- Rename column back
ALTER TABLE auth_tokens RENAME COLUMN auth_uid TO user_id;

-- Drop and recreate foreign key (adjust table name if different)
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_auth_uid_fkey;
ALTER TABLE auth_tokens 
  ADD CONSTRAINT auth_tokens_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES profiles(id) 
  ON DELETE CASCADE;
```

## Next Steps

1. ✅ Run the migration
2. ✅ Test token generation (login with biometrics)
3. ✅ Test token validation (use the code to login)
4. ✅ Test route protection (try accessing dashboard while logged out)
5. ✅ Verify RLS policies work (users can only see their own tokens)
6. 🔄 Remove debug logging once confirmed working (optional)

## Files Modified

- `src/components/ProtectedRoute.js` (NEW)
- `src/router.js` (route protection added)
- `src/components/forms/LoginForm.js` (redirect to original route)
- `src/utils/authTokenGenerator.js` (auth_uid + debug logging)
- `supabase/migrations/20251030_migrate_auth_tokens_to_auth_uid.sql` (NEW)
