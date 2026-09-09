import { api } from "./client";
import i18n from "../../i18n";

export type TheoryTopic = {
  id: number;
  title: string;
  order: number;
  description: string | null;
  language: "JAVA" | "PYTHON" | "CPP";
  theory: {
    id: number;
    title: string;
    content: string | null;
    version: number;
    updatedAt: string;
  } | null;
};

export async function getTheoryTopics(language: "JAVA" | "PYTHON" | "CPP"): Promise<TheoryTopic[]> {
  const res = await api.get("/theory", {
    params: {
      language,
      uiLang: (i18n.language || "uk").toLowerCase(),
      summary: "1"
    }
  });
  return res.data.topics || [];
}

export async function getTheoryTopic(
  language: "JAVA" | "PYTHON" | "CPP",
  topicId: number,
): Promise<TheoryTopic | null> {
  const res = await api.get("/theory", {
    params: {
      language,
      topicId,
      uiLang: (i18n.language || "uk").toLowerCase()
    }
  });
  return res.data.topics?.[0] || null;
}
