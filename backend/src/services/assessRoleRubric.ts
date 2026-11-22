export const ASSESS_ROLE_PROFILE_KEYS = [
  "SOFTWARE_ENGINEERING",
  "QA_AUTOMATION",
  "DATA_AI",
  "DEVOPS_SRE",
  "SECURITY",
  "PRODUCT_DESIGN",
  "ENGINEERING_MANAGEMENT",
  "TECHNICAL_SUPPORT",
] as const;

export type AssessRoleProfile = typeof ASSESS_ROLE_PROFILE_KEYS[number];
export type AssessRubricCriterion = { id: string; labelUk: string; labelEn: string };

const roleRubrics: Record<AssessRoleProfile, AssessRubricCriterion[]> = {
  SOFTWARE_ENGINEERING: [
    { id: "problem_solving", labelUk: "Розв’язання задач", labelEn: "Problem solving" },
    { id: "technical_design", labelUk: "Технічні рішення", labelEn: "Technical design" },
    { id: "implementation_quality", labelUk: "Якість реалізації та перевірок", labelEn: "Implementation and test quality" },
    { id: "communication", labelUk: "Комунікація та обґрунтування", labelEn: "Communication and rationale" },
  ],
  QA_AUTOMATION: [
    { id: "risk_analysis", labelUk: "Аналіз ризиків і граничних випадків", labelEn: "Risk and edge-case analysis" },
    { id: "test_design", labelUk: "Дизайн тестів", labelEn: "Test design" },
    { id: "automation_quality", labelUk: "Надійність автоматизації", labelEn: "Automation reliability" },
    { id: "defect_communication", labelUk: "Звітність про дефекти", labelEn: "Defect communication" },
  ],
  DATA_AI: [
    { id: "data_reasoning", labelUk: "Міркування на основі даних", labelEn: "Data reasoning" },
    { id: "method_selection", labelUk: "Вибір методу та припущення", labelEn: "Method selection and assumptions" },
    { id: "validation_reproducibility", labelUk: "Перевірка й відтворюваність", labelEn: "Validation and reproducibility" },
    { id: "impact_explanation", labelUk: "Пояснення впливу результату", labelEn: "Explaining result impact" },
  ],
  DEVOPS_SRE: [
    { id: "reliability", labelUk: "Надійність і відновлення", labelEn: "Reliability and recovery" },
    { id: "automation", labelUk: "Автоматизація процесів", labelEn: "Operational automation" },
    { id: "observability", labelUk: "Спостережуваність та діагностика", labelEn: "Observability and diagnosis" },
    { id: "security_cost", labelUk: "Безпека й контроль витрат", labelEn: "Security and cost awareness" },
  ],
  SECURITY: [
    { id: "threat_modeling", labelUk: "Моделювання загроз", labelEn: "Threat modeling" },
    { id: "risk_prioritization", labelUk: "Пріоритизація ризиків", labelEn: "Risk prioritization" },
    { id: "mitigation_quality", labelUk: "Якість заходів захисту", labelEn: "Mitigation quality" },
    { id: "responsible_communication", labelUk: "Відповідальна комунікація", labelEn: "Responsible communication" },
  ],
  PRODUCT_DESIGN: [
    { id: "problem_discovery", labelUk: "Виявлення проблеми користувача", labelEn: "User problem discovery" },
    { id: "decision_quality", labelUk: "Обґрунтування рішень", labelEn: "Decision quality" },
    { id: "iteration_accessibility", labelUk: "Ітерація та доступність", labelEn: "Iteration and accessibility" },
    { id: "collaboration", labelUk: "Співпраця з командою", labelEn: "Team collaboration" },
  ],
  ENGINEERING_MANAGEMENT: [
    { id: "technical_judgment", labelUk: "Технічне судження", labelEn: "Technical judgment" },
    { id: "delivery", labelUk: "Планування та виконання", labelEn: "Planning and delivery" },
    { id: "people_leadership", labelUk: "Розвиток людей і команди", labelEn: "People and team leadership" },
    { id: "system_health", labelUk: "Здоров’я системи та процесів", labelEn: "System and process health" },
  ],
  TECHNICAL_SUPPORT: [
    { id: "customer_diagnosis", labelUk: "Діагностика запиту клієнта", labelEn: "Customer issue diagnosis" },
    { id: "technical_accuracy", labelUk: "Технічна точність", labelEn: "Technical accuracy" },
    { id: "resolution_quality", labelUk: "Якість і безпечність рішення", labelEn: "Resolution quality and safety" },
    { id: "clear_communication", labelUk: "Зрозуміла комунікація", labelEn: "Clear communication" },
  ],
};

export const legacyAssessRubric: AssessRubricCriterion[] = [
  { id: "requirements", labelUk: "Розуміння вимог", labelEn: "Understanding requirements" },
  { id: "reasoning", labelUk: "Обґрунтування рішення", labelEn: "Reasoning and design" },
  { id: "quality", labelUk: "Якість коду й перевірок", labelEn: "Code quality and tests" },
];

export function assessRubricForProfile(profile: string): AssessRubricCriterion[] {
  return roleRubrics[profile as AssessRoleProfile] ?? roleRubrics.SOFTWARE_ENGINEERING;
}

export function isAssessRoleProfile(value: unknown): value is AssessRoleProfile {
  return typeof value === "string" && ASSESS_ROLE_PROFILE_KEYS.includes(value as AssessRoleProfile);
}
