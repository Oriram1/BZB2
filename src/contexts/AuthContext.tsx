/* eslint-disable react-refresh/only-export-components -- context hook and provider form one public API. */
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  age: number | null;
  address: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUserState: () => Promise<void>;
}

type AppRole = "tasker" | "bee" | "parent" | "admin";

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  refreshUserState: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  /** Who we have already resolved profile and roles for. */
  const settledUserIdRef = useRef<string | null>(null);

  const getMetadataRole = (nextUser: User | null): AppRole | null => {
    const role = nextUser?.user_metadata?.app_role;
    if (role === "tasker" || role === "bee" || role === "parent" || role === "admin") {
      return role;
    }
    return null;
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    return data ?? null;
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    return data?.map((r) => r.role) || [];
  };

  const ensureUserRole = async (nextUser: User | null, currentRoles: string[]) => {
    if (!nextUser || currentRoles.length > 0) return currentRoles;

    const metadataRole = getMetadataRole(nextUser);
    if (!metadataRole) return currentRoles;

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: nextUser.id, role: metadataRole });

    // Never treat client metadata as an authority. If the database rejected
    // the repair, the user has no verified role until the next successful
    // reload. Metadata is only an input for the signup repair path.
    if (error && error.code !== "23505") return currentRoles;

    const repairedRoles = await fetchRoles(nextUser.id);
    return repairedRoles;
  };

  const loadUserState = async (nextUser: User | null) => {
    if (!nextUser) {
      setProfile(null);
      setRoles([]);
      return;
    }

    const [nextProfile, nextRoles] = await Promise.all([
      fetchProfile(nextUser.id),
      fetchRoles(nextUser.id),
    ]);

    const resolvedRoles = await ensureUserRole(nextUser, nextRoles);

    setProfile(nextProfile);
    setRoles(resolvedRoles);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const nextUser = session?.user ?? null;
        setSession(session);

        // Supabase re-fires this for the same signed-in user on every token
        // refresh (roughly hourly) and when a tab regains focus. Profile and
        // roles cannot have changed, but going through the loading state again
        // would blank every guarded page — RoleGuard renders null while loading
        // — and remount it with fresh state. That is what threw the chat back
        // to the conversation list in the middle of a conversation.
        if (nextUser && settledUserIdRef.current === nextUser.id) {
          // Keep the existing object so consumers holding `user` in a
          // dependency array do not refetch over a token we merely renewed.
          setUser((current) => current ?? nextUser);
          return;
        }

        setUser(nextUser);
        setLoading(true);

        window.setTimeout(() => {
          void loadUserState(nextUser).finally(() => {
            settledUserIdRef.current = nextUser?.id ?? null;
            setLoading(false);
          });
        }, 0);
      }
    );

    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      const nextUser = session?.user ?? null;
      setLoading(true);
      setSession(session);
      setUser(nextUser);
      await loadUserState(nextUser);
      settledUserIdRef.current = nextUser?.id ?? null;
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  // The subscription is intentionally installed once for the provider.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    settledUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (user) {
      const nextProfile = await fetchProfile(user.id);
      setProfile(nextProfile);
    }
  };

  const refreshUserState = async () => {
    await loadUserState(user);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, signOut, refreshProfile, refreshUserState }}>
      {children}
    </AuthContext.Provider>
  );
};
