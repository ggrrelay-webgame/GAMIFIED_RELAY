import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

export const syncEventEmitter = new EventEmitter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '..', 'data', 'ggr_database.json');

export interface TaskProgressData {
  teamIndex: number;
  teamName: string;
  phaseKey: string;
  status: 'not_started' | 'in_progress' | 'completed';
  currentQuestionIndex: number;
  totalQuestions: number;
  correctAnswers: number;
  totalAttempts: number;
  accuracy: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  durationSeconds?: number;
  paceSecondsPerItem?: number;
  completionOrder?: number; // 1 = 1st to finish, 2 = 2nd, etc.
  speedRank?: number; // 1 = fastest, 2 = 2nd fastest, etc.
  lastActiveTs: string;
}

export interface AppStateData {
  pin: string;
  currentPhaseIndex: number;
  completedToday: Record<string, number[]>;
  groups: Array<{
    name: string;
    members: string[];
  }>;
  surveyResponses?: any[];
  taskProgress?: Record<string, Record<string, TaskProgressData>>;
}

export interface AttemptLogData {
  id: string;
  ts: string;
  phase: string;
  phaseLabel?: string;
  weekLabel?: string;
  team: string;
  player: string;
  runnerIndex?: number;
  roleAtTurn?: string;
  questionNumber?: number;
  prompt: string;
  chosen: string;
  correctAnswer?: string;
  correct: boolean;
}

export interface DatabaseSchema {
  appState: AppStateData;
  logData: AttemptLogData[];
  lastUpdated?: string;
}

const DEFAULT_STATE: AppStateData = {
  pin: '1234',
  currentPhaseIndex: 0,
  completedToday: {
    pretest: [],
    session1: [],
    session2: [],
    session3: [],
    session4: [],
    posttest: [],
  },
  groups: [0, 1, 2, 3].map((i) => ({
    name: `Team ${i + 1}`,
    members: [1, 2, 3, 4, 5].map((n) => `Runner ${n}`),
  })),
  surveyResponses: [],
};

let memoryStore: DatabaseSchema = {
  appState: DEFAULT_STATE,
  logData: [],
  lastUpdated: new Date().toISOString(),
};

// Initial load from file
export function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.appState) {
        memoryStore = {
          appState: {
            ...DEFAULT_STATE,
            ...parsed.appState,
            completedToday: {
              ...DEFAULT_STATE.completedToday,
              ...(parsed.appState.completedToday || {}),
            },
          },
          logData: Array.isArray(parsed.logData)
            ? parsed.logData.filter((l: any) => l && !l.id?.startsWith('sim-'))
            : [],
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        };
        return memoryStore;
      }
    }
  } catch (err) {
    console.error('[SYNC] Failed to read database from file, using memory store:', err);
  }
  return memoryStore;
}

// Save to disk helper
export function saveDatabase(data: DatabaseSchema): void {
  memoryStore = data;
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SYNC] Failed to save database to file:', err);
  }
}

// Generate unique signature for log deduplication
function getLogKey(log: AttemptLogData): string {
  if (log.id && log.id.trim()) {
    return log.id.trim();
  }
  return `${log.ts}_${log.phase}_${log.team}_${log.player}_${log.questionNumber}_${log.prompt?.slice(0, 20)}`;
}

// Core merge function for multi-device sync
export function mergeDatabase(payload: {
  clientState?: Partial<AppStateData>;
  newLogs?: AttemptLogData[];
  logData?: AttemptLogData[];
  surveys?: any[];
  newSurveys?: any[];
  isDelete?: boolean;
}): DatabaseSchema {
  const current = loadDatabase();
  const now = new Date().toISOString();

  // If this is a deletion operation from teacher's area, directly overwrite logs, completedToday, and taskProgress
  // so deleted records are wiped completely from Overview and Standings across all connected devices!
  if (payload.isDelete) {
    const updatedDatabase: DatabaseSchema = {
      appState: {
        pin: payload.clientState?.pin || current.appState.pin || '1234',
        currentPhaseIndex:
          typeof payload.clientState?.currentPhaseIndex === 'number'
            ? payload.clientState.currentPhaseIndex
            : current.appState.currentPhaseIndex,
        completedToday: payload.clientState?.completedToday || {},
        groups: payload.clientState?.groups || current.appState.groups,
        surveyResponses: payload.surveys || payload.clientState?.surveyResponses || current.appState.surveyResponses || [],
        taskProgress: payload.clientState?.taskProgress || {},
      },
      logData: payload.logData || [],
      lastUpdated: now,
    };
    saveDatabase(updatedDatabase);
    syncEventEmitter.emit('sync', updatedDatabase);
    return updatedDatabase;
  }

  // 1. Merge completedToday (union of all completed team indices)
  const mergedCompleted: Record<string, number[]> = {
    ...current.appState.completedToday,
  };

  if (payload.clientState?.completedToday) {
    for (const [phaseKey, clientDone] of Object.entries(payload.clientState.completedToday)) {
      const serverDone = mergedCompleted[phaseKey] || [];
      const combined = Array.from(new Set([...serverDone, ...(Array.isArray(clientDone) ? clientDone : [])]));
      mergedCompleted[phaseKey] = combined;
    }
  }

  // 2. Merge groups if client updated team or runner names
  let mergedGroups = current.appState.groups;
  if (Array.isArray(payload.clientState?.groups) && payload.clientState.groups.length === 4) {
    // Check if client groups have non-default names
    const hasCustomGroupData = payload.clientState.groups.some(
      (g) => g.name && g.members && g.members.length === 5
    );
    if (hasCustomGroupData) {
      mergedGroups = payload.clientState.groups.map((g, idx) => ({
        name: g.name || `Team ${idx + 1}`,
        members: Array.isArray(g.members) && g.members.length === 5 ? g.members : current.appState.groups[idx].members,
      }));
    }
  }

  // 3. Current Phase Index (keep teacher or highest valid phase)
  let mergedPhaseIndex = current.appState.currentPhaseIndex;
  if (typeof payload.clientState?.currentPhaseIndex === 'number') {
    mergedPhaseIndex = Math.max(mergedPhaseIndex, payload.clientState.currentPhaseIndex);
  }

  // 4. Merge Surveys
  const existingSurveys = current.appState.surveyResponses || [];
  const incomingSurveys = [
    ...(payload.surveys || []),
    ...(payload.newSurveys || []),
    ...(payload.clientState?.surveyResponses || []),
  ];
  const surveyMap = new Map<string, any>();
  for (const s of existingSurveys) {
    const key = s.id || `${s.teamName}_${s.timestamp}`;
    surveyMap.set(key, s);
  }
  for (const s of incomingSurveys) {
    if (s && s.teamName) {
      const key = s.id || `${s.teamName}_${s.timestamp}`;
      if (!surveyMap.has(key)) {
        surveyMap.set(key, s);
      }
    }
  }
  const mergedSurveys = Array.from(surveyMap.values());

  // 5. Merge Logs (strictly deduplicated so no duplicate questions or attempts)
  const existingLogs = current.logData || [];
  const incomingLogs = [...(payload.newLogs || []), ...(payload.logData || [])];
  const logMap = new Map<string, AttemptLogData>();

  for (const log of existingLogs) {
    if (log && !log.id?.startsWith('sim-')) {
      logMap.set(getLogKey(log), log);
    }
  }
  for (const log of incomingLogs) {
    if (log && log.team && log.phase && !log.id?.startsWith('sim-')) {
      const key = getLogKey(log);
      if (!logMap.has(key)) {
        logMap.set(key, log);
      }
    }
  }

  const mergedLogs = Array.from(logMap.values()).sort((a, b) => {
    return new Date(a.ts).getTime() - new Date(b.ts).getTime();
  });

  // 6. Merge & Reconcile Task Progress (Live Question, Finish Times, Speed Ranking)
  const existingTaskProgress = current.appState.taskProgress || {};
  const incomingTaskProgress = payload.clientState?.taskProgress || (payload as any).taskProgress || {};

  const mergedTaskProgress: Record<string, Record<string, TaskProgressData>> = {
    ...existingTaskProgress,
  };

  for (const [phaseKey, teamMap] of Object.entries(incomingTaskProgress)) {
    if (!mergedTaskProgress[phaseKey]) {
      mergedTaskProgress[phaseKey] = {};
    }
    for (const [teamName, record] of Object.entries(teamMap as Record<string, TaskProgressData>)) {
      const prev = mergedTaskProgress[phaseKey][teamName];
      const isCompleted = record.status === 'completed' || prev?.status === 'completed';
      const startedAt = prev?.startedAt || record.startedAt || now;
      const completedAt = prev?.completedAt || record.completedAt || (isCompleted ? now : undefined);
      let durationMs = record.durationMs || prev?.durationMs;
      if (!durationMs && startedAt && completedAt) {
        durationMs = Math.max(1000, new Date(completedAt).getTime() - new Date(startedAt).getTime());
      }
      mergedTaskProgress[phaseKey][teamName] = {
        ...(prev || {}),
        ...record,
        startedAt,
        completedAt,
        status: isCompleted ? 'completed' : (record.status || prev?.status || 'in_progress'),
        currentQuestionIndex: Math.max(prev?.currentQuestionIndex || 0, record.currentQuestionIndex || 0),
        correctAnswers: Math.max(prev?.correctAnswers || 0, record.correctAnswers || 0),
        totalAttempts: Math.max(prev?.totalAttempts || 0, record.totalAttempts || 0),
        durationMs,
        durationSeconds: durationMs ? Math.round(durationMs / 1000) : undefined,
        lastActiveTs: now,
      };
    }
  }

  // Also auto-reconcile / backfill taskProgress from mergedLogs and mergedCompleted
  for (const [phaseKey, doneIndices] of Object.entries(mergedCompleted)) {
    if (!mergedTaskProgress[phaseKey]) {
      mergedTaskProgress[phaseKey] = {};
    }
    mergedGroups.forEach((g, gIdx) => {
      const isDone = (doneIndices || []).includes(gIdx);
      const teamLogs = mergedLogs.filter((l) => l.team === g.name && l.phase === phaseKey);
      if (teamLogs.length > 0 || isDone) {
        const prev = mergedTaskProgress[phaseKey][g.name];
        const firstLogTs = teamLogs.length > 0 ? teamLogs[0].ts : prev?.startedAt || now;
        const lastLogTs = teamLogs.length > 0 ? teamLogs[teamLogs.length - 1].ts : prev?.completedAt || now;
        const correctCount = teamLogs.filter((l) => l.correct).length;
        const totalCount = teamLogs.length;
        const maxQ = teamLogs.reduce((m, l) => Math.max(m, l.questionNumber || 0), prev?.currentQuestionIndex || 0);
        const startedAt = prev?.startedAt || firstLogTs;
        const completedAt = isDone ? (prev?.completedAt || lastLogTs) : undefined;
        let durationMs = prev?.durationMs;
        if (completedAt && startedAt) {
          durationMs = Math.max(1000, new Date(completedAt).getTime() - new Date(startedAt).getTime());
        }

        mergedTaskProgress[phaseKey][g.name] = {
          teamIndex: gIdx,
          teamName: g.name,
          phaseKey,
          status: isDone ? 'completed' : (teamLogs.length > 0 ? 'in_progress' : 'not_started'),
          currentQuestionIndex: isDone ? Math.max(maxQ, 15) : maxQ,
          totalQuestions: prev?.totalQuestions || 15,
          correctAnswers: correctCount,
          totalAttempts: totalCount,
          accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : (prev?.accuracy || 0),
          startedAt,
          completedAt,
          durationMs,
          durationSeconds: durationMs ? Math.round(durationMs / 1000) : undefined,
          lastActiveTs: lastLogTs,
        };
      }
    });
  }

  // Calculate completionOrder (who finished 1st, 2nd, 3rd, 4th) and speedRank (fastest duration)
  for (const [, teamMap] of Object.entries(mergedTaskProgress)) {
    const list = Object.values(teamMap);
    // Completion order by completedAt
    const completedList = list
      .filter((r) => r.status === 'completed' && r.completedAt)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());
    completedList.forEach((r, idx) => {
      r.completionOrder = idx + 1;
    });

    // Speed rank by durationMs (fastest duration = rank 1)
    const speedList = list
      .filter((r) => r.status === 'completed' && typeof r.durationMs === 'number' && r.durationMs > 0)
      .sort((a, b) => a.durationMs! - b.durationMs!);
    speedList.forEach((r, idx) => {
      r.speedRank = idx + 1;
      r.paceSecondsPerItem = r.durationSeconds && r.totalQuestions ? +(r.durationSeconds / r.totalQuestions).toFixed(1) : undefined;
    });
  }

  const updatedDatabase: DatabaseSchema = {
    appState: {
      pin: payload.clientState?.pin || current.appState.pin || '1234',
      currentPhaseIndex: mergedPhaseIndex,
      completedToday: mergedCompleted,
      groups: mergedGroups,
      surveyResponses: mergedSurveys,
      taskProgress: mergedTaskProgress,
    },
    logData: mergedLogs,
    lastUpdated: now,
  };

  saveDatabase(updatedDatabase);
  syncEventEmitter.emit('sync', updatedDatabase);
  return updatedDatabase;
}

// Reset or Seed
export function resetDatabase(newState?: Partial<AppStateData>, sampleLogs?: AttemptLogData[]): DatabaseSchema {
  const resetDb: DatabaseSchema = {
    appState: {
      ...DEFAULT_STATE,
      ...(newState || {}),
      completedToday: (newState && newState.completedToday) || DEFAULT_STATE.completedToday,
      taskProgress: {},
    },
    logData: sampleLogs || [],
    lastUpdated: new Date().toISOString(),
  };
  saveDatabase(resetDb);
  syncEventEmitter.emit('sync', resetDb);
  return resetDb;
}

// Initial load on import
loadDatabase();
