import type { LibraryTaskProjectSpec } from "../entities/LibraryTask";
import type { TaskLang } from "../entities/Task";

export type PersonalMiniProjectDefinition = {
  key: string;
  title: string;
  subtitle: string;
  description: string;
  language: TaskLang;
  projectSpec: LibraryTaskProjectSpec;
  template: string;
  tests: Array<{ input: string; expectedOutput: string; points: number }>;
};

const templates: Record<TaskLang, string> = {
  PYTHON: `def main():
    # TODO: implement the project
    pass

if __name__ == "__main__":
    main()
`,
  JAVA: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    // TODO: implement the project
  }
}
`,
  CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // TODO: implement the project
    return 0;
}
`,
};

const sharedProjects = [
  {
    key: "cli-calculator",
    title: "Калькулятор у терміналі",
    subtitle: "Мініпроєкт · арифметика та обробка вводу",
    description: "Створіть консольний калькулятор: прочитайте два числа й оператор (+, -, *, /), виконайте операцію та виведіть результат. Для ділення на нуль виведіть `ERROR`.",
    skills: ["змінні", "умови", "ввід і вивід", "обробка помилок"],
    milestones: [
      { id: "input", title: "Прочитати команду", description: "Отримайте два числа та оператор з одного рядка.", required: true },
      { id: "operations", title: "Виконати операцію", description: "Підтримайте чотири базові операції.", required: true },
      { id: "errors", title: "Обробити ділення на нуль", description: "Не допускайте аварійного завершення програми.", required: true },
    ],
    tests: [
      { input: "10 + 4", expectedOutput: "14", points: 25 },
      { input: "9 * 3", expectedOutput: "27", points: 25 },
      { input: "12 / 4", expectedOutput: "3", points: 25 },
      { input: "7 / 0", expectedOutput: "ERROR", points: 25 },
    ],
  },
  {
    key: "expense-tracker",
    title: "Трекер витрат",
    subtitle: "Мініпроєкт · цикли та колекції",
    description: "Напишіть маленький трекер витрат. У першому рядку задано кількість покупок, у другому — їхні цілі суми. Виведіть загальну суму та найбільшу витрату через пробіл.",
    skills: ["цикли", "масиви", "агрегація даних", "граничні випадки"],
    milestones: [
      { id: "collect", title: "Зібрати витрати", description: "Зчитайте список сум у зручну структуру.", required: true },
      { id: "total", title: "Порахувати підсумок", description: "Знайдіть загальну суму без ручного підрахунку.", required: true },
      { id: "maximum", title: "Знайти найбільшу витрату", description: "Опрацюйте також список з одним елементом.", required: true },
    ],
    tests: [
      { input: "3\n10 25 5", expectedOutput: "40 25", points: 25 },
      { input: "5\n2 8 1 12 4", expectedOutput: "27 12", points: 25 },
      { input: "1\n99", expectedOutput: "99 99", points: 25 },
      { input: "4\n0 0 0 0", expectedOutput: "0 0", points: 25 },
    ],
  },
  {
    key: "text-inspector",
    title: "Інспектор тексту",
    subtitle: "Мініпроєкт · рядки та функції",
    description: "Створіть аналізатор одного рядка. Виведіть кількість слів і кількість символів без пробілів через пробіл. Послідовність слів розділена одним або кількома пробілами.",
    skills: ["рядки", "функції", "нормалізація вводу", "підрахунок"],
    milestones: [
      { id: "normalize", title: "Нормалізувати рядок", description: "Врахуйте зайві пробіли на початку та в кінці.", required: true },
      { id: "words", title: "Порахувати слова", description: "Визначте слова без ручного переліку.", required: true },
      { id: "characters", title: "Порахувати символи", description: "Не враховуйте пробіли у другому числі.", required: true },
    ],
    tests: [
      { input: "hello world", expectedOutput: "2 10", points: 25 },
      { input: "  StudyCod   makes coding fun  ", expectedOutput: "4 24", points: 25 },
      { input: "programming", expectedOutput: "1 11", points: 25 },
      { input: "one two three four", expectedOutput: "4 15", points: 25 },
    ],
  },
  {
    key: "gradebook",
    title: "Електронний журнал",
    subtitle: "Мініпроєкт · сортування й статистика",
    description: "Зробіть консольний журнал оцінок. Зчитайте оцінки учнів, виведіть середній бал (до двох знаків після крапки) та кількість оцінок не нижче 60.",
    skills: ["колекції", "сортування", "середнє значення", "форматування"],
    milestones: [
      { id: "parse", title: "Прочитати оцінки", description: "Перетворіть вхідні значення на числа.", required: true },
      { id: "average", title: "Обчислити середнє", description: "Порахуйте середнє без втрати точності.", required: true },
      { id: "filter", title: "Порахувати успішних", description: "Визначте кількість результатів від 60 і вище.", required: true },
    ],
    tests: [
      { input: "4\n80 70 90 60", expectedOutput: "75.00 4", points: 25 },
      { input: "5\n40 55 60 75 100", expectedOutput: "66.00 3", points: 25 },
      { input: "1\n59", expectedOutput: "59.00 0", points: 25 },
      { input: "3\n100 100 100", expectedOutput: "100.00 3", points: 25 },
    ],
  },
  {
    key: "inventory",
    title: "Облік складу",
    subtitle: "Мініпроєкт · словники та бізнес-правила",
    description: "Реалізуйте простий облік товарів. Для кожного товару задано кількість і ціну. Виведіть загальну вартість запасів та кількість товарів, яких менше 5.",
    skills: ["словники", "вкладені дані", "бізнес-логіка", "декомпозиція"],
    milestones: [
      { id: "items", title: "Змоделювати товари", description: "Зберігайте назву, кількість і ціну разом.", required: true },
      { id: "value", title: "Порахувати вартість", description: "Помножте кількість на ціну для кожного товару.", required: true },
      { id: "low-stock", title: "Знайти низькі залишки", description: "Порахуйте позиції з кількістю менше 5.", required: true },
    ],
    tests: [
      { input: "2\napple 3 10\nbook 8 25", expectedOutput: "230 1", points: 25 },
      { input: "3\npen 10 2\nnotebook 4 30\nbag 1 100", expectedOutput: "240 2", points: 25 },
      { input: "1\nchair 5 40", expectedOutput: "200 0", points: 25 },
      { input: "2\nitem 0 99\nbox 2 5", expectedOutput: "10 2", points: 25 },
    ],
  },
  {
    key: "quiz-game",
    title: "Вікторина в терміналі",
    subtitle: "Мініпроєкт · функції та стан програми",
    description: "Побудуйте вікторину: зчитайте кількість відповідей користувача та рядок із відповідями. Порівняйте їх із ключем `ABCBA` і виведіть кількість правильних відповідей та відсоток.",
    skills: ["функції", "умови", "стан програми", "тестування"],
    milestones: [
      { id: "answers", title: "Прочитати відповіді", description: "Зчитайте відповіді як послідовність символів.", required: true },
      { id: "score", title: "Порахувати збіги", description: "Порівняйте відповіді з ключем за позиціями.", required: true },
      { id: "result", title: "Показати результат", description: "Виведіть кількість і відсоток правильних відповідей.", required: true },
    ],
    tests: [
      { input: "5\nABCBA", expectedOutput: "5 100", points: 25 },
      { input: "5\nAAAAA", expectedOutput: "2 40", points: 25 },
      { input: "5\nCCCCC", expectedOutput: "1 20", points: 25 },
      { input: "5\nBBBBB", expectedOutput: "1 20", points: 25 },
    ],
  },
  {
    key: "password-guard",
    title: "Перевірка пароля",
    subtitle: "Мініпроєкт · рядки та правила валідації",
    description: "Створіть валідатор пароля. Пароль є коректним, якщо має щонайменше 8 символів і містить хоча б одну цифру. Виведіть `OK` або `WEAK`.",
    skills: ["рядки", "умови", "валідація", "логічні вирази"],
    milestones: [
      { id: "length", title: "Перевірити довжину", description: "Визначте мінімальну довжину пароля.", required: true },
      { id: "digit", title: "Знайти цифру", description: "Перевірте всі символи, а не лише перший.", required: true },
      { id: "verdict", title: "Сформувати результат", description: "Обʼєднайте правила в одне рішення.", required: true },
    ],
    tests: [
      { input: "study1234", expectedOutput: "OK", points: 25 },
      { input: "abc", expectedOutput: "WEAK", points: 25 },
      { input: "password", expectedOutput: "WEAK", points: 25 },
      { input: "Code2026", expectedOutput: "OK", points: 25 },
    ],
  },
  {
    key: "number-parity-report",
    title: "Звіт про числа",
    subtitle: "Мініпроєкт · цикли та агрегації",
    description: "Зчитайте кількість чисел і самі числа. Виведіть через пробіл кількість парних, кількість непарних чисел і їхню суму.",
    skills: ["цикли", "числа", "лічильники", "агрегація"],
    milestones: [
      { id: "read", title: "Зчитайте послідовність", description: "Опрацюйте всі числа з другого рядка.", required: true },
      { id: "classify", title: "Розділіть числа", description: "Збільшуйте правильний лічильник для кожного числа.", required: true },
      { id: "report", title: "Побудуйте звіт", description: "Виведіть три значення в заданому порядку.", required: true },
    ],
    tests: [
      { input: "5\n1 2 3 4 5", expectedOutput: "2 3 15", points: 25 },
      { input: "4\n2 8 10 6", expectedOutput: "4 0 26", points: 25 },
      { input: "3\n-3 -2 -1", expectedOutput: "1 2 -6", points: 25 },
      { input: "1\n0", expectedOutput: "1 0 0", points: 25 },
    ],
  },
  {
    key: "matrix-summary",
    title: "Зведення матриці",
    subtitle: "Мініпроєкт · вкладені цикли",
    description: "Зчитайте матрицю та виведіть суму всіх елементів і найбільший елемент через пробіл.",
    skills: ["двовимірні масиви", "вкладені цикли", "пошук максимуму", "ввід"],
    milestones: [
      { id: "shape", title: "Прочитати розмір", description: "Визначте кількість рядків і стовпців.", required: true },
      { id: "walk", title: "Обійти матрицю", description: "Опрацюйте кожну клітинку рівно один раз.", required: true },
      { id: "summary", title: "Порахувати показники", description: "Підтримуйте суму та максимум під час обходу.", required: true },
    ],
    tests: [
      { input: "2 3\n1 2 3\n4 5 6", expectedOutput: "21 6", points: 25 },
      { input: "1 4\n-2 0 8 1", expectedOutput: "7 8", points: 25 },
      { input: "2 2\n-5 -1\n-3 -2", expectedOutput: "-11 -1", points: 25 },
      { input: "1 1\n42", expectedOutput: "42 42", points: 25 },
    ],
  },
  {
    key: "contact-book",
    title: "Контактна книга",
    subtitle: "Мініпроєкт · словники та пошук",
    description: "Створіть контактну книгу. Після кількох пар `імʼя номер` зчитайте імʼя для пошуку. Виведіть номер або `NOT_FOUND`.",
    skills: ["словники", "пошук", "рядки", "структури даних"],
    milestones: [
      { id: "store", title: "Зберегти контакти", description: "Звʼяжіть кожне імʼя з номером.", required: true },
      { id: "lookup", title: "Виконати пошук", description: "Знайдіть контакт за ключем.", required: true },
      { id: "fallback", title: "Обробити відсутність", description: "Поверніть зрозумілий результат для невідомого імені.", required: true },
    ],
    tests: [
      { input: "3\nAnna 123\nOleh 456\nIra 789\nOleh", expectedOutput: "456", points: 25 },
      { input: "2\nA 10\nB 20\nC", expectedOutput: "NOT_FOUND", points: 25 },
      { input: "1\nmentor 999\nmentor", expectedOutput: "999", points: 25 },
      { input: "2\ncat 1\ndog 2\ncat", expectedOutput: "1", points: 25 },
    ],
  },
  {
    key: "bank-account",
    title: "Рух коштів",
    subtitle: "Мініпроєкт · стан і бізнес-правила",
    description: "Змоделюйте рахунок: перший рядок — початковий баланс, далі операції `+сума` або `-сума`. Виведіть фінальний баланс. Якщо операція знімає більше доступного, пропустіть її.",
    skills: ["стан програми", "цикли", "умови", "моделювання"],
    milestones: [
      { id: "balance", title: "Ініціалізувати баланс", description: "Почніть обчислення з початкової суми.", required: true },
      { id: "operations", title: "Застосувати операції", description: "Оновлюйте стан після кожної команди.", required: true },
      { id: "guard", title: "Захистити рахунок", description: "Не допускайте відʼємного балансу.", required: true },
    ],
    tests: [
      { input: "100\n3\n+50\n-30\n+10", expectedOutput: "130", points: 25 },
      { input: "20\n3\n-50\n+5\n-10", expectedOutput: "15", points: 25 },
      { input: "0\n2\n+10\n-10", expectedOutput: "0", points: 25 },
      { input: "50\n1\n-50", expectedOutput: "0", points: 25 },
    ],
  },
  {
    key: "cinema-seats",
    title: "Карта місць у кінотеатрі",
    subtitle: "Мініпроєкт · двовимірні дані",
    description: "Карта кінотеатру містить `.` для вільного місця та `X` для зайнятого. Виведіть кількість вільних і зайнятих місць через пробіл.",
    skills: ["матриці", "рядки", "підрахунок", "моделювання"],
    milestones: [
      { id: "read-map", title: "Зчитати карту", description: "Опрацюйте кожен рядок місць.", required: true },
      { id: "count", title: "Порахувати стани", description: "Відрізніть вільні й зайняті символи.", required: true },
      { id: "output", title: "Показати статистику", description: "Виведіть спочатку вільні, потім зайняті.", required: true },
    ],
    tests: [
      { input: "3 4\n..X.\nX...\n....", expectedOutput: "10 2", points: 25 },
      { input: "2 2\nXX\nXX", expectedOutput: "0 4", points: 25 },
      { input: "1 5\n.....", expectedOutput: "5 0", points: 25 },
      { input: "1 1\nX", expectedOutput: "0 1", points: 25 },
    ],
  },
  {
    key: "palindrome-checker",
    title: "Перевірка паліндрому",
    subtitle: "Мініпроєкт · рядки та два вказівники",
    description: "Перевірте, чи читається рядок однаково зліва направо і справа наліво. Ігноруйте пробіли та регістр. Виведіть `YES` або `NO`.",
    skills: ["рядки", "нормалізація", "два вказівники", "порівняння"],
    milestones: [
      { id: "normalize", title: "Підготувати текст", description: "Приберіть пробіли та приведіть символи до одного регістру.", required: true },
      { id: "compare", title: "Порівняти краї", description: "Рухайтеся до центру з обох боків.", required: true },
      { id: "verdict", title: "Повернути відповідь", description: "Зупиніться на першій невідповідності.", required: true },
    ],
    tests: [
      { input: "level", expectedOutput: "YES", points: 25 },
      { input: "Never odd or even", expectedOutput: "YES", points: 25 },
      { input: "hello", expectedOutput: "NO", points: 25 },
      { input: "A man a plan", expectedOutput: "NO", points: 25 },
    ],
  },
  {
    key: "prime-analyzer",
    title: "Аналізатор простих чисел",
    subtitle: "Мініпроєкт · функції та оптимізація",
    description: "Визначте, чи є задане ціле число простим. Виведіть `YES` для простого числа і `NO` для складеного або числа 1.",
    skills: ["функції", "цикли", "дільники", "оптимізація"],
    milestones: [
      { id: "edge", title: "Обробити крайні випадки", description: "Окремо врахуйте числа менші за 2.", required: true },
      { id: "divisors", title: "Перевірити дільники", description: "Не перевіряйте дільники, які вже не можуть бути потрібні.", required: true },
      { id: "result", title: "Повернути результат", description: "Зробіть перевірку окремою функцією.", required: true },
    ],
    tests: [
      { input: "2", expectedOutput: "YES", points: 25 },
      { input: "17", expectedOutput: "YES", points: 25 },
      { input: "1", expectedOutput: "NO", points: 25 },
      { input: "100", expectedOutput: "NO", points: 25 },
    ],
  },
  {
    key: "caesar-cipher",
    title: "Шифр Цезаря",
    subtitle: "Мініпроєкт · символи та перетворення",
    description: "Зашифруйте текст циклічним зсувом латинських літер. Перший рядок — зсув, другий — текст. Пробіли залиште без змін, регістр збережіть.",
    skills: ["символи", "рядки", "модульна арифметика", "перетворення"],
    milestones: [
      { id: "alphabet", title: "Розпізнати літери", description: "Відрізніть великі й малі латинські літери від інших символів.", required: true },
      { id: "shift", title: "Застосувати зсув", description: "Поверніться на початок алфавіту після Z або z.", required: true },
      { id: "preserve", title: "Зберегти формат", description: "Не змінюйте пробіли та пунктуацію.", required: true },
    ],
    tests: [
      { input: "3\nABC XYZ", expectedOutput: "DEF ABC", points: 25 },
      { input: "1\nhello", expectedOutput: "ifmmp", points: 25 },
      { input: "-1\nB a!", expectedOutput: "A z!", points: 25 },
      { input: "26\nStudyCod", expectedOutput: "StudyCod", points: 25 },
    ],
  },
  {
    key: "shopping-cart",
    title: "Кошик покупок",
    subtitle: "Мініпроєкт · колекції та розрахунки",
    description: "Для кожного товару задано назву, кількість і ціну. Виведіть загальну вартість кошика.",
    skills: ["колекції", "числа", "агрегація", "грошові розрахунки"],
    milestones: [
      { id: "items", title: "Зчитати товари", description: "Розберіть кожен рядок товару.", required: true },
      { id: "line-total", title: "Порахувати рядки", description: "Помножте кількість на ціну для кожної позиції.", required: true },
      { id: "cart-total", title: "Підсумувати кошик", description: "Поверніть одну загальну суму.", required: true },
    ],
    tests: [
      { input: "2\napple 3 10\nbook 2 25", expectedOutput: "80", points: 25 },
      { input: "3\npen 10 2\nnotebook 4 30\nbag 1 100", expectedOutput: "240", points: 25 },
      { input: "1\nchair 5 40", expectedOutput: "200", points: 25 },
      { input: "2\nitem 0 99\nbox 2 5", expectedOutput: "10", points: 25 },
    ],
  },
  {
    key: "leaderboard",
    title: "Таблиця лідерів",
    subtitle: "Мініпроєкт · пошук максимуму та частоти",
    description: "Зчитайте бали учасників. Виведіть найвищий бал і кількість учасників, які його набрали.",
    skills: ["масиви", "максимум", "частоти", "однопрохідні алгоритми"],
    milestones: [
      { id: "scores", title: "Прочитати результати", description: "Зчитайте всі бали в послідовності.", required: true },
      { id: "max", title: "Знайти рекорд", description: "Підтримуйте поточний максимум.", required: true },
      { id: "count", title: "Порахувати переможців", description: "Порахуйте всі входження максимуму.", required: true },
    ],
    tests: [
      { input: "5\n10 20 20 5 20", expectedOutput: "20 3", points: 25 },
      { input: "3\n100 50 80", expectedOutput: "100 1", points: 25 },
      { input: "4\n7 7 7 7", expectedOutput: "7 4", points: 25 },
      { input: "1\n42", expectedOutput: "42 1", points: 25 },
    ],
  },
  {
    key: "tic-tac-toe",
    title: "Стан хрестиків-нуликів",
    subtitle: "Мініпроєкт · матриці та правила гри",
    description: "Зчитайте поле 3×3 із символів `X`, `O` і `.`. Виведіть переможця `X`, `O` або `DRAW`.",
    skills: ["матриці", "умови", "ігрова логіка", "перевірка правил"],
    milestones: [
      { id: "board", title: "Зчитати поле", description: "Збережіть три рядки ігрового поля.", required: true },
      { id: "lines", title: "Перевірити лінії", description: "Перевірте рядки, стовпці та діагоналі.", required: true },
      { id: "winner", title: "Визначити стан", description: "Поверніть переможця або нічию.", required: true },
    ],
    tests: [
      { input: "XXX\n.O.\n..O", expectedOutput: "X", points: 25 },
      { input: "X..\nOX.\nO.X", expectedOutput: "O", points: 25 },
      { input: "XOX\nXXO\nOXO", expectedOutput: "DRAW", points: 25 },
      { input: "...\n...\n...", expectedOutput: "DRAW", points: 25 },
    ],
  },
  {
    key: "weather-report",
    title: "Звіт погоди",
    subtitle: "Мініпроєкт · статистика та форматування",
    description: "Зчитайте денні температури. Виведіть мінімальну, максимальну та середню температуру з двома знаками після крапки.",
    skills: ["масиви", "статистика", "форматування", "числа з плаваючою крапкою"],
    milestones: [
      { id: "read", title: "Зібрати вимірювання", description: "Зчитайте всі температури.", required: true },
      { id: "range", title: "Знайти діапазон", description: "Окремо підтримуйте мінімум і максимум.", required: true },
      { id: "average", title: "Порахувати середнє", description: "Виведіть результат у стабільному форматі.", required: true },
    ],
    tests: [
      { input: "4\n10 20 0 30", expectedOutput: "0 30 15.00", points: 25 },
      { input: "3\n-5 0 5", expectedOutput: "-5 5 0.00", points: 25 },
      { input: "1\n12", expectedOutput: "12 12 12.00", points: 25 },
      { input: "2\n1 2", expectedOutput: "1 2 1.50", points: 25 },
    ],
  },
  {
    key: "library-search",
    title: "Пошук у каталозі",
    subtitle: "Мініпроєкт · пошук і нормалізація тексту",
    description: "Зчитайте назви книжок і пошуковий запит. Виведіть кількість назв, що містять запит без врахування регістру.",
    skills: ["рядки", "пошук підрядка", "колекції", "нормалізація"],
    milestones: [
      { id: "catalog", title: "Завантажити каталог", description: "Збережіть назви для подальшого пошуку.", required: true },
      { id: "normalize", title: "Уніфікувати регістр", description: "Порівнюйте текст незалежно від регістру.", required: true },
      { id: "count", title: "Порахувати збіги", description: "Збільшуйте результат для кожної відповідної назви.", required: true },
    ],
    tests: [
      { input: "3\nThe Hobbit\nClean Code\nThe Pragmatic Programmer\nthe", expectedOutput: "2", points: 25 },
      { input: "2\nPython Basics\nJava Guide\nrust", expectedOutput: "0", points: 25 },
      { input: "1\nAlgorithms", expectedOutput: "1", points: 25 },
      { input: "3\nA\nAB\nB\na", expectedOutput: "2", points: 25 },
    ],
  },
  {
    key: "grade-distribution",
    title: "Розподіл оцінок",
    subtitle: "Мініпроєкт · класифікація даних",
    description: "Розподіліть оцінки за категоріями: `excellent` — 90+, `good` — 75–89, `pass` — 60–74, `fail` — нижче 60. Виведіть чотири лічильники.",
    skills: ["умови", "класифікація", "лічильники", "обробка списків"],
    milestones: [
      { id: "read", title: "Прочитати оцінки", description: "Опрацюйте весь список без пропусків.", required: true },
      { id: "classify", title: "Вибрати категорію", description: "Перевіряйте межі інтервалів у правильному порядку.", required: true },
      { id: "report", title: "Сформувати розподіл", description: "Виведіть категорії у заданому порядку.", required: true },
    ],
    tests: [
      { input: "5\n95 80 70 50 100", expectedOutput: "2 1 1 1", points: 25 },
      { input: "4\n60 74 75 89", expectedOutput: "0 2 2 0", points: 25 },
      { input: "3\n0 30 59", expectedOutput: "0 0 0 3", points: 25 },
      { input: "1\n90", expectedOutput: "1 0 0 0", points: 25 },
    ],
  },
  {
    key: "delivery-route",
    title: "Маршрут доставки",
    subtitle: "Мініпроєкт · послідовності та оптимізація",
    description: "Для маршруту задано відстані між послідовними зупинками. Виведіть загальну довжину маршруту та найдовший сегмент.",
    skills: ["масиви", "сума", "максимум", "алгоритмічне мислення"],
    milestones: [
      { id: "segments", title: "Зібрати сегменти", description: "Зчитайте відстані між зупинками.", required: true },
      { id: "route", title: "Порахувати маршрут", description: "Складіть усі сегменти.", required: true },
      { id: "longest", title: "Знайти найдовший сегмент", description: "Підтримуйте максимум під час проходу.", required: true },
    ],
    tests: [
      { input: "4\n5 12 3 8", expectedOutput: "28 12", points: 25 },
      { input: "3\n10 10 10", expectedOutput: "30 10", points: 25 },
      { input: "1\n7", expectedOutput: "7 7", points: 25 },
      { input: "2\n0 4", expectedOutput: "4 4", points: 25 },
    ],
  },
] as const;

export function getPersonalMiniProjectDefinition(language: TaskLang, sequence: number): PersonalMiniProjectDefinition {
  const source = sharedProjects[Math.max(0, sequence) % sharedProjects.length];
  return {
    key: source.key,
    title: source.title,
    subtitle: source.subtitle,
    description: source.description,
    language,
    projectSpec: {
      version: 1,
      kind: "MINI_PROJECT",
      estimatedMinutes: 35 + (sequence % 3) * 10,
      skills: [...source.skills],
      milestones: source.milestones.map(milestone => ({ ...milestone })),
      extensions: ["Додайте меню команд", "Додайте власний edge case"],
    },
    template: templates[language],
    tests: source.tests.map(test => ({ ...test })),
  };
}

export const PERSONAL_MINI_PROJECT_INTERVAL = 3;
