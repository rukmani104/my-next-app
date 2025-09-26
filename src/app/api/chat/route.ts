// app/api/chat/route.ts

import { NextResponse } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import clientPromise from "@/lib/models/mongodb";// This import now works correctly
import { getStudentStore } from "@/lib/models/studentStore";

/**
 * Utility: Format Gemini response into clean paragraphs without markdown.
 */
function formatGeminiResponse(text: string): string {
  if (!text) return "No response received.";

  let formatted = text;

  // Remove markdown formatting
  formatted = formatted
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s?/g, "")
    .replace(/_{1,2}/g, "")
    .replace(/~~/g, "")
    .replace(/`(.*?)`/g, "$1");

  // Handle code blocks with indentation
  formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, __, code) => {
    return `    ${code.trim().replace(/\n/g, "\n    ")}`;
  });

  // Convert lists
  formatted = formatted
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, (m) => `${m.trim()} `);

  // Emojis for key phrases
  const emojiMap: { [key: string]: string } = {
    "important:|crucial:|key point": "🔑",
    "tip:|suggestion:|recommendation": "💡",
    "warning:|caution:|attention": "⚠️",
    "note:|notice": "📝",
    "example:|for example:|e.g.": "📌",
    "advantage:|benefit:|pro": "✅",
    "disadvantage:|limitation:|con": "❌",
    "question:|how to|what is": "❓",
    "success:|achievement:|completed": "🎯",
    "error:|problem:|issue": "❌",
    "info:|information": "ℹ️",
  };

  Object.entries(emojiMap).forEach(([patterns, emoji]) => {
    patterns.split("|").forEach((pattern) => {
      const regex = new RegExp(`\\b(${pattern})\\b`, "gi");
      formatted = formatted.replace(regex, `${emoji} $1`);
    });
  });

  // Ensure paragraph breaks
  formatted = formatted.replace(/([.!?])\s+(?=[A-Z])/g, "$1\n\n");
  formatted = formatted.replace(/(\n\s*)\n\s*/g, "\n\n");

  // Clean up paragraphs
  const paragraphs = formatted
    .split("\n\n")
    .map((p) => {
      p = p.trim();
      if (!p) return "";
      if (!/[.!?]$/.test(p) && !p.startsWith("•") && !/^\d+\./.test(p)) {
        p += ".";
      }
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .filter(Boolean);

  return paragraphs.join("\n\n").trim();
}

/**
 * Utility: Extract plain text from Gemini response
 */
type GeminiResponse = {
  content?:
    | string
    | { text?: string } & Record<string, unknown>
    | Array<{ type?: string; text?: string }>;
};

function extractReplyText(response: GeminiResponse): string {
  if (Array.isArray(response.content)) {
    const textPart = response.content.find(
      (c) => c.type === "text" && typeof c.text === "string"
    );
    return textPart?.text ?? "";
  } else if (typeof response.content === "string") {
    return response.content;
  } else if (
    response.content &&
    typeof response.content === "object" &&
    typeof (response.content as { text?: string }).text === "string"
  ) {
    return (response.content as { text: string }).text;
  }
  return "⚠️ No response from Gemini.";
}

/**
 * Minimal DatabaseService stub
 * Replace with your actual implementation
 */
class DatabaseService {
  private static instance: DatabaseService;

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async getStudentById(id: string) {
    const client = await clientPromise;
    return client.db("studentdb").collection("students").findOne({ studentId: id });
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
      .updateOne({ sessionId }, { $inc: { messageCount: 1 } }, { upsert: true });
  }
}

/**
 * POST handler: Handles chat requests
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, id, studentId, sessionId, messages } = body;

    if (!message) {
      return NextResponse.json(
        { reply: "⚠️ Message is required." },
        { status: 400 }
      );
    }

    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { reply: "⚠️ Server configuration error." },
        { status: 500 }
      );
    }

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-flash",
      apiKey: process.env.GOOGLE_API_KEY!,
    });

    const db = DatabaseService.getInstance();
    let replyText = "";

    // Case 1: Student-specific query
    const resolvedStudentId = (id ?? studentId) as string | undefined;
    if (resolvedStudentId && sessionId) {
      const student = await db.getStudentById(resolvedStudentId);

      // console.log('Fetched student:', student);
      if (!student) {
        return NextResponse.json(
          { reply: "⚠️ Student not found. Please login again." },
          { status: 401 }
        );
      }

      const studentData = {
        profile: student.profile,
        attendance: student.attendance,
        enrollment: student.enrollment,
        scores: student.scores,
        assignments: student.assignments,
        examlist: student.examlist,
      };

      const store = await getStudentStore(resolvedStudentId, studentData);

      // Limit docs to avoid overloading Gemini
      const retriever = store.asRetriever();
      console.log('Retriever created for student store.',retriever);
      const docs = await retriever.getRelevantDocuments(message);
      const context = docs
        .map((d) => d.pageContent)
        .slice(0, 5) // keep only top 5 docs
        .join("\n");

      const response = await model.invoke(
        `You are Counsellor AI, a helpful educational assistant. 
         Please provide a well-structured response with clear paragraph breaks. 
         Use double line breaks between paragraphs, and avoid markdown.
         
         Student Context: ${context}
         
         Student Question: ${message}`
      );

      replyText = extractReplyText(response);

      if (Array.isArray(messages)) {
        const updatedMessages = [
          ...messages,
          { role: "user", text: message },
          { role: "ai", text: replyText },
        ];
        await db.saveConversation(resolvedStudentId, sessionId, updatedMessages);
        await db.incrementMessageCount(sessionId);
      }
    }
    // Case 2: Generic chat
    else {
      const response = await model.invoke(
        `You are Counsellor AI, a helpful educational assistant. 
         Provide a clear, well-structured response with proper paragraph spacing 
         and double line breaks between paragraphs. 
         Question: ${message}`
      );
      replyText = extractReplyText(response);
    }

    const formattedReply = formatGeminiResponse(replyText);
    return NextResponse.json({ reply: formattedReply });
  } catch (err) {
    console.error("Gemini API error:", err);
    return NextResponse.json(
      { reply: "⚠️ Error processing your request." },
      { status: 500 }
    );
  }
}

/**
 * GET handler: Fetch users
 */
export async function GET() {
  try {
    const client = await clientPromise;
    // Corrected the database name from "studentdb" to "studentdb" for consistency
    const users = await client.db("studentdb").collection("users").find({}).toArray();
    return NextResponse.json(users);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to fetch users." },
      { status: 500 }
    );
  }
}