import {
  getUserProfile,
  getDashboardStats,
  getInterviewHistory,
  getInterview,
} from "../lib/api";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Award,
  Code,
  Calendar,
  Target,
  CheckCircle,
  AlertCircle,
  Eye,
  Bell,
  User,
  Briefcase,
  FolderKanban,
  Brain,
  ChevronLeft,
  ChevronRight,
  X,
  Flame,
  Star,
  Trophy,
  Medal,
} from "lucide-react";

const codingInsights = [
  { name: "Solved", value: 145 },
  { name: "Attempted", value: 35 },
];

// Fallback (used only if no real feedback yet)
const defaultStrengths = [
  "Clear communication",
  "Problem-solving approach",
  "Code optimization",
  "Technical depth",
];

const defaultImprovements = [
  "Time management",
  "Edge case handling",
  "Initial nervousness",
];

const notifications = [
  {
    id: 1,
    type: "achievement",
    message: "You completed 3 interviews this week!",
    icon: Award,
  },
  {
    id: 2,
    type: "update",
    message: "New JavaScript challenges available.",
    icon: Code,
  },
  {
    id: 3,
    type: "tip",
    message: "Try practicing system design questions.",
    icon: Target,
  },
  {
    id: 4,
    type: "achievement",
    message: "Streak of 5 days maintained!",
    icon: TrendingUp,
  },
];

const COLORS = ["#9333ea", "#e9d5ff"];

// =============== BADGE DEFINITIONS (v2 with progress) ===============

const BADGES = [
  // Activity – total interviews
  {
    id: "first_interview",
    name: "First Step",
    category: "Activity",
    icon: Award,
    description: "Complete your first interview.",
    checkUnlocked: ({ totalInterviews }) => totalInterviews >= 1,
    getProgress: ({ totalInterviews }) => ({
      current: Math.min(totalInterviews, 1),
      target: 1,
    }),
  },
  {
    id: "interviews_5",
    name: "Getting Serious",
    category: "Activity",
    icon: Briefcase,
    description: "Complete 5 interviews.",
    checkUnlocked: ({ totalInterviews }) => totalInterviews >= 5,
    getProgress: ({ totalInterviews }) => ({
      current: Math.min(totalInterviews, 5),
      target: 5,
    }),
  },
  {
    id: "interviews_10",
    name: "Dedicated",
    category: "Activity",
    icon: Trophy,
    description: "Complete 10 interviews.",
    checkUnlocked: ({ totalInterviews }) => totalInterviews >= 10,
    getProgress: ({ totalInterviews }) => ({
      current: Math.min(totalInterviews, 10),
      target: 10,
    }),
  },

  // Consistency – streak + weekly interviews
  {
    id: "streak_5",
    name: "On a Roll",
    category: "Consistency",
    icon: Flame,
    description: "Maintain a 5-day streak.",
    checkUnlocked: ({ currentStreak }) => currentStreak >= 5,
    getProgress: ({ currentStreak }) => ({
      current: Math.min(currentStreak, 5),
      target: 5,
    }),
  },
  {
    id: "week_3",
    name: "Warmup Week",
    category: "Consistency",
    icon: Calendar,
    description: "Complete 3 interviews in the last 7 days.",
    checkUnlocked: ({ thisWeekInterviews }) => thisWeekInterviews >= 3,
    getProgress: ({ thisWeekInterviews }) => ({
      current: Math.min(thisWeekInterviews, 3),
      target: 3,
    }),
  },

  // Performance – overall confidence
  {
    id: "conf_60",
    name: "On the Right Track",
    category: "Performance",
    icon: TrendingUp,
    description: "Reach 60% average confidence.",
    checkUnlocked: ({ averageConfidencePercent }) =>
      averageConfidencePercent >= 60,
    getProgress: ({ averageConfidencePercent }) => ({
      current: Math.min(Math.round(averageConfidencePercent || 0), 60),
      target: 60,
    }),
  },
  {
    id: "conf_75",
    name: "Confident Communicator",
    category: "Performance",
    icon: Star,
    description: "Reach 75% average confidence.",
    checkUnlocked: ({ averageConfidencePercent }) =>
      averageConfidencePercent >= 75,
    getProgress: ({ averageConfidencePercent }) => ({
      current: Math.min(Math.round(averageConfidencePercent || 0), 75),
      target: 75,
    }),
  },

  // Category mastery – based on Performance by Category (confidence)
  {
    id: "tech_75",
    name: "Tech Guru",
    category: "Category Mastery",
    icon: Code,
    description: "Reach 75% confidence in Technical interviews.",
    checkUnlocked: ({ categoryConfidence }) =>
      (categoryConfidence["Technical"] || 0) >= 75,
    getProgress: ({ categoryConfidence }) => ({
      current: Math.min(categoryConfidence["Technical"] || 0, 75),
      target: 75,
    }),
  },
  {
    id: "hr_75",
    name: "HR Friendly",
    category: "Category Mastery",
    icon: Medal,
    description: "Reach 75% confidence in HR interviews.",
    checkUnlocked: ({ categoryConfidence }) =>
      (categoryConfidence["HR"] || 0) >= 75,
    getProgress: ({ categoryConfidence }) => ({
      current: Math.min(categoryConfidence["HR"] || 0, 75),
      target: 75,
    }),
  },
];

// ---------- Helpers ----------

function getIntensityClass(count) {
  if (count === 0) return "bg-gray-100 dark:bg-gray-800";
  if (count === 1) return "bg-green-200 dark:bg-green-900/60";
  if (count <= 3) return "bg-green-400 dark:bg-green-700";
  return "bg-green-600 dark:bg-green-500";
}

function buildMonthMatrix(currentMonth) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekDay = firstDay.getDay();

  const cells = [];

  for (let i = 0; i < startWeekDay; i++) {
    cells.push(null);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return weeks;
}

// ✅ Local date key (fixes 23→24 offset issue)
function getLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getBarColor(value) {
  if (!value || value <= 0) return "#6B7280";
  if (value < 50) return "#EF4444";
  if (value < 75) return "#EAB308";
  return "#22C55E";
}

const StatCard = ({ icon: Icon, title, value, subtitle, color }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 hover:shadow-md dark:hover:shadow-gray-900/50 transition-all duration-200">
    <div className="flex items-center gap-3 mb-2">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
        {title}
      </p>
    </div>
    <p className="text-2xl font-bold text-gray-900 dark:text-white ml-11">
      {value}
    </p>
    {subtitle && (
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-11">
        {subtitle}
      </p>
    )}
  </div>
);

export default function Dashboard() {
  const { user, isLoaded } = useApi();
  const [Profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const [expandedInterviewId, setExpandedInterviewId] = useState(null);
  const [interviewDetails, setInterviewDetails] = useState({});
  const [detailsLoadingId, setDetailsLoadingId] = useState(null);
  const [detailsErrorId, setDetailsErrorId] = useState(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [categoryMetric, setCategoryMetric] = useState("confidence");

  const [showResume, setShowResume] = useState(false);

  const [seenBadgeIds, setSeenBadgeIds] = useState([]);
  const [justUnlockedBadges, setJustUnlockedBadges] = useState([]);

  // 🔍 Latest Feedback for "Feedback Insights"
  const [latestFeedback, setLatestFeedback] = useState(null);
  const [latestFeedbackLoading, setLatestFeedbackLoading] = useState(false);
  const [latestFeedbackError, setLatestFeedbackError] = useState(null);

  const navigate = useNavigate();

  // ---------- Aggregations from interviews ----------

  const totalInterviews = interviews.length;

  const averageConfidencePercent = (() => {
    if (!interviews || interviews.length === 0) return "0.0";

    let sum = 0;
    let count = 0;

    for (const interview of interviews) {
      const val =
        interview.average_confidence ?? interview.avg_confidence ?? null;
      if (typeof val === "number") {
        sum += val;
        count += 1;
      }
    }

    if (count === 0) return "0.0";
    const avg = (sum / count) * 100;
    return avg.toFixed(1);
  })();

  const codingAccuracyPercent = "0";

  const performanceByCategoryConfidence = (() => {
    const categories = {
      full: { label: "Full", sum: 0, count: 0 },
      technical: { label: "Technical", sum: 0, count: 0 },
      behavioral: { label: "HR", sum: 0, count: 0 },
      coding: { label: "Coding", sum: 0, count: 0 },
    };

    if (!interviews || interviews.length === 0) {
      return Object.values(categories).map((c) => ({
        category: c.label,
        value: 0,
      }));
    }

    interviews.forEach((iv) => {
      const modeRaw = iv.mode || "";
      const mode = modeRaw.trim().toLowerCase();

      let key = null;
      if (mode.includes("full")) key = "full";
      else if (mode.includes("technical") || mode.includes("tech"))
        key = "technical";
      else if (
        mode.includes("behavioral") ||
        mode.includes("behavioural") ||
        mode.includes("hr")
      )
        key = "behavioral";
      else if (
        mode.includes("coding") ||
        mode.includes("code") ||
        mode.includes("dsa")
      )
        key = "coding";

      if (!key) return;

      const conf =
        typeof iv.average_confidence === "number"
          ? iv.average_confidence
          : typeof iv.avg_confidence === "number"
          ? iv.avg_confidence
          : null;

      if (conf == null) return;

      categories[key].sum += conf;
      categories[key].count += 1;
    });

    return Object.values(categories).map((c) => ({
      category: c.label,
      value: c.count ? Math.round((c.sum / c.count) * 100) : 0,
    }));
  })();

  const performanceByCategoryScore = (() => {
    const categories = {
      full: { label: "Full", sum: 0, count: 0 },
      technical: { label: "Technical", sum: 0, count: 0 },
      behavioral: { label: "HR", sum: 0, count: 0 },
      coding: { label: "Coding", sum: 0, count: 0 },
    };

    if (!interviews || interviews.length === 0) {
      return Object.values(categories).map((c) => ({
        category: c.label,
        value: 0,
      }));
    }

    interviews.forEach((iv) => {
      const modeRaw = iv.mode || "";
      const mode = modeRaw.trim().toLowerCase();

      let key = null;
      if (mode.includes("full")) key = "full";
      else if (mode.includes("technical") || mode.includes("tech"))
        key = "technical";
      else if (
        mode.includes("behavioral") ||
        mode.includes("behavioural") ||
        mode.includes("hr")
      )
        key = "behavioral";
      else if (
        mode.includes("coding") ||
        mode.includes("code") ||
        mode.includes("dsa")
      )
        key = "coding";

      if (!key) return;

      const technicalScore = iv.feedback?.technical?.score;
      const behavioralScore = iv.feedback?.behavioral?.score;
      const codingScore = iv.feedback?.coding?.score;

      const score =
        typeof technicalScore === "number"
          ? technicalScore
          : typeof behavioralScore === "number"
          ? behavioralScore
          : typeof codingScore === "number"
          ? codingScore
          : null;

      if (score == null) return;

      categories[key].sum += score;
      categories[key].count += 1;
    });

    return Object.values(categories).map((c) => ({
      category: c.label,
      value: c.count ? Math.round(c.sum / c.count) : 0,
    }));
  })();

  const performanceByCategoryData =
    categoryMetric === "confidence"
      ? performanceByCategoryConfidence
      : performanceByCategoryScore;

  const bestCategoryInfo = (() => {
    let best = null;
    performanceByCategoryConfidence.forEach((item) => {
      if (item.value > 0 && (!best || item.value > best.value)) {
        best = item;
      }
    });
    return best;
  })();

  const bestCategoryLabel = bestCategoryInfo ? bestCategoryInfo.category : "—";
  const bestCategorySubtitle = bestCategoryInfo
    ? `${bestCategoryInfo.value}% avg confidence`
    : "No data yet";

  const interviewCountByDate = {};
  interviews.forEach((iv) => {
    if (!iv.date) return;
    const d = new Date(iv.date);
    if (isNaN(d.getTime())) return;
    const key = getLocalDateKey(d);
    interviewCountByDate[key] = (interviewCountByDate[key] || 0) + 1;
  });

  const calendarWeeks = buildMonthMatrix(currentMonth);

  const lastInterviewDate = (() => {
    let latest = null;
    interviews.forEach((iv) => {
      if (!iv.date) return;
      const d = new Date(iv.date);
      if (isNaN(d.getTime())) return;
      if (!latest || d > latest) {
        latest = d;
      }
    });
    return latest;
  })();

  const lastActiveLabel = lastInterviewDate
    ? lastInterviewDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No interviews yet";

  const thisWeekInterviews = (() => {
    if (!interviews || interviews.length === 0) return 0;

    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6);

    return interviews.reduce((count, iv) => {
      if (!iv.date) return count;
      const d = new Date(iv.date);
      if (isNaN(d.getTime())) return count;
      if (d >= sevenDaysAgo && d <= now) {
        return count + 1;
      }
      return count;
    }, 0);
  })();

  const currentStreak = (() => {
    if (!interviews || interviews.length === 0) return 0;

    const dateSet = new Set();
    interviews.forEach((iv) => {
      if (!iv.date) return;
      const d = new Date(iv.date);
      if (isNaN(d.getTime())) return;
      const key = getLocalDateKey(d);
      dateSet.add(key);
    });

    const today = new Date();
    let streak = 0;
    let cursor = new Date(today);

    while (true) {
      const key = getLocalDateKey(cursor);
      if (!dateSet.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  })();

  const currentStreakLabel = `${currentStreak} day${
    currentStreak === 1 ? "" : "s"
  }`;

  const confidenceTrendData = (() => {
    if (!interviews || interviews.length === 0) return [];

    const withConf = interviews
      .filter((iv) => iv.date)
      .map((iv) => {
        const raw =
          typeof iv.average_confidence === "number"
            ? iv.average_confidence
            : typeof iv.avg_confidence === "number"
            ? iv.avg_confidence
            : null;
        if (raw == null) return null;
        const d = new Date(iv.date);
        if (isNaN(d.getTime())) return null;
        return { dateObj: d, conf: raw * 100 };
      })
      .filter(Boolean);

    if (withConf.length === 0) return [];

    withConf.sort((a, b) => a.dateObj - b.dateObj);

    return withConf.map((item) => ({
      date: item.dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      score: Number(item.conf.toFixed(1)),
    }));
  })();

  // ---------- Badge Context & Unlock Logic ----------

  const categoryConfidenceMap = (() => {
    const map = {};
    performanceByCategoryConfidence.forEach((item) => {
      map[item.category] = item.value;
    });
    return map;
  })();

  const badgeContext = {
    totalInterviews,
    currentStreak,
    thisWeekInterviews,
    averageConfidencePercent: Number(averageConfidencePercent),
    categoryConfidence: categoryConfidenceMap,
  };

  const unlockedBadges = BADGES.filter((b) => b.checkUnlocked(badgeContext));
  const lockedBadges = BADGES.filter((b) => !b.checkUnlocked(badgeContext));

  // ---------- XP + Level System ----------

  const xpStats = (() => {
    const interviewsXp = totalInterviews * 10;
    const confidenceXp = Math.floor(Number(averageConfidencePercent) || 0);
    const badgesXp = unlockedBadges.length * 15;

    const totalXp = interviewsXp + confidenceXp + badgesXp;
    const level = Math.floor(totalXp / 100) + 1;
    const currentLevelBase = (level - 1) * 100;
    const nextLevelBase = level * 100;
    const xpIntoLevel = totalXp - currentLevelBase;
    const xpForLevel = nextLevelBase - currentLevelBase;
    const progressPercent =
      xpForLevel > 0
        ? Math.min(100, (xpIntoLevel / xpForLevel) * 100)
        : 0;

    return { totalXp, level, xpIntoLevel, xpForLevel, progressPercent };
  })();

  // ---------- New Badge Unlock Toast Logic ----------

  useEffect(() => {
    const currentIds = unlockedBadges.map((b) => b.id);

    if (seenBadgeIds.length === 0) {
      if (currentIds.length > 0) {
        setSeenBadgeIds(currentIds);
      }
      return;
    }

    const newOnes = unlockedBadges.filter(
      (b) => !seenBadgeIds.includes(b.id)
    );
    if (newOnes.length > 0) {
      setJustUnlockedBadges(newOnes);
      setSeenBadgeIds(currentIds);
    }
  }, [unlockedBadges, seenBadgeIds]);

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

  // ---------- Initial data load ----------

  useEffect(() => {
    const fetchData = async () => {
      if (!isLoaded || !user) return;
      try {
        setLoading(true);

        const [profileData, statsDataResp, interviewsData] = await Promise.all(
          [getUserProfile(), getDashboardStats(), getInterviewHistory()]
        );

        setProfile(profileData);
        setStats(statsDataResp);
        setInterviews(interviewsData);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, isLoaded]);

  // 🔍 Fetch latest interview details for Feedback Insights
  useEffect(() => {
    const fetchLatestFeedback = async () => {
      if (!interviews || interviews.length === 0) {
        setLatestFeedback(null);
        return;
      }

      const withDate = interviews.filter((iv) => iv.date);
      if (withDate.length === 0) {
        setLatestFeedback(null);
        return;
      }

      const latest = withDate.reduce((acc, iv) => {
        if (!acc) return iv;
        return new Date(iv.date) > new Date(acc.date) ? iv : acc;
      }, null);

      if (!latest || !latest._id) return;

      try {
        setLatestFeedbackLoading(true);
        setLatestFeedbackError(null);
        const detail = await getInterview(latest._id);
        setLatestFeedback(detail);
      } catch (err) {
        console.error("Error fetching latest feedback:", err);
        setLatestFeedbackError("Unable to load latest feedback.");
      } finally {
        setLatestFeedbackLoading(false);
      }
    };

    fetchLatestFeedback();
  }, [interviews]);

  const handleToggleDetails = async (interviewId) => {
    if (expandedInterviewId === interviewId) {
      setExpandedInterviewId(null);
      return;
    }

    if (!interviewDetails[interviewId]) {
      try {
        setDetailsLoadingId(interviewId);
        setDetailsErrorId(null);
        const detail = await getInterview(interviewId);
        setInterviewDetails((prev) => ({ ...prev, [interviewId]: detail }));
      } catch (err) {
        console.error("Failed to load interview details", err);
        setDetailsErrorId(interviewId);
      } finally {
        setDetailsLoadingId(null);
      }
    }

    setExpandedInterviewId(interviewId);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loading || !Profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const resumeRole = Profile.role || "Aspiring Software Engineer";
  const resumePhone = Profile.phone || "Not provided";
  const resumeLinkedIn = Profile.linkedin || null;
  const resumeGithub = Profile.github || null;
  const resumeCollege = Profile.college || null;
  const resumeDegree = Profile.degree || null;
  const resumeGradYear = Profile.graduationYear || null;
  const resumeAreas =
    Profile.areasOfInterest && Profile.areasOfInterest.length > 0
      ? Profile.areasOfInterest
      : null;
  const resumeTargets =
    Profile.targetCompanies && Profile.targetCompanies.length > 0
      ? Profile.targetCompanies
      : null;
  const resumePreferred =
    Profile.preferredInterviewTypes &&
    Profile.preferredInterviewTypes.length > 0
      ? Profile.preferredInterviewTypes
      : null;

  // 🔍 Build dynamic strengths & improvements from latestFeedback
  const feedbackObj = latestFeedback?.feedback;

  const latestScores = {
    techScore: feedbackObj?.technical?.score,
    behavioralScore: feedbackObj?.behavioral?.score,
    codingScore: feedbackObj?.coding?.score,
    avgConfidence: latestFeedback?.average_confidence,
  };

  const strengthsList = (() => {
    const list = [];

    const addFrom = (val) => {
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach((item) => {
          if (typeof item === "string") list.push(item);
          else if (item && typeof item.text === "string") list.push(item.text);
        });
      } else if (typeof val === "string") {
        list.push(val);
      }
    };

    if (feedbackObj) {
      addFrom(feedbackObj.technical?.strengths);
      addFrom(feedbackObj.behavioral?.strengths);
      addFrom(feedbackObj.coding?.strengths);
      addFrom(feedbackObj.strengths);
      addFrom(feedbackObj.positives);
    }

    // If not enough structured strengths, derive from scores
    const { techScore, behavioralScore, codingScore, avgConfidence } =
      latestScores;

    if (typeof techScore === "number" && techScore >= 70) {
      list.push("Strong technical problem-solving");
    } else if (typeof techScore === "number" && techScore >= 60) {
      list.push("Good technical understanding");
    }

    if (typeof behavioralScore === "number" && behavioralScore >= 70) {
      list.push("Good communication and HR response");
    } else if (typeof behavioralScore === "number" && behavioralScore >= 60) {
      list.push("Solid HR interaction skills");
    }

    if (typeof codingScore === "number" && codingScore >= 70) {
      list.push("Good coding logic and implementation");
    } else if (typeof codingScore === "number" && codingScore >= 60) {
      list.push("Decent coding ability");
    }

    if (typeof avgConfidence === "number" && avgConfidence >= 0.7) {
      list.push("Overall high confidence throughout the interview");
    }

    const unique = Array.from(new Set(list));
    if (unique.length === 0) return defaultStrengths;
    return unique.slice(0, 6);
  })();

  const improvementsList = (() => {
    const list = [];

    const addFrom = (val) => {
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach((item) => {
          if (typeof item === "string") list.push(item);
          else if (item && typeof item.text === "string") list.push(item.text);
        });
      } else if (typeof val === "string") {
        list.push(val);
      }
    };

    if (feedbackObj) {
      addFrom(feedbackObj.technical?.areas_for_improvement);
      addFrom(feedbackObj.behavioral?.areas_for_improvement);
      addFrom(feedbackObj.coding?.areas_for_improvement);
      addFrom(feedbackObj.improvements);
      addFrom(feedbackObj.areas_for_improvement);
      addFrom(feedbackObj.negatives);
    }

    const { techScore, behavioralScore, codingScore, avgConfidence } =
      latestScores;

    if (typeof techScore === "number" && techScore < 60) {
      list.push("Improve technical depth and accuracy");
    }
    if (typeof behavioralScore === "number" && behavioralScore < 60) {
      list.push("Work on communication and clarity");
    }
    if (typeof codingScore === "number" && codingScore < 60) {
      list.push("Practice coding problems and edge cases");
    }
    if (typeof avgConfidence === "number" && avgConfidence < 0.6) {
      list.push("Try to maintain more consistent confidence");
    }

    const unique = Array.from(new Set(list));
    if (unique.length === 0) return defaultImprovements;
    return unique.slice(0, 6);
  })();

  const latestAverageConfidenceLabel =
    latestFeedback?.average_confidence != null
      ? `${(latestFeedback.average_confidence * 100).toFixed(1)}%`
      : null;

  const latestAverageFocusLabel =
    latestFeedback?.average_focus != null
      ? `${(latestFeedback.average_focus * 100).toFixed(1)}%`
      : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-8 py-6">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <button
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm shadow-sm"
            onClick={() => navigate("/setup")}
          >
            Start New Interview
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Advanced User Profile Section */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 mb-8 shadow-lg">
          <div className="flex items-start justify-between">
            {/* Left Side - User Info */}
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center text-purple-600 text-3xl font-bold shadow-xl">
                {Profile.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  {Profile.name}
                </h2>
                <p className="text-purple-100 mb-3">{Profile.email}</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
                    <Briefcase className="w-4 h-4 text-white" />
                    <span className="text-sm text-white font-medium">
                      {Profile.experience} Experience
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
                    <FolderKanban className="w-4 h-4 text-white" />
                    <span className="text-sm text-white font-medium">
                      {Profile.projects} Projects
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Quick Stats + Level */}
            <div className="grid grid-cols-3 gap-4 w-[520px]">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-white" />
                  <p className="text-xs text-purple-100 font-medium">
                    Interviews
                  </p>
                </div>
                <p className="text-3xl font-bold text-white">
                  {totalInterviews}
                </p>
                <p className="text-xs text-purple-100 mt-1">
                  All time interviews completed
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-white" />
                  <p className="text-xs text-purple-100 font-medium">
                    Confidence
                  </p>
                </div>
                <p className="text-3xl font-bold text-white">
                  {averageConfidencePercent}%
                </p>
                <p className="text-xs text-purple-100 mt-1">
                  Avg confidence across interviews
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <Code className="w-5 h-5 text-white" />
                  <p className="text-xs text-purple-100 font-medium">
                    Coding Accuracy
                  </p>
                </div>
                <p className="text-3xl font-bold text-white">
                  {codingAccuracyPercent}%
                </p>
                <p className="text-xs text-purple-100 mt-1">
                  Based on coding data (not available yet)
                </p>
              </div>

              <div className="col-span-3 mt-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-purple-100 font-semibold flex items-center gap-1">
                        <Trophy className="w-4 h-4 text-amber-300" />
                        Level {xpStats.level}
                      </p>
                      <p className="text-[11px] text-purple-100/80 mt-0.5">
                        {xpStats.xpIntoLevel} / {xpStats.xpForLevel} XP to next
                        level
                      </p>
                    </div>
                    <div className="flex-1">
                      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-emerald-300 to-purple-300"
                          style={{
                            width: `${xpStats.progressPercent}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-purple-100/70 mt-1">
                    Interviews, confidence and badges all contribute to your XP.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Skills Section */}
          <div className="mt-6 pt-6 border-t border-white/20">
            <p className="text-sm text-purple-100 font-semibold mb-3">
              Technical Skills
            </p>
            <div className="flex flex-wrap gap-2">
              {Profile.skills.map((skill, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white rounded-lg text-sm font-medium border border-white/30 hover:bg-white/30 transition-colors"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Left Column - Main Content */}
          <div className="flex-1 space-y-8">
            <div className="grid grid-cols-4 gap-5">
              <StatCard
                icon={Award}
                title="Best Category"
                value={bestCategoryLabel}
                subtitle={bestCategorySubtitle}
                color="bg-purple-600"
              />
              <StatCard
                icon={Target}
                title="Current Streak"
                value={currentStreakLabel}
                subtitle="Daily interview streak"
                color="bg-blue-600"
              />
              <StatCard
                icon={Briefcase}
                title="This Week"
                value={thisWeekInterviews}
                subtitle="Interviews in last 7 days"
                color="bg-teal-600"
              />
              <StatCard
                icon={Calendar}
                title="Last Active"
                value={lastActiveLabel}
                subtitle="Last interview date"
                color="bg-cyan-600"
              />
            </div>

            {/* Performance Analytics */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Performance Analytics
              </h2>
              <div className="grid grid-cols-2 gap-5">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Confidence Score Trend
                  </h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={confidenceTrendData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#374151"
                        className="dark:opacity-20"
                      />
                      <XAxis
                        dataKey="date"
                        stroke="#9CA3AF"
                        style={{ fontSize: "11px" }}
                        tick={{ fill: "#6B7280" }}
                      />
                      <YAxis
                        stroke="#9CA3AF"
                        style={{ fontSize: "11px" }}
                        tick={{ fill: "#6B7280" }}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "Confidence"]}
                        contentStyle={{
                          backgroundColor: "#1f2937",
                          border: "1px solid #374151",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "#fff",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#9333ea"
                        strokeWidth={2.5}
                        dot={{ fill: "#9333ea", r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  {confidenceTrendData.length === 0 && (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      No confidence data available yet.
                    </p>
                  )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Performance by Category
                    </h3>
                    <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-900 p-1">
                      <button
                        onClick={() => setCategoryMetric("confidence")}
                        className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                          categoryMetric === "confidence"
                            ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-300 shadow-sm"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        Avg Confidence
                      </button>
                      <button
                        onClick={() => setCategoryMetric("score")}
                        className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                          categoryMetric === "score"
                            ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-300 shadow-sm"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        Avg Score
                      </button>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={performanceByCategoryData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#374151"
                        className="dark:opacity-20"
                      />
                      <XAxis
                        dataKey="category"
                        stroke="#9CA3AF"
                        style={{ fontSize: "11px" }}
                        tick={{ fill: "#6B7280" }}
                      />
                      <YAxis
                        stroke="#9CA3AF"
                        style={{ fontSize: "11px" }}
                        tick={{ fill: "#6B7280" }}
                      />
                      <Tooltip
                        formatter={(value) => [
                          `${value}%`,
                          categoryMetric === "confidence"
                            ? "Avg Confidence"
                            : "Avg Score",
                        ]}
                        contentStyle={{
                          backgroundColor: "#1f2937",
                          border: "1px solid #374151",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {performanceByCategoryData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getBarColor(entry.value)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Coding Practice Insights */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Coding Practice Insights
              </h2>
              <div className="grid grid-cols-2 gap-5">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Problems Solved vs Attempted
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={codingInsights}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {codingInsights.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1f2937",
                          border: "1px solid #374151",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "#fff",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-4 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-600"></div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Solved: 145
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-200 dark:bg-purple-800"></div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Remaining: 35
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Common Mistakes
                  </h3>
                  <ul className="space-y-3">
                    {defaultImprovements.map((mistake, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-300"
                      >
                        <AlertCircle className="w-4 h-4 mt-0.5 text-orange-500 dark:text-orange-400 flex-shrink-0" />
                        <span className="leading-relaxed">{mistake}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Achievements & Badges */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Achievements & Badges
                <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {unlockedBadges.length} / {BADGES.length} unlocked
                </span>
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    Unlocked Badges
                  </p>
                  {unlockedBadges.length === 0 ? (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      No badges unlocked yet. Complete interviews and build your
                      streak to start earning rewards.
                    </p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {unlockedBadges.map((badge) => {
                        const Icon = badge.icon;
                        return (
                          <div
                            key={badge.id}
                            className="flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2.5"
                          >
                            <div className="mt-0.5">
                              <Icon className="w-4 h-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                                {badge.name}
                              </p>
                              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                                {badge.description}
                              </p>
                              <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded-full bg-green-600/10 text-[10px] font-medium text-green-700 dark:text-green-300">
                                Unlocked
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {lockedBadges.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                      <LockIcon className="w-3.5 h-3.5 text-gray-400" />
                      Locked Badges
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {lockedBadges.map((badge) => {
                        const Icon = badge.icon;
                        const progress = badge.getProgress
                          ? badge.getProgress(badgeContext)
                          : null;
                        const progressPercent =
                          progress && progress.target > 0
                            ? Math.min(
                                100,
                                (progress.current / progress.target) * 100
                              )
                            : 0;

                        return (
                          <div
                            key={badge.id}
                            className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 opacity-90"
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5">
                                <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                  {badge.name}
                                </p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                                  {badge.description}
                                </p>
                                <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded-full bg-gray-200/60 dark:bg-gray-800 text-[10px] font-medium text-gray-700 dark:text-gray-300">
                                  Locked
                                </span>
                              </div>
                            </div>
                            {progress && (
                              <div className="pl-7">
                                <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                                  <div
                                    className="h-1.5 rounded-full bg-purple-400 dark:bg-purple-500"
                                    style={{
                                      width: `${progressPercent}%`,
                                    }}
                                  />
                                </div>
                                <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                                  Progress: {progress.current} /{" "}
                                  {progress.target}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interview History */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Interview History
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Mode
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Score
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {interviews.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400 text-center"
                          >
                            No interviews found yet.
                          </td>
                        </tr>
                      ) : (
                        interviews.map((interview) => {
                          const technicalScore =
                            interview.feedback?.technical?.score;
                          const behavioralScore =
                            interview.feedback?.behavioral?.score;
                          const codingScore =
                            interview.feedback?.coding?.score;

                          const score =
                            typeof technicalScore === "number"
                              ? technicalScore
                              : typeof behavioralScore === "number"
                              ? behavioralScore
                              : typeof codingScore === "number"
                              ? codingScore
                              : null;

                          const isExpanded =
                            expandedInterviewId === interview._id;
                          const details = interviewDetails[interview._id];

                          return [
                            <tr
                              key={`${interview._id}-main`}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                {formatDate(interview.date)}
                              </td>
                              <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                {interview.role}
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md text-xs font-medium">
                                  {interview.mode || "Custom"}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                                {score !== null ? score : "--"}
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-xs font-medium">
                                  Completed
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() =>
                                    handleToggleDetails(interview._id)
                                  }
                                  className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 text-sm font-medium transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  {isExpanded ? "Hide details" : "View details"}
                                </button>
                              </td>
                            </tr>,
                            isExpanded && (
                              <tr key={`${interview._id}-details`}>
                                <td colSpan={6} className="px-6 pb-6">
                                  <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
                                    {detailsLoadingId === interview._id && (
                                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>
                                          Loading interview details...
                                        </span>
                                      </div>
                                    )}

                                    {detailsErrorId === interview._id && (
                                      <p className="text-xs text-red-500">
                                        Could not load details. Please try
                                        again.
                                      </p>
                                    )}

                                    {details &&
                                      detailsLoadingId !== interview._id &&
                                      !detailsErrorId && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                          <div className="space-y-2">
                                            <p className="font-semibold text-gray-900 dark:text-white">
                                              Overview
                                            </p>
                                            <div className="space-y-1 text-gray-600 dark:text-gray-300">
                                              <p>
                                                <span className="font-medium">
                                                  Role:
                                                </span>{" "}
                                                {details.role || interview.role}
                                              </p>
                                              <p>
                                                <span className="font-medium">
                                                  Mode:
                                                </span>{" "}
                                                {details.mode ||
                                                  interview.mode ||
                                                  "Custom"}
                                              </p>
                                              <p>
                                                <span className="font-medium">
                                                  Date:
                                                </span>{" "}
                                                {formatDate(
                                                  details.date ||
                                                    interview.date
                                                )}
                                              </p>
                                              <p>
                                                <span className="font-medium">
                                                  Avg. Confidence:
                                                </span>{" "}
                                                {details.average_confidence !=
                                                null
                                                  ? `${(
                                                      details.average_confidence *
                                                      100
                                                    ).toFixed(1)}%`
                                                  : "--"}
                                              </p>
                                              <p>
                                                <span className="font-medium">
                                                  Avg. Focus:
                                                </span>{" "}
                                                {details.average_focus != null
                                                  ? `${(
                                                      details.average_focus *
                                                      100
                                                    ).toFixed(1)}%`
                                                  : "--"}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="space-y-2">
                                            <p className="font-semibold text-gray-900 dark:text-white">
                                              Feedback Snapshot
                                            </p>
                                            <div className="space-y-1 text-gray-600 dark:text-gray-300">
                                              <p>
                                                <span className="font-medium">
                                                  Technical score:
                                                </span>{" "}
                                                {details.feedback?.technical
                                                  ?.score ??
                                                  score ??
                                                  "--"}
                                              </p>
                                              <p>
                                                <span className="font-medium">
                                                  Behavioral score:
                                                </span>{" "}
                                                {details.feedback?.behavioral
                                                  ?.score ?? "--"}
                                              </p>
                                              <p>
                                                <span className="font-medium">
                                                  Coding score:
                                                </span>{" "}
                                                {details.feedback?.coding
                                                  ?.score ?? "--"}
                                              </p>
                                              {details.feedback?.technical
                                                ?.summary && (
                                                <p className="mt-1">
                                                  <span className="font-medium">
                                                    Technical summary:
                                                  </span>{" "}
                                                  {
                                                    details.feedback.technical
                                                      .summary
                                                  }
                                                </p>
                                              )}
                                            </div>

                                            <button
                                              onClick={() =>
                                                navigate(
                                                  `/interviews/${interview._id}`
                                                )
                                              }
                                              className="mt-3 inline-flex items-center gap-1.5 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 text-xs font-medium"
                                            >
                                              <Eye className="w-3 h-3" />
                                              Open full report
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                </td>
                              </tr>
                            ),
                          ];
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="w-[400px] space-y-6">
            {/* Profile Snapshot */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Profile Snapshot
                </h3>
                <button
                  onClick={() => setShowResume(true)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 shadow-sm transition-colors"
                >
                  Resume
                </button>
              </div>
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-md">
                  {Profile.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {Profile.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {Profile.email}
                  </p>
                  {Profile.role && (
                    <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">
                      {Profile.role}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2.5">
                    Skills
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Profile.skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center justify-between">
                    <span>Badges</span>
                    <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                      {unlockedBadges.length} / {BADGES.length} unlocked
                    </span>
                  </p>
                  {unlockedBadges.length === 0 ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Start practicing interviews to earn your first badge.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {unlockedBadges.slice(0, 4).map((badge) => {
                        const Icon = badge.icon;
                        return (
                          <span
                            key={badge.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[11px] font-medium"
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {badge.name}
                          </span>
                        );
                      })}
                      {unlockedBadges.length > 4 && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          +{unlockedBadges.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Briefcase className="w-4 h-4" />
                      <span>Experience</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">
                      {Profile.experience}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <FolderKanban className="w-4 h-4" />
                      <span>Projects</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">
                      {Profile.projects}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interview Activity Calendar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Interview Activity
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </button>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-[90px] text-center">
                    {monthLabel}
                  </span>
                  <button
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </button>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <div className="flex gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                  {weekdayLabels.map((day) => (
                    <span key={day} className="w-7 text-center">
                      {day}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                {calendarWeeks.map((week, wIdx) => (
                  <div key={wIdx} className="flex gap-1">
                    {week.map((day, dIdx) => {
                      if (!day) {
                        return (
                          <div
                            key={`empty-${wIdx}-${dIdx}`}
                            className="w-7 h-7 rounded-md bg-transparent"
                          />
                        );
                      }

                      const key = getLocalDateKey(day);
                      const count = interviewCountByDate[key] || 0;
                      const labelDate = day.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      });

                      return (
                        <div
                          key={key}
                          className={`w-7 h-7 rounded-md border border-gray-100 dark:border-gray-700 flex items-center justify-center text-xs ${
                            count > 0
                              ? getIntensityClass(count) + " text-white"
                              : "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
                          }`}
                          title={`${count} interview${
                            count === 1 ? "" : "s"
                          } on ${labelDate}`}
                        >
                          {day.getDate()}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span>Less</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800" />
                  <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/60" />
                  <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700" />
                  <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500" />
                </div>
                <span>More</span>
              </div>
            </div>

            {/* 🔍 Feedback Insights – REAL & DYNAMIC */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Feedback Insights
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {latestFeedback
                    ? "Based on your latest interview"
                    : "Waiting for your first interview"}
                </p>
              </div>

              {(latestAverageConfidenceLabel || latestAverageFocusLabel) && (
                <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="border border-purple-100 dark:border-purple-900/40 rounded-lg px-3 py-2 bg-purple-50/60 dark:bg-purple-900/20">
                    <p className="text-[11px] font-semibold text-purple-800 dark:text-purple-200">
                      Avg Confidence
                    </p>
                    <p className="text-sm font-bold text-purple-900 dark:text-purple-100 mt-0.5">
                      {latestAverageConfidenceLabel || "--"}
                    </p>
                  </div>
                  <div className="border border-blue-100 dark:border-blue-900/40 rounded-lg px-3 py-2 bg-blue-50/60 dark:bg-blue-900/20">
                    <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-200">
                      Avg Focus
                    </p>
                    <p className="text-sm font-bold text-blue-900 dark:text-blue-100 mt-0.5">
                      {latestAverageFocusLabel || "--"}
                    </p>
                  </div>
                </div>
              )}

              {latestFeedbackLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading latest feedback...</span>
                </div>
              )}

              {latestFeedbackError && (
                <p className="text-xs text-red-500 mb-3">
                  {latestFeedbackError}
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">
                      Strengths
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {strengthsList.map((strength, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-xs font-medium"
                      >
                        {strength}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">
                      Areas for Improvement
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {improvementsList.map((improvement, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-md text-xs font-medium"
                      >
                        {improvement}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-800/30 mt-4">
                  <div className="flex items-start gap-2">
                    <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-purple-900 dark:text-purple-300 mb-1">
                        AI Insight
                      </p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                        {feedbackObj?.overall_summary
                          ? feedbackObj.overall_summary
                          : "Your recent interview performance shows specific strengths and some focus areas. Use these insights to target your next practice session and keep improving step by step."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notifications & Updates */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Updates & Notifications
              </h3>
              <div className="space-y-3">
                {notifications.map((notif) => {
                  const Icon = notif.icon;
                  return (
                    <div
                      key={notif.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="p-1.5 bg-purple-100 dark:bg-purple-900/50 rounded-lg mt-0.5">
                        <Icon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed flex-1">
                        {notif.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* "New Badge Unlocked" Toast */}
      {justUnlockedBadges.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40">
          <div className="bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-700 rounded-xl shadow-lg px-4 py-3 max-w-xs">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-full bg-purple-100 dark:bg-purple-900/40">
                <Trophy className="w-4 h-4 text-purple-600 dark:text-purple-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-900 dark:text-white">
                  New badge unlocked!
                </p>
                <ul className="mt-1 space-y-0.5">
                  {justUnlockedBadges.map((b) => (
                    <li
                      key={b.id}
                      className="text-[11px] text-gray-700 dark:text-gray-300"
                    >
                      <span className="font-medium">{b.name}</span>{" "}
                      <span className="text-gray-500 dark:text-gray-400">
                        – {b.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setJustUnlockedBadges([])}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume Modal */}
      {showResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-xs font-semibold text-purple-600 dark:text-purple-300 uppercase tracking-wide">
                  Resume Preview
                </p>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {Profile.name}
                </h2>
              </div>
              <button
                onClick={() => setShowResume(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {Profile.name}
                  </h1>
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mt-1">
                    {resumeRole}
                  </p>
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1 text-right">
                  <p>{Profile.email}</p>
                  <p>{resumePhone}</p>
                  {resumeLinkedIn && (
                    <p className="truncate">
                      LinkedIn:{" "}
                      <span className="text-purple-600 dark:text-purple-300">
                        {resumeLinkedIn}
                      </span>
                    </p>
                  )}
                  {resumeGithub && (
                    <p className="truncate">
                      GitHub:{" "}
                      <span className="text-purple-600 dark:text-purple-300">
                        {resumeGithub}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {(resumeCollege || resumeDegree || resumeGradYear) && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Education
                  </h3>
                  <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3.5">
                    <p className="text-sm font-semibold text-gray-900 dark:text:white dark:text-white">
                      {resumeDegree || "Degree"}
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                      {resumeCollege}
                    </p>
                    {resumeGradYear && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Graduation Year: {resumeGradYear}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {Profile.skills && Profile.skills.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Skills
                  </h3>
                  <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {Profile.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md text-xs font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {resumeAreas && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Areas of Interest
                  </h3>
                  <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {resumeAreas.map((area, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {resumeTargets && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Target Companies
                  </h3>
                  <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {resumeTargets.map((company, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-xs font-medium"
                        >
                          {company}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {resumePreferred && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Preferred Interview Types
                  </h3>
                  <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {resumePreferred.map((type, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-md text-xs font-medium"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Summary
                </h3>
                <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3.5">
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                    Passionate {resumeRole.toLowerCase()} with{" "}
                    {Profile.experience || "relevant"} experience and{" "}
                    {Profile.projects
                      ? `${Profile.projects} completed projects`
                      : "hands-on project work"}
                    . Actively preparing through mock interviews to improve
                    confidence, communication, and problem-solving skills for
                    roles at{" "}
                    {resumeTargets
                      ? resumeTargets.slice(0, 3).join(", ")
                      : "top tech companies"}
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple lock icon using SVG */
function LockIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M7 10V8a5 5 0 0110 0v2h1a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1h1zm2 0h6V8a3 3 0 00-6 0v2z"
        fill="currentColor"
      />
    </svg>
  );
}
