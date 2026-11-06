import { createContext, useContext, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, logout } from '../services/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const signOut = async () => {
    await logout();
    queryClient.clear();
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
