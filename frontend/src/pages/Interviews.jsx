import { Button } from "../components/ui/button";
import {
  Plus,
  Clock,
  Target,
  TrendingUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { getInterviewHistory } from "../lib/api";

export default function Interviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadInterviews();
  }, []);

  useEffect(() => {
    if (location.state?.showFeedback && location.state?.feedback) {
      console.log("Feedback from previous page:", location.state.feedback);
    }
  }, [location.state]);

  const loadInterviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInterviewHistory();
      const sortedData = data.sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
      setInterviews(sortedData);
    } catch (err) {
      console.error("Failed to load interviews:", err);
      setError("Failed to load interview history. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleNewInterview = () => navigate("/setup");
  const handleViewInterview = (id) => navigate(`/interviews/${id}`);

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Convert score (0–5) → percentage (0–100)
  const scoreToPercent = (score) =>
    Math.round((Number(score)));

  const getScoreColor = (percent) => {
    if (percent >= 80) return "text-green-600 dark:text-green-400";
    if (percent >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBgColor = (percent) => {
    if (percent >= 80)
      return "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700";
    if (percent >= 60)
      return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700";
    return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700";
  };

  const getModeDisplay = (mode) => {
    if (!mode) return "Custom Round";
    const m = mode.toLowerCase();
    if (m.includes("full")) return "Full Interview";
    if (m.includes("technical") || m.includes("tech")) return "Technical";
    if (m.includes("behavioral") || m.includes("hr")) return "HR / Behavioral";
    if (m.includes("coding") || m.includes("dsa")) return "Coding Challenge";
    return mode;
  };

  // Dashboard stats card
  const StatsCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 hover:shadow-md dark:hover:shadow-gray-900/50 transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );

  // Calculate dashboard stats
  const stats = {
    total: interviews.length,

    // Average confidence (0–1 -> %)
    avgConfidence:
      interviews.length > 0
        ? Math.round(
            (interviews.reduce(
              (sum, i) => sum + (i.average_confidence || 0),
              0
            ) /
              interviews.length) *
              100
          )
        : 0,

    // Average technical score → based on feedback.overall (0–5)
    avgScore:
      interviews.length > 0
        ? (() => {
            const valid = interviews.filter((i) => i.feedback?.overall);
            if (valid.length === 0) return "N/A";

            const sum = valid.reduce(
              (acc, i) => acc + Number(i.feedback.overall),
              0
            );

            const avg5 = sum / valid.length; // 0–5
            const avgPercent = Math.round((avg5));

            return avgPercent + "%";
          })()
        : "0%",
  };

  // Table: primary score = feedback.overall → %
  const getPrimaryScore = (interview) => {
    if (interview.feedback?.overall) {
      const percent = scoreToPercent(interview.feedback.overall);
      return { label: "Overall", value: percent };
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 shadow-lg flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
            Your Interviews
          </h1>
          <p className="text-sm text-purple-100">
            All your mock interview sessions in one place.
          </p>
        </div>
        <Button
          onClick={handleNewInterview}
          className="bg-white text-purple-700 hover:bg-purple-50 font-medium px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Start New Interview
        </Button>
      </div>

      {/* Stats */}
      {interviews.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatsCard
            icon={Target}
            label="Total Interviews"
            value={stats.total}
            color="bg-blue-600"
          />
          <StatsCard
            icon={TrendingUp}
            label="Avg. Confidence"
            value={`${stats.avgConfidence}%`}
            color="bg-purple-600"
          />
          <StatsCard
            icon={Clock}
            label="Avg. Technical Score"
            value={stats.avgScore}
            color="bg-green-600"
          />
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Interview History
          </h2>
        </div>

        <div className="px-6 py-4">
          {/* Loading */}
          {loading && (
            <div className="py-10 flex flex-col items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 dark:text-purple-400 mb-3" />
              Loading interviews...
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="py-10 flex flex-col items-center">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 flex items-start gap-3 max-w-md">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Error loading interviews
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-200 mt-1">
                    {error}
                  </p>
                </div>
              </div>

              <Button
                onClick={loadInterviews}
                variant="outline"
                className="mt-4 text-sm"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && interviews.length === 0 && (
            <div className="py-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-purple-600 dark:text-purple-300" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                No interviews yet
              </p>
              <Button
                onClick={handleNewInterview}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create First Interview
              </Button>
            </div>
          )}

          {/* Table */}
          {!loading && !error && interviews.length > 0 && (
            <div className="overflow-x-auto -mx-6 mt-2">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <th className="px-6 py-3 text-[11px] text-gray-600 dark:text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-6 py-3 text-[11px] text-gray-600 dark:text-gray-400 uppercase">
                      Role
                    </th>
                    <th className="px-6 py-3 text-[11px] text-gray-600 dark:text-gray-400 uppercase">
                      Mode
                    </th>
                    <th className="px-6 py-3 text-[11px] text-gray-600 dark:text-gray-400 uppercase">
                      Confidence
                    </th>
                    <th className="px-6 py-3 text-[11px] text-gray-600 dark:text-gray-400 uppercase">
                      Score
                    </th>
                    <th className="px-6 py-3 text-[11px] text-gray-600 dark:text-gray-400 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {interviews.map((interview) => {
                    const primary = getPrimaryScore(interview);
                    const conf =
                      typeof interview.average_confidence === "number"
                        ? `${Math.round(interview.average_confidence * 100)}%`
                        : "--";

                    return (
                      <tr
                        key={interview._id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                      >
                        <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-400">
                          {formatDate(interview.date)}
                        </td>

                        <td className="px-6 py-3 text-xs font-medium text-gray-900 dark:text-white">
                          {interview.role}
                        </td>

                        <td className="px-6 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-900/40 text-[11px] text-purple-700 dark:text-purple-300">
                            {getModeDisplay(interview.mode)}
                          </span>
                        </td>

                        <td className="px-6 py-3 text-xs text-gray-800 dark:text-gray-200">
                          {conf}
                        </td>

                        {/* Primary Score column */}
                        <td className="px-6 py-3 text-xs">
                          {primary ? (
                            <div
                              className={`inline-flex flex-col px-2.5 py-1 rounded-lg border ${getScoreBgColor(
                                primary.value
                              )}`}
                            >
                              <span
                                className={`text-sm font-semibold ${getScoreColor(
                                  primary.value
                                )}`}
                              >
                                {primary.value}%
                              </span>
                              <span className="text-[10px] text-gray-600 dark:text-gray-300">
                                {primary.label}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">--</span>
                          )}
                        </td>

                        <td className="px-6 py-3 text-xs">
                          <Button
                            onClick={() => handleViewInterview(interview._id)}
                            variant="outline"
                            size="sm"
                            className="border-gray-200 dark:border-gray-600 text-xs"
                          >
                            View Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {!loading && !error && interviews.length > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
          You have completed{" "}
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {interviews.length}
          </span>{" "}
          interviews. Keep practicing!
        </p>
      )}
    </div>
  );
}
