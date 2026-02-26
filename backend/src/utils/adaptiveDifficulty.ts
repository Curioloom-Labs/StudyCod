export function calculateAdaptiveDifus(averageGrade: number, last3Grades: number[], topicIndex: number): number {
  const baseDifus = topicIndex < 5 ? 0 : topicIndex < 10 ? 0.5 : 1;
  if (averageGrade >= 9 && last3Grades.length === 3 && last3Grades.every(g => g >= 9)) {
    return Math.min(1, baseDifus + 0.3);
  } else if (averageGrade >= 7 && last3Grades.length === 3 && last3Grades.every(g => g >= 7)) {
    return baseDifus;
  } else if (averageGrade < 6 || last3Grades.length > 0 && last3Grades.some(g => g < 5)) {
    return Math.max(0, baseDifus - 0.3);
  }
  return baseDifus;
}
export async function getStableDifus(userId: number, lang: "JAVA" | "PYTHON" | "CPP", topicIndex: number, userRepo: () => any, gradeRepo: () => any): Promise<number> {
  const user = await userRepo().findOne({
    where: {
      id: userId
    }
  });
  if (!user) {
    return topicIndex < 5 ? 0 : topicIndex < 10 ? 0.5 : 1;
  }
  const grades = await gradeRepo().createQueryBuilder("grade").leftJoinAndSelect("grade.task", "task").where("grade.user_id = :userId", {
    userId
  }).andWhere("task.lang = :lang", {
    lang
  }).orderBy("grade.createdAt", "DESC").take(5).getMany();
  const validGrades = grades.filter((g: any) => g.total !== null && g.total !== undefined);
  if (validGrades.length < 3) {
    const currentDifus = lang === "PYTHON" ? user.difusPython : user.difusJava;
    return currentDifus;
  }
  const last5Grades = validGrades.slice(0, 5).map((g: any) => g.total ?? 0);
  const last3Grades = last5Grades.slice(0, 3);
  const averageGrade = last5Grades.reduce((sum: number, g: number) => sum + g, 0) / last5Grades.length;
  const newDifus = calculateAdaptiveDifus(averageGrade, last3Grades, topicIndex);
  const currentDifus = lang === "PYTHON" ? user.difusPython : user.difusJava;
  if (Math.abs(newDifus - currentDifus) >= 0.3) {
    const lastChange = (user as any).lastDifusChange || new Date(0);
    const daysSinceChange = Math.floor((new Date().getTime() - new Date(lastChange).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceChange >= 1 || validGrades.length < 3) {
      if (lang === "PYTHON") user.difusPython = newDifus;
      else user.difusJava = newDifus;
      (user as any).lastDifusChange = new Date();
      await userRepo().save(user);
      return newDifus;
    }
  }
  return currentDifus;
}