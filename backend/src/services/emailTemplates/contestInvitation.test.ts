import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContestInvitationEmail, type ContestInvitation } from "./contestInvitation";

const invitation: ContestInvitation = {
  fullName: "Олена Коваль",
  contestTitle: "Ліцейний турнір",
  username: "contest_participant",
  password: " demonstration-password ",
  entryUrl: "https://studycod.space/contest/entry/22",
  siteUrl: "https://studycod.space",
  startsAt: "2026-10-11T07:45:00Z",
  endsAt: "2026-10-11T10:45:00Z",
  organizerMessage: "Ознайомтеся з правилами.\nПеред початком перевірте вхід.",
};

test("untrusted invitation fields are escaped while plain text and credentials remain exact", () => {
  const unsafe = '<img src=x onerror="alert(1)"> &';
  const result = buildContestInvitationEmail({ ...invitation, contestTitle: unsafe, fullName: unsafe, username: unsafe, password: ` ${unsafe} `, organizerMessage: unsafe });
  assert.ok(!result.html.includes(unsafe));
  assert.ok(result.html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp;'));
  assert.ok(result.text.includes(`Пароль:  ${unsafe} `));
  const links = [...result.html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(new Set(links), new Set([invitation.siteUrl, invitation.entryUrl]));
});

test("invitation uses Kyiv time independently of the server timezone and localizes both formats", () => {
  for (const serverZone of ["UTC", "America/Los_Angeles"]) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = serverZone;
      const uk = buildContestInvitationEmail(invitation);
      const en = buildContestInvitationEmail({ ...invitation, locale: "en" });
      assert.match(uk.text, /11 жовтня 2026.*10:45/);
      assert.match(en.text, /11 October 2026.*10:45/);
      assert.match(uk.text, /Час за Києвом/);
      assert.match(en.text, /Kyiv time/);
      assert.match(en.html, /lang="en"/);
      assert.match(en.subject, /Invitation to/);
      assert.ok(en.text.includes(invitation.organizerMessage!));
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
});

test("optional schedule and organizer message do not leave empty sections or lose sign-in details", () => {
  const minimal = buildContestInvitationEmail({ ...invitation, includeContestInfo: false, organizerMessage: "   ", locale: "en" });
  assert.ok(!minimal.text.includes("Starts:"));
  assert.ok(!minimal.html.includes("schedule-cell\""));
  assert.ok(!minimal.text.includes("From the organizer:"));
  assert.ok(minimal.text.includes(`Password: ${invitation.password}`));
  assert.ok(minimal.text.includes(invitation.entryUrl));
  const unset = buildContestInvitationEmail({ ...invitation, startsAt: null, endsAt: "invalid" });
  assert.match(unset.text, /Початок: Не вказано/);
  assert.match(unset.text, /Завершення: Не вказано/);
});
