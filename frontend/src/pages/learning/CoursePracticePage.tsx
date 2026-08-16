import React from "react";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "../core/TasksPage";
import { BrandedPageLoader } from "../../components/ui/BrandedPageLoader";

export const CoursePracticePage: React.FC = () => {
  const [user, setUser] = React.useState<User | null>(null);
  React.useEffect(() => { void getMe({ suppressAuthRedirect: true }).then(setUser); }, []);
  if (!user) return <BrandedPageLoader />;
  return <TasksPage user={user} />;
};
