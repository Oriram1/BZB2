import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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

    if (error && error.code !== "23505") {
      return [metadataRole];
    }

    const repairedRoles = await fetchRoles(nextUser.id);
    return repairedRoles.length > 0 ? repairedRoles : [metadataRole];
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
        setLoading(true);
        setSession(session);
        setUser(session?.user ?? null);

        window.setTimeout(() => {
          void loadUserState(session?.user ?? null).finally(() => {
            setLoading(false);
          });
        }, 0);
      }
    );

    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      setLoading(true);
      setSession(session);
      setUser(session?.user ?? null);
      await loadUserState(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
