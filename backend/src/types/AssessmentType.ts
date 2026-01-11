export enum AssessmentType {
  PRACTICE = "PRACTICE",
  INTERMEDIATE = "INTERMEDIATE",
  CONTROL = "CONTROL",
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
  if (type === AssessmentType.INTERMEDIATE || type === AssessmentType.PRACTICE) {
    if (controlWorkId) {
      throw new Error(`INTERMEDIATE/PRACTICE assessment cannot have controlWorkId. ` + `Got: controlWorkId=${controlWorkId}, type=${type}`);
    }
  }
}