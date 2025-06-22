// src/components/AuthProvider.tsx
'use client';

import { SessionProvider, SessionProviderProps } from 'next-auth/react';
import React from 'react';

// Extend SessionProviderProps if you need to pass additional props,
// though for basic usage, just children is often enough.
interface AuthProviderProps {
  children: React.ReactNode;
  // session prop is part of SessionProviderProps, Next.js might pass it automatically
  // if SessionProvider is used in a server component that fetches session.
  // For a root layout client component, SessionProvider typically fetches its own session.
  session?: SessionProviderProps['session'];
}

export default function AuthProvider({ children, session }: AuthProviderProps) {
  return (
    // The session prop is optional here. If not provided, SessionProvider
    // will automatically fetch the session on the client-side.
    // Passing it can be an optimization if the session is already available (e.g., from a Server Component parent).
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  );
}
