import { AppState, AttemptLog, SurveyResponse, TaskProgressRecord } from '../types';

export interface SyncResponse {
  success: boolean;
  appState: AppState;
  logData: AttemptLog[];
  surveys?: SurveyResponse[];
  lastUpdated?: string;
  error?: string;
}

// Generate unique signature for log deduplication
export function getLogSignature(log: AttemptLog): string {
  if (log.id && log.id.trim()) {
    return log.id.trim();
  }
  return `${log.ts}_${log.phase}_${log.team}_${log.player}_${log.questionNumber}_${log.prompt?.slice(0, 20)}`;
}

// Merge logs deduplicated
export function mergeLogs(existing: AttemptLog[], incoming: AttemptLog[]): AttemptLog[] {
  const map = new Map<string, AttemptLog>();
  for (const log of existing) {
    map.set(getLogSignature(log), log);
  }
  for (const log of incoming) {
    if (log && log.team && log.phase) {
      const key = getLogSignature(log);
      if (!map.has(key)) {
        map.set(key, log);
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
}

// Merge completedToday from two sources (union of sets)
export function mergeCompletedToday(
  a: Record<string, number[]>,
  b: Record<string, number[]>
): Record<string, number[]> {
  const result: Record<string, number[]> = { ...(a || {}) };
  for (const [phaseKey, doneList] of Object.entries(b || {})) {
    const prevList = result[phaseKey] || [];
    result[phaseKey] = Array.from(new Set([...prevList, ...(Array.isArray(doneList) ? doneList : [])]));
  }
  return result;
}

// Fetch current cloud state
export async function fetchCloudSync(): Promise<SyncResponse | null> {
  try {
    const res = await fetch('/api/sync', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

// Push local updates to cloud server
export async function pushCloudSync(payload: {
  clientState?: Partial<AppState>;
  newLogs?: AttemptLog[];
  logData?: AttemptLog[];
  surveys?: SurveyResponse[];
  newSurveys?: SurveyResponse[];
  taskProgress?: Record<string, Record<string, TaskProgressRecord>>;
  isDelete?: boolean;
}): Promise<SyncResponse | null> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

// Reset cloud database (e.g. from teacher panel)
export async function resetCloudDatabase(appState: AppState, logData: AttemptLog[]): Promise<SyncResponse | null> {
  try {
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ appState, logData }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Subscribe to Live Server-Sent Events (SSE) Stream
export function subscribeToLiveSync(
  onSync: (data: SyncResponse) => void,
  onStatusChange?: (isConnected: boolean) => void
): () => void {
  let eventSource: EventSource | null = null;
  let retryTimer: any = null;
  let isClosed = false;

  const connect = () => {
    if (isClosed) return;
    try {
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        onStatusChange?.(true);
      };

      eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && (parsed.type === 'sync' || parsed.type === 'init')) {
            onSync({
              success: true,
              appState: parsed.appState,
              logData: parsed.logData || [],
              surveys: parsed.appState?.surveyResponses || [],
              lastUpdated: parsed.lastUpdated,
            });
          }
        } catch {
          // ignore keepalive comments or non-JSON
        }
      };

      eventSource.onerror = () => {
        onStatusChange?.(false);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    } catch {
      onStatusChange?.(false);
      if (!isClosed) {
        retryTimer = setTimeout(connect, 4000);
      }
    }
  };

  connect();

  return () => {
    isClosed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    onStatusChange?.(false);
  };
}

// Format duration helper
export function formatDurationSeconds(seconds: number | undefined | null): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

export interface GroupTaskSpeedAnalysis {
  teamIndex: number;
  teamName: string;
  color: string;
  status: 'completed' | 'in_progress' | 'not_started';
  isDone: boolean;
  completionOrder: number | null; // 1 = 1st to finish, 2 = 2nd, etc.
  completedAtFormatted: string | null;
  completedAtTimestamp: number | null;
  durationSeconds: number | null;
  durationFormatted: string;
  speedRank: number | null; // 1 = fastest duration, 2 = 2nd, etc.
  isFastest: boolean;
  secondsBehindFastest: number | null;
  currentQuestion: number;
  totalQuestions: number;
  progressPct: number;
  correctAnswers: number;
  totalAttempts: number;
  accuracy: number;
  paceSecondsPerItem: number | null;
  paceFormatted: string;
  speedBadge: string;
  lastActiveTimeAgo: string;
}

export interface TaskSpeedComparisonResult {
  phaseKey: string;
  phaseLabel: string;
  totalQuestions: number;
  teams: GroupTaskSpeedAnalysis[];
  fastestTeam: GroupTaskSpeedAnalysis | null;
  firstFinishedTeam: GroupTaskSpeedAnalysis | null;
  highestAccuracyTeam: GroupTaskSpeedAnalysis | null;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  allCompleted: boolean;
}

// Advanced computation function to determine which group is faster and done to a certain task
export function analyzeTaskSpeedAndDone(
  phaseKey: string,
  phaseLabel: string,
  totalQuestions: number,
  appState: AppState,
  logData: AttemptLog[],
  groupColors: string[]
): TaskSpeedComparisonResult {
  const completedTeamIndices = appState.completedToday[phaseKey] || [];
  const storedTaskProgress = appState.taskProgress?.[phaseKey] || {};

  const teamAnalyses: GroupTaskSpeedAnalysis[] = appState.groups.map((group, gIdx) => {
    const color = groupColors[gIdx % groupColors.length];
    const teamLogs = logData
      .filter((l) => l.team === group.name && l.phase === phaseKey)
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    const isMarkedDone = completedTeamIndices.includes(gIdx);
    const stored = storedTaskProgress[group.name];

    // Determine status
    let isDone = isMarkedDone || (stored?.status === 'completed') || (teamLogs.length >= totalQuestions && totalQuestions > 0);
    const hasStarted = teamLogs.length > 0 || (stored && stored.currentQuestionIndex > 0);
    const status: 'completed' | 'in_progress' | 'not_started' = isDone
      ? 'completed'
      : hasStarted
      ? 'in_progress'
      : 'not_started';

    // Questions answered
    const currentQuestion = isDone
      ? totalQuestions
      : Math.min(
          totalQuestions,
          Math.max(
            stored?.currentQuestionIndex || 0,
            teamLogs.reduce((max, l) => Math.max(max, l.questionNumber || 0), 0)
          )
        );

    const progressPct = totalQuestions > 0 ? Math.min(100, Math.round((currentQuestion / totalQuestions) * 100)) : 0;

    // Accuracy & score
    const correctAnswers = teamLogs.filter((l) => l.correct).length || (stored?.correctAnswers || 0);
    const totalAttempts = teamLogs.length || (stored?.totalAttempts || currentQuestion);
    const accuracy = totalAttempts > 0 ? Math.round((correctAnswers / totalAttempts) * 100) : (stored?.accuracy || 0);

    // Timing calculation
    let startedAtMs: number | null = null;
    let completedAtMs: number | null = null;

    if (stored?.startedAt) {
      startedAtMs = new Date(stored.startedAt).getTime();
    } else if (teamLogs.length > 0) {
      startedAtMs = new Date(teamLogs[0].ts).getTime();
    }

    if (isDone) {
      if (stored?.completedAt) {
        completedAtMs = new Date(stored.completedAt).getTime();
      } else if (teamLogs.length > 0) {
        completedAtMs = new Date(teamLogs[teamLogs.length - 1].ts).getTime();
      } else if (startedAtMs) {
        completedAtMs = startedAtMs + 60000; // fallback reasonable estimate
      }
    }

    let durationSeconds: number | null = null;
    if (stored?.durationSeconds && stored.durationSeconds > 0) {
      durationSeconds = stored.durationSeconds;
    } else if (startedAtMs && completedAtMs && completedAtMs >= startedAtMs) {
      durationSeconds = Math.max(1, Math.round((completedAtMs - startedAtMs) / 1000));
    } else if (status === 'in_progress' && startedAtMs) {
      durationSeconds = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000));
    }

    // Pace calculation (seconds per question)
    let paceSecondsPerItem: number | null = null;
    if (durationSeconds && currentQuestion > 0) {
      paceSecondsPerItem = +(durationSeconds / currentQuestion).toFixed(1);
    }

    const durationFormatted = formatDurationSeconds(durationSeconds);
    const paceFormatted = paceSecondsPerItem ? `${paceSecondsPerItem}s / item` : '--';

    let speedBadge = '⏱️ Pending';
    if (isDone && paceSecondsPerItem) {
      if (paceSecondsPerItem <= 8) speedBadge = '⚡ Lightning Sprint';
      else if (paceSecondsPerItem <= 14) speedBadge = '🚀 Fast Relay';
      else if (paceSecondsPerItem <= 22) speedBadge = '🏃 Steady Pace';
      else speedBadge = '🧠 Deliberate Finish';
    } else if (status === 'in_progress') {
      speedBadge = '🏃 Sprinting Now...';
    } else {
      speedBadge = '⏳ Waiting at Starting Line';
    }

    const completedAtFormatted = completedAtMs
      ? new Date(completedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : null;

    // Last active time ago
    const lastTs = teamLogs.length > 0 ? teamLogs[teamLogs.length - 1].ts : stored?.lastActiveTs;
    let lastActiveTimeAgo = 'No activity';
    if (lastTs) {
      const diffSec = Math.round((Date.now() - new Date(lastTs).getTime()) / 1000);
      if (diffSec < 10) lastActiveTimeAgo = 'Just now';
      else if (diffSec < 60) lastActiveTimeAgo = `${diffSec}s ago`;
      else lastActiveTimeAgo = `${Math.floor(diffSec / 60)}m ago`;
    }

    return {
      teamIndex: gIdx,
      teamName: group.name,
      color,
      status,
      isDone,
      completionOrder: null, // to be populated below
      completedAtFormatted,
      completedAtTimestamp: completedAtMs,
      durationSeconds,
      durationFormatted,
      speedRank: null, // to be populated below
      isFastest: false,
      secondsBehindFastest: null,
      currentQuestion,
      totalQuestions,
      progressPct,
      correctAnswers,
      totalAttempts,
      accuracy,
      paceSecondsPerItem,
      paceFormatted,
      speedBadge,
      lastActiveTimeAgo,
    };
  });

  // Calculate completion order (who finished 1st, 2nd, etc. in real time)
  const doneTeams = teamAnalyses.filter((t) => t.isDone && t.completedAtTimestamp !== null);
  doneTeams.sort((a, b) => (a.completedAtTimestamp || 0) - (b.completedAtTimestamp || 0));
  doneTeams.forEach((t, idx) => {
    t.completionOrder = idx + 1;
  });

  // Calculate speed rank (fastest duration)
  const timedTeams = teamAnalyses.filter(
    (t) => t.isDone && typeof t.durationSeconds === 'number' && t.durationSeconds > 0
  );
  timedTeams.sort((a, b) => (a.durationSeconds || 0) - (b.durationSeconds || 0));
  timedTeams.forEach((t, idx) => {
    t.speedRank = idx + 1;
    if (idx === 0) {
      t.isFastest = true;
      t.secondsBehindFastest = 0;
    } else {
      const fastestSec = timedTeams[0].durationSeconds || 0;
      t.secondsBehindFastest = Math.max(0, (t.durationSeconds || 0) - fastestSec);
    }
  });

  const fastestTeam = timedTeams.length > 0 ? timedTeams[0] : null;
  const firstFinishedTeam = doneTeams.length > 0 ? doneTeams[0] : null;

  // Highest accuracy team
  const teamsWithAttempts = [...teamAnalyses].filter((t) => t.totalAttempts > 0);
  teamsWithAttempts.sort((a, b) => b.accuracy - a.accuracy || b.correctAnswers - a.correctAnswers);
  const highestAccuracyTeam = teamsWithAttempts.length > 0 ? teamsWithAttempts[0] : null;

  const completedCount = teamAnalyses.filter((t) => t.isDone).length;
  const inProgressCount = teamAnalyses.filter((t) => t.status === 'in_progress').length;
  const notStartedCount = teamAnalyses.filter((t) => t.status === 'not_started').length;
  const allCompleted = completedCount === teamAnalyses.length && teamAnalyses.length > 0;

  return {
    phaseKey,
    phaseLabel,
    totalQuestions,
    teams: teamAnalyses,
    fastestTeam,
    firstFinishedTeam,
    highestAccuracyTeam,
    completedCount,
    inProgressCount,
    notStartedCount,
    allCompleted,
  };
}
