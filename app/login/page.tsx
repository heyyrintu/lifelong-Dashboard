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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Aurora Background Effect - matching dashboard */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary gradient blob - top right */}
        <div className="absolute -top-60 -right-60 w-[700px] h-[700px] bg-gradient-to-br from-brandRed/30 via-orange-500/30 to-brandYellow/30 rounded-full blur-[100px] animate-pulse" />
        {/* Secondary gradient blob - bottom left */}
        <div className="absolute -bottom-60 -left-60 w-[700px] h-[700px] bg-gradient-to-tr from-brandYellow/30 via-red-500/30 to-orange-400/30 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        {/* Center accent */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-red-500/10 via-orange-400/10 to-yellow-500/10 rounded-full blur-[120px]" />
        {/* Top left accent */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-gradient-to-br from-orange-400/20 via-brandRed/20 to-yellow-500/20 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse {
            animation: none !important;
          }
        }
      `}</style>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-4 md:py-8">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left Side - Branding */}
          <div className="hidden lg:flex flex-col items-center justify-center text-center space-y-6" role="complementary" aria-label="Brand information">
            <div className="relative">
              <img
                src="https://cdn.dribbble.com/userupload/45188200/file/49510167ef68236a40dd16a5212e595e.png?resize=400x400&vertical=center"
                alt="Drona MIS logo"
                className="h-32 w-32 rounded-3xl object-cover shadow-2xl ring-4 ring-brandRed/20"
              />
              <div className="absolute -inset-4 bg-gradient-to-r from-brandRed/20 to-brandYellow/20 rounded-full blur-xl -z-10"></div>
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-brandRed to-orange-600 bg-clip-text text-transparent">
                Drona Logitech
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md">
                Welcome to your comprehensive management dashboard. Streamline your operations with our powerful suite of tools.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 bg-red-100/80 dark:bg-red-900/30 text-brandRed dark:text-red-300 rounded-full text-sm font-medium">Inventory Management</span>
                <span className="px-3 py-1 bg-orange-100/80 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-sm font-medium">Billing System</span>
                <span className="px-3 py-1 bg-yellow-100/80 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-sm font-medium">Attendance Tracking</span>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="w-full max-w-md mx-auto">
            <div className="relative">
              {/* Glassmorphism Card */}
              <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl backdrop-saturate-[180%] border border-white/20 dark:border-slate-700/50 rounded-2xl shadow-2xl shadow-brandRed/10 dark:shadow-black/40 p-6 md:p-8">
                {/* Gradient Border Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-brandRed/20 via-orange-500/20 to-brandYellow/20 rounded-2xl -z-10 blur-sm"></div>
                
                <div className="relative z-10">
                  <div className="mb-4 flex justify-center">
                    <span className="inline-flex items-center rounded-full border border-red-100 bg-red-50/80 text-brandRed text-xs font-semibold px-3 py-1 shadow-sm">
                      {isLogin ? 'Login to Drona Logitech' : 'Create your Drona Logitech account'}
                    </span>
                  </div>
                  <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-gray-900 via-brandRed to-orange-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                    {isLogin ? 'Welcome back' : 'Welcome to Drona Logitech'}
                  </h1>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center mb-4 md:mb-6">
                    Use your work email or mobile number to access the dashboard.
                  </p>

          {/* Auth Method Selection */}
                  <div className="mb-4 md:mb-6 flex gap-2 p-1 rounded-full bg-white/95 dark:bg-slate-900/90 border border-gray-200/70 dark:border-slate-700/80 shadow-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMethod('email-password');
                        resetOTP();
                      }}
                      className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-full transition-all duration-200 ${
                        authMethod === 'email-password'
                          ? 'bg-brandRed text-white shadow-md ring-1 ring-brandRed/40'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/80 dark:hover:bg-slate-800/80'
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
                      className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-full transition-all duration-200 ${
                        authMethod === 'email-otp'
                          ? 'bg-brandRed text-white shadow-md ring-1 ring-brandRed/40'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/80 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      Email OTP
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMethod('phone-otp');
                        resetOTP();
                        if (!user || !user.phone) {
                          setPhone('+91');
                        }
                      }}
                      className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-full transition-all duration-200 ${
                        authMethod === 'phone-otp'
                          ? 'bg-brandRed text-white shadow-md ring-1 ring-brandRed/40'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/80 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      🇮🇳 Mobile OTP
                    </button>
                  </div>

          {error && (
            <div className="mb-4 md:mb-6 p-4 bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border border-red-200/50 dark:border-red-800/50 text-red-700 dark:text-red-400 rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">{error}</span>
              </div>
            </div>
          )}

          {/* Email/Password Form */}
          {authMethod === 'email-password' && (
            <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed transition-all duration-200"
                    placeholder="Your name"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed transition-all duration-200"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed transition-all duration-200"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-brandRed to-brandYellow hover:from-red-600 hover:to-yellow-500 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-brandRed/20 hover:shadow-xl hover:shadow-brandRed/30 disabled:shadow-none transform hover:-translate-y-0.5 disabled:translate-y-0"
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed transition-all duration-200"
                      placeholder="you@example.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 bg-gradient-to-r from-brandRed to-brandYellow hover:from-red-600 hover:to-yellow-500 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-brandRed/20 hover:shadow-xl hover:shadow-brandRed/30 disabled:shadow-none transform hover:-translate-y-0.5 disabled:translate-y-0"
                  >
                    {loading ? 'Sending...' : 'Send OTP'}
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-4 p-4 bg-orange-50/80 dark:bg-orange-900/20 backdrop-blur-sm border border-orange-200/50 dark:border-orange-800/50 rounded-xl">
                    <p className="text-sm text-orange-800 dark:text-orange-300 font-medium">
                      OTP sent to {email}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      maxLength={6}
                      className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white text-center text-2xl tracking-widest placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed transition-all duration-200"
                      placeholder="000000"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 bg-gradient-to-r from-brandRed to-brandYellow hover:from-red-600 hover:to-yellow-500 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-brandRed/20 hover:shadow-xl hover:shadow-brandRed/30 disabled:shadow-none transform hover:-translate-y-0.5 disabled:translate-y-0"
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={resetOTP}
                    className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:text-brandRed dark:hover:text-brandYellow transition-colors"
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Mobile Number (India)
                    </label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2 pointer-events-none z-10">
                        <span className="text-lg">🇮🇳</span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">+91</span>
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={handlePhoneChange}
                        required
                        maxLength={13}
                        className="w-full pl-24 pr-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed transition-all duration-200"
                        placeholder="9876543210"
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Enter your 10-digit mobile number
                      </p>
                      {phone.length > 3 && phone.length < 13 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <div className="w-1 h-1 bg-amber-500 rounded-full animate-pulse"></div>
                          {phone.length - 3} digits entered. Need {13 - phone.length} more.
                        </p>
                      )}
                      {phone.length === 13 && !validateIndianPhone(phone) && (
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                          <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse"></div>
                          Invalid number. Indian mobile numbers start with 6, 7, 8, or 9.
                        </p>
                      )}
                      {phone.length === 13 && validateIndianPhone(phone) && (
                        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                          ✓ Valid Indian mobile number
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !validateIndianPhone(phone)}
                    className="w-full py-3 px-4 bg-gradient-to-r from-brandRed to-brandYellow hover:from-red-600 hover:to-yellow-500 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-brandRed/20 hover:shadow-xl hover:shadow-brandRed/30 disabled:shadow-none transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Sending OTP...' : 'Send OTP'}
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-4 p-4 bg-orange-50/80 dark:bg-orange-900/20 backdrop-blur-sm border border-orange-200/50 dark:border-orange-800/50 rounded-xl">
                    <p className="text-sm text-orange-800 dark:text-orange-300 font-medium">
                      <span className="font-medium">OTP sent to:</span> {phone}
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      Please check your SMS for the 6-digit OTP code
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                      className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white text-center text-3xl tracking-[0.5em] font-semibold placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brandRed/20 focus:border-brandRed transition-all duration-200"
                      placeholder="000000"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full py-3 px-4 bg-gradient-to-r from-brandRed to-brandYellow hover:from-red-600 hover:to-yellow-500 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-brandRed/20 hover:shadow-xl hover:shadow-brandRed/30 disabled:shadow-none transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Verifying OTP...' : 'Verify OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={resetOTP}
                    className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:text-brandRed dark:hover:text-brandYellow transition-colors"
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
                      className="text-xs text-brandRed dark:text-orange-400 hover:underline disabled:opacity-50 transition-colors"
                    >
                      Didn&apos;t receive OTP? Resend
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {authMethod === 'email-password' && (
            <div className="mt-4 md:mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-sm text-brandRed dark:text-orange-400 hover:text-red-700 dark:hover:text-orange-300 font-medium transition-colors"
              >
                {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
              </button>
            </div>
          )}

          {/* Google Login Button */}
          <div className="mt-6 md:mt-8">
            <div className="flex justify-center text-sm">
              <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-md">
                Or continue with
              </span>
            </div>

            <div className="mt-4 md:mt-6 space-y-3">
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
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm hover:bg-gray-50/80 dark:hover:bg-gray-600/80 hover:border-brandRed/30 text-gray-700 dark:text-gray-200 font-medium transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200/50 dark:border-gray-600/50 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm hover:bg-gray-50/80 dark:hover:bg-gray-600/80 hover:border-brandRed/30 text-gray-700 dark:text-gray-200 font-medium transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </div>
      </div>
    </div>
  );
}

