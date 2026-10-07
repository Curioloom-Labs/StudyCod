import { createContext } from "react";
import type { User } from "../../types";

export const PersonalWorkspaceContext = createContext<{
  active: boolean;
  setUser: (user: User | null) => void;
} | null>(null);
