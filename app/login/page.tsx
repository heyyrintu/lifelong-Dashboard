'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type AuthMethod = 'email-password' | 'email-otp' | 'phone-otp';

export default function LoginPage() {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email-password');
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+91');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, login, register, sendEmailOTP, verifyEmailOTP, sendPhoneOTP, verifyPhoneOTP, loginWithGoogle, loginWithMicrosoft } = useAuth();
  const router = useRouter();

  // Auto-detect phone number from user account if logged in
  useEffect(() => {
    if (user && user.phone && authMethod === 'phone-otp' && !otpSent && phone === '+91') {
      // Extract phone number from user account
      let userPhone = user.phone;
      
      // Ensure it starts with +91
      if (!userPhone.startsWith('+91')) {
        // If it starts with 91, add +
        if (userPhone.startsWith('91')) {
          userPhone = '+' + userPhone;
        } else {
          // Otherwise, assume it's just the 10 digits and add +91
          const digits = userPhone.replace(/\D/g, '');
          if (digits.length === 10) {
            userPhone = '+91' + digits;
          } else {
            userPhone = '+91' + digits.slice(-10); // Take last 10 digits
          }
        }
      }
      
      setPhone(userPhone);
    } else if (authMethod !== 'phone-otp' || otpSent) {
      // Reset phone when switching away from phone-otp or after OTP is sent
      if (phone !== '+91') {
        setPhone('+91');
      }
    }
  }, [user, authMethod, otpSent]);

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      router.push('/summary');
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!otpSent) {
        const token = await sendEmailOTP(email);
        setUserId(token.userId);
        setOtpSent(true);
      } else {
        await verifyEmailOTP(userId, otp);
        router.push('/summary');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate Indian phone number before sending OTP
    if (!otpSent && !validateIndianPhone(phone)) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    
    setLoading(true);

    try {
      if (!otpSent) {
        const token = await sendPhoneOTP(phone);
        setUserId(token.userId);
        setOtpSent(true);
      } else {
        await verifyPhoneOTP(userId, otp);
        router.push('/summary');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetOTP = () => {
    setOtpSent(false);
    setOtp('');
    setUserId('');
    setError('');
    setEmail('');
    if (authMethod === 'phone-otp') {
      // Only reset to +91 if user doesn't have a phone number
      if (!user || !user.phone) {
        setPhone('+91');
      }
    }
  };

  const formatIndianPhone = (value: string) => {
    // Remove all non-digit characters except +
    let cleaned = value.replace(/[^\d+]/g, '');
    
    // Always enforce +91 country code
    if (!cleaned.startsWith('+91')) {
      if (cleaned.startsWith('91')) {
        cleaned = '+' + cleaned;
      } else if (cleaned.startsWith('+')) {
        // If it starts with + but not +91, remove country code and add +91
        const digits = cleaned.substring(1).replace(/\D/g, '');
        cleaned = '+91' + digits.slice(-10); // Take last 10 digits
      } else {
        // Just digits, add +91
        const digits = cleaned.replace(/\D/g, '');
        cleaned = '+91' + digits.slice(-10); // Take last 10 digits
      }
    }
    
    // Limit to +91 followed by max 10 digits
    const afterCountryCode = cleaned.substring(3).replace(/\D/g, '');
    if (afterCountryCode.length > 10) {
      cleaned = '+91' + afterCountryCode.substring(0, 10);
    } else {
      cleaned = '+91' + afterCountryCode;
    }
    
    return cleaned;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatIndianPhone(e.target.value);
    setPhone(formatted);
  };

  const validateIndianPhone = (phoneNumber: string): boolean => {
    // Should be +91 followed by exactly 10 digits
    const pattern = /^\+91[6-9]\d{9}$/;
    return pattern.test(phoneNumber);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
            {isLogin ? 'Login' : 'Register'}
          </h1>

          {/* Auth Method Selection */}
          <div className="mb-4 flex gap-2 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('email-password');
                resetOTP();
              }}
              className={`flex-1 py-2 text-sm font-medium ${
                authMethod === 'email-password'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Email/Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod('email-otp');
                resetOTP();
              }}
              className={`flex-1 py-2 text-sm font-medium ${
                authMethod === 'email-otp'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Email OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod('phone-otp');
                resetOTP();
                // Reset phone to +91 when switching to phone-otp (will be auto-filled if user has phone)
                if (!user || !user.phone) {
                  setPhone('+91');
                }
              }}
              className={`flex-1 py-2 text-sm font-medium ${
                authMethod === 'phone-otp'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              🇮🇳 Mobile OTP
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {/* Email/Password Form */}
          {authMethod === 'email-password' && (
            <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Your name"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
              >
                {loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
              </button>
            </form>
          )}

          {/* Email OTP Form */}
          {authMethod === 'email-otp' && (
            <form onSubmit={handleEmailOTPSubmit} className="space-y-4">
              {!otpSent ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="you@example.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
                  >
                    {loading ? 'Sending...' : 'Send OTP'}
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                    OTP sent to {email}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      maxLength={6}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-2xl tracking-widest"
                      placeholder="000000"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={resetOTP}
                    className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Change Email
                  </button>
                </>
              )}
            </form>
          )}

          {/* Phone OTP Form */}
          {authMethod === 'phone-otp' && (
            <form onSubmit={handlePhoneOTPSubmit} className="space-y-4">
              {!otpSent ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Mobile Number (India)
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1.5 pointer-events-none z-10">
                        <span className="text-lg">🇮🇳</span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">+91</span>
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={handlePhoneChange}
                        required
                        maxLength={13}
                        className="w-full pl-20 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="9876543210"
                      />
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Enter your 10-digit mobile number
                      </p>
                      {phone.length > 3 && phone.length < 13 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {phone.length - 3} digits entered. Need {13 - phone.length} more.
                        </p>
                      )}
                      {phone.length === 13 && !validateIndianPhone(phone) && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Invalid number. Indian mobile numbers start with 6, 7, 8, or 9.
                        </p>
                      )}
                      {phone.length === 13 && validateIndianPhone(phone) && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          ✓ Valid Indian mobile number
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !validateIndianPhone(phone)}
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                  >
                    {loading ? 'Sending OTP...' : 'Send OTP'}
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      <span className="font-medium">OTP sent to:</span> {phone}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                      Please check your SMS for the 6-digit OTP code
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Enter 6-Digit OTP
                    </label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setOtp(value);
                      }}
                      required
                      maxLength={6}
                      className="w-full px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-3xl tracking-[0.5em] font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="000000"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                  >
                    {loading ? 'Verifying OTP...' : 'Verify OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={resetOTP}
                    className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    ← Change Mobile Number
                  </button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setLoading(true);
                          const token = await sendPhoneOTP(phone);
                          setUserId(token.userId);
                          setError('');
                        } catch (err: any) {
                          setError(err.message || 'Failed to resend OTP');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    >
                      Didn&apos;t receive OTP? Resend
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {authMethod === 'email-password' && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
              </button>
            </div>
          )}

          {/* Google Login Button */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    setError('');
                    setLoading(true);
                    await loginWithGoogle();
                  } catch (err: any) {
                    setError(err.message || 'Google login failed. Please try again.');
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    setError('');
                    setLoading(true);
                    await loginWithMicrosoft();
                  } catch (err: any) {
                    setError(err.message || 'Microsoft login failed. Please try again.');
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 21 21">
                  <rect x="0" y="0" width="10" height="10" fill="#F25022" />
                  <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
                  <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
                  <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
                </svg>
                <span>Continue with Microsoft</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

