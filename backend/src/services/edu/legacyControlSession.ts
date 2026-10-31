import { AppDataSource } from '../../data-source';
import { ControlWork } from '../../entities/ControlWork';
import { LessonAttempt } from '../../entities/LessonAttempt';
import { Student } from '../../entities/Student';
import { TopicTask } from '../../entities/TopicTask';
import { TestData } from '../../entities/TestData';
import { HttpError } from '../../utils/httpError';
import { isAssignedToStudent } from '../../utils/assignmentVisibility';
import { assessmentRemainingSeconds } from '../../../../shared/utils/assessmentClock';
import { normalizeLegacyAnswer } from '../../../../shared/utils/legacyQuiz';
import { saveControlSummaryGradeForNewSystemWithManager } from './controlWorkGrading';

export async function changeLegacyControlSession(id: number, studentId: number, action: 'START' | 'FINISH') {
  return AppDataSource.transaction('READ COMMITTED', async manager => {
    const student = await manager.getRepository(Student).findOne({ where: { id: studentId }, relations: ['class'], lock: { mode: 'pessimistic_write' } });
    const control = await manager.getRepository(ControlWork).findOne({ where: { id }, relations: ['topic', 'topic.class'], lock: { mode: 'pessimistic_write' } });
    if (!control || !student?.class || student.class.id !== control.topic.class?.id || !isAssignedToStudent(control.isAssigned, control.assignedStudentIds, studentId)) throw new HttpError(403, 'ACCESS_DENIED');
    const repo = manager.getRepository(LessonAttempt);
    let attempt = await repo.findOne({ where: { controlWork: { id }, student: { id: studentId } }, order: { startedAt: 'DESC', id: 'DESC' }, lock: { mode: 'pessimistic_write' } });
    const expired = control.deadline && Date.now() >= control.deadline.getTime();
    if (action === 'START') {
      const other = await repo.findOne({ where: { student: { id: studentId }, status: 'IN_PROGRESS' }, relations: ['controlWork'], order: { startedAt: 'DESC' } });
      if (other?.controlWork && other.controlWork.id !== id) {
        if (assessmentRemainingSeconds(other.startedAt, other.timeLimitMinutes, other.controlWork.deadline) !== 0) throw new HttpError(409, 'CONTROL_WORK_ALREADY_IN_PROGRESS');
        other.status = 'COMPLETED'; other.finishedAt = new Date(); other.isFinished = true; await repo.save(other);
      }
      if (expired) throw new HttpError(403, 'CONTROL_WORK_DEADLINE_PASSED');
      if (attempt) {
        if (attempt.status !== 'IN_PROGRESS' || assessmentRemainingSeconds(attempt.startedAt, attempt.timeLimitMinutes, control.deadline) === 0) throw new HttpError(409, 'CONTROL_WORK_COMPLETED');
      } else {
        if (!control.hasTheory && control.hasPractice === false) throw new HttpError(409, 'ASSESSMENT_NOT_READY');
        if (control.hasTheory) {
          let questions: unknown;
          try { const parsed = JSON.parse(control.quizJson || 'null'); questions = Array.isArray(parsed) ? parsed : parsed?.questions; } catch { /* readiness below */ }
          if (!Array.isArray(questions) || !questions.length || questions.some(question => {
            if (!question || !String(question.question || question.q || '').trim() || !question.options) return true;
            const options = Object.entries(question.options);
            return options.length < 2 || options.some(([, value]) => !String(value ?? '').trim()) || !options.some(([key]) => normalizeLegacyAnswer(key) === normalizeLegacyAnswer(question.correct));
          })) throw new HttpError(409, 'ASSESSMENT_NOT_READY');
        }
        if (control.hasPractice !== false) {
          const tasks = await manager.getRepository(TopicTask).find({ where: { controlWork: { id }, type: 'CONTROL' } });
          if (!tasks.length) throw new HttpError(409, 'ASSESSMENT_NOT_READY');
          for (const task of tasks) {
            if (!task.description?.trim() || (task.taskMode !== 'WEB' && !await manager.getRepository(TestData).count({ where: { topicTask: { id: task.id } } }))) throw new HttpError(409, 'ASSESSMENT_NOT_READY');
          }
        }
        attempt = await repo.save(repo.create({ controlWork: control, student, startedAt: new Date(), timeLimitMinutes: Math.max(1, control.timeLimitMinutes || 45), status: 'IN_PROGRESS' }));
      }
    } else {
      if (!attempt) throw new HttpError(409, 'CONTROL_WORK_NOT_STARTED');
      attempt.status = 'COMPLETED'; attempt.isFinished = true; attempt.finishedAt ??= new Date();
      await repo.save(attempt);
      await saveControlSummaryGradeForNewSystemWithManager(manager, id, studentId, null);
    }
    return { attemptId: attempt!.id, startedAt: attempt!.startedAt.toISOString(), timeLimitMinutes: attempt!.timeLimitMinutes, remainingSeconds: action === 'FINISH' ? 0 : assessmentRemainingSeconds(attempt!.startedAt, attempt!.timeLimitMinutes, control.deadline), status: attempt!.status };
  });
}
