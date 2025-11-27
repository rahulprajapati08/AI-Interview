// src/pages/InterviewSession.jsx
import React, { useState, useEffect, useRef } from "react";
import { Volume2, SkipForward, XCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";

// ===== API base =====
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Build auth headers for the backend.
 * Your FastAPI auth dependency expects Clerk headers:
 *   - X-User-Id
 *   - X-User-Email
 * (NOT a Bearer token)
 */
function useClerkHeaders() {
  const { isSignedIn, user } = useUser();

  const getHeaders = () => {
    if (!isSignedIn || !user) return {};
    return {
      "X-User-Id": user.id,
      "X-User-Email": user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "",
    };
  };

  return getHeaders;
}

// ===== Audio recorder with simple VAD =====
const useAutoDetectRecorder = () => {
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [frequency, setFrequency] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      
      let options = { mimeType: "audio/wav" };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = {};
      }
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      return analyser;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      return null;
    }
  };

  const stopAudioCapture = () => {
    return new Promise((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/wav" });

          // Cleanup
          try { streamRef.current?.getTracks()?.forEach((t) => t.stop()); } catch {}
          try { audioContextRef.current?.close(); } catch {}
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

          setIsRecording(false);
          setFrequency([]);
          setRecordingTime(0);
          resolve(audioBlob);
        };
        mediaRecorderRef.current.stop();
      } else {
        resolve(null);
      }
    });
  };

  const detectSpeech = (analyser, onSpeechStart, onSpeechEnd) => {
    let isSpeaking = false;
    let silenceCounter = 0;
    const SILENCE_FRAMES = 20; // ~20 animation frames of silence
    const VOLUME_THRESHOLD = 18; // tweak as needed

    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((p) => p + 1);
    }, 1000);

    const check = () => {
      if (!analyser) return;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setFrequency(Array.from(dataArray.slice(0, 24)));

      if (avg > VOLUME_THRESHOLD) {
        silenceCounter = 0;
        if (!isSpeaking) {
          isSpeaking = true;
          onSpeechStart?.();
        }
      } else {
        silenceCounter++;
        if (isSpeaking && silenceCounter > SILENCE_FRAMES) {
          isSpeaking = false;
          onSpeechEnd?.();
          return; // stop loop after end
        }
      }
      animationFrameRef.current = requestAnimationFrame(check);
    };
    animationFrameRef.current = requestAnimationFrame(check);
  };

  return {
    startAudioCapture,
    stopAudioCapture,
    detectSpeech,
    frequency,
    recordingTime,
    isRecording,
  };
};

const AudioVisualization = ({ frequency }) => {
  return (
    <div className="flex items-end justify-center gap-1 h-28">
      {frequency.map((freq, idx) => (
        <div
          key={idx}
          className="w-1 bg-gradient-to-t from-purple-500 to-blue-500 rounded-full transition-all duration-75"
          style={{
            height: `${Math.min((freq / 255) * 110, 110)}px`,
            opacity: Math.max(0.25, freq / 255),
          }}
        />
      ))}
    </div>
  );
};

// ===== Main Interview Session Page =====
const InterviewSession = ({ sessionConfig: sessionConfigProp, onComplete }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useUser();
  const getAuthHeaders = useClerkHeaders();

  // Pull config from props or location.state to work with your router
  const routeConfig = location.state?.sessionConfig;
  const config = sessionConfigProp || routeConfig || {
    role: "Software Developer",
    interviewType: "technical",
    duration: 5,
  };

  const [currentQuestion, setCurrentQuestion] = useState("");
  const [transcript, setTranscript] = useState("");
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState((config.duration || 5) * 60);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [showUserVideo, setShowUserVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusScore, setFocusScore] = useState(1.0);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [questionsRemaining, setQuestionsRemaining] = useState(5);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [currentConfidence, setCurrentConfidence] = useState(0);

  const videoRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const hasFetchedInitialQuestion = useRef(false);

  const { startAudioCapture, stopAudioCapture, detectSpeech, frequency, recordingTime } =
    useAutoDetectRecorder();

  // Utility: time format
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Speak question
  const speakQuestion = (text) => {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsListening(true);
      setTimeout(() => startListening(), 400);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsListening(true);
      setTimeout(() => startListening(), 400);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Start listening
  const startListening = async () => {
    setIsCapturing(true);
    const analyser = await startAudioCapture();
    if (!analyser) {
      setError("Microphone permission denied or unavailable.");
      setIsCapturing(false);
      setIsListening(false);
      return;
    }
    detectSpeech(
      analyser,
      () => {}, // onSpeechStart (optional UI)
      () => handleSpeechEnd() // onSpeechEnd
    );
  };

  // Handle speech end -> send audio
  const handleSpeechEnd = async () => {
    setIsCapturing(false);
    setIsListening(false);
    setLoading(true);
    try {
      const audioBlob = await stopAudioCapture();
      if (!audioBlob || audioBlob.size === 0) throw new Error("No audio captured");

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("focus_score", focusScore.toString());

      const res = await fetch(`${API_BASE_URL}/api/audio`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Audio upload failed (${res.status})`);
      }

      const data = await res.json();
      setTranscript(data.answer || "[Answer recorded]");
      setCurrentConfidence(data.confidence || 0);

      const newAnswer = {
        question: currentQuestion,
        answer: data.answer || "[Answer recorded]",
        recordingTime,
        confidence: data.confidence || 0,
        focusScore,
        timestamp: new Date().toISOString(),
      };
      setAnswers((p) => [...p, newAnswer]);
      setQuestionsRemaining((p) => Math.max(0, p - 1));

      // Complete or next
      if (data.text && /(complete|thank you)/i.test(data.text)) {
        setSessionComplete(true);
        return;
      }
      if (data.text) {
        setCurrentQuestion(data.text);
        setTranscript("");
        setFocusScore(1.0);
        setTimeout(() => speakQuestion(data.text), 800);
      } else {
        setSessionComplete(true);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to process audio");
      setTranscript("");
    } finally {
      setLoading(false);
    }
  };

  // Terminate interview
  const handleTerminateInterview = async () => {
    try {
      window.speechSynthesis?.cancel();
      if (isCapturing) await stopAudioCapture();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
     
    } catch (e) {
      console.warn("Terminate save warn:", e);
    } finally {
      navigate("/interviews");
    }
  };

  // Timer
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          setSessionComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerIntervalRef.current);
  }, []);

  // Webcam
  useEffect(() => {
    const setupWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 180, height: 180 } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Webcam error:", err);
      }
    };
    if (showUserVideo) setupWebcam();
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [showUserVideo]);

  // Initialize session (first question)
  useEffect(() => {
    const init = async () => {
      if (hasFetchedInitialQuestion.current) return;
      hasFetchedInitialQuestion.current = true;

      if (!isSignedIn) {
        setError("Please sign in to start the interview.");
        return;
      }

      setLoading(true);
      try {
        // Ensure /api/setup already called by your setup page.
        // Kick off conversation by sending an empty blob.
        const formData = new FormData();
        formData.append("audio", new Blob([], { type: "audio/wav" }), "init.wav");
        formData.append("focus_score", "1.0");

        const res = await fetch(`${API_BASE_URL}/api/audio`, {
          method: "POST",
          headers: { ...getAuthHeaders() },
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to initialize interview");
        }

        const data = await res.json();
        if (!data.text) throw new Error("No question received from server");
        setCurrentQuestion(data.text);
        setTimeout(() => speakQuestion(data.text), 800);
      } catch (e) {
        console.error("Init error:", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    init();

    // Cleanup
    return () => {
      window.speechSynthesis?.cancel();
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isSignedIn]);

  // Skip
  const handleSkipQuestion = async () => {
    window.speechSynthesis?.cancel();
    setIsCapturing(false);
    setIsListening(false);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("audio", new Blob([], { type: "audio/wav" }), "skip.wav");
      formData.append("focus_score", "0");

      const res = await fetch(`${API_BASE_URL}/api/audio`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          setCurrentQuestion(data.text);
          setTranscript("");
          setTimeout(() => speakQuestion(data.text), 400);
        }
      }
      setQuestionsRemaining((p) => Math.max(0, p - 1));
    } catch (e) {
      console.error("Skip error:", e);
      setError("Failed to skip question");
    } finally {
      setLoading(false);
    }
  };

  const handleRepeatQuestion = () => {
    window.speechSynthesis?.cancel();
    if (currentQuestion) speakQuestion(currentQuestion);
  };

  const handleViewResults = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        headers: { ...getAuthHeaders() },
      });
      const feedback = await res.json();
      if (onComplete) {
        onComplete(feedback);
      } else {
        navigate("/interviews", {
          state: { showFeedback: true, feedback },
        });
      }
    } catch (e) {
      console.error("Feedback error:", e);
      setError("Failed to retrieve feedback. Redirecting...");
      setTimeout(() => navigate("/interviews"), 1500);
    } finally {
      setLoading(false);
    }
  };

  // Completed screen
  if (sessionComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white mb-2">Interview Complete!</h1>
          <p className="text-gray-300 mb-4 text-lg">Great job finishing the interview.</p>
          <p className="text-gray-400 mb-8">
            You answered <span className="font-bold text-purple-400">{answers.length}</span> questions
          </p>

          <div className="space-y-3">
            <button
              onClick={handleViewResults}
              disabled={loading}
              className="w-full px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading Results..." : "View Results"}
            </button>
            <button
              onClick={() => navigate("/interviews")}
              className="w-full px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition"
            >
              Back to Interviews
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4 md:p-8">
      {/* Terminate Confirmation Modal */}
      {showTerminateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                <XCircle size={32} className="text-red-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3 text-center">Terminate Interview?</h2>
            <p className="text-gray-300 text-center mb-6">
              Are you sure you want to end this interview session? Your progress will be saved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTerminateModal(false)}
                className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleTerminateInterview}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-semibold transition"
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Interview Session</h1>
          <p className="text-gray-400 text-sm mt-1">Role: {config.role || "Software Developer"}</p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={`text-center px-4 py-2 rounded-lg ${
              timeLeft < 60 ? "bg-red-500/20 border border-red-500/50" : "bg-white/10 border border-white/20"
            }`}
          >
            <p className="text-gray-400 text-xs">Time Left</p>
            <p className={`text-2xl font-bold font-mono ${timeLeft < 60 ? "text-red-400 animate-pulse" : "text-green-400"}`}>
              {formatTime(timeLeft)}
            </p>
          </div>
          <button
            onClick={() => setShowTerminateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-300 hover:text-red-200 rounded-lg font-semibold transition"
          >
            <XCircle size={20} />
            <span className="hidden md:inline">Terminate</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 transition">
            ✕
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-12 gap-6">
        {/* Main Area */}
        <div className="md:col-span-9">
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 mb-6">
            <div className="flex justify-between items-start mb-4">
              <p className="text-gray-400 text-sm uppercase tracking-widest">Question {answers.length + 1}</p>
              <span className="text-xs font-semibold px-3 py-1 bg-purple-500/30 text-purple-200 rounded-full">
                {questionsRemaining} remaining
              </span>
            </div>

            {loading && !currentQuestion ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mb-3"></div>
                <p className="text-gray-300">Loading next question...</p>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2">{currentQuestion}</h2>
                  <div className="flex items-center gap-2 mt-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        isSpeaking ? "bg-green-500/30 text-green-200 animate-pulse" : "bg-gray-500/30 text-gray-200"
                      }`}
                    >
                      {isSpeaking ? "Speaking Question..." : "Ready"}
                    </span>
                    {currentConfidence > 0 && (
                      <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-500/30 text-blue-200">
                        Confidence: {Math.round(currentConfidence * 100)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Audio Visualization */}
                <div className="bg-black/30 rounded-xl p-8 my-8 border border-white/5">
                  {isCapturing ? (
                    <div>
                      <AudioVisualization frequency={frequency} />
                      <p className="text-center text-gray-300 mt-4 font-semibold">
                        {isListening ? "Listening... Speak now" : "Processing..."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32">
                      <div className="text-center">
                        <Volume2 size={40} className="text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-300">Waiting for question to be read...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recording Time */}
                {isCapturing && (
                  <div className="text-center mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-gray-300">
                      Recording:{" "}
                      <span className="text-red-400 font-bold animate-pulse">{formatTime(recordingTime)}</span>
                    </p>
                  </div>
                )}

                {/* Transcript */}
                {transcript && (
                  <div className="bg-purple-500/20 border border-purple-500/50 rounded-xl p-5 mb-6">
                    <p className="text-sm text-purple-200 font-semibold mb-3">Answer Recorded</p>
                    <p className="text-white leading-relaxed">{transcript}</p>
                  </div>
                )}

                {/* Focus Slider */}
                {!isCapturing && transcript && (
                  <div className="mb-6 bg-black/30 rounded-xl p-5 border border-white/5">
                    <label className="text-gray-300 text-sm font-semibold mb-3 block">
                      How focused were you during this answer?
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={focusScore}
                        onChange={(e) => setFocusScore(parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-600"
                      />
                      <span className="text-purple-400 font-bold min-w-fit">{Math.round(focusScore * 100)}%</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-4 justify-center flex-wrap">
                  <button
                    onClick={handleRepeatQuestion}
                    disabled={loading || isSpeaking || isCapturing}
                    className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Volume2 size={20} />
                    Repeat Question
                  </button>
                  <button
                    onClick={handleSkipQuestion}
                    disabled={loading || isSpeaking}
                    className="flex items-center gap-2 px-8 py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <SkipForward size={20} />
                    Skip Question
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Answer History */}
          {answers.length > 0 && (
            <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path
                    fillRule="evenodd"
                    d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                    clipRule="evenodd"
                  />
                </svg>
                Answer History
              </h3>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {answers.map((answer, idx) => (
                  <div
                    key={idx}
                    className="bg-black/30 border border-white/10 rounded-xl p-4 hover:border-purple-500/30 transition"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-purple-400 font-semibold text-sm">Q{idx + 1}</span>
                      <div className="flex gap-2">
                        <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">
                          {formatTime(answer.recordingTime)}
                        </span>
                        {answer.confidence > 0 && (
                          <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded-full">
                            {Math.round(answer.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-300 text-sm mb-2 line-clamp-2">{answer.question}</p>
                    <p className="text-white/80 text-sm line-clamp-3">{answer.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="md:col-span-3">
          {/* Stats */}
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-bold text-white mb-4">Session Stats</h3>
            <div className="space-y-4">
              <div>
                <p className="text-gray-400 text-sm mb-1">Questions Answered</p>
                <p className="text-3xl font-bold text-white">{answers.length}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Avg. Confidence</p>
                <p className="text-3xl font-bold text-green-400">
                  {answers.length > 0
                    ? Math.round(
                        (answers.reduce((sum, a) => sum + (a.confidence || 0), 0) / answers.length) * 100
                      )
                    : 0}
                  %
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Avg. Focus</p>
                <p className="text-3xl font-bold text-purple-400">
                  {answers.length > 0
                    ? Math.round(
                        (answers.reduce((sum, a) => sum + (a.focusScore || 0), 0) / answers.length) * 100
                      )
                    : 0}
                  %
                </p>
              </div>
            </div>
          </div>

          {/* Camera */}
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Camera</h3>
              <button
                onClick={() => setShowUserVideo((v) => !v)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold transition ${
                  showUserVideo
                    ? "bg-green-500/20 text-green-300 border border-green-500/50"
                    : "bg-gray-500/20 text-gray-300 border border-gray-500/50"
                }`}
              >
                {showUserVideo ? "ON" : "OFF"}
              </button>
            </div>
            {showUserVideo ? (
              <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              </div>
            ) : (
              <div className="aspect-square bg-black/50 rounded-lg flex items-center justify-center border border-white/5">
                <div className="text-center">
                  <svg className="w-12 h-12 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 01-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-400 text-sm">Camera Off</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewSession;
