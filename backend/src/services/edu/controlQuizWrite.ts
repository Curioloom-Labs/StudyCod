import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { ControlWork } from "../../entities/ControlWork";
import { LessonAttempt } from "../../entities/LessonAttempt";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { AssessmentType } from "../../types/AssessmentType";
import { HttpError } from "../../utils/httpError";
import { isAssignedToStudent } from "../../utils/assignmentVisibility";
import { lockEduOrganization } from "./lifecycleAccess";
import { matchesStudentCredentialVersion } from "./studentCredentialVersion";
import { matchesEduSessionVersion } from "./userSessions";
import { markControlWorkAttemptCompletedIfReadyWithManager, saveControlSummaryGradeForNewSystemWithManager } from "./controlWorkGrading";

export async function persistControlQuiz(input: {
  controlWorkId: number; studentId: number; classId: number; expectedQuizJson: string;
  theoryGrade: number; answersJson: string; resultsJson: string;
  credentialVersion?: number; userId?: number; sessionVersion?: number;
}) {
  const result = await AppDataSource.transaction("READ COMMITTED", async manager => {
    const classes = manager.getRepository(Class), snapshot = await classes.findOneBy({ id: input.classId });
    if (!snapshot) throw new HttpError(403, "ACCESS_DENIED");
    await lockEduOrganization(manager, snapshot.organizationId);
    const cls = await classes.findOne({ where: { id: input.classId, organization: { id: snapshot.organizationId } }, lock: { mode: "pessimistic_write" } });
    if (!cls) throw new HttpError(409, "STUDENT_CONTEXT_CHANGED");
    const student = await manager.getRepository(Student).findOne({ where: { id: input.studentId, class: { id: cls.id } }, withDeleted: true, relations: ["user"], lock: { mode: "pessimistic_write" } });
    if (!student || student.deletedAt) throw new HttpError(403, "ACCESS_DENIED");
    if (!matchesStudentCredentialVersion(input.credentialVersion, student.credentialVersion)) throw new HttpError(401, "SESSION_CHANGED");
    if (input.userId) {
      const user = await manager.getRepository(User).findOne({ where: { id: input.userId }, select: ["id", "userMode", "eduSessionVersion"], lock: { mode: "pessimistic_write" } });
      if (!user || student.user?.id !== user.id || !matchesEduSessionVersion(input.sessionVersion, user.eduSessionVersion)) throw new HttpError(401, "SESSION_CHANGED");
      if (user.userMode === "CONTEST") throw new HttpError(403, "CONTEST_ACCOUNT_NOT_SUPPORTED");
    }
    const control = await manager.getRepository(ControlWork).findOne({ where: { id: input.controlWorkId, topic: { class: { id: cls.id } } }, relations: ["topic"], lock: { mode: "pessimistic_write" } });
    if (!control || !isAssignedToStudent(control.isAssigned, control.assignedStudentIds, student.id)) throw new HttpError(403, "ACCESS_DENIED");
    if (!control.hasTheory || !control.quizJson) throw new HttpError(400, "CONTROL_WORK_HAS_NO_QUIZ");
    if (control.quizJson !== input.expectedQuizJson) throw new HttpError(409, "QUIZ_CHANGED");
    if (control.deadline && Date.now() > control.deadline.getTime()) throw new HttpError(403, "CONTROL_WORK_DEADLINE_PASSED");
    const repo = manager.getRepository(SummaryGrade);
    let summary = await repo.findOne({ where: { student: { id: student.id }, controlWork: { id: control.id } }, order: { createdAt: "DESC", id: "DESC" }, lock: { mode: "pessimistic_write" } });
    if (summary && (summary.quizAnswersJson || summary.theoryGrade != null)) throw new HttpError(409, "QUIZ_ALREADY_SUBMITTED");
    const attempts = manager.getRepository(LessonAttempt), attempt = await attempts.findOne({ where: { controlWork: { id: control.id }, student: { id: student.id }, status: "IN_PROGRESS" }, order: { startedAt: "DESC", id: "DESC" }, lock: { mode: "pessimistic_write" } });
    if (!attempt) throw new HttpError(403, "CONTROL_WORK_NOT_STARTED");
    if (Date.now() >= attempt.startedAt.getTime() + (attempt.timeLimitMinutes || 45) * 60000) {
      await attempts.update(attempt.id, { status: "COMPLETED", finishedAt: new Date(), isFinished: true });
      return { expired: true as const };
    }
    const patch = { theoryGrade: input.theoryGrade, quizAnswersJson: input.answersJson, quizResultsJson: input.resultsJson };
    if (summary) await repo.update(summary.id, patch);
    else summary = await repo.save(repo.create({ student, class: cls, topic: control.topic, controlWork: control, name: control.title || `Control #${control.id}`, assessmentType: AssessmentType.CONTROL, grade: input.theoryGrade, ...patch }));
    await saveControlSummaryGradeForNewSystemWithManager(manager, control.id, student.id, input.theoryGrade);
    await markControlWorkAttemptCompletedIfReadyWithManager(manager, control.id, student.id);
    const saved = await repo.findOneBy({ id: summary.id });
    if (!saved) throw new HttpError(409, "SUMMARY_GRADE_NOT_FOUND");
    return { expired: false as const, summary: saved };
  });
  if (result.expired) throw new HttpError(403, "CONTROL_WORK_TIME_EXPIRED");
  return result.summary;
}
