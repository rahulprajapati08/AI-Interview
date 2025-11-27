import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  Clock,
  Code2,
  Users,
  Brain,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

import { setAuthTokenGetter } from "../lib/api";
import { setupInterview, storage } from "../lib/api";

const InterviewSetup = () => {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load last setup from localStorage
  useEffect(() => {
    const lastSetup = storage.getLastSetup();
    setAuthTokenGetter(getToken);
    if (lastSetup) {
      setSelectedRole(lastSetup.role || "");
      setSelectedType(lastSetup.interviewType || "");
      setSelectedDuration(lastSetup.duration || 5);
    }
  }, [getToken]);

  const roles = [
    { id: "frontend developer", name: "Frontend Developer", icon: "⚛️" },
    { id: "backend developer", name: "Backend Developer", icon: "🔧" },
    { id: "full stack developer", name: "Full Stack Developer", icon: "🔗" },
    { id: "devops engineer", name: "DevOps Engineer", icon: "☁️" },
    { id: "data scientist", name: "Data Scientist", icon: "📊" },
    { id: "product manager", name: "Product Manager", icon: "📱" },
  ];

  const interviewTypes = [
    {
      id: "technical",
      name: "Technical Interview",
      description: "Focus on coding and technical problem-solving",
      icon: <Code2 className="w-7 h-7" />,
    },
    {
      id: "behavioral",
      name: "Behavioral Interview",
      description: "HR-focused questions about your experience",
      icon: <Users className="w-7 h-7" />,
    },
    {
      id: "coding",
      name: "Coding Challenge",
      description: "Live coding problems with multiple rounds",
      icon: <Brain className="w-7 h-7" />,
    },
    {
      id: "full",
      name: "Full Interview",
      description: "Complete interview with all rounds",
      icon: <Clock className="w-7 h-7" />,
    },
  ];

  const durations = [3, 5, 10, 15, 20, 30];

  // ================= HANDLE START =================
  const handleStart = async () => {
    if (!isLoaded || !isSignedIn) {
      setError("Please sign in to start an interview");
      return;
    }

    if (!selectedRole || !selectedType || !selectedDuration) {
      setError("Please complete all steps before starting");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const setupData = {
        role: selectedRole,
        interviewType: selectedType,
        duration: selectedDuration,
      };

      console.log("Sending setup data:", setupData);

      const response = await setupInterview(setupData);
      console.log("Interview setup response:", response);

      navigate("/interview-session", {
        state: {
          sessionConfig: {
            ...setupData,
            sessionId: response.session_id,
          },
        },
      });
    } catch (err) {
      console.error("Setup failed:", err);

      let message = "Failed to start interview. Please try again.";

      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        message = detail.map((e) => e.msg).join(", ");
      } else if (typeof detail === "string") {
        message = detail;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ================= ERROR ALERT =================
  const ErrorAlert = () => (
    <div className="max-w-4xl mx-auto mb-6">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-300 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-red-700 dark:text-red-200 font-semibold text-sm">
            Setup Error
          </p>
          <p className="text-red-600 dark:text-red-200 text-xs mt-1">
            {typeof error === "string" ? error : JSON.stringify(error)}
          </p>
        </div>
        <button
          onClick={() => setError(null)}
          className="text-red-500 dark:text-red-300 hover:text-red-700 dark:hover:text-red-100 transition text-sm"
        >
          ✕
        </button>
      </div>
    </div>
  );

  // ================= RENDER =================
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top header (matches Dashboard style) */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-8 py-4">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Interview Setup
          </h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        {/* Gradient banner similar to dashboard hero */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 md:p-8 shadow-md mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
                Prepare for Your Next Interview
              </h2>
              <p className="text-sm md:text-base text-purple-100">
                Choose your role, interview type, and duration. We’ll create a
                tailored mock session for you.
              </p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs text-purple-100 max-w-xs">
              <p className="font-semibold mb-1">Setup Progress</p>
              <p className="mb-1">
                Step {step} of 3 •{" "}
                {step === 1
                  ? "Select your target role"
                  : step === 2
                  ? "Choose interview type"
                  : "Pick duration & review"}
              </p>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-300 to-purple-300"
                  style={{ width: `${(step / 3) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {error && <ErrorAlert />}

        {/* Card wrapper for steps (matches dashboard card look) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 md:p-8">
          {/* Step progress pills (inside card now) */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              {[1, 2, 3].map((s) => (
                <React.Fragment key={s}>
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold mb-1 border transition-all ${
                        step >= s
                          ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                          : "bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      {s}
                    </div>
                    <span
                      className={`text-[11px] font-medium ${
                        step >= s
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {s === 1
                        ? "Select Role"
                        : s === 2
                        ? "Interview Type"
                        : "Duration"}
                    </span>
                  </div>
                  {s < 3 && (
                    <div className="flex-1 flex items-center">
                      <div
                        className={`w-full h-[2px] rounded-full ${
                          step > s
                            ? "bg-purple-500"
                            : "bg-gray-200 dark:bg-gray-700"
                        }`}
                      />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step 1: Role */}
          {step === 1 && (
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-6">
                What is your target role?
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Pick the role closest to the position you are preparing for.
                This helps us ask more relevant questions.
              </p>
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`p-4 rounded-xl border transition-all text-left hover:shadow-sm ${
                      selectedRole === role.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 hover:border-purple-300 dark:hover:border-purple-500/60"
                    }`}
                  >
                    <div className="text-3xl mb-2">{role.icon}</div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      {role.name}
                    </p>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedRole}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Type */}
          {step === 2 && (
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text:white dark:text-white mb-6">
                Choose interview type
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                You can focus on a specific round or simulate a complete process
                with all stages.
              </p>
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {interviewTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`p-4 rounded-xl border transition-all text-left flex gap-3 items-start hover:shadow-sm ${
                      selectedType === type.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 hover:border-purple-300 dark:hover:border-purple-500/60"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        selectedType === type.id
                          ? "bg-purple-600 text-white"
                          : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {type.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-1">
                        {type.name}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        {type.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selectedType}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Duration */}
          {step === 3 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  Select interview duration
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Shorter sessions are great for quick practice. Longer sessions
                  feel closer to a real interview.
                </p>
              </div>

              {/* Duration slider card */}
              <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Duration
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Drag the slider or pick a preset below.
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-500">
                    {selectedDuration} min
                  </p>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  value={selectedDuration}
                  onChange={(e) =>
                    setSelectedDuration(parseInt(e.target.value, 10))
                  }
                  className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                  <span>3 min (Quick warmup)</span>
                  <span>30 min (Full round)</span>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-5">
                  {durations.map((dur) => (
                    <button
                      key={dur}
                      onClick={() => setSelectedDuration(dur)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition ${
                        selectedDuration === dur
                          ? "bg-purple-600 text-white"
                          : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      {dur}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary & tip row */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Summary card */}
                <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Interview Summary
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-gray-500 dark:text-gray-400">
                        Role
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {roles.find((r) => r.id === selectedRole)?.name}
                      </span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-gray-500 dark:text-gray-400">
                        Interview Type
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {interviewTypes.find((t) => t.id === selectedType)?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">
                        Duration
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {selectedDuration} minutes
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tip card */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl p-5">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                    💡 Quick Tip
                  </p>
                  <p className="text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
                    Choose a duration that matches the type of round you’re
                    practicing. For example, 10–15 minutes for quick daily
                    practice, or 20–30 minutes to simulate a real interview
                    round.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="px-5 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleStart}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-7 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm md:text-base font-semibold shadow-sm transition transform hover:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Starting...
                    </>
                  ) : (
                    <>
                      Start Interview
                      <ChevronRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterviewSetup;
