import clientPromise from "./mongodb";

export class DatabaseService {
  private static instance: DatabaseService;

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async getStudentById(studentId: string) {
    const client = await clientPromise;
    return client.db("studentdb").collection("students").findOne({ studentId });
  }

  async saveConversation(studentId: string, sessionId: string, messages: { role: string; text: string }[]) {
    const client = await clientPromise;
    await client
      .db("studentdb")
      .collection("conversations")
      .updateOne(
        { studentId, sessionId },
        { $set: { messages } },
        { upsert: true }
      );
  }

  async incrementMessageCount(sessionId: string) {
    const client = await clientPromise;
    await client
      .db("studentdb")
      .collection("sessions")
      .updateOne(
        { sessionId },
        { $inc: { messageCount: 1 } },
        { upsert: true }
      );
  }

  async createChatSession(studentId: string): Promise<string> {
    const client = await clientPromise;
    const newSession = {
      studentId,
      sessionId: crypto.randomUUID(),
      createdAt: new Date(),
      messageCount: 0,
    };
    await client.db("studentdb").collection("sessions").insertOne(newSession);
    return newSession.sessionId;
  }

  async upsertStudent(student: {
    studentId: string;
    name: string;
    lastLogin?: Date;
    profile?: unknown;
    attendance?: unknown;
    enrollment?: unknown;
    scores?: unknown;
    assignments?: unknown;
    examlist?: unknown;
  }) {
    const client = await clientPromise;
    const now = new Date();
    await client
      .db("studentdb")
      .collection("students")
      .updateOne(
        { studentId: student.studentId },
        {
          $set: {
            name: student.name,
            lastLogin: student.lastLogin ?? now,
            profile: student.profile,
            attendance: student.attendance,
            enrollment: student.enrollment,
            scores: student.scores,
            assignments: student.assignments,
            examlist: student.examlist,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
  }
}

