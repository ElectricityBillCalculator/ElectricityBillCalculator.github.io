// src/app/login/page.tsx
'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react'; // Import signIn and useSession

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession(); // Get session status

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check for error query parameter from NextAuth.js (e.g., if redirected from [...nextauth] route)
  useEffect(() => {
    const nextAuthError = searchParams?.get('error');
    if (nextAuthError) {
      // You can map specific NextAuth errors to more user-friendly messages
      if (nextAuthError === 'CredentialsSignin') {
        setError('Invalid email or password. Please try again.');
      } else if (nextAuthError === 'Callback') {
        setError('Login callback error. Please try again.'); // Example for other errors
      }
      else {
        setError(`Login failed: ${nextAuthError}. Please try again.`);
      }
    }
  }, [searchParams]);

  // If user is already logged in, redirect to dashboard
   useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    }
  }, [status, router]);


  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        redirect: false, // We'll handle redirect manually after checking result
        email,
        password,
      });

      if (result?.error) {
        console.error("SignIn Error:", result.error);
        // Map common errors or use a generic message
        if (result.error === 'CredentialsSignin') {
            setError('Invalid email or password.');
        } else {
            setError(`Login attempt failed. Please check your credentials or try again later.`);
        }
        setIsLoading(false);
      } else if (result?.ok) {
        // Successful login
        router.push('/dashboard'); // Redirect to dashboard
        // router.refresh(); // To ensure server components using session are updated
      } else {
        // Other non-error but not ok results (should not happen with credentials for this setup)
        setError('Login failed. Please try again.');
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error("Exception during signIn:", err);
      setError(err.message || 'An unexpected error occurred during login.');
      setIsLoading(false);
    }
  };

  // Show loading or nothing if session is loading or user is already authenticated
  if (status === 'loading' || status === 'authenticated') {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
            <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {status === 'authenticated' ? <p className="mt-2">Redirecting...</p> : <p className="mt-2">Loading session...</p>}
        </div>
    );
  }


  return (
    // Render login form only if not authenticated and not loading
    status === 'unauthenticated' && (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-4 py-8">
        <div className="w-full max-w-md p-8 space-y-6 bg-white shadow-2xl rounded-xl">
            <h1 className="text-3xl font-bold text-center text-slate-800">เข้าสู่ระบบ</h1>

            {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm text-center transition-opacity duration-300">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                อีเมล
                </label>
                <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                placeholder="you@example.com"
                disabled={isLoading}
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                รหัสผ่าน
                </label>
                <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                placeholder="รหัสผ่านของคุณ"
                disabled={isLoading}
                />
            </div>

            <div>
                <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-150 ease-in-out"
                >
                {isLoading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    'เข้าสู่ระบบ'
                )}
                </button>
            </div>
            </form>
            <p className="text-sm text-center text-slate-600 pt-2">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500 hover:underline">
                ลงทะเบียนที่นี่
            </Link>
            </p>
        </div>
        </div>
    )
  );
}
