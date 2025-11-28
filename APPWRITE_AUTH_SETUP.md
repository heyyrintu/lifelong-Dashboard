# Appwrite Authentication Setup Guide

## ✅ What's Been Implemented

Your Drona MIS V2 dashboard now has complete authentication integrated with Appwrite:

1. **Authentication Context** - Global auth state management
2. **Login/Register Page** - Beautiful UI at `/login`
3. **Protected Routes** - All dashboard routes require authentication
4. **User Session Management** - Automatic session handling
5. **Header Integration** - User info and logout button

## 🔧 Appwrite Console Setup Required

Before you can use authentication, you need to configure it in your Appwrite console:

### Step 1: Enable Authentication

1. Go to your Appwrite Console: https://cloud.appwrite.io/console
2. Select your project: **Drona** (ID: `692932d700154b91c6cb`)
3. Navigate to **Auth** in the left sidebar
4. Click **Settings**

### Step 2: Enable Email/Password Provider

1. In Auth Settings, find **Email/Password** provider
2. Enable it by toggling it ON
3. Save the changes

### Step 3: Configure Email Templates (Optional but Recommended)

1. Go to **Auth** → **Email Templates**
2. Configure templates for:
   - Email Verification (if you want email verification)
   - Password Reset (for forgot password functionality)

### Step 4: Set Up Allowed Origins (Important!)

1. Go to **Settings** → **Domains**
2. Add your development domain:
   - `http://localhost:3000`
3. For production, add your production domain later

## 🚀 How to Use

### First Time Setup

1. **Start your app:**
   ```bash
   npm run dev
   ```

2. **Navigate to the app:**
   - Go to `http://localhost:3000`
   - You'll be redirected to `/login`

3. **Register a new user:**
   - Click the "Register" tab
   - Enter your email and password (min 8 characters)
   - Optionally add your name
   - Click "Register"

4. **Login:**
   - After registration, you'll be automatically logged in
   - Or use the "Login" tab to sign in with existing credentials

### Using the App

- **All dashboard routes are protected** - You must be logged in to access:
  - `/summary`
  - `/inbound`
  - `/inventory`
  - `/outbound`
  - `/upload`
  - `/billing`

- **User Info in Header:**
  - Your name and email are displayed in the header
  - Click "Logout" to sign out

- **Automatic Redirects:**
  - Unauthenticated users → `/login`
  - Authenticated users → `/summary` (home page)

## 🔐 Security Features

- ✅ Session-based authentication
- ✅ Protected routes
- ✅ Automatic session validation
- ✅ Secure logout
- ✅ Password requirements (min 8 characters)

## 🎨 Features

- **Beautiful Login UI** - Modern, responsive design matching your dashboard
- **Toggle Login/Register** - Easy switching between modes
- **Error Handling** - Clear error messages
- **Loading States** - Visual feedback during auth operations
- **User Display** - Shows user info in header when logged in

## 🐛 Troubleshooting

### "Login failed" or "Registration failed"

- Check that Email/Password provider is enabled in Appwrite console
- Verify your Appwrite endpoint and project ID are correct in `lib/appwrite.ts`
- Check browser console for detailed error messages

### "CORS Error"

- Add `http://localhost:3000` to allowed domains in Appwrite console
- Go to Settings → Domains in Appwrite console

### "Session expired" or auto-logout

- This is normal behavior - sessions expire after inactivity
- User will be redirected to login page automatically

### Can't access dashboard routes

- Make sure you're logged in
- Check that ProtectedRoute component is working
- Verify AuthProvider is wrapping your app in `app/layout.tsx`

## 📝 Next Steps (Optional Enhancements)

You can extend this authentication system with:

1. **Email Verification** - Require users to verify their email
2. **Password Reset** - Add "Forgot Password" functionality
3. **Role-Based Access** - Add Admin, Viewer, Editor roles
4. **Social Login** - Add Google, GitHub, etc. providers
5. **Remember Me** - Persistent sessions
6. **Two-Factor Authentication** - Enhanced security

## 📚 Files Created/Modified

### New Files:
- `lib/auth-context.tsx` - Authentication context and provider
- `app/login/page.tsx` - Login/Register page
- `components/auth/ProtectedRoute.tsx` - Route protection component

### Modified Files:
- `app/layout.tsx` - Added AuthProvider wrapper
- `app/(dashboard)/layout.tsx` - Added ProtectedRoute wrapper
- `app/page.tsx` - Added auth-based redirect logic
- `components/layout/Header.tsx` - Added user info and logout button

---

**Need Help?** Check the Appwrite documentation: https://appwrite.io/docs/products/auth

