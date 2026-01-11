import type { DocsAudience, DocsSection, DocsSectionId } from "./docs.types";
import DOCS_SECTIONS_UK from "./docs.uk";
import DOCS_SECTIONS_EN from "./docs.en";
export type { DocsAudience, DocsSection, DocsSectionId };
export const DOCS_SECTIONS: DocsSection[] = DOCS_SECTIONS_UK;
export function getDocsSections(language?: string): DocsSection[] {
  const lng = (language || "").toLowerCase();
  if (lng.startsWith("en")) return DOCS_SECTIONS_EN;
  return DOCS_SECTIONS_UK;
}