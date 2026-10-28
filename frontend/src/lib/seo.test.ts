import { describe, expect, it } from "vitest";
import { getSeoData } from "./seo";

describe("Portfolio and Assess route metadata", () => {
  it("allows public owner portfolios to be indexed", () => {
    expect(getSeoData("/portfolio/u/alice", "en")).toMatchObject({
      title: "Developer Portfolio — StudyCod",
      indexable: true,
    });
  });

  it("keeps bearer Evidence Pack pages out of search indexes", () => {
    expect(getSeoData(`/portfolio/p/${"a".repeat(43)}`, "en")).toMatchObject({
      title: "StudyCod Portfolio — shared evidence pack",
      indexable: false,
    });
  });

  it("keeps authenticated Portfolio and Assess workspaces private", () => {
    expect(getSeoData("/portfolio", "en").indexable).toBe(false);
    expect(getSeoData("/portfolio/projects", "en").indexable).toBe(false);
    expect(getSeoData("/assess", "en").indexable).toBe(false);
    expect(getSeoData("/assess/interviews/meeting-id", "en").indexable).toBe(false);
  });

  it("keeps legacy company URLs branded as private Assess workspaces", () => {
    expect(getSeoData("/companies", "en")).toMatchObject({
      title: "StudyCod Assess — technical assessment",
      indexable: false,
    });
    expect(getSeoData("/companies/interviews/meeting-id", "uk")).toMatchObject({
      title: "StudyCod Assess — technical assessment",
      indexable: false,
    });
  });

  it("keeps legacy project URLs branded as private Portfolio workspaces", () => {
    expect(getSeoData("/projects", "en")).toMatchObject({
      title: "StudyCod Portfolio — practical work",
      indexable: false,
    });
    expect(getSeoData("/projects/reviews", "uk")).toMatchObject({
      title: "StudyCod Portfolio — практичне портфоліо",
      indexable: false,
    });
  });
});
