import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../types";
import { PersonalWorkspaceContext } from "./PersonalWorkspaceContext";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("../../lib/api/profile", () => ({ getCachedMeUser: () => session.user, getMe: vi.fn() }));
vi.mock("../../lib/authSession", () => ({ logoutAndReload: vi.fn() }));
vi.mock("../../lib/devPreview", () => ({ isDevPreviewActive: () => false, getDevPreviewUser: () => null, withDevPreview: (path: string) => path }));
vi.mock("../../theme", () => ({ getCurrentTheme: () => "light", applyTheme: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("../learning/PersonalLearningProvider", () => ({ PersonalLearningProvider: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock("./PremiumWorkspaceShell", () => ({ PremiumWorkspaceShell: ({ children }: React.PropsWithChildren) => <section data-personal-shell>{children}</section> }));
vi.mock("react-router-dom", async importOriginal => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  Navigate: ({ to }: { to: string }) => <span data-redirect={to} />,
}));
import { PersonalRouteShell } from "./PersonalRouteShell";

function render(path: string, shared = false) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>
    <PersonalWorkspaceContext.Provider value={{ active: shared, setUser: vi.fn() }}>
      <PersonalRouteShell><p>Personal course content</p></PersonalRouteShell>
    </PersonalWorkspaceContext.Provider>
  </MemoryRouter>);
}

describe("personal route isolation", () => {
  beforeEach(() => { session.user = { id: 7, username: "learner", difus: 0, avatarUrl: null, userMode: "EDUCATIONAL", studentId: 41 }; });
  it("sends a student opening a saved personal course to EDU lessons", () => {
    const html = render("/learning/course/1/overview");
    expect(html).toContain('data-redirect="/edu/lessons"');
    expect(html).not.toContain("Personal course content");
    expect(html).not.toContain("data-personal-shell");
  });
  it("guards even when the outer frame still has personal context", () => {
    expect(render("/portfolio", true)).toContain('data-redirect="/edu/lessons"');
  });
  it("keeps a shared library task in the EDU library", () => {
    expect(render("/lab/library/solve/42?lang=JAVA#statement")).toContain('data-redirect="/edu/library/solve/42?lang=JAVA#statement"');
  });
  it("returns staff to their EDU workspace", () => {
    session.user = { ...session.user!, studentId: undefined };
    expect(render("/learning/catalog")).toContain('data-redirect="/edu"');
  });
  it("preserves personal learning", () => {
    session.user = { ...session.user!, userMode: "PERSONAL", studentId: undefined };
    const html = render("/learning/catalog");
    expect(html).toContain("Personal course content");
    expect(html).toContain("data-personal-shell");
    expect(html).not.toContain("data-redirect");
  });
});
