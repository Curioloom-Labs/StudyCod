import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { HttpError } from "../../utils/httpError";
import type { GradingSystem } from "../../types/GradingSystem";
import { normalizeScaleMode, type GradeScaleMode } from "../../utils/gradingScale";
import { lockClassActor, type EduLifecycleActor } from "./lifecycleAccess";

/** Class scales format canonical raw-100 results; they never infer storage units. */
export function updateClassGradingSettings(classId: number, actor: EduLifecycleActor, gradingSystem: GradingSystem, gradeScaleMode?: GradeScaleMode) {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const cls = await lockClassActor(manager, classId, actor, "CLASS_EDIT");
    const from = cls.gradingSystem;
    const repo = manager.getRepository(Class);
    await repo.update(cls.id, { gradingSystem, ...(gradeScaleMode !== undefined ? { gradeScaleMode } : {}) });
    const saved = await repo.findOneBy({ id: cls.id });
    if (!saved) throw new HttpError(404, "CLASS_NOT_FOUND");
    return {
      class: { id: saved.id, name: saved.name, gradingSystem: saved.gradingSystem, gradeScaleMode: normalizeScaleMode(saved.gradeScaleMode), createdAt: saved.createdAt, updatedAt: saved.updatedAt },
      conversion: { from, to: gradingSystem, legacyConverted: false, convertedFields: 0, displayOnly: true }
    };
  });
}
