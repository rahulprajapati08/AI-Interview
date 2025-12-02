import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  SkipForward,
  XCircle,
  Video,
  Timer,
  Mic,
  ChevronLeft,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useBehaviorTracker } from "@/hooks/useBehaviorTracker";

// ===== API base =====
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

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
      "X-User-Email":
        user.primaryEmailAddress?.emailAddress ||
        user.emailAddresses?.[0]?.emailAddress ||
        "",
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
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
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });

          // Cleanup
          try {
            streamRef.current
              ?.getTracks()
              ?.forEach((t) => t.stop());
          } catch { }
          try {
            audioContextRef.current?.close();
          } catch { }
          if (recordingTimerRef.current)
            clearInterval(recordingTimerRef.current);
          if (animationFrameRef.current)
            cancelAnimationFrame(animationFrameRef.current);

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
    const SILENCE_FRAMES = 90; // ~1.5 sec silence allowed
    const VOLUME_THRESHOLD = 12; // more sensitive
    let hasStartedSpeaking = false; // prevents early cutoff

    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((p) => p + 1);
    }, 1000);

    const check = () => {
      if (!analyser) return;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setFrequency(Array.from(dataArray.slice(0, 24)));

      // --- Detect speaking ---
      if (avg > VOLUME_THRESHOLD) {
        silenceCounter = 0;
        if (!isSpeaking) {
          isSpeaking = true;
          hasStartedSpeaking = true;
          onSpeechStart?.();
        }
      } else {
        // silence
        if (isSpeaking) {
          silenceCounter++;
          if (silenceCounter > SILENCE_FRAMES && hasStartedSpeaking) {
            isSpeaking = false;
            onSpeechEnd?.();
            return; // stop detection loop
          }
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
    <div className="flex items-end justify-center gap-1 h-24">
      {frequency.map((freq, idx) => (
        <div
          key={idx}
          className="w-1 bg-gradient-to-t from-purple-500 to-blue-500 rounded-full transition-all duration-75"
          style={{
            height: `${Math.min((freq / 255) * 100, 100)}px`,
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
  const config =
    sessionConfigProp ||
    routeConfig ||
    {
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


  // ==== BEHAVIOR TRACKER ====
  const behavior = useBehaviorTracker(videoRef, showUserVideo);
  const timerIntervalRef = useRef(null);
  const hasFetchedInitialQuestion = useRef(false);

  const {
    startAudioCapture,
    stopAudioCapture,
    detectSpeech,
    frequency,
    recordingTime,
  } = useAutoDetectRecorder();

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
    if (sessionComplete || timeLeft <= 0) return;

    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();
    const preferredVoices = [
      "Microsoft Aria Online (Natural)",
      "Microsoft Jenny",
      "Google UK English Female",
      "Google US English",
      "Microsoft Guy",
    ];

    let selectedVoice =
      voices.find((v) => preferredVoices.includes(v.name)) || voices[0];

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // listening will only really start if session is still active
      setIsListening(true);
      setTimeout(() => startListening(), 400);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Start listening
  const startListening = async () => {
    // 🔒 Guard: don't start recording if session is over or timer done
    if (sessionComplete || timeLeft <= 0) {
      setIsCapturing(false);
      setIsListening(false);
      return;
    }

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
      () => {
        // onSpeechStart (optional UI)
      },
      () => handleSpeechEnd() // onSpeechEnd
    );
  };

  // Handle speech end -> send audio
  // Handle speech end -> send audio
  const handleSpeechEnd = async () => {
    // ⛔ Absolute guard: if session is completed or time is up, do nothing
    if (sessionComplete || timeLeft <= 0) {
      setIsCapturing(false);
      setIsListening(false);
      return;
    }

    setIsCapturing(false);
    setIsListening(false);
    setLoading(true);
    try {
      const audioBlob = await stopAudioCapture();
      if (!audioBlob || audioBlob.size === 0)
        throw new Error("No audio captured");

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
        throw new Error(
          err.detail || `Audio upload failed (${res.status})`
        );
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
  // Terminate interview
  const handleTerminateInterview = async () => {
    try {
      // Mark session as done so no more logic runs
      setSessionComplete(true);

      // 🔇 Kill voice immediately
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        // Some browsers behave better if we pause too
        window.speechSynthesis.pause();
      }

      // 🎙️ Stop any running recorder / mic (even if isCapturing flag is stale)
      try {
        await stopAudioCapture();
      } catch (e) {
        console.warn("stopAudioCapture failed on terminate:", e);
      }

      // ⏱️ Stop timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      // 📷 Turn off camera
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject
          .getTracks()
          .forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      setShowUserVideo(false);

      // 👉 Directly fetch feedback and go to results
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
      console.warn("Terminate save warn:", e);
      navigate("/interviews");
    }
  };

  // Timer
  // Timer
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          setSessionComplete(true);

          // 🛑 Kill voice & audio when time ends
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            window.speechSynthesis.pause();
          }
          stopAudioCapture().catch(() => { });
          setIsCapturing(false);
          setIsListening(false);

          // Turn off camera too for safety
          if (videoRef.current?.srcObject) {
            videoRef.current.srcObject
              .getTracks()
              .forEach((t) => t.stop());
            videoRef.current.srcObject = null;
          }
          setShowUserVideo(false);

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
        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: { width: 180, height: 180 },
          });
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
        formData.append(
          "audio",
          new Blob([], { type: "audio/webm" }),
          "init.webm"
        );
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
        if (!data.text)
          throw new Error("No question received from server");
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
        videoRef.current.srcObject
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  // Skip
  const handleSkipQuestion = async () => {
    window.speechSynthesis?.cancel();
    setIsCapturing(false);
    setIsListening(false);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append(
        "audio",
        new Blob([], { type: "audio/webm" }),
        "skip.webm"
      );
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

  // 🔁 When session completes (timer or AI), automatically show feedback
  useEffect(() => {
    if (!sessionComplete) return;
    const timeout = setTimeout(() => {
      handleViewResults();
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionComplete]);

  // Completed screen (kept, but usually you'll jump to feedback quickly)
  if (sessionComplete) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Top header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-8 py-4">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/dashboard")}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Interview Complete
              </h1>
            </div>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-6 py-10 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 px-8 py-10 max-w-xl w-full text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center shadow-md">
                <svg
                  className="w-12 h-12 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Great job! 🎉
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              You’ve completed this mock interview session.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
              Questions answered:{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {answers.length}
              </span>
            </p>
            <div className="space-y-3">
              <button
                onClick={handleViewResults}
                disabled={loading}
                className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold text-sm hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading Results..." : "View Detailed Feedback"}
              </button>
              <button
                onClick={() => navigate("/interviews")}
                className="w-full px-6 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Back to Interviews
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== ACTIVE SESSION UI (Dashboard-style) =====
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Terminate Confirmation Modal */}
      {showTerminateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500 dark:text-red-300" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
              End Interview?
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 text-center mb-5">
              Are you sure you want to end this interview now? Your
              progress so far will be saved, and feedback will be
              generated.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTerminateModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Continue Interview
              </button>
              <button
                onClick={handleTerminateInterview}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition"
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top header (like Dashboard) */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-8 py-4">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
                Live Interview
              </p>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Interview Session
              </h1>
            </div>
          </div>

          <button
            onClick={() => setShowTerminateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-700 text-red-600 dark:text-red-300 text-xs font-semibold bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition"
          >
            <XCircle className="w-4 h-4" />
            End Interview
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
        {/* Gradient banner (like dashboard hero) */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 md:p-7 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
              Practice in Real-Time
            </h2>
            <p className="text-sm md:text-[13px] text-purple-100">
              Answer questions out loud, let the AI listen, and get
              feedback after the session.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-white/15 text-white font-medium flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" />
                {config.interviewType || "Technical"} Interview
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/15 text-white font-medium flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5" />
                {config.duration || 5} min session
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/15 text-white font-medium flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                Voice-based answers
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div
              className={`px-4 py-2 rounded-xl bg-white/10 border border-white/30 text-right`}
            >
              <p className="text-xs text-purple-100 mb-1">
                Time Remaining
              </p>
              <p
                className={`text-2xl font-mono font-bold ${timeLeft < 60
                  ? "text-amber-200"
                  : "text-emerald-200"
                  }`}
              >
                {formatTime(timeLeft)}
              </p>
            </div>
            <span className="text-[11px] text-purple-100/80">
              Role:{" "}
              <span className="font-semibold">
                {config.role || "Software Developer"}
              </span>
            </span>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3 flex justify-between items-center">
            <p className="text-xs text-red-700 dark:text-red-200">
              {error}
            </p>
            <button
              onClick={() => setError(null)}
              className="text-red-500 dark:text-red-300 text-xs hover:text-red-700 dark:hover:text-red-100"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid md:grid-cols-12 gap-6">
          {/* Left: Main question + audio + history */}
          <div className="md:col-span-8 space-y-5">
            {/* Question card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 md:p-7">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Question {answers.length + 1}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    {questionsRemaining} question
                    {questionsRemaining === 1 ? "" : "s"} remaining
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-medium ${isSpeaking
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300"
                      }`}
                  >
                    {isSpeaking
                      ? "Reading question…"
                      : isCapturing
                        ? "Recording answer…"
                        : "Ready for answer"}
                  </span>
                  {currentConfidence > 0 && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                      Confidence:{" "}
                      {Math.round(currentConfidence * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {loading && !currentQuestion ? (
                <div className="py-10 flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mb-3" />
                  <p className="text-xs text-gray-500 dark:text-gray-300">
                    Loading first question...
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                    {currentQuestion || "Waiting for question..."}
                  </h2>

                  {/* Audio visualization */}
                  <div className="mt-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-6">
                    {isCapturing ? (
                      <div className="flex flex-col items-center">
                        <AudioVisualization frequency={frequency} />
                        <p className="mt-3 text-xs text-gray-700 dark:text-gray-300 font-medium">
                          {isListening
                            ? "Listening… speak clearly into your mic."
                            : "Processing your answer…"}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-28">
                        <Volume2 className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Waiting to start recording. The AI will listen
                          after reading the question.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Recording time */}
                  {isCapturing && (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-xs text-red-700 dark:text-red-200 text-center">
                      Recording:{" "}
                      <span className="font-semibold">
                        {formatTime(recordingTime)}
                      </span>
                    </div>
                  )}

                  {/* Transcript */}
                  {transcript && (
                    <div className="mt-5 bg-purple-50 dark:bg-purple-900/25 border border-purple-200 dark:border-purple-700 rounded-xl px-4 py-3">
                      <p className="text-[11px] font-semibold text-purple-800 dark:text-purple-200 mb-1">
                        Answer captured
                      </p>
                      <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">
                        {transcript}
                      </p>
                    </div>
                  )}

                  {/* Focus slider */}
                  {!isCapturing && transcript && (
                    <div className="mt-5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-4">
                      <label className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-2 block">
                        How focused were you during this answer?
                      </label>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={focusScore}
                          onChange={(e) =>
                            setFocusScore(
                              parseFloat(e.target.value)
                            )
                          }
                          className="flex-1 h-2 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                        <span className="text-xs font-semibold text-purple-600 dark:text-purple-300 min-w-[40px] text-right">
                          {Math.round(focusScore * 100)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button
                      onClick={handleRepeatQuestion}
                      disabled={loading || isSpeaking || isCapturing}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <Volume2 className="w-4 h-4" />
                      Repeat Question
                    </button>
                    <button
                      onClick={handleSkipQuestion}
                      disabled={loading || isSpeaking}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <SkipForward className="w-4 h-4" />
                      Skip Question
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Answer history */}
            {answers.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Answer History
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {answers.length} answered
                  </p>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {answers.map((answer, idx) => (
                    <div
                      key={idx}
                      className="border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/50 hover:border-purple-300 dark:hover:border-purple-600 transition"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                          Q{idx + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200">
                            {formatTime(answer.recordingTime)}
                          </span>
                          {answer.confidence > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                              {Math.round(
                                answer.confidence * 100
                              )}
                              %
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 line-clamp-2">
                        {answer.question}
                      </p>
                      <p className="text-[11px] text-gray-800 dark:text-gray-100 line-clamp-3">
                        {answer.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Session stats + camera */}
          <div className="md:col-span-4 space-y-5">
            {/* Session stats card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Session Stats
              </h3>
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    Questions Answered
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {answers.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    Avg. Confidence
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                    {answers.length > 0
                      ? Math.round(
                        (answers.reduce(
                          (sum, a) =>
                            sum + (a.confidence || 0),
                          0
                        ) /
                          answers.length) *
                        100
                      )
                      : 0}
                    %
                  </span>
                </div>
                <hr className="my-3 border-gray-300 dark:border-gray-700" />

                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Behavior Tracking
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Engagement</span>
                    <span>{(behavior.engagement * 100).toFixed(0)}%</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-500">Looking Away</span>
                    <span>{behavior.lookingAway ? "Yes" : "No"}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-500">Blink Rate</span>
                    <span>{behavior.blinkRate.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-500">Fidget Score</span>
                    <span>{(behavior.fidgetScore * 100).toFixed(0)}%</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Camera card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Camera
                </h3>
                <button
                  onClick={() =>
                    setShowUserVideo((v) => !v)
                  }
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition ${showUserVideo
                    ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"
                    : "bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                    }`}
                >
                  {showUserVideo ? "On" : "Off"}
                </button>
              </div>
              <div className="aspect-video rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-black/80 flex items-center justify-center">
                {showUserVideo ? (
                  <div className="relative w-full h-full">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center px-4">
                    <Video className="w-10 h-10 text-gray-500 mb-2" />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Turn your camera on if you want to
                      practice real interview body language.
                    </p>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10px] text-gray-500 dark:text-gray-400">
                Camera is only used locally in your browser and
                is not uploaded to the server.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewSession;
