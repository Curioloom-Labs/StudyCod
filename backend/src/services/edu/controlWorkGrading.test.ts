import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlWork } from '../../entities/ControlWork';
import { EduGrade } from '../../entities/EduGrade';
import { SummaryGrade } from '../../entities/SummaryGrade';
import { LessonAttempt } from '../../entities/LessonAttempt';
import { saveControlSummaryGradeForNewSystemWithManager } from './controlWorkGrading';

test('finishing counts missing quiz and practice as zero without discarding submitted grades', async () => {
  const control: any = { id: 12, title: 'Exam', hasTheory: true, hasPractice: true, formula: '0.5 * test + 0.5 * avg(practice)', topic: { id: 1, class: { id: 3 }, tasks: [{ id: 10, type: 'CONTROL', controlWork: { id: 12 } }, { id: 11, type: 'CONTROL', controlWork: { id: 12 } }] } };
  const saved: any[] = [];
  const manager: any = {
    createQueryBuilder(entity: unknown) {
      const query: any = { getOne: async () => entity === ControlWork ? control : null, getMany: async () => entity === EduGrade ? [{ topicTask: { id: 10 }, total: 100 }] : [] };
      for (const method of ['setLock', 'where', 'andWhere', 'leftJoin', 'leftJoinAndSelect', 'orderBy', 'addOrderBy']) query[method] = () => query;
      return query;
    },
    getRepository(entity: unknown) {
      if (entity === LessonAttempt) return { count: async () => 1 };
      assert.equal(entity, SummaryGrade);
      return { create: (value: unknown) => value, save: async (value: unknown) => { saved.push(value); return value; } };
    }
  };
  await saveControlSummaryGradeForNewSystemWithManager(manager, 12, 7, null);
  assert.equal(saved[0].theoryGrade, 0);
  assert.equal(saved[0].grade, 25);
});
