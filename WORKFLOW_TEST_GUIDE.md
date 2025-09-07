# Organization Setup & Login Workflow Test Guide

## 🔄 **Complete Workflow Overview**

### **For New Organizations (First Time Setup):**

1. **Landing Page** → User clicks "Set Up Organization"
2. **Setup Page** (`/setup-organization`)
   - Enter organization details
   - Enter AWS Cognito configuration (User Pool ID, Client ID, Region, etc.)
   - System validates credentials and **checks for duplicates**
   - Select admin user from Cognito user pool
   - Create organization
3. **Redirect to Login** → `/o/{orgId}/login`  
4. **Authentication** → Cognito Hosted UI with PKCE
5. **Dashboard Access** → `/o/{orgId}/admin/dashboard` 

### **For Existing Organizations (Return Users):**

1. **Direct Login** → `/o/{orgId}/login`
2. **Authentication** → Cognito Hosted UI  
3. **Dashboard Access** → `/o/{orgId}/admin/dashboard`

## 🛡️ **Duplicate Prevention Logic**

### **What's Checked for Duplicates:**
- ✅ **User Pool ID + Region** combination
- ✅ **Client ID** (even across different user pools)  
- ✅ **Both during validation AND creation**

### **When Duplicates Are Found:**
- ❌ **Validation fails early** (before AWS API calls)
- 🔗 **Shows login button** to existing organization  
- 📝 **Clear messaging**: "Configuration already in use by [Organization Name]"
- ⚠️ **Guidance**: "If you own this org, click login. Otherwise, contact support."

## 🧪 **Testing Scenarios**

### **Scenario 1: New Organization (Happy Path)**
```
1. Go to /setup-organization
2. Enter unique Cognito config 
3. Validate → Should show "✅ Configuration validated"
4. Select admin user
5. Create org → Should redirect to /o/{orgId}/login  
6. Login → Should work with PKCE flow
7. Access dashboard → Should load properly
```

### **Scenario 2: Duplicate User Pool**
```  
1. Go to /setup-organization
2. Enter SAME User Pool ID + Region as existing org
3. Validate → Should show:
   - "❌ Configuration already in use by [Org Name]"
   - [Go to Login Page] button
4. Click button → Should redirect to existing org login
```

### **Scenario 3: Duplicate Client ID**
```
1. Go to /setup-organization  
2. Enter SAME Client ID (but different User Pool)
3. Validate → Should show:
   - "❌ Client ID already in use"
   - [Go to Login Page] button  
```

### **Scenario 4: Return User**
```
1. Go directly to /o/{orgId}/login
2. Should see org-specific login page
3. Click "Sign In with Cognito"  
4. Should redirect to Cognito Hosted UI
5. After auth → Should land on /o/{orgId}/admin/dashboard
```

### **Scenario 5: Legacy Login Redirect**  
```
1. Go to /login (old URL)
2. If org_id cookie exists → Should redirect to /o/{orgId}/admin/dashboard
3. If no org_id → Should show legacy login form
```

## 🔍 **What to Verify**

### **Security:**
- [x] Cookies are `httpOnly`, `secure`, `sameSite=lax`
- [x] PKCE flow (no client secrets needed)
- [x] State parameter includes `orgId`, `next`, `timestamp`
- [x] Middleware blocks unauthorized access

### **User Experience:**  
- [x] Clear error messages for duplicates
- [x] Direct path to existing org login
- [x] Smooth setup → login → dashboard flow
- [x] No auto-redirects from setup page

### **Data Integrity:**
- [x] Each Cognito config only used once
- [x] Each Client ID only used once  
- [x] Organization data properly stored
- [x] Admin user assigned Owner role

## 🚀 **Production Readiness**

### **Environment Variables to Remove:**
```bash
# After testing, remove these from Beanstalk:
COGNITO_CLIENT_ID
COGNITO_CLIENT_SECRET  
COGNITO_USERPOOL_ID
COGNITO_REDIRECT_URI
COGNITO_LOGOUT_URI
ORGANIZATION_ID
ACCESS_KEY_ID
SECRET_ACCESS_KEY
```

### **Keep These:**
```bash
AWS_REGION
CLOUDSERVICES_TABLE
ORGANIZATIONS_TABLE
CORS_ORIGINS
NEXT_PUBLIC_API_URL
[Other service tables...]
```

## 📝 **Expected Behavior Summary**

1. **✅ NO duplicate Cognito configurations allowed**
2. **✅ Clear messaging when duplicates found**  
3. **✅ Direct path to existing org login**
4. **✅ Secure PKCE authentication flow**
5. **✅ Org-aware URL structure** (`/o/{orgId}/...`)
6. **✅ Proper cookie security**
7. **✅ Clean setup → login → dashboard flow**

This workflow ensures each organization gets their own isolated environment while preventing configuration conflicts and providing clear user guidance when issues occur.