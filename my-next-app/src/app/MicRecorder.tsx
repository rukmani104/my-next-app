"use client";

import { useState, useEffect } from "react";
import { FiMic } from "react-icons/fi";

export default function MicRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");

  let recognition: any;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition;

      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsRecording(false);
        };
      }
    }
  }, []);

  const handleMicClick = () => {
    if (!recognition) {
      alert("Speech Recognition not supported in this browser.");
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      recognition.start();
      setIsRecording(true);
    }
  };

  return (
    <div className="flex flex-col m-2 items-center">
      <button
        onClick={handleMicClick}
        className={`rounded-full shadow-lg transition ${
          isRecording ? "bg-red-500 text-white" : "bg-gray-200 text-black"
        }`}
      >
        <FiMic size={20} />
      </button>

      <div className="w-full max-w-lg bg-gray-100 rounded-xl text-gray-800">
        
      </div>
    </div>
  );
}
