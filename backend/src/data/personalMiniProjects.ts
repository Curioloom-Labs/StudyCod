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
    description: "Створіть консольний калькулятор: прочитайте два числа й оператор (+, -, *, /), виконайте операцію та виведіть результат. Вхідні дані гарантовано коректні, а дільник не дорівнює нулю.",
    skills: ["змінні", "умови", "ввід і вивід", "арифметика"],
    milestones: [
      { id: "input", title: "Прочитати команду", description: "Отримайте два числа та оператор з одного рядка.", required: true },
      { id: "operations", title: "Виконати операцію", description: "Підтримайте чотири базові операції.", required: true },
      { id: "result", title: "Показати результат", description: "Виведіть результат обраної арифметичної операції.", required: true },
    ],
    tests: [
      { input: "10 + 4", expectedOutput: "14", points: 25 },
      { input: "9 * 3", expectedOutput: "27", points: 25 },
      { input: "12 / 4", expectedOutput: "3", points: 25 },
      { input: "7 - 9", expectedOutput: "-2", points: 25 },
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
  {
    key: "word-counter",
    title: "Лічильник слів",
    subtitle: "Мініпроєкт · рядки та агрегації",
    description: "Зчитайте слова з каталогу й порахуйте, скільки з них мають щонайменше 5 символів. Також виведіть загальну кількість символів.",
    skills: ["рядки", "цикли", "лічильники", "агрегація"],
    milestones: [
      { id: "words", title: "Зчитати слова", description: "Опрацюйте всі слова з вхідного списку.", required: true },
      { id: "long", title: "Перевірити довжину", description: "Порахуйте слова з довжиною не меншою за 5.", required: true },
      { id: "characters", title: "Підсумувати символи", description: "Додайте довжину кожного слова до загальної суми.", required: true },
    ],
    tests: [
      { input: "4\ncat\nstudy\ncode\nplatform", expectedOutput: "2 21", points: 25 },
      { input: "3\na\nbb\nccc", expectedOutput: "0 6", points: 25 },
      { input: "1\nhello", expectedOutput: "1 5", points: 25 },
      { input: "5\nalpha\nbeta\ngamma\ndelta\ne", expectedOutput: "4 23", points: 25 },
    ],
  },
  {
    key: "string-compressor",
    title: "Стиснення рядка",
    subtitle: "Мініпроєкт · рядки та послідовності",
    description: "Стисніть рядок методом серій: для кожної групи однакових сусідніх символів виведіть символ і кількість його повторень.",
    skills: ["рядки", "цикли", "послідовності", "стан програми"],
    milestones: [
      { id: "scan", title: "Пройти рядок", description: "Рухайтеся зліва направо без повторного сортування символів.", required: true },
      { id: "runs", title: "Знайти серії", description: "Завершуйте серію, коли зустрічається інший символ.", required: true },
      { id: "encode", title: "Сформувати код", description: "Запишіть кожну серію у форматі `символкількість`.", required: true },
    ],
    tests: [
      { input: "aaabbc", expectedOutput: "a3b2c1", points: 25 },
      { input: "abcd", expectedOutput: "a1b1c1d1", points: 25 },
      { input: "zzzz", expectedOutput: "z4", points: 25 },
      { input: "AABBBA", expectedOutput: "A2B3A1", points: 25 },
    ],
  },
  {
    key: "temperature-converter",
    title: "Конвертер температур",
    subtitle: "Мініпроєкт · числа та форматування",
    description: "Перетворіть температуру з градусів Цельсія у Фаренгейти за формулою `F = C × 9 / 5 + 32`.",
    skills: ["формули", "дійсні числа", "ввід і вивід", "форматування"],
    milestones: [
      { id: "read", title: "Прочитати температуру", description: "Зчитайте одне число у градусах Цельсія.", required: true },
      { id: "convert", title: "Застосувати формулу", description: "Використайте точне перетворення без цілочисельного ділення.", required: true },
      { id: "format", title: "Відформатувати результат", description: "Виведіть рівно два знаки після крапки.", required: true },
    ],
    tests: [
      { input: "0", expectedOutput: "32.00", points: 25 },
      { input: "100", expectedOutput: "212.00", points: 25 },
      { input: "-40", expectedOutput: "-40.00", points: 25 },
      { input: "20", expectedOutput: "68.00", points: 25 },
    ],
  },
  {
    key: "discount-calculator",
    title: "Калькулятор знижок",
    subtitle: "Мініпроєкт · умови та бізнес-правила",
    description: "Для суми замовлення визначте знижку: від 1000 — 15%, від 500 — 10%, інакше — 0%. Виведіть суму знижки та фінальну ціну.",
    skills: ["умови", "відсотки", "арифметика", "форматування"],
    milestones: [
      { id: "tier", title: "Визначити рівень", description: "Перевірте пороги від більшого до меншого.", required: true },
      { id: "discount", title: "Порахувати знижку", description: "Обчисліть відсоток від початкової суми.", required: true },
      { id: "total", title: "Показати підсумок", description: "Виведіть знижку й суму після знижки через пробіл.", required: true },
    ],
    tests: [
      { input: "1200", expectedOutput: "180 1020", points: 25 },
      { input: "500", expectedOutput: "50 450", points: 25 },
      { input: "499", expectedOutput: "0 499", points: 25 },
      { input: "1000", expectedOutput: "150 850", points: 25 },
    ],
  },
  {
    key: "queue-simulator",
    title: "Симулятор черги",
    subtitle: "Мініпроєкт · колекції та стан",
    description: "Послідовно виконайте команди черги `ADD x` і `REMOVE`. Якщо черга порожня, `REMOVE` ігнорується. Виведіть елементи, що залишилися.",
    skills: ["черга", "колекції", "умови", "моделювання"],
    milestones: [
      { id: "commands", title: "Прочитати команди", description: "Опрацюйте команди в заданому порядку.", required: true },
      { id: "state", title: "Оновлювати чергу", description: "Додавайте в кінець і видаляйте з початку.", required: true },
      { id: "report", title: "Вивести залишок", description: "Покажіть елементи з початку до кінця через пробіл.", required: true },
    ],
    tests: [
      { input: "4\nADD 1\nADD 2\nREMOVE\nADD 3", expectedOutput: "2 3", points: 25 },
      { input: "3\nREMOVE\nADD 7\nREMOVE", expectedOutput: "EMPTY", points: 25 },
      { input: "3\nADD 5\nADD 6\nADD 7", expectedOutput: "5 6 7", points: 25 },
      { input: "5\nADD 1\nREMOVE\nREMOVE\nADD 9\nADD 8", expectedOutput: "9 8", points: 25 },
    ],
  },
  {
    key: "coordinate-quadrant",
    title: "Координатний навігатор",
    subtitle: "Мініпроєкт · умови та геометрія",
    description: "За координатами точки визначте, у якій чверті вона розташована. Точки на осях позначте як `AXIS`, а початок координат — як `ORIGIN`.",
    skills: ["умови", "порівняння", "координати", "класифікація"],
    milestones: [
      { id: "axes", title: "Перевірити осі", description: "Спочатку відокремте осі та початок координат.", required: true },
      { id: "quadrant", title: "Визначити чверть", description: "Порівняйте знаки x та y.", required: true },
      { id: "result", title: "Повернути позначку", description: "Виведіть один точний маркер результату.", required: true },
    ],
    tests: [
      { input: "3 4", expectedOutput: "I", points: 25 },
      { input: "-2 5", expectedOutput: "II", points: 25 },
      { input: "-1 -1", expectedOutput: "III", points: 25 },
      { input: "4 -3", expectedOutput: "IV", points: 25 },
    ],
  },
  {
    key: "movie-ratings",
    title: "Рейтинг фільмів",
    subtitle: "Мініпроєкт · статистика та фільтрація",
    description: "Зчитайте оцінки фільмів від 0 до 10. Виведіть середню оцінку з двома знаками після крапки та кількість оцінок від 8 і вище.",
    skills: ["масиви", "середнє", "фільтрація", "форматування"],
    milestones: [
      { id: "read", title: "Зібрати оцінки", description: "Зчитайте всі оцінки без пропусків.", required: true },
      { id: "average", title: "Обчислити середнє", description: "Поділіть суму на кількість оцінок.", required: true },
      { id: "popular", title: "Порахувати високі оцінки", description: "Враховуйте оцінки 8, 9 і 10.", required: true },
    ],
    tests: [
      { input: "3\n8 9 10", expectedOutput: "9.00 3", points: 25 },
      { input: "4\n5 6 7 8", expectedOutput: "6.50 1", points: 25 },
      { input: "1\n0", expectedOutput: "0.00 0", points: 25 },
      { input: "5\n10 10 7 8 5", expectedOutput: "8.00 3", points: 25 },
    ],
  },
  {
    key: "reading-log",
    title: "Щоденник читання",
    subtitle: "Мініпроєкт · цикли та підсумки",
    description: "Зчитайте кількість сторінок, прочитаних за кожен день. Виведіть загальну кількість сторінок і кількість продуктивних днів, коли прочитано не менше 20 сторінок.",
    skills: ["цикли", "суми", "умови", "лічильники"],
    milestones: [
      { id: "days", title: "Зібрати дні", description: "Опрацюйте всі денні значення.", required: true },
      { id: "total", title: "Порахувати сторінки", description: "Підсумуйте прочитане за весь період.", required: true },
      { id: "productive", title: "Знайти продуктивні дні", description: "Порахуйте дні з результатом не менше 20.", required: true },
    ],
    tests: [
      { input: "4\n10 20 30 5", expectedOutput: "65 2", points: 25 },
      { input: "3\n0 0 0", expectedOutput: "0 0", points: 25 },
      { input: "1\n20", expectedOutput: "20 1", points: 25 },
      { input: "5\n19 20 21 1 40", expectedOutput: "101 3", points: 25 },
    ],
  },
] as const;

export const PERSONAL_MINI_PROJECT_COUNT = sharedProjects.length;

type MiniProjectContract = {
  input: string;
  output: string;
  notes: string;
};

const miniProjectContracts: Record<string, MiniProjectContract> = {
  "cli-calculator": {
    input: "Один рядок: ціле число, оператор `+`, `-`, `*` або `/`, і друге ціле число через пробіли. Ділення завжди націло.",
    output: "Одне ціле число — результат операції.",
    notes: "Виводьте лише число без пояснень. Наприклад, для `10 / 2` правильний формат — `5`, а не `5.0`.",
  },
  "expense-tracker": {
    input: "Перший рядок — `n`, другий — `n` невід'ємних сум покупок.",
    output: "Два цілі числа через пробіл: загальна сума та найбільша витрата.",
    notes: "Порядок результатів фіксований: спочатку сума, потім максимум.",
  },
  "text-inspector": {
    input: "Один рядок тексту; слова розділені одним або кількома пробілами.",
    output: "Два цілі числа через пробіл: кількість слів і кількість символів без пробілів.",
    notes: "Зайві пробіли на початку, у кінці та між словами не є словами.",
  },
  gradebook: {
    input: "Перший рядок — `n`, другий — `n` оцінок від 0 до 100.",
    output: "Середнє з двома знаками після крапки та кількість оцінок не нижче 60 через пробіл.",
    notes: "Навіть ціле середнє виводьте як `60.00`; не додавайте текстових підписів.",
  },
  inventory: {
    input: "Перший рядок — `n`. Далі `n` рядків: назва товару, кількість і ціна.",
    output: "Два цілі числа через пробіл: загальна вартість запасів і кількість позицій із кількістю менше 5.",
    notes: "Вартість позиції — `кількість × ціна`; назви не впливають на результат.",
  },
  "quiz-game": {
    input: "Перший рядок — `5`, другий — рядок із п'яти відповідей `A`–`D`.",
    output: "Кількість правильних відповідей і відсоток через пробіл.",
    notes: "Еталонні відповіді: `A B C B A`; відсоток — ціле число від 0 до 100.",
  },
  "password-guard": {
    input: "Один рядок із паролем.",
    output: "`OK`, якщо пароль має щонайменше 8 символів і містить хоча б одну цифру; інакше `WEAK`.",
    notes: "Регістр літер не впливає на перевірку; виводьте тільки одне слово великими літерами.",
  },
  "number-parity-report": {
    input: "Перший рядок — `n`, другий — `n` цілих чисел.",
    output: "Три цілі числа через пробіл: кількість парних, кількість непарних і сума всіх чисел.",
    notes: "Нуль є парним числом.",
  },
  "matrix-summary": {
    input: "Перший рядок — кількість рядків і стовпців `r c`. Далі — матриця цілих чисел.",
    output: "Сума всіх елементів і найбільший елемент через пробіл.",
    notes: "Результат має містити саме два числа в указаному порядку.",
  },
  "contact-book": {
    input: "Перший рядок — `n`. Далі `n` рядків із іменем та номером, потім окремий рядок із запитом.",
    output: "Номер знайденого контакту або слово `NOT_FOUND`.",
    notes: "Порівнюйте імена точно; виводьте лише номер або `NOT_FOUND`.",
  },
  "bank-account": {
    input: "Перший рядок — початковий баланс, другий — `n`, далі `n` цілих змін балансу.",
    output: "Один цілий баланс після застосування всіх змін.",
    notes: "Застосовуйте операції в заданому порядку, не виводьте проміжні значення.",
  },
  "cinema-seats": {
    input: "Перший рядок — кількість рядків і місць `r c`. Далі поле з `.` для вільного та `X` для зайнятого місця.",
    output: "Кількість вільних і зайнятих місць через пробіл.",
    notes: "Порядок фіксований: спочатку вільні (`.`), потім зайняті (`X`).",
  },
  "palindrome-checker": {
    input: "Один рядок тексту.",
    output: "`YES`, якщо текст є паліндромом без урахування регістру та пробілів, інакше `NO`.",
    notes: "Виводьте лише `YES` або `NO` великими літерами.",
  },
  "prime-analyzer": {
    input: "Одне ціле число `n`.",
    output: "`YES`, якщо `n` просте, інакше `NO`.",
    notes: "Числа менші за 2 не є простими.",
  },
  "caesar-cipher": {
    input: "Перший рядок — цілий зсув, другий — текст із латинських літер, пробілів і пунктуації.",
    output: "Зашифрований текст в одному рядку.",
    notes: "Зберігайте регістр, пробіли та пунктуацію; результат не доповнюйте поясненням.",
  },
  "shopping-cart": {
    input: "Перший рядок — `n`. Далі `n` рядків: назва товару, кількість і ціна.",
    output: "Одне ціле число — загальна вартість кошика.",
    notes: "Для кожного товару множте кількість на ціну та підсумовуйте всі позиції.",
  },
  leaderboard: {
    input: "Перший рядок — `n`, другий — `n` цілих балів.",
    output: "Найвищий бал і кількість учасників із цим балом через пробіл.",
    notes: "Якщо максимум повторюється, порахуйте всі його входження.",
  },
  "tic-tac-toe": {
    input: "Три рядки по три символи: `X`, `O` або `.`.",
    output: "`X`, `O` або `DRAW` — результат гри.",
    notes: "Перевіряйте рядки, стовпці та обидві діагоналі; виводьте лише один маркер.",
  },
  "weather-report": {
    input: "Перший рядок — `n`, другий — `n` дійсних температур.",
    output: "Мінімум, максимум і середнє через пробіл; кожне число має рівно два знаки після крапки.",
    notes: "Наприклад, нуль потрібно виводити як `0.00`, а не `0`.",
  },
  "library-search": {
    input: "Перший рядок — `n`, далі `n` назв книжок, потім окремий рядок із запитом.",
    output: "Одне ціле число — кількість назв, що містять запит.",
    notes: "Пошук не враховує регістр; виводьте лише кількість збігів.",
  },
  "grade-distribution": {
    input: "Перший рядок — `n`, другий — `n` цілих оцінок.",
    output: "Чотири лічильники через пробіл у порядку `excellent good pass fail`.",
    notes: "Межі: `90+`, `75–89`, `60–74`, нижче `60`; порядок змінювати не можна.",
  },
  "delivery-route": {
    input: "Перший рядок — `n`, другий — `n` невід'ємних відстаней між зупинками.",
    output: "Загальна довжина маршруту та найдовший сегмент через пробіл.",
    notes: "Для маршруту з одним сегментом обидва результати дорівнюють цій відстані.",
  },
  "word-counter": {
    input: "Перший рядок — `n`, далі `n` слів без пробілів.",
    output: "Кількість слів довжиною не менше 5 і загальна кількість символів через пробіл.",
    notes: "Слово з рівно 5 символів входить до першого лічильника.",
  },
  "string-compressor": {
    input: "Один непорожній рядок символів.",
    output: "Для кожної серії виведіть символ і її довжину без пробілів між серіями.",
    notes: "Серії не об'єднуються через різні символи; регістр зберігається.",
  },
  "temperature-converter": {
    input: "Одне дійсне число `C` — температура у градусах Цельсія.",
    output: "Температура у Фаренгейтах із рівно двома знаками після крапки.",
    notes: "Використайте `F = C × 9 / 5 + 32`; наприклад, `0` дає `32.00`.",
  },
  "discount-calculator": {
    input: "Одне ціле число — початкова сума замовлення.",
    output: "Сума знижки та фінальна ціна через пробіл.",
    notes: "Пороги включні: 500 отримує 10%, 1000 отримує 15%; для дробового результату збережіть точність до копійок.",
  },
  "queue-simulator": {
    input: "Перший рядок — `n`, далі `n` команд `ADD x` або `REMOVE`.",
    output: "Залишок черги через пробіл або `EMPTY`, якщо елементів не залишилося.",
    notes: "`REMOVE` з порожньої черги нічого не змінює.",
  },
  "coordinate-quadrant": {
    input: "Два цілі числа `x` та `y` — координати точки.",
    output: "Один маркер: `I`, `II`, `III`, `IV`, `AXIS` або `ORIGIN`.",
    notes: "`ORIGIN` має пріоритет, якщо обидві координати дорівнюють нулю.",
  },
  "movie-ratings": {
    input: "Перший рядок — `n`, другий — `n` оцінок від 0 до 10.",
    output: "Середня оцінка з двома знаками після крапки та кількість оцінок від 8 до 10.",
    notes: "Оцінка 8 входить до другого лічильника; виводьте тільки два значення.",
  },
  "reading-log": {
    input: "Перший рядок — `n`, другий — `n` невід'ємних значень сторінок за днями.",
    output: "Загальна кількість сторінок і кількість днів із результатом не менше 20 через пробіл.",
    notes: "Поріг 20 включний.",
  },
};

const additionalTestsByKey: Record<string, Array<{ input: string; expectedOutput: string }>> = {
  "cli-calculator": [
    { input: "10 / 2", expectedOutput: "5" },
    { input: "-9 / 3", expectedOutput: "-3" },
    { input: "0 + 7", expectedOutput: "7" },
    { input: "8 * -2", expectedOutput: "-16" },
  ],
  "expense-tracker": [
    { input: "2\n5 10", expectedOutput: "15 10" },
    { input: "3\n5 5 5", expectedOutput: "15 5" },
    { input: "2\n100 1", expectedOutput: "101 100" },
    { input: "6\n1 2 3 4 5 6", expectedOutput: "21 6" },
  ],
  "text-inspector": [
    { input: "a", expectedOutput: "1 1" },
    { input: "  a  b  ", expectedOutput: "2 2" },
    { input: "hello   world", expectedOutput: "2 10" },
    { input: "a b c d e", expectedOutput: "5 5" },
  ],
  gradebook: [
    { input: "2\n0 100", expectedOutput: "50.00 1" },
    { input: "3\n59 60 74", expectedOutput: "64.33 2" },
    { input: "2\n75 89", expectedOutput: "82.00 2" },
    { input: "1\n60", expectedOutput: "60.00 1" },
  ],
  inventory: [
    { input: "3\napple 0 10\nbook 5 20\npen 4 3", expectedOutput: "112 2" },
    { input: "2\nx 1 0\ny 4 5", expectedOutput: "20 2" },
    { input: "3\na 5 1\nb 5 2\nc 5 3", expectedOutput: "30 0" },
    { input: "4\na 1 1\nb 2 2\nc 3 3\nd 4 4", expectedOutput: "30 4" },
  ],
  "quiz-game": [
    { input: "5\nABCDE", expectedOutput: "3 60" },
    { input: "5\nAACBA", expectedOutput: "4 80" },
    { input: "5\nABCBB", expectedOutput: "4 80" },
    { input: "5\nDDDDD", expectedOutput: "0 0" },
  ],
  "password-guard": [
    { input: "12345678", expectedOutput: "WEAK" },
    { input: "1234567a", expectedOutput: "WEAK" },
    { input: "abcdefgh1", expectedOutput: "OK" },
    { input: "Abcdefg1", expectedOutput: "OK" },
  ],
  "number-parity-report": [
    { input: "6\n-1 -2 -3 -4 -5 -6", expectedOutput: "3 3 -21" },
    { input: "4\n0 0 0 0", expectedOutput: "4 0 0" },
    { input: "2\n100 101", expectedOutput: "1 1 201" },
    { input: "5\n-2 0 2 4 6", expectedOutput: "5 0 10" },
  ],
  "matrix-summary": [
    { input: "1 3\n-1 -2 -3", expectedOutput: "-6 -1" },
    { input: "2 1\n5\n-2", expectedOutput: "3 5" },
    { input: "3 3\n0 0 0\n0 0 0\n0 0 0", expectedOutput: "0 0" },
    { input: "2 2\n1 4\n2 3", expectedOutput: "10 4" },
  ],
  "contact-book": [
    { input: "3\nA 1\nB 2\nC 3\nA", expectedOutput: "1" },
    { input: "2\nann 1\nbob 2\nbob", expectedOutput: "2" },
    { input: "1\nx 0\nx", expectedOutput: "0" },
    { input: "3\none 1\ntwo 2\nthree 3\nfour", expectedOutput: "NOT_FOUND" },
  ],
  "bank-account": [
    { input: "10\n4\n+5\n-3\n-20\n+2", expectedOutput: "14" },
    { input: "0\n3\n-1\n-2\n+4", expectedOutput: "4" },
    { input: "100\n2\n-100\n-1", expectedOutput: "0" },
    { input: "5\n4\n+0\n-2\n+0\n-3", expectedOutput: "0" },
  ],
  "cinema-seats": [
    { input: "2 3\n...\n...", expectedOutput: "6 0" },
    { input: "2 3\nXXX\nXXX", expectedOutput: "0 6" },
    { input: "3 2\n.X\nX.\n..", expectedOutput: "4 2" },
    { input: "1 4\nX.X.", expectedOutput: "2 2" },
  ],
  "palindrome-checker": [
    { input: "A", expectedOutput: "YES" },
    { input: "aa", expectedOutput: "YES" },
    { input: "ab", expectedOutput: "NO" },
    { input: "12345", expectedOutput: "NO" },
  ],
  "prime-analyzer": [
    { input: "0", expectedOutput: "NO" },
    { input: "-7", expectedOutput: "NO" },
    { input: "3", expectedOutput: "YES" },
    { input: "97", expectedOutput: "YES" },
  ],
  "caesar-cipher": [
    { input: "0\nHello World!", expectedOutput: "Hello World!" },
    { input: "25\nz a", expectedOutput: "y z" },
    { input: "2\nXyZ!", expectedOutput: "ZaB!" },
    { input: "-26\nStudyCod", expectedOutput: "StudyCod" },
  ],
  "shopping-cart": [
    { input: "3\nA 1 1\nB 2 2\nC 3 3", expectedOutput: "14" },
    { input: "2\nx 0 100\ny 1 7", expectedOutput: "7" },
    { input: "1\nitem 100 0", expectedOutput: "0" },
    { input: "4\na 1 10\nb 1 20\nc 1 30\nd 1 40", expectedOutput: "100" },
  ],
  leaderboard: [
    { input: "5\n1 1 2 2 2", expectedOutput: "2 3" },
    { input: "4\n-1 -2 -3 -4", expectedOutput: "-1 1" },
    { input: "2\n0 0", expectedOutput: "0 2" },
    { input: "6\n9 8 7 9 8 9", expectedOutput: "9 3" },
  ],
  "tic-tac-toe": [
    { input: "X..\n.X.\n..X", expectedOutput: "X" },
    { input: "O..\n.O.\n..O", expectedOutput: "O" },
    { input: "XXX\nOO.\n...", expectedOutput: "X" },
    { input: "XOX\nOXO\nOX.", expectedOutput: "DRAW" },
  ],
  "weather-report": [
    { input: "3\n1.1 1.2 1.3", expectedOutput: "1.10 1.30 1.20" },
    { input: "2\n-1.5 -1.5", expectedOutput: "-1.50 -1.50 -1.50" },
    { input: "5\n100 0 50 25 75", expectedOutput: "0.00 100.00 50.00" },
    { input: "1\n0", expectedOutput: "0.00 0.00 0.00" },
  ],
  "library-search": [
    { input: "3\nTHE\nthe\nThe\nTHE", expectedOutput: "3" },
    { input: "2\nOne\nTwo\nthree", expectedOutput: "0" },
    { input: "3\ncat\nscatter\ncatalog\ncat", expectedOutput: "3" },
    { input: "1\nStudyCod\nstudy", expectedOutput: "1" },
  ],
  "grade-distribution": [
    { input: "4\n59 60 74 75", expectedOutput: "0 1 2 1" },
    { input: "4\n89 90 100 74", expectedOutput: "2 1 1 0" },
    { input: "2\n75 89", expectedOutput: "0 2 0 0" },
    { input: "3\n90 90 90", expectedOutput: "3 0 0 0" },
  ],
  "delivery-route": [
    { input: "5\n1 2 3 4 5", expectedOutput: "15 5" },
    { input: "3\n0 0 0", expectedOutput: "0 0" },
    { input: "6\n10 1 10 1 10 1", expectedOutput: "33 10" },
    { input: "4\n100 50 25 75", expectedOutput: "250 100" },
  ],
  "word-counter": [
    { input: "2\nhello\nworld", expectedOutput: "2 10" },
    { input: "3\naaaaa\nbbbb\nccccc", expectedOutput: "2 14" },
    { input: "4\none\ntwo\nthree\nfour", expectedOutput: "1 15" },
    { input: "1\nStudyCod", expectedOutput: "1 8" },
  ],
  "string-compressor": [
    { input: "a", expectedOutput: "a1" },
    { input: "112233", expectedOutput: "122232" },
    { input: "xxxYYYYz", expectedOutput: "x3Y4z1" },
    { input: "abcccb", expectedOutput: "a1b1c3b1" },
  ],
  "temperature-converter": [
    { input: "-10", expectedOutput: "14.00" },
    { input: "37", expectedOutput: "98.60" },
    { input: "-40.5", expectedOutput: "-40.90" },
    { input: "12.5", expectedOutput: "54.50" },
  ],
  "discount-calculator": [
    { input: "1001", expectedOutput: "150.15 850.85" },
    { input: "750", expectedOutput: "75 675" },
    { input: "1", expectedOutput: "0 1" },
    { input: "2000", expectedOutput: "300 1700" },
  ],
  "queue-simulator": [
    { input: "1\nREMOVE", expectedOutput: "EMPTY" },
    { input: "5\nADD 4\nREMOVE\nADD 8\nADD 9\nREMOVE", expectedOutput: "9" },
    { input: "2\nADD -1\nADD 0", expectedOutput: "-1 0" },
    { input: "4\nADD 1\nREMOVE\nADD 2\nREMOVE", expectedOutput: "EMPTY" },
  ],
  "coordinate-quadrant": [
    { input: "0 5", expectedOutput: "AXIS" },
    { input: "-3 0", expectedOutput: "AXIS" },
    { input: "0 0", expectedOutput: "ORIGIN" },
    { input: "7 -2", expectedOutput: "IV" },
  ],
  "movie-ratings": [
    { input: "2\n8 8", expectedOutput: "8.00 2" },
    { input: "4\n1 2 3 4", expectedOutput: "2.50 0" },
    { input: "3\n7 8 9", expectedOutput: "8.00 2" },
    { input: "5\n0 10 5 9 6", expectedOutput: "6.00 2" },
  ],
  "reading-log": [
    { input: "2\n19 20", expectedOutput: "39 1" },
    { input: "4\n1 2 3 4", expectedOutput: "10 0" },
    { input: "3\n100 0 20", expectedOutput: "120 2" },
    { input: "5\n20 20 20 20 20", expectedOutput: "100 5" },
  ],
};

type MiniProjectTestCase = { input: string; expectedOutput: string };

/**
 * Keep a broad regression floor for every project. The first eight cases are
 * semantic scenarios; these additional cases exercise normal console input
 * framing (one or more trailing line breaks) across every supported language.
 * This catches parsers that accidentally depend on EOF formatting while
 * keeping the expected result unchanged.
 */
function buildInputFramingCoverageTests(baseTests: MiniProjectTestCase[]): MiniProjectTestCase[] {
  const coverage: MiniProjectTestCase[] = [];
  for (let index = 0; coverage.length < 22; index += 1) {
    const source = baseTests[index % baseTests.length];
    coverage.push({
      input: `${source.input}${"\n".repeat(index + 1)}`,
      expectedOutput: source.expectedOutput,
    });
  }
  return coverage;
}

export function getPersonalMiniProjectDefinition(language: TaskLang, sequence: number): PersonalMiniProjectDefinition {
  const source = sharedProjects[Math.max(0, sequence) % sharedProjects.length];
  const contract = miniProjectContracts[source.key];
  const semanticTests = [...source.tests, ...(additionalTestsByKey[source.key] || [])];
  const allTests = [...semanticTests, ...buildInputFramingCoverageTests(semanticTests)];
  const basePoints = Math.floor(100 / allTests.length);
  const remainder = 100 - basePoints * allTests.length;
  return {
    key: source.key,
    title: source.title,
    subtitle: source.subtitle,
    description: [
      source.description,
      "",
      "### Формат вводу",
      contract.input,
      "",
      "### Формат виводу",
      contract.output,
      "",
      "### Важливо",
      contract.notes,
    ].join("\n"),
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
    tests: allTests.map((test, index) => ({
      ...test,
      points: basePoints + (index < remainder ? 1 : 0),
    })),
  };
}

export const PERSONAL_MINI_PROJECT_INTERVAL = 3;
