// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { NextAuthOptions, User as NextAuthUser } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// Extend NextAuthUser to include id, and ensure other fields are compatible with your Prisma User model
interface CustomSessionUser extends NextAuthUser {
  id: string;
  // email?: string | null; // Already in NextAuthUser
  // name?: string | null; // Already in NextAuthUser
  // image?: string | null; // Already in NextAuthUser
}

// This is the user object returned by the authorize callback
interface AuthorizeUser {
  id: string;
  email: string | null; // Match Prisma schema (email is String?)
  name?: string | null; // Match Prisma schema
  // Add any other fields you expect from authorize to be passed to JWT callback
}


export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials): Promise<AuthorizeUser | null> {
        if (!credentials?.email || !credentials?.password) {
          console.log('Authorize: Missing email or password');
          throw new Error('Please enter both email and password.');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user) {
          console.log('Authorize: No user found with email:', credentials.email);
          throw new Error('No user found with this email.');
        }

        if (!user.passwordHash) {
            console.log('Authorize: User found but has no password hash:', credentials.email);
            throw new Error('This account may not use password login. Try another method or contact support.');
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isValidPassword) {
          console.log('Authorize: Invalid password for email:', credentials.email);
          throw new Error('Incorrect password.');
        }

        console.log('Authorize: Password valid for email:', credentials.email);
        return {
          id: user.id,
          email: user.email, // Prisma user.email can be null, handle accordingly
          name: user.name,
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      // 'user' here is the object returned from the 'authorize' callback or from OAuth provider
      if (user) {
        token.id = (user as AuthorizeUser).id;
        token.email = (user as AuthorizeUser).email; // Persist email to token
        // token.name = (user as AuthorizeUser).name; // Persist name if needed
      }
      return token;
    },
    async session({ session, token }) {
      // 'token' here is the JWT token from the 'jwt' callback
      if (token && session.user) {
        // Assign the properties from the token to the session.user object
        // This makes them available on the client via useSession() or getSession()
        (session.user as CustomSessionUser).id = token.id as string;
        session.user.email = token.email as string | undefined | null; // Align with token.email type
        // session.user.name = token.name as string | undefined | null; // Align with token.name type
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
    error: '/login', // Redirect to login page on error, with error query param
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
