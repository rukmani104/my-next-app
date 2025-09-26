import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

const studentStores: Record<string, MemoryVectorStore> = {};

type StudentData = {
  profile?: unknown;
  attendance?: unknown;
  enrollment?: unknown;
  scores?: unknown;
  score?: unknown;
  assignments?: unknown;
  examlist?: unknown;
};

export async function getStudentStore(studentId: string, data: StudentData) {
  if (!studentStores[studentId]) {
    const embeddings = new GoogleGenerativeAIEmbeddings();
    const store = await MemoryVectorStore.fromTexts(
      [
        `Profile: ${JSON.stringify(data.profile)}`,
        `Attendance: ${JSON.stringify(data.attendance)}`,
        `Enrollment: ${JSON.stringify(data.enrollment)}`,
        `Scores: ${JSON.stringify(data.score || data.scores)}`,
        `Assignments: ${JSON.stringify(data.assignments)}`,
        `Exam List: ${JSON.stringify(data.examlist)}`,
      ],
      [{ studentId }],
      embeddings
    );
    studentStores[studentId] = store;
  }
  return studentStores[studentId];
}
