export enum AssessmentType {
  PRACTICE = "PRACTICE",
  INTERMEDIATE = "INTERMEDIATE",
  CONTROL = "CONTROL",
  // Semester aggregate: average of a semester's thematic (INTERMEDIATE) grades.
  // Not tied to a single topic (topic_id is NULL); keyed by the `semester` column.
  SEMESTER = "SEMESTER",
}
export function validateAssessmentType(type: AssessmentType, controlWorkId: number | null | undefined, targetField?: string): void {
  if (type === AssessmentType.CONTROL) {
    if (!controlWorkId) {
      throw new Error(`CONTROL assessment must have controlWorkId. ` + `Got: controlWorkId=${controlWorkId}, type=${type}`);
    }
    if (targetField && targetField !== 'control_grade' && targetField !== 'grade') {
      throw new Error(`CONTROL assessment cannot be stored in field '${targetField}'. ` + `Must use 'control_grade' or 'grade' in SummaryGrade.`);
    }
  }
  if (type === AssessmentType.INTERMEDIATE || type === AssessmentType.PRACTICE || type === AssessmentType.SEMESTER) {
    if (controlWorkId) {
      throw new Error(`${type} assessment cannot have controlWorkId. ` + `Got: controlWorkId=${controlWorkId}, type=${type}`);
    }
  }
}