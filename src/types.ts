export type PhaseKey = 'pretest' | 'session1' | 'session2' | 'session3' | 'session4' | 'posttest';

export interface QuizItem {
  p: string; // prompt text, with **word** for bolding
  o: string[]; // options (4 choices)
  c: number; // correct option index (0-3)
  explanation?: string;
}

export type RelayRole = 'READER' | 'SOLVER' | 'CHECKER' | 'EXPLAINER' | 'RUNNER';

export interface RelayRoleAssignment {
  memberIndex: number;
  memberName: string;
  role: RelayRole;
  roleIcon: string;
  roleTitle: string;
  roleDuty: string;
}

export interface Phase {
  key: PhaseKey;
  label: string;
  sub: string;
  icon: string;
  eyebrow: string;
  itemCount: number;
  cycle: boolean;
  showFeedback: boolean;
  weekLabel?: string;
  domain?: string;
  badgeName?: string;
  badgeIcon?: string;
}

export interface TeamGroup {
  name: string;
  members: string[]; // exactly 5 runners per group
}

export interface SurveyResponse {
  id?: string;
  teamName: string;
  timestamp: string;
  q1Rating: number; // 1-5
  q2Rating: number; // 1-5
  q3Rating: number; // 1-5
  comments?: string;
}

export interface TaskProgressRecord {
  teamIndex: number;
  teamName: string;
  phaseKey: PhaseKey | string;
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
  completionOrder?: number; // 1 = 1st done to this task, 2 = 2nd done, etc.
  speedRank?: number; // 1 = fastest to finish, 2 = 2nd fastest, etc.
  lastActiveTs: string;
}

export interface AppState {
  pin: string;
  currentPhaseIndex: number;
  completedToday: Record<string, number[]>; // phaseKey -> array of completed group indices
  groups: TeamGroup[]; // 4 groups, each with 5 runners
  surveyResponses?: SurveyResponse[];
  taskProgress?: Record<string, Record<string, TaskProgressRecord>>; // phaseKey -> teamName -> TaskProgressRecord
}

export interface AttemptLog {
  id: string;
  ts: string;
  phase: string;
  phaseLabel?: string;
  weekLabel?: string;
  team: string;
  player: string;
  runnerIndex?: number; // 1-5
  roleAtTurn?: RelayRole;
  questionNumber?: number; // 1 to N within session
  prompt: string;
  chosen: string;
  correctAnswer?: string;
  correct: boolean;
}

export interface ActiveSession {
  phaseIndex: number;
  groupIndex: number;
  itemOrder: number[];
  itemIndex: number;
  turnPlayerIndex: number; // 0 to 4 (cycling through the 5 runners)
}
