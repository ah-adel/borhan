import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Profile, UserRole } from '@/types/database.types';
import {
  writeLocalSession,
} from '@/lib/localDb';
import { localizedRuntimeError } from '@/lib/errorMessages';
import { clearSessionToken, fetchWithSession, getSessionToken, isSessionTokenPersistent, setSessionToken } from '@/lib/sessionToken';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
type ApiRequestError = Error & { code?: string };

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10000);
  let response: Response;

  try {
    response = await fetchWithSession(`${API_BASE_URL}${path}`, {
      ...options,
      cache: 'no-store',
      signal: options.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    }, {
      useSessionToken: !['/api/auth/sign-in', '/api/auth/sign-up', '/api/auth/verify-email', '/api/auth/resend-verification', '/api/auth/forgot-password', '/api/auth/reset-password'].includes(path),
    });
  } catch (error) {
    throw new Error(localizedRuntimeError(timedOut ? new Error('Request timed out') : error));
  } finally {
    window.clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(localizedRuntimeError(payload?.error ?? payload?.detail, 'Authentication request failed.')) as ApiRequestError;
    if (typeof payload?.code === 'string') error.code = payload.code;
    throw error;
  }

  return (payload?.data ?? payload) as T;
}

type LocalSession = {
  userId: string;
  email: string;
};

type LocalUser = {
  id: string;
  email: string;
  role: UserRole;
};

type AuthApiResponse = {
  user: LocalUser;
  verification_required?: boolean;
  session?: {
    user_id: string;
    email: string;
    authenticated: boolean;
    access_token: string;
    token_type: 'bearer';
    expires_at?: string;
  };
  profile?: Profile | null;
  challenge_token?: string;
  mfa_setup_required?: boolean;
};

export type MfaChallenge = {
  challengeToken: string;
  setupRequired: boolean;
  rememberMe?: boolean;
  secret?: string;
  otpauthUrl?: string;
};

type AuthActionResult = { error: string | null; mfaChallenge?: MfaChallenge; verificationRequired?: boolean };

async function prepareMfaChallenge(response: AuthApiResponse): Promise<MfaChallenge> {
  const challengeToken = response.challenge_token;
  const setupRequired = Boolean(response.mfa_setup_required);
  if (!challengeToken) throw new Error('The server did not return an MFA challenge.');
  if (!setupRequired) return { challengeToken, setupRequired: false };

  const setup = await apiRequest<{ secret: string; otpauth_url: string }>('/api/auth/mfa/setup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${challengeToken}` },
  });
  return {
    challengeToken,
    setupRequired,
    secret: setup.secret,
    otpauthUrl: setup.otpauth_url,
  };
}

interface UserListRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'suspended';
  avatar?: string | null;
  joined_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AdminStats {
  total_users: number;
  total_students: number;
  total_instructors: number;
  total_courses: number;
  published_courses: number;
  total_enrollments: number;
  total_revenue: number;
}

interface AdminCourseRow {
  id: string;
  instructor_id: string;
  title: string;
  description: string;
  thumbnail_url?: string | null;
  is_published: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  status?: 'draft' | 'published' | 'review';
}

interface AuthContextValue {
  session: LocalSession | null;
  user: LocalUser | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<AuthActionResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<AuthActionResult>;
  verifyEmail: (token: string) => Promise<{ error: string | null }>;
  resendVerificationEmail: (email: string) => Promise<{ error: string | null }>;
  completeMfa: (challengeToken: string, code: string, rememberMe?: boolean) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateAccount: (fullName: string, email: string, bio: string) => Promise<{ error: string | null }>;
  fetchUsers: () => Promise<UserListRow[]>;
  fetchAdminStats: () => Promise<AdminStats>;
  fetchAdminCourses: () => Promise<AdminCourseRow[]>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildProfile(userId: string, fullName: string, role: UserRole): Profile {
  const now = new Date().toISOString();

  return {
    id: userId,
    full_name: fullName,
    role,
    avatar_url: null,
    bio: null,
    created_at: now,
    updated_at: now,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string): Promise<Profile | null> {
    if (!userId || typeof window === 'undefined') return null;

    try {
      const authSession = await apiRequest<{ user: LocalUser; profile: Profile | null }>('/api/auth/me');
      const nextProfile = authSession?.profile ?? null;
      setProfile(nextProfile);
      return nextProfile;
    } catch (error) {
      console.error('Failed to load backend profile:', error);
      setProfile(null);
      return null;
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    const restoreSession = async () => {
      try {
        if (!getSessionToken()) {
          clearSessionToken();
          writeLocalSession(null);
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const restored = await apiRequest<{ user: LocalUser; profile: Profile | null }>('/api/auth/me');
        if (!restored.user?.id || !restored.profile) {
          clearSessionToken();
          writeLocalSession(null);
          setSession(null);
          setProfile(null);
          return;
        }
        const restoredSession = { userId: restored.user.id, email: restored.user.email };
        if (restored.user.role === 'admin' && isSessionTokenPersistent()) {
          setSessionToken(getSessionToken() ?? '', 'admin');
        }
        writeLocalSession(restoredSession);
        setSession(restoredSession);
        setProfile(restored.profile);
      } catch (error) {
        console.error('Failed to restore backend session:', error);
        clearSessionToken();
        writeLocalSession(null);
        setSession(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    void restoreSession();
  }, []);

  async function signIn(email: string, password: string, rememberMe = false) {
    if (typeof window === 'undefined') {
      return { error: 'Local auth is only available in the browser.' };
    }

    try {
      const authResponse = await apiRequest<AuthApiResponse>(`/api/auth/sign-in`, {
        method: 'POST',
        body: JSON.stringify({ email, password, remember_me: rememberMe }),
      });

      if (authResponse?.challenge_token) {
        return { error: null, mfaChallenge: { ...await prepareMfaChallenge(authResponse), rememberMe } };
      }

      const user = authResponse?.user;
      if (!user || !authResponse.session?.access_token) {
        return { error: localizedRuntimeError(new Error('Invalid email or password.')) };
      }

      const nextSession = { userId: user.id, email: user.email };
      setSessionToken(authResponse.session.access_token, user.role, rememberMe);
      writeLocalSession(nextSession);
      setSession(nextSession);
      setProfile(authResponse?.profile ?? buildProfile(user.id, user.email, user.role));
      return { error: null };
    } catch (error) {
      console.error('Failed to sign in with backend:', error);
      return {
        error: localizedRuntimeError(error, 'Unable to sign in.'),
        verificationRequired: (error as ApiRequestError)?.code === 'email_not_verified',
      };
    }
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string
  ) {
    if (typeof window === 'undefined') {
      return { error: 'Local auth is only available in the browser.' };
    }

    try {
      const authResponse = await apiRequest<AuthApiResponse>(`/api/auth/sign-up`, {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name: fullName }),
      });

      if (authResponse?.verification_required) {
        return { error: null, verificationRequired: true };
      }

      if (authResponse?.challenge_token) {
        return { error: null, mfaChallenge: await prepareMfaChallenge(authResponse) };
      }

      const user = authResponse?.user;
      if (!user || !authResponse.session?.access_token) {
        return { error: localizedRuntimeError(new Error('Unable to create the account.')) };
      }

      const nextSession = { userId: user.id, email: user.email };
      setSessionToken(authResponse.session.access_token, user.role);
      writeLocalSession(nextSession);
      setSession(nextSession);
      setProfile(authResponse?.profile ?? buildProfile(user.id, fullName, user.role));
      return { error: null };
    } catch (error) {
      console.error('Failed to sign up with backend:', error);
      return { error: localizedRuntimeError(error, 'Unable to create the account.') };
    }
  }

  async function verifyEmail(token: string) {
    try {
      await apiRequest('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      return { error: null };
    } catch (error) {
      return { error: localizedRuntimeError(error, 'Unable to verify the email address.') };
    }
  }

  async function resendVerificationEmail(email: string) {
    try {
      await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return { error: null };
    } catch (error) {
      return { error: localizedRuntimeError(error, 'Unable to resend the verification email.') };
    }
  }

  async function completeMfa(challengeToken: string, code: string, rememberMe = false) {
    try {
      const authResponse = await apiRequest<AuthApiResponse>('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${challengeToken}` },
        body: JSON.stringify({ code, remember_me: rememberMe }),
      });
      const user = authResponse.user;
      const accessToken = authResponse.session?.access_token;
      if (!user || !accessToken || !authResponse.profile) {
        return { error: 'The server did not complete MFA authentication.' };
      }

      setSessionToken(accessToken, user.role, rememberMe);
      writeLocalSession({ userId: user.id, email: user.email });
      setSession({ userId: user.id, email: user.email });
      setProfile(authResponse.profile);
      return { error: null };
    } catch (error) {
      return { error: localizedRuntimeError(error, 'Unable to verify the authenticator code.') };
    }
  }

  async function signOut() {
    if (typeof window === 'undefined') {
      return;
    }

    const localKeys = ['learnflow_session', 'access_token', 'token'];
    localKeys.forEach((key) => {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    });
    clearSessionToken();

    writeLocalSession(null);
    setProfile(null);
    setSession(null);

    try {
      void fetch(`${API_BASE_URL}/api/auth/sign-out`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      }).catch((error) => {
        console.warn('Sign-out request failed; continuing local logout.', error);
      });
    } finally {
      window.location.href = '/';
      window.location.href = '/auth/sign-in';
    }
  }

  async function refreshProfile() {
    if (!session?.userId) return;
    await loadProfile(session.userId);
  }

  async function updateAccount(fullName: string, email: string, bio: string) {
    if (!session?.userId) return { error: 'You must be signed in to update your profile.' };

    try {
      const response = await apiRequest<{ user: { id: string; email: string; role: UserRole }; profile: Profile; verification_required?: boolean }>(`/api/auth/profile?user_id=${encodeURIComponent(session.userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName, email, bio }),
      });
      if (response.verification_required) {
        clearSessionToken();
        writeLocalSession(null);
        setSession(null);
        setProfile(null);
        return { error: 'A verification link was sent to your new email address. Verify it before signing in again.' };
      }
      const nextSession = { ...session, email: response.user.email };
      writeLocalSession(nextSession);
      setSession(nextSession);
      setProfile(response.profile);
      return { error: null };
    } catch (error) {
      if ((error as ApiRequestError)?.code === 'email_not_verified') {
        clearSessionToken();
        writeLocalSession(null);
        setSession(null);
        setProfile(null);
      }
      return { error: localizedRuntimeError(error, 'Unable to update your profile.') };
    }
  }

  async function fetchUsers(): Promise<UserListRow[]> {
    const users = await apiRequest<UserListRow[]>(`/api/users`, {
      method: 'GET',
    });
    return Array.isArray(users) ? users : [];
  }

  async function fetchAdminStats(): Promise<AdminStats> {
    const stats = await apiRequest<AdminStats>(`/api/admin/stats`, {
      method: 'GET',
    });
    return {
      total_users: Number(stats?.total_users ?? 0),
      total_students: Number(stats?.total_students ?? 0),
      total_instructors: Number(stats?.total_instructors ?? 0),
      total_courses: Number(stats?.total_courses ?? 0),
      published_courses: Number(stats?.published_courses ?? 0),
      total_enrollments: Number(stats?.total_enrollments ?? 0),
      total_revenue: Number(stats?.total_revenue ?? 0),
    };
  }

  async function fetchAdminCourses(): Promise<AdminCourseRow[]> {
    const courses = await apiRequest<AdminCourseRow[]>(`/api/admin/courses`, {
      method: 'GET',
    });
    return Array.isArray(courses) ? courses : [];
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session && profile ? { id: session.userId, email: session.email, role: profile.role } : null,
      profile,
      loading,
      signIn,
      signUp,
      verifyEmail,
      resendVerificationEmail,
      completeMfa,
      signOut,
      refreshProfile,
      updateAccount,
      fetchUsers,
      fetchAdminStats,
      fetchAdminCourses,
    }),
    [loading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
