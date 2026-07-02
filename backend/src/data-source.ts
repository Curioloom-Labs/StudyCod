import "reflect-metadata";
import { DataSource, type Logger as TypeOrmLogger, type QueryRunner } from "typeorm";
import path from "path";
import fs from "fs";
import { env } from "./env";
import { logger } from "./utils/logger";

// App-side slow-query visibility. The MySQL slow_query_log captures the SQL at the
// DB level; this bridge additionally attributes slow queries to the running process
// (and exposes a counter for /metrics) so "which code path is slow" is answerable
// without grepping. Threshold is configurable; default 500ms matches DB-1.
const DB_SLOW_QUERY_MS = (() => {
  const n = Number.parseInt(String(process.env.DB_SLOW_QUERY_MS ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
})();
let dbSlowQueryCount = 0;
let dbQueryErrorCount = 0;
export function getDbSlowQueryCount(): number { return dbSlowQueryCount; }
export function getDbQueryErrorCount(): number { return dbQueryErrorCount; }

/** Minimal logger: only surfaces slow queries + errors, stays silent otherwise. */
class SlowQueryLogger implements TypeOrmLogger {
  logQuery(): void {}
  logQuerySlow(time: number, query: string, _params?: any[], _qr?: QueryRunner): void {
    dbSlowQueryCount += 1;
    logger.warn("[db] slow query", { timeMs: time, query: query.slice(0, 500) });
  }
  logQueryError(error: string | Error, query: string, _params?: any[], _qr?: QueryRunner): void {
    dbQueryErrorCount += 1;
    logger.error("[db] query error", { error: String((error as any)?.message ?? error), query: query.slice(0, 500) });
  }
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}
import { User } from "./entities/User";
import { Task } from "./entities/Task";
import { Grade } from "./entities/Grade";
import { Topic } from "./entities/Topic";
import { Class } from "./entities/Class";
import { Student } from "./entities/Student";
import { Attendance } from "./entities/Attendance";
import { EduLesson } from "./entities/EduLesson";
import { EduLiveSession } from "./entities/EduLiveSession";
import { EduTask } from "./entities/EduTask";
import { TestData } from "./entities/TestData";
import { EduGrade } from "./entities/EduGrade";
import { SummaryGrade } from "./entities/SummaryGrade";
import { LessonAttempt } from "./entities/LessonAttempt";
import { TopicNew } from "./entities/TopicNew";
import { TopicTask } from "./entities/TopicTask";
import { TaskTheory } from "./entities/TaskTheory";
import { ControlWork } from "./entities/ControlWork";
import { TopicProgress } from "./entities/TopicProgress";
import { ClassAnnouncement } from "./entities/ClassAnnouncement";
import { TheoryBlock } from "./entities/TheoryBlock";
import { SupportTicket } from "./entities/SupportTicket";
import { SupportConversation } from "./entities/SupportConversation";
import { SupportMessage } from "./entities/SupportMessage";
import { SupportAttachment } from "./entities/SupportAttachment";
import { MaintenanceState } from "./entities/MaintenanceState";
import { LibraryTask } from "./entities/LibraryTask";
import { LibraryTaskAttempt } from "./entities/LibraryTaskAttempt";
import { LibraryTaskRevision } from "./entities/LibraryTaskRevision";
import { Contest } from "./entities/Contest";
import { ContestProblem } from "./entities/ContestProblem";
import { ContestParticipant } from "./entities/ContestParticipant";
import { ContestSubmission } from "./entities/ContestSubmission";
import { GradeAppeal } from "./entities/GradeAppeal";
import { GradeAppealMessage } from "./entities/GradeAppealMessage";
import { EduHintFeedback } from "./entities/EduHintFeedback";
import { ConceptReviewState } from "./entities/ConceptReviewState";
import { SubmissionIntegrity } from "./entities/SubmissionIntegrity";
import { SolveSession } from "./entities/SolveSession";
import { PlaygroundSnippet } from "./entities/PlaygroundSnippet";
import { BlogPost } from "./entities/BlogPost";
import { BlogMedia } from "./entities/BlogMedia";
import { BlogTag } from "./entities/BlogTag";
import { BlogPostTag } from "./entities/BlogPostTag";
import { BlogComment } from "./entities/BlogComment";
import { BlogReaction } from "./entities/BlogReaction";
import { BlogCommentReport } from "./entities/BlogCommentReport";
import { Notification } from "./entities/Notification";
import { AuditLog } from "./entities/AuditLog";
import { Organization } from "./entities/Organization";
import { Membership } from "./entities/Membership";
import { OrgInvitation } from "./entities/OrgInvitation";
import { ParentLink } from "./entities/ParentLink";
import { Course } from "./entities/Course";
import { CourseModule } from "./entities/CourseModule";
import { CourseItem } from "./entities/CourseItem";
import { CourseAssignment } from "./entities/CourseAssignment";
import { ManualSubmission } from "./entities/ManualSubmission";
import { QuizAttempt } from "./entities/QuizAttempt";
const dbPort = env.DB_PORT != null ? parseInt(env.DB_PORT, 10) : 3306;
const runtimeMigrationExtension = path.extname(__filename) === ".ts" ? "ts" : "js";
const BLOCKED_MIGRATION_TIMESTAMPS = new Set(["1736206400000"]);

function resolveMigrationFiles(): string[] {
  const migrationsDir = path.join(__dirname, "migrations");
  const migrationFileNamePattern = new RegExp(`^[0-9]+-.+\\.${runtimeMigrationExtension}$`);

  // Fail fast: if the migration dir cannot be enumerated, we MUST not silently
  // fall back to a glob like `[0-9]*.ts`. That fallback historically pulled in
  // any timestamped helper file (e.g. test fixtures) and ran them as
  // migrations on startup. Strict explicit enumeration only.
  const files = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => migrationFileNamePattern.test(name))
    .filter(name => {
      const [timestamp] = name.split("-", 1);
      return !BLOCKED_MIGRATION_TIMESTAMPS.has(String(timestamp || "").trim());
    })
    .sort((a, b) => a.localeCompare(b));

  return files.map(fileName => path.join(migrationsDir, fileName));
}

const migrationGlobs = resolveMigrationFiles();

export const AppDataSource = new DataSource({
  type: "mysql",
  ...(env.DATABASE_URL ? {
    url: env.DATABASE_URL
  } : {
    host: env.DB_HOST || "localhost",
    port: dbPort,
    username: env.DB_USER || "root",
    password: env.DB_PASS || "",
    database: env.DB_NAME || "studycod"
  }),
  entities: [User, Task, Grade, Topic, Class, Student, EduLesson, EduLiveSession, EduTask, TestData, EduGrade, SummaryGrade, LessonAttempt, TopicNew, TopicTask, TaskTheory, ControlWork, TopicProgress, ClassAnnouncement, TheoryBlock, SupportTicket, SupportConversation, SupportMessage, SupportAttachment, MaintenanceState, LibraryTask, LibraryTaskAttempt, LibraryTaskRevision, Contest, ContestProblem, ContestParticipant, ContestSubmission, GradeAppeal, GradeAppealMessage, EduHintFeedback, ConceptReviewState, SubmissionIntegrity, SolveSession, PlaygroundSnippet, BlogPost, BlogMedia, BlogTag, BlogPostTag, BlogComment, BlogReaction, BlogCommentReport, Notification, AuditLog, Organization, Membership, OrgInvitation, ParentLink, Course, CourseModule, CourseItem, CourseAssignment, ManualSubmission, QuizAttempt, Attendance],
  synchronize: false,
  logging: ["error", "warn"],
  logger: new SlowQueryLogger(),
  maxQueryExecutionTime: DB_SLOW_QUERY_MS,
  migrations: migrationGlobs,
  extra: {
    connectionLimit: parseInt(env.DB_POOL_SIZE || "10", 10),
    connectTimeout: parseInt(env.DB_CONNECT_TIMEOUT_MS || "5000", 10),
    // Cap how many requests can queue waiting for a free connection. 0 means
    // unbounded, which masks DB overload as latency. A bounded queue makes the
    // pool fail-fast under sustained pressure.
    queueLimit: parseInt(env.DB_POOL_QUEUE_LIMIT || "100", 10),
    // mysql2 honours `acquireTimeout` (alias `waitForConnections`-respecting).
    // Without it a slow DB silently blocks request handlers forever.
    acquireTimeout: parseInt(env.DB_ACQUIRE_TIMEOUT_MS || "10000", 10),
    waitForConnections: true,
    multipleStatements: false,
    dateStrings: false
  },
  cache: false
});
export default AppDataSource;
