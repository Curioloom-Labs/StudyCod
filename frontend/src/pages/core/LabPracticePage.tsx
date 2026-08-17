import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "./TasksPage";
import { LibraryTaskSolvePage } from "../library/LibraryTaskSolvePage";
import { BrandedPageLoader } from "../../components/ui/BrandedPageLoader";

/**
 * Keep the legacy route useful without making it the Lab landing page.
 *
 * - `/lab/practice?workspace=personal` is the optional generated-task flow.
 * - `/lab/practice?task=...` is a compatibility entry point for a library task.
 * - `/lab/practice` itself belongs to the library and redirects there.
 */
export const LabPracticePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const taskKey = String(searchParams.get("task") ?? "").trim();
  const personalWorkspace = searchParams.get("workspace") === "personal";
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    if (!personalWorkspace) return;
    void getMe({ suppressAuthRedirect: true }).then(setUser);
  }, [personalWorkspace]);

  if (taskKey && !personalWorkspace) return <LibraryTaskSolvePage />;
  if (!personalWorkspace) return <Navigate to="/lab/library" replace />;

  return user ? <TasksPage user={user} /> : <BrandedPageLoader />;
};
