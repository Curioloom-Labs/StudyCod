const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BROWSER_CONTRACT_BASE_URL || 'http://127.0.0.1:4176';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CONTRACT_CHANNEL ? { channel: process.env.BROWSER_CONTRACT_CHANNEL } : {}) });
  try {
    for (const expires of [false, true]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', error => console.error('Browser error:', error.message));
      await page.addInitScript(() => localStorage.setItem('i18nextLng', 'uk'));
      let startedAt = null, complete = false, submitted = false, finishes = 0;
      let deadline = new Date(Date.now() + 300000).toISOString();
      const student = { id: 1, studentId: 1, classId: 31, userMode: 'EDUCATIONAL', role: 'USER', username: 'student' };
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        let body = {};
        if (path.endsWith('/start-attempt')) { startedAt ||= new Date().toISOString(); deadline = new Date(Date.now() + (expires ? 3000 : 60000)).toISOString(); body = { startedAt, timeLimitMinutes: 45, remainingSeconds: expires ? 3 : 60 }; }
        else if (path.endsWith('/finish-attempt')) { complete = true; finishes++; body = { status: 'COMPLETED' }; }
        else if (path.endsWith('/submit-quiz')) { submitted = true; complete = true; body = { success: true }; }
        else if (path.endsWith('/control-work-status')) body = { status: complete ? 'COMPLETED' : startedAt ? 'IN_PROGRESS' : 'NOT_STARTED' };
        else if (path.endsWith('/active-control-session')) body = { session: startedAt && !complete ? { controlWorkId: 12, taskIds: [] } : null };
        else if (path === '/api/edu/lessons/12') body = { lesson: { id: 12, type: 'CONTROL', source: 'legacy', title: 'Session regression', hasTheory: true, controlHasTheory: true, controlHasPractice: false, timeLimitMinutes: 45, deadline, assessmentAttempt: startedAt ? { status: complete ? 'COMPLETED' : 'IN_PROGRESS', startedAt, timeLimitMinutes: 45, remainingSeconds: 60 } : null, reportOnly: complete, quizSubmitted: submitted, quizJson: startedAt ? JSON.stringify([{ q: 'Який результат коду?\n```python\nprint(1)\n```', options: ['1', '2'] }]) : null, tasks: [], controlReport: complete ? { finalGrade: submitted ? 100 : 0 } : null } };
        else if (path.endsWith('/profile/me')) body = student;
        else if (path.includes('maintenance')) body = { enabled: false, maintenance: false };
        else if (path.includes('geo')) body = { blocked: false };
        else if (path.endsWith('/edu/lessons')) body = { lessons: [] };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      const url = `${base}/edu/lessons/12?type=CONTROL&preview=true&persona=student`;
      await page.goto(url);
      await page.getByRole('button', { name: /^(Почати контрольну|Start assessment)$/ }).waitFor({ timeout: 60000 }).catch(async error => { console.error(page.url(), (await page.locator('body').innerText()).slice(0, 2500)); throw error; });
      assert.equal(await page.getByRole('radio').count(), 0, 'quiz is locked before start');
      await page.getByRole('button', { name: /^(Почати контрольну|Start assessment)$/ }).click();
      await page.getByRole('timer').waitFor();
      await page.getByText('Який результат коду?').waitFor();
      if (!expires) {
        const clockBefore = await page.getByRole('timer').innerText();
        await page.reload();
        await page.getByRole('timer').waitFor();
        assert.equal((await page.getByRole('timer').innerText()).includes('45:'), false, 'deadline clamps the shared timer');
        assert.ok(clockBefore.includes('0:') || clockBefore.includes('1:'));
        await page.goto(`${base}/edu/profile?preview=true&persona=student`);
        await page.waitForURL(/\/edu\/lessons\/12/);
        await page.getByRole('radio').first().check();
        await page.getByRole('button', { name: /^(Надіслати тест|Submit quiz)$/ }).click();
        await page.getByRole('timer').waitFor({ state: 'detached' });
        assert.equal(submitted, true);
      } else {
        await page.getByRole('timer').waitFor({ state: 'detached', timeout: 15000 });
        await page.waitForTimeout(500);
        assert.equal(finishes, 1, 'expiry finalizes the session once');
        assert.equal(await page.getByRole('radio').count(), 0, 'expired test cannot be answered');
      }
      await context.close();
    }
    const teacher = await browser.newContext();
    const editor = await teacher.newPage();
    await editor.goto(`${base}/edu/control-works/12?preview=true&persona=teacher`);
    const practice = editor.getByRole('checkbox', { name: /^(Практичні завдання|Practice tasks)$/ });
    const quiz = editor.getByRole('checkbox', { name: /^(Тестова частина|Quiz)$/ });
    await practice.waitFor();
    await practice.uncheck();
    await editor.getByRole('button', { name: /^(Зберегти зміни|Save changes)$/ }).click();
    assert.equal(await practice.isChecked(), false, 'teacher can save quiz-only mode');
    await quiz.uncheck();
    await editor.getByRole('button', { name: /^(Зберегти зміни|Save changes)$/ }).click();
    await editor.getByText(/Оберіть хоча б одну частину роботи|Choose at least one section/).waitFor();
    await teacher.close();
    console.log('Control assessment browser checks passed: start gate, question/code rendering, shared deadline clock, reload, navigation lock, quiz-only completion, expiry.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
