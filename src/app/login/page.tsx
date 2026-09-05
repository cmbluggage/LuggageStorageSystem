'use client';

import React, { useState } from 'react';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { Button } from '@/components/ui/Button';
import { Lock, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { notify } from '@/lib/toast';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (authError) {
        setError(authError.message);
        notify.error(authError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        const msg = 'Login failed. Please try again.';
        setError(msg);
        notify.error(msg);
        setLoading(false);
        return;
      }

      notify.success('Signed in successfully! Redirecting...');

      // Determine role from app_metadata, user_metadata, staff query, or email fallback
      const { data: staff } = await supabase
        .from('staff')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle();

      const appRole  = (data.user.app_metadata as Record<string, unknown> | undefined)?.role as string | undefined;
      const userRole = (data.user.user_metadata as Record<string, unknown> | undefined)?.role as string | undefined;
      const staffRole = (staff as { role?: string } | null)?.role;
      const isEmailAdmin = data.user.email?.toLowerCase() === 'admin@stowaway.lk';

      const role = appRole || userRole || staffRole || (isEmailAdmin ? 'superadmin' : 'staff');
      window.location.href = role === 'superadmin' ? '/admin' : '/staff';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg);
      notify.error(msg);
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      const msg = 'Please enter both email and password.';
      setError(msg);
      notify.error(msg);
      return;
    }
    doLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12" id="login-main">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-extrabold text-[#1C130E] tracking-tight">Portal Sign In</h1>
            <p className="text-sm font-medium text-slate-500 mt-2">
              Staff &amp; SuperAdmin authentication for Luggage Storage Colombo operations.
            </p>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label htmlFor="login-email" className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-600 focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-600 focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                loading={loading}
                id="login-submit-btn"
                className="mt-2 py-4 text-base font-black"
              >
                {loading ? 'Signing In...' : 'Sign In to Portal →'}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
