// src/pages/FeedbackPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Download,
  Share2,
  AlertCircle,
  ChevronDown,
  Loader2,
  BarChart3,
  MessageCircle,
} from "lucide-react";

import { getFeedback, getInterview } from "../lib/api";
import { TranscriptView } from "../components/TranscriptView";

export default function FeedbackPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);

        let payload;
        if (id) payload = await getInterview(id);
        else payload = await getFeedback();

        if (!mounted) return;
        setData(normalize(payload));
      } catch (e) {
        setError("Unable to load feedback. Try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => (mounted = false);
  }, [id]);

  // ====================================================================
  // NORMALIZER — Matches your backend EXACTLY
  // ====================================================================
  function normalize(p) {
    const obj = p.data ?? p;

    return {
      id: obj._id,
      date: obj.date,
      role: obj.role,
      mode: obj.mode,

      average_confidence:
        typeof obj.average_confidence === "number"
          ? obj.average_confidence
          : null,

      average_focus:
        typeof obj.average_focus === "number" ? obj.average_focus : null,

      feedback: obj.feedback || null,

      transcript:
        typeof obj.transcript === "string"
          ? parseTranscript(obj.transcript)
          : Array.isArray(obj.transcript)
          ? obj.transcript
          : [],

      raw: obj,
    };
  }

  // Parse Q/A formatted string
  function parseTranscript(str) {
    return str
      .split(/(?=Q:\s*)/g)
      .filter(Boolean)
      .map((block) => {
        const q = block.match(/Q:\s*(.*?)(?=A:\s*)/s);
        const a = block.match(/A:\s*(.*)/s);
        return {
          question: q ? q[1].trim() : "",
          answer: a ? a[1].trim() : "",
        };
      });
  }

  // ====================================================================
  // UI Components
  // ====================================================================

  const Stat = ({ label, value }) => (
    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 shadow-sm">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
        {value}
      </p>
    </div>
  );

  // ====================================================================
  // RENDER
  // ====================================================================

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-6 py-10">
      <div className="max-w-5xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col gap-1 mb-6">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Interview Feedback
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review your AI-generated performance feedback
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-20 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-purple-600" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Loading feedback...
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center py-8">
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-600 px-4 py-3 rounded-lg inline-flex items-center gap-2">
              <AlertCircle className="text-red-700" />
              <span className="text-red-700 dark:text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        {!loading && !error && data && (
          <div className="space-y-10">

            {/* ===================== TOP STATS ===================== */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

              <Stat
                label="Overall Score"
                value={
                  data.feedback
                    ? Math.round((data.feedback.overall) ) + "%"
                    : "--"
                }
              />

              <Stat
                label="Confidence"
                value={
                  typeof data.average_confidence === "number"
                    ? Math.round(data.average_confidence * 100) + "%"
                    : "--"
                }
              />

              <Stat
                label="Focus"
                value={
                  typeof data.average_focus === "number"
                    ? Math.round(data.average_focus * 100) + "%"
                    : "--"
                }
              />

              <Stat label="Questions" value={data.transcript.length} />
            </div>

            {/* ===================== TABS ===================== */}
            <div className="flex gap-6 border-b border-gray-300 dark:border-gray-700">
              {["overview", "transcript", "details"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-3 font-medium border-b-2 transition ${
                    activeTab === tab
                      ? "border-purple-600 text-purple-600 dark:text-purple-400"
                      : "border-transparent text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            {/* ===================== OVERVIEW ===================== */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Unified feedback */}
                <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-6 shadow-sm">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Overall Feedback
                  </h3>

                  <p className="text-gray-800 dark:text-gray-300 mb-4">
                    {data.feedback?.summary}
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.entries(data.feedback)
                      .filter(([k]) => k !== "summary")
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3"
                        >
                          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                            {key}
                          </p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {value} %
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===================== TRANSCRIPT ===================== */}
            {activeTab === "transcript" && (
              <TranscriptView transcript={data.transcript} />
            )}

            {/* ===================== DETAILS ===================== */}
            {activeTab === "details" && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white space-y-3">
                <h3 className="text-xl font-semibold">Interview Details</h3>

                <p><strong>Role:</strong> {data.role}</p>
                <p><strong>Mode:</strong> {data.mode}</p>
                <p><strong>Date:</strong> {new Date(data.date).toLocaleString()}</p>
                <p><strong>Transcript Questions:</strong> {data.transcript.length}</p>
                <p><strong>Overall Score:</strong> {Math.round((data.feedback.overall))}%</p>
                <p><strong>Confidence:</strong> {Math.round(data.average_confidence * 100)}%</p>
                <p><strong>Focus:</strong> {Math.round(data.average_focus * 100)}%</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
