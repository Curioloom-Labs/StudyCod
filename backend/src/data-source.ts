import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "./env";
import { User } from "./entities/User";
import { Task } from "./entities/Task";
import { Grade } from "./entities/Grade";
import { Topic } from "./entities/Topic";
import { Class } from "./entities/Class";
import { Student } from "./entities/Student";
import { EduLesson } from "./entities/EduLesson";
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
const dbPort = env.DB_PORT != null ? parseInt(env.DB_PORT, 10) : 3306;
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
  entities: [User, Task, Grade, Topic, Class, Student, EduLesson, EduTask, TestData, EduGrade, SummaryGrade, LessonAttempt, TopicNew, TopicTask, TaskTheory, ControlWork, TopicProgress, ClassAnnouncement, TheoryBlock, SupportTicket, SupportConversation, SupportMessage, SupportAttachment, MaintenanceState, LibraryTask, LibraryTaskAttempt, LibraryTaskRevision, Contest, ContestProblem, ContestParticipant, ContestSubmission],
  synchronize: false,
  logging: false,
  migrations: ["dist/backend/src/migrations/*.js", "dist/migrations/*.js"],
  extra: {
    connectionLimit: parseInt(env.DB_POOL_SIZE || "10", 10),
    connectTimeout: 5000,
    queueLimit: 0,
    multipleStatements: false,
    dateStrings: false
  },
  cache: false
});
export default AppDataSource;
