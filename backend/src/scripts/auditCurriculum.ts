import { auditCurriculum } from "../utils/curriculum";

const report = auditCurriculum();
console.log(JSON.stringify(report, null, 2));

if (!report.ok) process.exitCode = 1;
