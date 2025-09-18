import { NextResponse } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-flash",
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const response = await model.invoke(message);

    let replyText = "";

    if (Array.isArray(response.content)) {
      const textPart = response.content.find(
        (c: any) => c.type === "text" && typeof (c as { text?: string }).text === "string"
      );
      replyText = (textPart && typeof (textPart as { text?: string }).text === "string"
        ? (textPart as { text: string }).text
        : "") || "";
    } else if (typeof response.content === "string") {
      replyText = response.content;
    } else if (
      typeof response.content === "object" &&
      response.content !== null &&
      "text" in response.content &&
      typeof (response.content as any).text === "string"
    ) {
      replyText = (response.content as any).text;
    }

    return NextResponse.json({ reply: replyText || "⚠️ No response from Gemini." });
  } catch (err) {
    console.error("Gemini API error:", err);
    return NextResponse.json(
      { reply: "⚠️ Error connecting to Gemini API." },
      { status: 500 }
    );
  }
  }

  
  