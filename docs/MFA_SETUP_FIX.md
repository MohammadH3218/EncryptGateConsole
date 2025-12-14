# MFA Setup Fix Documentation

## Problem Summary

The `contact@encryptgate.net` account was failing during MFA setup with "Code mismatch" errors, while `mohammadh@encryptgate.net` worked fine because it already had MFA configured.

## Root Cause

When a user encounters the `MFA_SETUP` challenge during login (after password change), the authentication flow follows these steps:

1. Backend receives `MFA_SETUP` challenge from Cognito
2. Backend calls `associate_software_token(Session=session)` which returns:
   - A secret code (for QR code generation)
   - A **new session token** (required for verification)
3. Frontend displays QR code to user
4. User enters MFA code
5. Frontend sends verification request with code and session

**The Issue**: The frontend was not updating the session state with the new session returned from `associate_software_token`. When verification was attempted, it used the old session token, causing Cognito to return "Code mismatch" because the session didn't match the one from the association step.

## Fixes Applied

### 1. Frontend Fix (`app/o/[orgId]/login/page.tsx`)

Updated the session state when receiving `MFA_SETUP` challenge response:

```typescript
} else if (challengeName === "MFA_SETUP") {
  if (result.secretCode) {
    setMfaSecretCode(result.secretCode)
    // Update session to the new one returned from associate_software_token
    if (result.session) {
      setSession(result.session)
    }
    setShowMFASetup(true)
  }
}
```

### 2. Backend Improvements (`auth_services_routes.py`)

- Added better code validation (ensures 6 digits, strips whitespace)
- Added detailed logging for debugging
- Improved error messages with helpful hints about:
  - Time synchronization
  - Code expiration (30-second windows)
  - Correct authenticator app usage
- Added specific exception handling for Cognito MFA errors

## Why Main Account Worked

The main account (`mohammadh@encryptgate.net`) already had MFA set up, so it used the `SOFTWARE_TOKEN_MFA` challenge instead of `MFA_SETUP`. The `SOFTWARE_TOKEN_MFA` flow doesn't require the `associate_software_token` step, so it didn't have the session update issue.

## Testing

To verify the fix works:

1. Try logging in with `contact@encryptgate.net`
2. Complete password change if required
3. Complete MFA setup when prompted
4. Verify login succeeds

## Diagnostic Commands

Use the diagnostic script to check Cognito configuration:

```powershell
.\scripts\diagnose-cognito-mfa.ps1
```

Or run individual AWS CLI commands:

```bash
# Check user pool MFA configuration
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_kpXZ426n8 \
  --region us-east-1 \
  --query 'UserPool.MfaConfiguration'

# Check specific user status
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_kpXZ426n8 \
  --username contact@encryptgate.net \
  --region us-east-1 \
  --query '{Username: Username, UserStatus: UserStatus, MFAOptions: MFAOptions}'

# List MFA devices for a user
aws cognito-idp admin-list-devices \
  --user-pool-id us-east-1_kpXZ426n8 \
  --username contact@encryptgate.net \
  --region us-east-1
```

## Related Files

- `app/o/[orgId]/login/page.tsx` - Frontend login and MFA setup UI
- `auth_services_routes.py` - Backend authentication endpoints
  - `/respond-to-challenge` - Handles MFA_SETUP challenge
  - `/confirm-mfa-setup` - Confirms MFA setup with verification code

## Additional Notes

- MFA codes are time-based (TOTP) and change every 30 seconds
- Users should ensure their device time is synchronized
- If code verification fails, wait for a new code and try again
- The session token from `associate_software_token` must be used for verification

