import React from "react";
import {
  getLearningCourse,
  getLearningMe,
  setCurrentCourse,
  type LearningCourse,
  type LearningMe,
} from "../../lib/api/learningCatalog";

type PersonalLearningContextValue = {
  me: LearningMe | null;
  currentCourse: LearningCourse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectCourse: (enrollmentId: number) => Promise<void>;
};

const PersonalLearningContext = React.createContext<PersonalLearningContextValue | null>(null);

export const PersonalLearningProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [me, setMe] = React.useState<LearningMe | null>(null);
  const [currentCourse, setCurrentCourseData] = React.useState<LearningCourse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextMe = await getLearningMe();
      setMe(nextMe);
      if (nextMe.current) {
        setCurrentCourseData(await getLearningCourse(nextMe.current.courseId));
      } else {
        setCurrentCourseData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити навчальний простір.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener("studycod:course-progress-changed", handler);
    return () => window.removeEventListener("studycod:course-progress-changed", handler);
  }, [refresh]);

  const selectCourse = React.useCallback(async (enrollmentId: number) => {
    await setCurrentCourse(enrollmentId);
    await refresh();
  }, [refresh]);

  return <PersonalLearningContext.Provider value={{ me, currentCourse, loading, error, refresh, selectCourse }}>{children}</PersonalLearningContext.Provider>;
};

export function usePersonalLearning(): PersonalLearningContextValue {
  const value = React.useContext(PersonalLearningContext);
  if (!value) throw new Error("usePersonalLearning must be used inside PersonalLearningProvider");
  return value;
}
