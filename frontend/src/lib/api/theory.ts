import { api } from "./client";

export type TheoryTopic = {
  id: number;
  title: string;
  order: number;
  description: string | null;
  language: "JAVA" | "PYTHON";
  theory: {
    id: number;
    title: string;
    content: string;
    version: number;
    updatedAt: string;
  } | null;
};

export async function getTheoryTopics(language: "JAVA" | "PYTHON"): Promise<TheoryTopic[]> {
  const res = await api.get("/theory", {
    params: {
      language
    }
  });
  return res.data.topics || [];
}
