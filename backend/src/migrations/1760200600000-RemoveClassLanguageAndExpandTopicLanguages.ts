import type { MigrationInterface, QueryRunner } from "typeorm";

const TOPIC_LANGUAGES = [
  "JAVA", "PYTHON", "CPP", "C", "CSHARP", "KOTLIN",
  "JS", "GO", "RUST", "PASCAL", "D", "DART", "HASKELL",
  "LISP", "LUA", "PERL", "PHP", "RUBY", "SWIFT",
];

export class RemoveClassLanguageAndExpandTopicLanguages1760200600000 implements MigrationInterface {
  name = "RemoveClassLanguageAndExpandTopicLanguages1760200600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const classes = await queryRunner.getTable("classes");
    if (classes?.findColumnByName("language")) {
      await queryRunner.dropColumn(classes, "language");
    }

    const topics = await queryRunner.getTable("topics_new");
    if (topics?.findColumnByName("language")) {
      const enumSql = TOPIC_LANGUAGES.map(value => `'${value}'`).join(",");
      await queryRunner.query(
        `ALTER TABLE \`topics_new\` MODIFY COLUMN \`language\` ENUM(${enumSql}) NOT NULL DEFAULT 'PYTHON'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const classes = await queryRunner.getTable("classes");
    if (classes && !classes.findColumnByName("language")) {
      await queryRunner.query(
        "ALTER TABLE `classes` ADD COLUMN `language` ENUM('JAVA','PYTHON','CPP') NOT NULL DEFAULT 'PYTHON'",
      );
    }

    const topics = await queryRunner.getTable("topics_new");
    if (topics?.findColumnByName("language")) {
      await queryRunner.query(
        "UPDATE `topics_new` SET `language` = 'PYTHON' WHERE `language` NOT IN ('JAVA','PYTHON','CPP')",
      );
      await queryRunner.query(
        "ALTER TABLE `topics_new` MODIFY COLUMN `language` ENUM('JAVA','PYTHON','CPP') NOT NULL DEFAULT 'PYTHON'",
      );
    }
  }
}
