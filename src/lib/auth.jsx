import { createContext, useContext, useEffect, useState } from "react";
import { sessionUser, supabase, toEmail } from "./supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ ready: true, user: sessionUser(data.session) }));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ ready: true, user: sessionUser(session) });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
    if (error) {
      if (/banned/i.test(error.message)) return "This account is turned off. Ask Marvie or Salome to turn it back on.";
      if (/fetch|network/i.test(error.message)) return "No internet connection. Check it and try again.";
      return "Wrong username or password.";
    }
    if (!sessionUser(data.session)) {
      await supabase.auth.signOut();
      return "This account has no access to the app. Ask an owner to create one for you.";
    }
    return null;
  }

  const value = {
    ...state,
    isOwner: state.user?.role === "owner",
    signIn,
    signOut: () => supabase.auth.signOut(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
