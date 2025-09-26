"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { FiSend, FiPaperclip,FiChevronLeft, FiChevronRight } from "react-icons/fi";
import MicRecorder from "@/app/MicRecorder";


type Message = { role: "user" | "ai"; text: string };
type HistoryItem = { id: string; title: string; messages: Message[]; conversationId?: string };

export default function Home() {
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [errors, setErrors] = useState<{ name?: string; id?: string }>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionId, setSessionId] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSliding] = useState(false);
  const [timer, setTimer] = useState(900); // 15 minutes
  const [sessionActive, setSessionActive] = useState(true);
  const [, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [, setIsLoading] = useState(false);

  // Validation function
  const validate = () => {
    const newErrors: { name?: string; id?: string } = {};

    // Student Name → two words, alphabets only
    const namePattern = /^[A-Za-z]+ [A-Za-z]+$/;
    if (!namePattern.test(studentName.trim())) {
      newErrors.name = "Enter first and last name (alphabets only).";
    }

    // ID → exactly 2 digits
    const idPattern = /^\d{2}$/;
    if (!idPattern.test(studentId.trim())) {
      newErrors.id = "ID must be exactly 2 digits.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  type AuthSuccess = {
    success: true;
    sessionId: string;
    student: { studentId: string; name: string; lastLogin: string };
  };

  type AuthFailure = { success: false; message: string };

  const handleLogin = async () => {
    if (validate()) {
      setIsLoading(true);
      try {
        // Authenticate with backend
        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: studentId.trim(), 
            name: studentName.trim() 
          })
        });
        
        const data: AuthSuccess | AuthFailure = await response.json();
        
        if (data.success) {
          setIsAuthenticated(true);
          setSessionActive(true);
          setTimer(900);
          setSessionId(data.sessionId);
          
          // Load conversation history
          await loadConversationHistory();
        } else {
          setErrors({ name: data.message });
        }
      } catch (error) {
        console.error('Login error:', error);
        setErrors({ name: 'Failed to connect to server' });
      } finally {
        setIsLoading(false);
      }
    }
  };

  type ConversationDTO = { id?: string; title: string; messages?: { role: "user" | "ai"; text: string }[] };
  const loadConversationHistory = async () => {
    try {
      const response = await fetch(`/api/history?id=${studentId}&limit=10`);
      const data = await response.json();
      
      if (data.success) {
        const formattedHistory = (data.conversations as ConversationDTO[]).map((conv, index) => ({
          id: (conv.id ?? String(index + 1)),
          title: conv.title,
          messages: (conv.messages ?? []).map((m) => ({ role: m.role, text: String(m.text || "") })),
          conversationId: conv.id,
        }));
        setHistory(formattedHistory);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionActive) return;

    setMessages((prev) => [...prev, { role: "user", text: input }]);
    const userMessage = input;
    setInput("");

    // --- Identity Guardrails ---
    const identityCheck = [
      "hey chatgpt",
      "are you",
      "are you google",
      "are you gemini",
      "are you openai",
      "which llm",
      "what model",
      "are you chatgpt",
      "are you grok",
      "who made you", "who created you", "your developer",
      "your creator",
      "your name",
      "identify yourself",
      "who are you",
      "what are you",
      "your purpose", "are you a counsellor",
    ];

    if (
      identityCheck.some((phrase) =>
        userMessage.toLowerCase().includes(phrase)
      )
    ) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "I am Counsellor AI, created to support and guide you. I am not Google, Gemini, or OpenAI — I am your personal counsellor 🤝.",
        },
      ]);
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage,
          id: studentId.trim(),
          sessionId,
          messages
        }),
      });

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "ai", text: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "⚠️ Failed to connect to AI." },
      ]);
    }
  };

  // History is now loaded from the database via loadConversationHistory()

  useEffect(() => {
    if (!isAuthenticated || !sessionActive) return;
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t > 0) return t - 1;
        clearInterval(interval);
        setSessionActive(false);
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "⏳ Session expired. Please start a new chat." },
        ]);
        return 0;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, sessionActive]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const loadHistory = (item: HistoryItem) => {
    setMessages(item.messages);
    setSidebarOpen(false);
  };

  const startNewSession = () => {
    setMessages([]);
    setTimer(900);
    setSessionActive(true);
  };

  // ---------- CREDENTIAL PAGE ----------
  if (!isAuthenticated) {
    return (
      <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-indigo-100 overflow-hidden">
        {/* Decorative background circles */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1 }}
          className="absolute top-10 left-10 w-40 h-40 bg-indigo-200 rounded-full opacity-30"
        />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="absolute bottom-10 right-10 w-56 h-56 bg-purple-200 rounded-full opacity-30"
        />

        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-indigo-700 drop-shadow-md">
            Welcome to <span className="text-purple-600">Counsellor AI</span>
          </h1>
          <p className="mt-3 text-gray-600 max-w-md">
            Please enter your credentials to continue.  
            This ensures a secure and personalized chat session.
          </p>

          {/* Login Card */}
          <div className="mt-8 bg-white shadow-2xl rounded-2xl p-8 w-96">
            <h2 className="text-xl font-semibold mb-6 text-indigo-700">
              🔐 Enter Credentials
            </h2>
            <input
              type="text"
              placeholder="Student Name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className={`w-full border rounded-lg p-3 mb-2 focus:ring-2 focus:ring-indigo-500 ${
                errors.name ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.name && (
              <p className="text-red-500 text-sm mb-3">{errors.name}</p>
            )}

            <input
              type="text"
              placeholder="ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={`w-full border rounded-lg p-3 mb-2 focus:ring-2 focus:ring-indigo-500 ${
                errors.id ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.id && (
              <p className="text-red-500 text-sm mb-3">{errors.id}</p>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  } 

  // ---------- CHAT PAGE ----------
  return (
    <div
      className="flex h-screen bg-cover bg-bottom"
      style={{ backgroundImage: "url('/bg.png')" }}
    >

      <div className="flex"></div>
      
      {/* Sidebar */}
<div
  className={`transition-all duration-300 bg-white/30 border-r border-gray-300 h-screen p-4 flex flex-col ${
    sidebarCollapsed ? "w-16" : "w-64"
  }`}
>
  {/* Collapse Button */}
  <button
    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
    className="flex items-center justify-center w-8 h-8 rounded-full shadow-xl/20 bg-white hover:bg-blue-200 transition self-end"
  >
    {sidebarCollapsed ? (
      <FiChevronRight size={20} />
    ) : (
      <FiChevronLeft size={20} />
    )}
  </button>
  
  {/* Sidebar Content */}
  {!sidebarCollapsed && (
    <>
      <h3 className="text-lg font-bold mb-3">History</h3>
      <div className="space-y-2">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => loadHistory(item)}
            className="w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm transition self-end hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {item.title}
          </button>
        ))}
      </div>
    </>
  )}
</div>

      {/* Main Chat Section */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 mt-0">
          <div
            className={`flex items-center font-bold ${
              sessionActive ? "text-gray-900" : "text-red-600"
            }`}
          >
            <span className="text-xl text-white absolute top-2 right-4 box-shadow-lg px-4 bg-black/30 rounded-full">
              {sessionActive ? formatTime(timer) : "Expired"}
            </span>
          </div>
        </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex items-end justify-center h-full mt-0 ">
            <Image
              src="/counsellor.png"
              alt="Counsellor"
              width={400}
              height={400}
              className="rounded-3xl mt-0"
            />
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`my-2 flex ${
                m.role === "user" ? "justify-start" : "justify-end"
              } px-64`}
            >
              <span
                className={`px-4 text-lg max-w-[70%] rounded-2xl ${
                  m.role === "user"
                    ? "bg-gray-100"
                    : "bg-blue-400 text-white"
                }`}
                dangerouslySetInnerHTML={{ __html: m.text }}
              />
            </div>
          ))
        )}
</div>


        {/* Floating Counsellor */}
        {messages.length > 0 && (
          <>
            <motion.div
              animate={{ x: isSliding ? 50 : 0 }}
              transition={{ type: "spring", stiffness: 50 }}
              className="fixed bottom-20 right-5 z-10"
            >
              <Image
                src="/counsellor.png"
                alt="Counsellor"
                width={250}
                height={250}
                className="rounded-full outline-offset-4 drop-shadow-rounded mr-8 relative z-10 
               border-2 border-white/40 shadow-3xl shadow-blue-500/25"
              />
            </motion.div>
          </>
        )}

        {/* Chat Input */}
        <div className="flex justify-center mb-4">
          {sessionActive ? (
            <div className="flex items-center w-[550px] max-w-[95%] border rounded-2xl px-3 py-2 bg-white shadow-sm">
              <button className="text-gray-500 hover:text-gray-700 mr-2">
                <FiPaperclip size={20} />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask Counsellor AI anything..."
                className="flex-1 border-none outline-none text-base px-2"
              />
               
      
      <MicRecorder />
    
              <button
                onClick={handleSend}
                className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-blue-700"
              >
                <FiSend size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={startNewSession}
              className="px-8 py-4 rounded-lg bg-blue-600 text-white text-2xl hover:bg-blue-700"
            >
              🔄 Start New Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


