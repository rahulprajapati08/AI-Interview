// src/pages/FeedbackPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Download,
  Share2,
  MessageCircle,
  BarChart3,
  Award,
  AlertCircle,
  ChevronDown,
  Loader2,
} from "lucide-react";

import { getFeedback, getInterview } from "../lib/api";
import { TranscriptView } from "../components/TranscriptView"; // FIXED IMPORT

export default function FeedbackPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedSection, setExpandedSection] = useState(null);

  useEffect(() => {
    let mounted = true;

    // 1— If feedback was passed via router state (after interview)
    if (location.state?.feedback) {
      setData(normalize(location.state.feedback));
      setLoading(false);
      return;
    }

    // 2— Otherwise fetch from backend
    const fetchData = async () => {
      try {
        setLoading(true);
        let res;

        if (id) res = await getInterview(id); // Past interview
        else res = await getFeedback(); // Full feedback from active session

        if (!mounted) return;
        setData(normalize(res));
      } catch (err) {
        console.error("Feedback fetch error:", err);
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Unable to load feedback."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => (mounted = false);
  }, [id, location.state?.feedback]);

  // ---------------------------------------------------------
  // Normalizer — ensures feedback works with multiple server shapes
  // ---------------------------------------------------------
  function normalize(p) {
    if (!p) return {};

    const obj = p.data ?? p;

    const out = {
      id: obj._id || obj.id,
      role: obj.role,
      date: obj.date || obj.createdAt,
      interview_duration: obj.duration || obj.interview_duration,
      average_confidence: obj.avg_confidence || obj.average_confidence,
      average_focus: obj.avg_focus || obj.average_focus,
      questions_asked: obj.questions || obj.questions_asked,

      technical: obj.technical || obj.tech || null,
      behavioral: obj.behavioral || obj.hr || null,
      coding: obj.coding || obj.code || null,

      overallFeedback: obj.feedback || null,
      transcript: [],
      raw: obj,
    };

    // transcript array of objects
    if (Array.isArray(obj.transcript)) out.transcript = obj.transcript;

    // transcript as single string
    else if (typeof obj.transcript === "string")
      out.transcript = parseTranscriptString(obj.transcript);

    // conversation history fallback
    else if (Array.isArray(obj.history))
      out.transcript = obj.history.map((h) => ({
        question: h.question,
        answer: h.answer,
      }));

    return out;
  }

  // Parser for "Q: ... A: ..." format
  function parseTranscriptString(str) {
    if (!str) return [];
    const blocks = str.split(/(?=Q:\s*)/g).filter(Boolean);
    return blocks.map((b) => {
      const q = b.match(/Q:\s*(.*?)(?=A:\s*)/s);
      const a = b.match(/A:\s*(.*)/s);
      return {
        question: q ? q[1].trim() : "",
        answer: a ? a[1].trim() : "",
      };
    });
  }

  // ---------------------------------------------------------
  // UI Components
  // ---------------------------------------------------------
  const Stat = ({ label, value, className }) => (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
      <p className="text-gray-600 dark:text-gray-400 text-sm">{label}</p>
      <p
        className={`text-2xl mt-1 font-bold ${
          className || "text-gray-900 dark:text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );

  const ExpandableCard = ({ title, children, icon: Icon }) => {
    const open = expandedSection === title;

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
        <button
          onClick={() => setExpandedSection(open ? null : title)}
          className="w-full flex justify-between items-center px-4 py-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <div className="flex items-center gap-3">
            <Icon className="text-purple-600 dark:text-purple-400" size={18} />
            <span className="font-semibold text-gray-900 dark:text-white">
              {title}
            </span>
          </div>
          <ChevronDown
            className={`text-gray-600 dark:text-gray-300 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {open && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            {children}
          </div>
        )}
      </div>
    );
  };

  const SectionBlock = ({ block }) => {
    if (!block) return <p>No feedback available.</p>;

    return (
      <div className="space-y-4 text-gray-800 dark:text-gray-300">
        <p>{block.feedback || block.summary || "No details"}</p>

        {/* Strengths */}
        {block.strengths && (
          <div>
            <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
              Strengths
            </h4>
            <ul className="space-y-1">
              {block.strengths.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Areas to Improve */}
        {block.areasToImprove && (
          <div>
            <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
              Areas to Improve
            </h4>
            <ul className="space-y-1">
              {block.areasToImprove.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------
  // Page Rendering
  // ---------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Interview Feedback
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Detailed feedback summary
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <Loader2 className="animate-spin h-8 w-8 mx-auto text-purple-600" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Loading feedback…
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-8">
            <div className="inline-flex gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        {!loading && !error && data && (
          <>
            {/* Top Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Stat
                label="Duration"
                value={data.interview_duration || "—"}
              />
              <Stat
                label="Questions"
                value={data.questions_asked || data.transcript.length}
              />
              <Stat
                label="Confidence"
                value={
                  data.average_confidence
                    ? Math.round(data.average_confidence * 100) + "%"
                    : "—"
                }
                className="text-green-600 dark:text-green-400"
              />
              <Stat
                label="Focus"
                value={
                  data.average_focus
                    ? Math.round(data.average_focus * 100) + "%"
                    : "—"
                }
                className="text-blue-600 dark:text-blue-400"
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-gray-200 dark:border-gray-700 mb-6">
              {["overview", "transcript", "details"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-3 font-medium border-b-2 transition ${
                    activeTab === tab
                      ? "border-purple-600 text-purple-600 dark:text-purple-400"
                      : "border-transparent text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {data.technical && (
                  <ExpandableCard
                    title="Technical"
                    icon={BarChart3}
                  >
                    <SectionBlock block={data.technical} />
                  </ExpandableCard>
                )}
                {data.behavioral && (
                  <ExpandableCard
                    title="Behavioral"
                    icon={MessageCircle}
                  >
                    <SectionBlock block={data.behavioral} />
                  </ExpandableCard>
                )}
                {data.coding && (
                  <ExpandableCard title="Coding" icon={Award}>
                    <SectionBlock block={data.coding} />
                  </ExpandableCard>
                )}
              </div>
            )}

            {/* Transcript */}
            {activeTab === "transcript" && (
              <div className="mt-4">
                <TranscriptView transcript={data.transcript} />
              </div>
            )}

            {/* Details */}
            {activeTab === "details" && (
              <div className="text-gray-800 dark:text-gray-300">
                <pre>{JSON.stringify(data.raw, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
