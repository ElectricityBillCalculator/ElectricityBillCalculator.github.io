// src/components/Navbar.tsx
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { LogIn, LogOut, UserPlus, LayoutDashboard, Home, UserCircle, Loader2 } from 'lucide-react'; // Added Loader2

export default function Navbar() {
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';

  return (
    <nav className="bg-slate-800 text-white p-4 shadow-md sticky top-0 z-50 print:hidden">
      <div className="container mx-auto flex flex-wrap justify-between items-center">
        <Link href="/" className="text-xl sm:text-2xl font-bold hover:text-slate-300 transition-colors flex items-center">
          <Home size={22} className="mr-2 sm:mr-2.5"/> E-Bill Calc
        </Link>

        <div className="space-x-2 sm:space-x-3 flex items-center mt-3 sm:mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-9 w-24 bg-slate-700 rounded animate-pulse">
                 <Loader2 size={20} className="animate-spin text-slate-500"/>
            </div>
          ) : session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm sm:text-base flex items-center px-2.5 py-2 sm:px-3 hover:bg-slate-700 rounded-md transition-colors"
                title="Dashboard"
              >
                <LayoutDashboard size={18} className="mr-1 sm:mr-1.5"/>Dashboard
              </Link>
              <div
                className="text-sm sm:text-base text-slate-300 hidden md:flex items-center px-2.5 py-2 sm:px-3"
                title={session.user.email || session.user.name || 'User Profile'}
              >
                <UserCircle size={18} className="mr-1 sm:mr-1.5 flex-shrink-0"/>
                <span className="truncate max-w-[100px] sm:max-w-[150px]">
                  {session.user.name || session.user.email || 'User'}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm sm:text-base flex items-center px-2.5 py-2 sm:px-3 bg-red-600 hover:bg-red-700 rounded-md transition-colors font-medium"
                title="ออกจากระบบ"
              >
                <LogOut size={18} className="mr-1 sm:mr-1.5"/>ออกจากระบบ
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm sm:text-base flex items-center px-2.5 py-2 sm:px-3 hover:bg-slate-700 rounded-md transition-colors"
                title="เข้าสู่ระบบ"
              >
                <LogIn size={18} className="mr-1 sm:mr-1.5"/>เข้าสู่ระบบ
              </Link>
              <Link
                href="/register"
                className="text-sm sm:text-base flex items-center px-2.5 py-2 sm:px-3 bg-green-600 hover:bg-green-700 rounded-md transition-colors font-medium"
                title="ลงทะเบียน"
              >
                <UserPlus size={18} className="mr-1 sm:mr-1.5"/>ลงทะเบียน
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
