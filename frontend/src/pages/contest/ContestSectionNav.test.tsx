import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ContestSectionNav } from "./ContestSectionNav";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "uk" } }) }));

function renderNav(canManage: boolean) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/contest/contests/102/scoreboard?preview=true&persona=contest"]}>
    <ContestSectionNav contestId={102} active="standings" canManage={canManage} />
  </MemoryRouter>);
}

describe("contest section navigation", () => {
  it("returns participants to the contest problems while preserving preview context", () => {
    const html = renderNav(false);
    expect(html).toContain('href="/contest/contests/102?preview=true&amp;persona=contest"');
    expect(html).not.toContain('href="/contest/contests/102/manage?preview=true&amp;persona=contest"');
  });

  it("keeps the organizer's problems link in the management workspace", () => {
    expect(renderNav(true)).toContain('href="/contest/contests/102/manage?preview=true&amp;persona=contest"');
  });
});
