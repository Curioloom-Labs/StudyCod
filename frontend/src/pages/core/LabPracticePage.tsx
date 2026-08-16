import React from "react";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "./TasksPage";
import { BrandedPageLoader } from "../../components/ui/BrandedPageLoader";
export const LabPracticePage: React.FC = () => { const [user, setUser] = React.useState<User | null>(null); React.useEffect(() => { void getMe({ suppressAuthRedirect: true }).then(setUser); }, []); return user ? <TasksPage user={user} /> : <BrandedPageLoader />; };
