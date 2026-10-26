import type { JudgeFile, JudgeLanguage, JudgeTestCase } from "../services/judgeWorker/types";

export type GrowthProjectRuntime = "PYTHON" | "JAVA" | "CPP";
export type GrowthProjectStageKey = "V1" | "V2" | "V3";
export type GrowthProjectAssessmentKind = "DEFENSE" | "TRANSFER";

export type GrowthTest = { input: string; output: string; hidden?: boolean; group: string };
export type GrowthStage = {
  key: GrowthProjectStageKey;
  titleUk: string;
  titleEn: string;
  descriptionUk: string;
  descriptionEn: string;
  tests: GrowthTest[];
  extraFiles: Record<GrowthProjectRuntime, string[]>;
};
export type GrowthCard = {
  id: string;
  titleUk: string;
  titleEn: string;
  promptUk: string;
  promptEn: string;
  transferTitleUk?: string;
  transferTitleEn?: string;
  transferPromptUk?: string;
  transferPromptEn?: string;
  tests: GrowthTest[];
};
export type GrowthFamily = {
  key: "contacts" | "inventory" | "logs";
  titleUk: string;
  titleEn: string;
  summaryUk: string;
  summaryEn: string;
  recommendedPrepUk: string;
  recommendedPrepEn: string;
  skillsUk: string[];
  skillsEn: string[];
  stages: Record<GrowthProjectStageKey, GrowthStage>;
  cards: GrowthCard[];
  transferCards: GrowthCard[];
};

const stage = (
  key: GrowthProjectStageKey,
  titleUk: string,
  titleEn: string,
  descriptionUk: string,
  descriptionEn: string,
  tests: GrowthTest[],
  extraFiles: Record<GrowthProjectRuntime, string[]>,
): GrowthStage => ({ key, titleUk, titleEn, descriptionUk, descriptionEn, tests, extraFiles });

const core = { PYTHON: [], JAVA: [], CPP: [] } satisfies Record<GrowthProjectRuntime, string[]>;
const moduleFiles = (python: string[], java: string[], cpp: string[]) => ({ PYTHON: python, JAVA: java, CPP: cpp });
const test = (input: string, output: string, group: string, hidden = false): GrowthTest => ({ input, output, group, hidden });

const authoredGrowthProjectFamilies: GrowthFamily[] = [
  {
    key: "contacts",
    titleUk: "Контактна книга",
    titleEn: "Contact book",
    summaryUk: "Створи консольну книгу контактів, додай перевірку даних, а потім зроби надійний пакетний імпорт.",
    summaryEn: "Build a console contact book, validate its data, and finish with a reliable batch import.",
    recommendedPrepUk: "Рекомендовано: змінні, умови, цикли, функції, рядки та базові колекції. Це не обмежує доступ.",
    recommendedPrepEn: "Suggested preparation: variables, conditions, loops, functions, strings, and basic collections. This does not restrict access.",
    skillsUk: ["команди", "словники й колекції", "валідація", "регресійні тести"],
    skillsEn: ["commands", "collections", "validation", "regression tests"],
    stages: {
      V1: stage("V1", "Керування контактами", "Manage contacts", "Реалізуй команди ADD, GET, UPDATE, DELETE, LIST та EXIT. Кожна команда, окрім EXIT, друкує рівно один рядок.", "Implement ADD, GET, UPDATE, DELETE, LIST, and EXIT commands. Every command except EXIT prints exactly one line.", [
        test("ADD Ana 111\nGET Ana\nLIST\nEXIT\n", "OK\nAna 111\nAna 111\n", "commands"),
        test("GET Missing\nUPDATE Missing 9\nDELETE Missing\nLIST\nEXIT\n", "NOT_FOUND\nNOT_FOUND\nNOT_FOUND\nEMPTY\n", "missing-contact"),
        test("ADD Ben 7\nUPDATE Ben 8\nGET Ben\nDELETE Ben\nGET Ben\nEXIT\n", "OK\nOK\nBen 8\nOK\nNOT_FOUND\n", "updates", true),
      ], core),
      V2: stage("V2", "Перевірка даних", "Validate contact data", "Розділи парсер і книгу на окремі файли. Прибери зайві пробіли навколо імені та номера. Не приймай порожні поля або номер без цифр.", "Split command parsing and contact storage into separate files. Trim surrounding whitespace. Reject empty fields and phone numbers without digits.", [
        test("ADD  Ana   111 \nGET Ana\nADD  222\nADD Bo x-y\nLIST\nEXIT\n", "OK\nAna 111\nERROR\nERROR\nAna 111\n", "validation"),
        test("ADD Ana 111\nADD Ana 222\nGET Ana\nEXIT\n", "OK\nEXISTS\nAna 111\n", "duplicates"),
        test("LIST\nADD Zed +380\nADD Ada 55\nLIST\nEXIT\n", "EMPTY\nOK\nOK\nAda 55,Zed +380\n", "sorting", true),
      ], moduleFiles(["contact_book.py"], ["ContactBook.java"], ["contact_book.hpp"])),
      V3: stage("V3", "Пакетний імпорт", "Batch import", "Додай IMPORT n, після якої йдуть n рядків `name phone`. Нормалізуй поля. Перша дійсна поява імені перемагає; некоректні записи та дублікати пропускай. Наприкінці надрукуй `IMPORTED=a SKIPPED=b`.", "Add IMPORT n followed by n `name phone` records. Normalize fields. Keep the first valid occurrence of a name; skip invalid records and duplicates. Print `IMPORTED=a SKIPPED=b` when the import ends.", [
        test("IMPORT 4\nAda 1\nBob 2\nAda 9\nEve x\nLIST\nEXIT\n", "IMPORTED=2 SKIPPED=2\nAda 1,Bob 2\n", "batch-import"),
        test("ADD Ana 1\nIMPORT 3\nAna 4\nBob 5\n  \nLIST\nEXIT\n", "OK\nIMPORTED=1 SKIPPED=2\nAna 1,Bob 5\n", "preserve-existing"),
        test("IMPORT 0\nLIST\nEXIT\n", "IMPORTED=0 SKIPPED=0\nEMPTY\n", "empty-import", true),
      ], moduleFiles(["contact_book.py", "contact_import.py"], ["ContactBook.java", "ContactImport.java"], ["contact_book.hpp", "contact_import.hpp"])),
    },
    cards: [
      { id: "contact-normalize", titleUk: "Нормалізація перед імпортом", titleEn: "Normalize before import", promptUk: "Користувач надсилає імпорт із варіантами пробілів і написання імені. Нормалізуй запис до перевірки дублікатів. Збережи чинні контакти та покажи тест для конфліктного запису.", promptEn: "An import contains inconsistent spacing and name casing. Normalize each record before detecting duplicates. Preserve existing contacts and add a test for a conflict.", tests: [test("IMPORT 3\n Ana   1 \nAna 2\nBob 3\nLIST\nEXIT\n", "IMPORTED=2 SKIPPED=1\nAna 1,Bob 3\n", "normalization")] },
      { id: "contact-conflict", titleUk: "Відхилення конфлікту", titleEn: "Reject a conflicting import", promptUk: "Додай правило, за яким дублікат телефона теж конфліктний. Імпорт має залишати перший запис і рахувати кожен відхилений рядок.", promptEn: "Treat a duplicate phone number as a conflict too. Keep the first record and count every rejected row.", tests: [test("IMPORT 3\nAda 1\nBo 1\nCy 2\nLIST\nEXIT\n", "IMPORTED=2 SKIPPED=1\nAda 1,Cy 2\n", "phone-conflict")] },
      { id: "contact-repeat", titleUk: "Повторне завантаження", titleEn: "Repeat a batch safely", promptUk: "Повтори один і той самий пакетний імпорт двічі. Другий запуск не має створювати дублікати чи змінювати перші контакти.", promptEn: "Run the same batch import twice. The second run must not create duplicates or replace the first contacts.", tests: [test("IMPORT 2\nAda 1\nBo 2\nIMPORT 2\nAda 9\nBo 8\nLIST\nEXIT\n", "IMPORTED=2 SKIPPED=0\nIMPORTED=0 SKIPPED=2\nAda 1,Bo 2\n", "idempotency")] },
    ],
    transferCards: [
      { id: "transfer-attendees", titleUk: "Реєстрація учасників", titleEn: "Workshop registration", promptUk: "Створи окрему консольну програму для реєстрації учасників події. Команди: REGISTER name email, IMPORT n (далі n рядків name email), LIST. Обрізай пробіли, email нормалізуй до нижнього регістру; перша адреса перемагає. Виводь OK/EXISTS, IMPORTED=a SKIPPED=b і відсортований список за ім'ям.", promptEn: "Build a separate console app for event registration. Commands: REGISTER name email, IMPORT n followed by n name/email rows, and LIST. Trim fields, lowercase email, and keep the first occurrence of an address. Print OK/EXISTS, IMPORTED=a SKIPPED=b, and a name-sorted list.", tests: [test("REGISTER Ada ADA@EXAMPLE.COM\nIMPORT 3\nBo bo@example.com\nBea ada@example.com\nCy cy@example.com\nLIST\n", "OK\nIMPORTED=2 SKIPPED=1\nAda ada@example.com,Bo bo@example.com,Cy cy@example.com\n", "email-conflicts")] },
      { id: "transfer-members", titleUk: "Список учасників команди", titleEn: "Team membership list", promptUk: "Створи окрему програму командних учасників. MEMBER name team додає учасника; BATCH n читає n таких рядків; LIST показує ім'я та команду. Прибери зайві пробіли й вважай ім'я без урахування регістру ключем унікальності. Перший запис зберігається, конфлікти рахуються як пропуски.", promptEn: "Build a separate team membership tool. MEMBER name team adds a member; BATCH n reads n such rows; LIST prints name and team. Trim fields and treat names case-insensitively as unique keys. Keep the first record and count conflicts as skipped rows.", tests: [test("MEMBER  Alex  Core \nBATCH 3\nalex Platform\nBea Core\nCy Data\nLIST\n", "OK\nIMPORTED=2 SKIPPED=1\nAlex Core,Bea Core,Cy Data\n", "normalized-identity")] },
      { id: "transfer-resources", titleUk: "Розподіл ресурсів", titleEn: "Resource allocation", promptUk: "Створи окрему програму розподілу обладнання. RESOURCE name count, ALLOCATE name count, RELEASE name count, GET name. Кількість має бути додатною, видати можна лише наявний залишок. Після некоректної операції стан не змінюється.", promptEn: "Build a separate equipment allocation tool. Support RESOURCE name count, ALLOCATE name count, RELEASE name count, and GET name. Counts must be positive and allocations cannot exceed availability. A rejected operation leaves state unchanged.", tests: [test("RESOURCE camera 3\nALLOCATE camera 2\nALLOCATE camera 2\nGET camera\nRELEASE camera 1\nGET camera\n", "OK\nOK\nINSUFFICIENT\ncamera 1\nOK\ncamera 2\n", "bounded-resource")] },
    ],
  },
  {
    key: "inventory",
    titleUk: "Облік складу",
    titleEn: "Inventory tracker",
    summaryUk: "Веди залишки й вартість товарів, а потім обробляй пакет змін без часткового оновлення складу.",
    summaryEn: "Track stock and inventory value, then process a batch without partially applying invalid changes.",
    recommendedPrepUk: "Рекомендовано: змінні, арифметика, умови, цикли, функції та словники або мапи. Це не обмежує доступ.",
    recommendedPrepEn: "Suggested preparation: variables, arithmetic, conditions, loops, functions, and dictionaries or maps. This does not restrict access.",
    skillsUk: ["колекції", "бізнес-правила", "цілісність змін", "аудит"],
    skillsEn: ["collections", "business rules", "atomic updates", "audit trails"],
    stages: {
      V1: stage("V1", "Товари та залишки", "Products and stock", "Реалізуй ADD name quantity price, GET name, REMOVE name, LIST та VALUE. Кількість і ціна — цілі невід’ємні числа. Список сортується за назвою.", "Implement ADD name quantity price, GET name, REMOVE name, LIST, and VALUE. Quantity and price are non-negative integers. Sort the list by name.", [
        test("ADD apple 3 10\nADD book 2 25\nVALUE\nLIST\n", "OK\nOK\n80\napple 3 10,book 2 25\n", "inventory"),
        test("GET missing\nADD item -1 4\nADD item 2 -4\nVALUE\n", "NOT_FOUND\nERROR\nERROR\n0\n", "validation"),
        test("ADD pen 10 2\nGET pen\nREMOVE pen\nGET pen\n", "OK\npen 10 2\nOK\nNOT_FOUND\n", "lifecycle", true),
      ], core),
      V2: stage("V2", "Надходження та списання", "Receive and issue stock", "Додай RESTOCK name quantity та ISSUE name quantity. Кількість має бути додатною. Списання більшого за залишок заборонене. Кожна команда друкує OK або код помилки.", "Add RESTOCK name quantity and ISSUE name quantity. The quantity must be positive. Issuing more than available is rejected. Each command prints OK or an error code.", [
        test("ADD pen 4 3\nRESTOCK pen 3\nISSUE pen 2\nGET pen\n", "OK\nOK\nOK\npen 5 3\n", "stock-movements"),
        test("ADD apple 2 5\nISSUE apple 3\nISSUE apple 0\nRESTOCK missing 3\nGET apple\n", "OK\nINSUFFICIENT_STOCK\nERROR\nNOT_FOUND\napple 2 5\n", "reject-invalid"),
        test("ADD book 0 9\nRESTOCK book 1\nVALUE\n", "OK\nOK\n9\n", "zero-stock", true),
      ], moduleFiles(["inventory.py"], ["Inventory.java"], ["inventory.hpp"])),
      V3: stage("V3", "Пакет операцій і журнал", "Batch operations and audit", "Додай BATCH n і n операцій формату `ISSUE name quantity` або `RESTOCK name quantity`. Спочатку перевір усі операції. Якщо хоча б одна некоректна, не змінюй склад. Успішний пакет друкує `APPLIED=n`; SHOWLOG показує послідовні записи журналу.", "Add BATCH n with n `ISSUE name quantity` or `RESTOCK name quantity` operations. Validate the entire batch first. If any operation fails, leave the inventory unchanged. Print `APPLIED=n` on success; SHOWLOG prints ordered audit entries.", [
        test("ADD pen 4 3\nBATCH 2\nRESTOCK pen 2\nISSUE pen 1\nGET pen\nSHOWLOG\n", "OK\nAPPLIED=2\npen 5 3\nRESTOCK pen 2,ISSUE pen 1\n", "atomic-batch"),
        test("ADD apple 2 5\nBATCH 2\nRESTOCK apple 1\nISSUE apple 9\nGET apple\nSHOWLOG\n", "OK\nBATCH_REJECTED\napple 2 5\n\n", "rollback"),
        test("BATCH 0\nSHOWLOG\n", "APPLIED=0\n\n", "empty-batch", true),
      ], moduleFiles(["inventory.py", "inventory_batch.py"], ["Inventory.java", "InventoryBatch.java"], ["inventory.hpp", "inventory_batch.hpp"])),
    },
    cards: [
      { id: "stock-retry", titleUk: "Безпечне повторення операції", titleEn: "Retry an operation safely", promptUk: "Клієнт повторно надсилає ту саму операцію. Додай ідентифікатор операції та переконайся, що залишок змінюється лише один раз.", promptEn: "A client retries the same operation. Add an operation identifier and ensure stock changes only once.", tests: [test("ADD pen 4 2\nRESTOCK pen 2 op1\nRESTOCK pen 2 op1\nGET pen\n", "OK\nOK\nDUPLICATE\npen 6 2\n", "idempotency")] },
      { id: "stock-all-or-nothing", titleUk: "Пакет без часткового успіху", titleEn: "All-or-nothing batch", promptUk: "В одній пакетній операції бракує товару для списання. Жодна попередня зміна пакета не повинна залишитись на складі.", promptEn: "A batch includes an issue operation with insufficient stock. None of its earlier updates may be retained.", tests: [test("ADD pen 3 2\nADD book 1 7\nBATCH 2\nRESTOCK pen 2\nISSUE book 2\nGET pen\nGET book\n", "OK\nOK\nBATCH_REJECTED\npen 3 2\nbook 1 7\n", "atomicity")] },
      { id: "stock-audit", titleUk: "Послідовність журналу", titleEn: "Keep audit order", promptUk: "Додай стабільний номер операції до журналу. Сортування або повторне читання звіту не повинні змінювати хронологічний порядок.", promptEn: "Add a stable sequence number to the audit log. Sorting or rereading the report must not change event order.", tests: [test("ADD pen 2 1\nRESTOCK pen 1\nISSUE pen 1\nSHOWLOG\n", "OK\nOK\nOK\nRESTOCK pen 1,ISSUE pen 1\n", "audit-order")] },
    ],
    transferCards: [
      { id: "transfer-bookings", titleUk: "Бронювання кімнат", titleEn: "Room bookings", promptUk: "Створи окрему систему бронювання кімнат. ROOM name capacity задає місткість, BATCH n читає n рядків BOOK name seats. Пакет застосовується повністю або не застосовується зовсім; списання місць не може зробити залишок від'ємним. GET name показує вільні місця.", promptEn: "Build a separate room booking system. ROOM name capacity sets capacity; BATCH n reads n BOOK name seats rows. Apply the whole batch or none of it; available seats may never become negative. GET name shows remaining seats.", tests: [test("ROOM A 3\nBATCH 2\nBOOK A 2\nBOOK A 2\nGET A\n", "OK\nBATCH_REJECTED\nA 3\n", "atomic-booking")] },
      { id: "transfer-parcels", titleUk: "Пакет видачі посилок", titleEn: "Parcel dispatch batch", promptUk: "Створи окрему програму видачі посилок. STOCK id count додає залишок, DISPATCH id count змінює його, BATCH n читає n операцій DISPATCH id count. Спочатку перевір увесь пакет; якщо хоча б одного залишку не вистачає, жодна зміна не зберігається.", promptEn: "Build a separate parcel dispatch tool. STOCK id count sets stock; DISPATCH id count changes it; BATCH n reads n dispatch operations. Validate the entire batch first. If any item lacks stock, no changes are committed.", tests: [test("STOCK p1 4\nSTOCK p2 1\nBATCH 2\nDISPATCH p1 2\nDISPATCH p2 2\nGET p1\nGET p2\n", "OK\nOK\nBATCH_REJECTED\np1 4\np2 1\n", "all-or-nothing-dispatch")] },
      { id: "transfer-ledger", titleUk: "Журнал використання матеріалів", titleEn: "Materials usage ledger", promptUk: "Створи окремий облік матеріалів. MATERIAL name count, USE name count і HISTORY. Кожне успішне використання додає запис у порядку виконання; повторне читання HISTORY не змінює журнал. Невдала операція не створює запису.", promptEn: "Build a separate materials tracker. Support MATERIAL name count, USE name count, and HISTORY. Each successful use appends one ordered record; reading HISTORY does not modify it. A rejected operation adds no record.", tests: [test("MATERIAL wire 5\nUSE wire 2\nUSE wire 9\nUSE wire 1\nHISTORY\n", "OK\nOK\nINSUFFICIENT\nOK\nwire 2,wire 1\n", "ordered-audit")] },
    ],
  },
  {
    key: "logs",
    titleUk: "Аналізатор журналів",
    titleEn: "Log analyzer",
    summaryUk: "Порахуй рівні подій, відфільтруй період і побудуй повторюваний звіт для змішаних записів.",
    summaryEn: "Count event levels, filter a time range, and build a repeatable report from mixed records.",
    recommendedPrepUk: "Рекомендовано: читання вводу, рядки, розділення тексту, цикли, умови та мапи частот. Це не обмежує доступ.",
    recommendedPrepEn: "Suggested preparation: input reading, strings, text splitting, loops, conditions, and frequency maps. This does not restrict access.",
    skillsUk: ["розбір рядків", "мапи частот", "фільтрація", "детермінований звіт"],
    skillsEn: ["parsing", "frequency maps", "filtering", "deterministic reports"],
    stages: {
      V1: stage("V1", "Підсумок рівнів", "Level summary", "Прочитай рядки `timestamp level event`. Рівні: INFO, WARN, ERROR. Для некоректних рядків збільш malformed. Надрукуй INFO=n, WARN=n, ERROR=n, events=n, malformed=n.", "Read `timestamp level event` lines. Levels: INFO, WARN, ERROR. Count invalid lines as malformed. Print INFO=n, WARN=n, ERROR=n, events=n, malformed=n.", [
        test("2026-01-01 INFO boot\n2026-01-02 WARN retry\n2026-01-03 ERROR down\n", "INFO=1\nWARN=1\nERROR=1\nevents=3\nmalformed=0\n", "levels"),
        test("bad row\n2026-01-03 FATAL crash\n\n2026-01-04 INFO up\n", "INFO=1\nWARN=0\nERROR=0\nevents=1\nmalformed=3\n", "malformed"),
        test("2026-01-01 ERROR a\n2026-01-02 ERROR b\n", "INFO=0\nWARN=0\nERROR=2\nevents=2\nmalformed=0\n", "counts", true),
      ], core),
      V2: stage("V2", "Фільтрація за рівнем", "Filter by level", "Першим рядком вводу може бути директива `--level LEVEL` або `--from DATE --to DATE`. Фільтруй включно за датою до підсумку; некоректні журнальні записи рахуй у malformed.", "The first input line may contain the `--level LEVEL` or `--from DATE --to DATE` directive. Date bounds are inclusive; count malformed log records separately.", [
        test("--level ERROR\n2026-01-01 INFO up\n2026-01-02 ERROR down\n2026-01-03 ERROR crash\n", "INFO=0\nWARN=0\nERROR=2\nevents=2\nmalformed=0\n", "level-filter"),
        test("--from 2026-01-02 --to 2026-01-03\n2026-01-01 INFO up\n2026-01-02 WARN slow\n2026-01-03 ERROR down\n2026-01-04 INFO up\n", "INFO=0\nWARN=1\nERROR=1\nevents=2\nmalformed=0\n", "date-range"),
        test("--level ERROR\nbad row\n2026-01-02 WARN slow\n", "INFO=0\nWARN=0\nERROR=0\nevents=0\nmalformed=1\n", "filter-errors", true),
      ], moduleFiles(["log_analyzer.py"], ["LogAnalyzer.java"], ["log_analyzer.hpp"])),
      V3: stage("V3", "Групування та повторні події", "Group and deduplicate events", "Додай режим REPORT LEVEL, який друкує частоти повідомлень цього рівня за спаданням, а за рівності — за назвою. За наявності `--unique` залишай лише перший запис для комбінації timestamp, level, event. Некоректний аргумент не завершує програму аварійно.", "Add REPORT LEVEL to print message frequencies for that level in descending count order, then alphabetically. With `--unique`, keep only the first occurrence of an identical timestamp, level, event tuple. Invalid options must not crash.", [
        test("--unique\n2026-01-01 INFO boot\n2026-01-01 INFO boot\n2026-01-02 INFO boot\n2026-01-03 WARN retry\nREPORT INFO\n", "INFO=2\nWARN=1\nERROR=0\nevents=3\nmalformed=0\nboot=2\n", "deduplicate"),
        test("REPORT WARN\n2026-01-01 WARN retry\n2026-01-02 WARN retry\n2026-01-03 WARN slow\n", "INFO=0\nWARN=3\nERROR=0\nevents=3\nmalformed=0\nretry=2\nslow=1\n", "stable-report"),
        test("--unique\nbad row\nbad row\n2026-01-03 ERROR crash\n", "INFO=0\nWARN=0\nERROR=1\nevents=1\nmalformed=2\n", "invalid-rows", true),
      ], moduleFiles(["log_analyzer.py", "log_report.py"], ["LogAnalyzer.java", "LogReport.java"], ["log_analyzer.hpp", "log_report.hpp"])),
    },
    cards: [
      { id: "logs-duplicate", titleUk: "Дедуплікація подій", titleEn: "Deduplicate events", promptUk: "Від зовнішнього джерела приходять повторні рядки журналу. За комбінацією timestamp, level, event залиш перший запис і коректно онови лічильники.", promptEn: "An upstream source sends repeated log lines. Keep the first occurrence of an identical timestamp, level, and event tuple, and update counters consistently.", tests: [test("--unique\n2026-01-01 ERROR crash\n2026-01-01 ERROR crash\n2026-01-02 WARN retry\n", "INFO=0\nWARN=1\nERROR=1\nevents=2\nmalformed=0\n", "deduplication")] },
      { id: "logs-partial-records", titleUk: "Частково некоректні рядки", titleEn: "Partly malformed input", promptUk: "Некоректні рядки не повинні блокувати аналіз наступних. Звіт рахує валідні записи та кількість некоректних незалежно.", promptEn: "Malformed rows must not stop analysis of later records. Report valid events and malformed rows independently.", tests: [test("2026-01-01 INFO up\nbad\n2026-01-02 ERROR down\n", "INFO=1\nWARN=0\nERROR=1\nevents=2\nmalformed=1\n", "partial-failure")] },
      { id: "logs-stable-sort", titleUk: "Стабільність звіту", titleEn: "Stable report output", promptUk: "Для однакових частот сортуй назви подій за алфавітом. Результат має бути однаковим за будь-якого порядку вхідних рядків.", promptEn: "Sort event names alphabetically when frequencies tie. The report must be identical regardless of input order.", tests: [test("REPORT WARN\n2026-01-01 WARN zeta\n2026-01-02 WARN alpha\n", "INFO=0\nWARN=2\nERROR=0\nevents=2\nmalformed=0\nalpha=1\nzeta=1\n", "stable-order")] },
    ],
    transferCards: [
      { id: "transfer-sensor-events", titleUk: "Потік показів датчиків", titleEn: "Sensor readings", promptUk: "Створи окремий аналізатор показів датчиків. Рядки мають формат `READ id timestamp value`. Некоректні рядки рахуй окремо. Для повторного id залиш перший запис. Виведи `accepted=n`, `duplicates=n`, `malformed=n` та середнє значення прийнятих показів із двома знаками після крапки.", promptEn: "Build a separate sensor reading analyzer. Rows use `READ id timestamp value`. Count malformed rows separately and keep only the first occurrence of each id. Print accepted, duplicate, and malformed counts plus the mean of accepted readings to two decimal places.", tests: [test("READ a1 2026-01-01 2.0\nREAD a1 2026-01-02 9.0\nREAD b2 2026-01-02 4.0\nbad\n", "accepted=2\nduplicates=1\nmalformed=1\nmean=3.00\n", "sensor-deduplication")] },
      { id: "transfer-delivery-events", titleUk: "Події доставки", titleEn: "Delivery event stream", promptUk: "Створи окремий аналізатор подій доставки. Формат: `id status`; дозволені CREATED, MOVING, DELIVERED. Перше коректне повідомлення з id перемагає; невідомий статус або неповний рядок — malformed. Виведи кількість кожного статусу, duplicates і malformed у фіксованому порядку.", promptEn: "Build a separate delivery event analyzer. Rows use `id status`; valid statuses are CREATED, MOVING, and DELIVERED. Keep the first valid record per id. Unknown status or incomplete rows count as malformed. Print each status count, duplicates, and malformed in a fixed order.", tests: [test("x1 CREATED\nx1 DELIVERED\nx2 MOVING\nx3 LOST\n", "CREATED=1\nMOVING=1\nDELIVERED=0\nduplicates=1\nmalformed=1\n", "delivery-events")] },
      { id: "transfer-audit-records", titleUk: "Аудит записів за ідентифікатором", titleEn: "Identifier conflict audit", promptUk: "Створи окремий аудит записів `id category value`. Перше значення id приймається. Повтор із тим самим вмістом рахується duplicate; повторний id з іншим вмістом — conflict. Некоректні рядки рахуються окремо. Надрукуй accepted, duplicates, conflicts і malformed.", promptEn: "Build a separate audit for `id category value` rows. Accept the first id. An identical repeat is a duplicate; reuse with different content is a conflict. Count malformed rows separately and print accepted, duplicates, conflicts, and malformed.", tests: [test("e1 cpu 20\ne1 cpu 20\ne1 cpu 21\ne2 mem 4\nbroken\n", "accepted=2\nduplicates=1\nconflicts=1\nmalformed=1\n", "identifier-conflicts")] },
    ],
  },
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
export const GROWTH_PROJECT_FAMILIES: readonly GrowthFamily[] = deepFreeze(authoredGrowthProjectFamilies);

/** Immutable authored catalog revision. New curriculum edits must add a new entry rather than mutate this revision. */
export const CURRENT_GROWTH_PROJECT_BLUEPRINT_REVISION = "2026-10-v1";
const GROWTH_PROJECT_BLUEPRINT_REVISIONS: Readonly<Record<string, readonly GrowthFamily[]>> = Object.freeze({
  [CURRENT_GROWTH_PROJECT_BLUEPRINT_REVISION]: GROWTH_PROJECT_FAMILIES,
});

export const GROWTH_PROJECT_RUNTIME_INFO: Record<GrowthProjectRuntime, { judge: JudgeLanguage; entryFile: string }> = {
  PYTHON: { judge: "python", entryFile: "main.py" },
  JAVA: { judge: "java", entryFile: "Main.java" },
  CPP: { judge: "cpp", entryFile: "main.cpp" },
};

export const GROWTH_PROJECT_RUNTIME_STUBS: Record<GrowthProjectRuntime, string> = {
  PYTHON: "# Implement the project requirements here.\n",
  JAVA: "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner scanner = new Scanner(System.in);\n    // Implement the project requirements here.\n  }\n}\n",
  CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  ios::sync_with_stdio(false);\n  cin.tie(nullptr);\n  // Implement the project requirements here.\n  return 0;\n}\n",
};

export function growthProjectFiles(family: GrowthFamily, runtime: GrowthProjectRuntime, stageKey: GrowthProjectStageKey): JudgeFile[] {
  const stageSpec = family.stages[stageKey];
  const entry = GROWTH_PROJECT_RUNTIME_INFO[runtime].entryFile;
  const comment = runtime === "PYTHON" ? "#" : "//";
  return [
    { path: entry, content: GROWTH_PROJECT_RUNTIME_STUBS[runtime] },
    ...stageSpec.extraFiles[runtime].map(path => ({ path, content: `${comment} Project module: ${path}\n` })),
  ];
}

export function growthJudgeTests(tests: GrowthTest[], includeHidden: boolean, idPrefix = ""): JudgeTestCase[] {
  return tests.filter(testCase => includeHidden || !testCase.hidden).map((testCase, index) => ({
    id: `${idPrefix}${testCase.group}-${index + 1}`,
    input: testCase.input,
    output: testCase.output,
    hidden: Boolean(testCase.hidden),
    group: testCase.group,
    weight: 1,
  }));
}

export function growthTestsThroughStage(family: GrowthFamily, stageKey: GrowthProjectStageKey, includeHidden = true): JudgeTestCase[] {
  const order: GrowthProjectStageKey[] = ["V1", "V2", "V3"];
  const stageIndex = order.indexOf(stageKey);
  if (stageIndex < 0) return [];
  return order.slice(0, stageIndex + 1).flatMap(key =>
    growthJudgeTests(family.stages[key].tests, includeHidden, `${key.toLowerCase()}-`)
  );
}

export function growthFamilyFor(key: unknown, revision = CURRENT_GROWTH_PROJECT_BLUEPRINT_REVISION): GrowthFamily | undefined {
  return GROWTH_PROJECT_BLUEPRINT_REVISIONS[revision]?.find(family => family.key === String(key ?? ""));
}

export function validateGrowthProjectCatalog(families: readonly GrowthFamily[] = GROWTH_PROJECT_FAMILIES): string[] {
  const errors: string[] = [];
  const runtimes: GrowthProjectRuntime[] = ["PYTHON", "JAVA", "CPP"];
  const stageKeys: GrowthProjectStageKey[] = ["V1", "V2", "V3"];
  const expectedFamilies = new Set(["contacts", "inventory", "logs"]);
  if (families.length !== 3) errors.push(`Expected 3 project families, found ${families.length}`);
  if (new Set(families.map(family => family.key)).size !== families.length) errors.push("Family keys must be unique");
  for (const family of families) {
    if (!expectedFamilies.has(family.key)) errors.push(`${family.key}: unexpected family key`);
    for (const localized of [family.titleUk, family.titleEn, family.summaryUk, family.summaryEn, family.recommendedPrepUk, family.recommendedPrepEn]) {
      if (!localized.trim()) errors.push(`${family.key}: missing localized title or summary`);
    }
    if (!family.skillsUk.length || !family.skillsEn.length) errors.push(`${family.key}: skills must be localized`);
    if (!Array.isArray(family.cards) || family.cards.length !== 3) errors.push(`${family.key}: expected 3 defense cards`);
    if (!Array.isArray(family.transferCards) || family.transferCards.length !== 3) errors.push(`${family.key}: expected 3 transfer cards`);
    const cardIds = [...(family.cards ?? []), ...(family.transferCards ?? [])].map(card => card.id);
    if (new Set(cardIds).size !== cardIds.length) errors.push(`${family.key}: card ids must be unique within a family`);
    for (const key of stageKeys) {
      const current = family.stages[key];
      if (!current || current.key !== key) { errors.push(`${family.key}/${key}: stage is missing or mislabeled`); continue; }
      if (![current.titleUk, current.titleEn, current.descriptionUk, current.descriptionEn].every(value => value.trim())) errors.push(`${family.key}/${key}: localized stage text is incomplete`);
      const publicTests = current.tests.filter(testCase => !testCase.hidden);
      const hiddenTests = current.tests.filter(testCase => testCase.hidden);
      if (!publicTests.length || !hiddenTests.length) errors.push(`${family.key}/${key}: both public and hidden tests are required`);
      for (const runtime of runtimes) {
        const entry = GROWTH_PROJECT_RUNTIME_INFO[runtime].entryFile;
        if (!Object.prototype.hasOwnProperty.call(current.extraFiles, runtime)) errors.push(`${family.key}/${key}: missing ${runtime} starter file list`);
        if (current.extraFiles[runtime].includes(entry)) errors.push(`${family.key}/${key}: entry file must not be duplicated in extra files`);
      }
      for (const [index, testCase] of current.tests.entries()) {
        if (!testCase.group.trim() || typeof testCase.input !== "string" || typeof testCase.output !== "string") errors.push(`${family.key}/${key}: test ${index + 1} has an invalid contract`);
      }
    }
    for (const [kind, cards] of [["defense", family.cards], ["transfer", family.transferCards]] as const) {
      for (const card of cards) {
        if (![card.id, card.titleUk, card.titleEn, card.promptUk, card.promptEn].every(value => value?.trim())) errors.push(`${family.key}/${kind}: card ${card.id || "(missing id)"} is incomplete`);
        if (!card.tests.length || card.tests.some(testCase => !testCase.group.trim() || typeof testCase.input !== "string" || typeof testCase.output !== "string")) errors.push(`${family.key}/${kind}/${card.id}: a test contract is missing`);
      }
    }
  }
  for (const key of expectedFamilies) if (!families.some(family => family.key === key)) errors.push(`${key}: required family is missing`);
  return errors;
}
