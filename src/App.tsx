/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AppState, ActiveSession, AttemptLog, QuizItem, TeamGroup, SurveyResponse, TaskProgressRecord } from './types';
import { PHASES, GROUP_COLORS, BANK } from './data/phases';
import { sounds } from './utils/audio';
import { recalculateCompletedToday } from './utils/exportUtils';
import {
  MISSIONS_CURRICULUM,
  RELAY_ROLES_INFO,
  getRotatedRoles,
  getDepEdRating,
} from './data/ggrCurriculum';
import { Mascot } from './components/Mascot';
import { TeacherPanel } from './components/TeacherPanel';
import { CsvSyncModal } from './components/CsvSyncModal';
import { StandingDeskModal } from './components/StandingDeskModal';
import {
  fetchCloudSync,
  pushCloudSync,
  mergeLogs,
  mergeCompletedToday,
  resetCloudDatabase,
  subscribeToLiveSync,
} from './services/syncService';

const STATE_KEY = 'ggr_state_v4';
const LOG_KEY = 'ggr_log_v4';
const SURVEY_KEY = 'ggr_survey_v4';

export const THEMES = [
  { id: 'track', name: '🏃 Stadium Grass', preview: 'linear-gradient(135deg, #FFF7EA, #1F9D68)' },
  { id: 'ocean', name: '🌊 Ocean Splash', preview: 'linear-gradient(135deg, #E0F2FE, #0284C7)' },
  { id: 'sunset', name: '🌅 Sunset Dash', preview: 'linear-gradient(135deg, #FFEDD5, #EA580C)' },
  { id: 'bubblegum', name: '🍬 Bubblegum Pop', preview: 'linear-gradient(135deg, #FAE8FF, #C026D3)' },
  { id: 'emerald', name: '🌲 Forest Mint', preview: 'linear-gradient(135deg, #DCFCE7, #059669)' },
  { id: 'lemon', name: '🍋 Sunny Gold', preview: 'linear-gradient(135deg, #FEF08A, #65A30D)' },
  { id: 'cosmic', name: '🌌 Cosmic Arcade', preview: 'linear-gradient(135deg, #1E1B4B, #818CF8)' },
];

function defaultState(): AppState {
  return {
    pin: '1234',
    currentPhaseIndex: 0,
    completedToday: {},
    groups: [0, 1, 2, 3].map((i) => ({
      name: `Team ${i + 1}`,
      members: [1, 2, 3, 4, 5].map((n) => `Runner ${n}`),
    })),
    surveyResponses: [],
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY) || localStorage.getItem('ggr_state_v3');
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const loaded = Object.assign(defaultState(), parsed);
    const defaultGroups = defaultState().groups;
    const finalGroups: TeamGroup[] = [];
    for (let i = 0; i < 4; i++) {
      const existing =
        Array.isArray(loaded.groups) && loaded.groups[i] ? loaded.groups[i] : defaultGroups[i];
      const existingName = existing && existing.name ? existing.name : `Team ${i + 1}`;
      let members: string[] =
        existing && Array.isArray(existing.members) ? [...existing.members] : [];
      if (members.length < 5) {
        for (let m = members.length; m < 5; m++) {
          members.push(`Runner ${m + 1}`);
        }
      } else if (members.length > 5) {
        members = members.slice(0, 5);
      }
      finalGroups.push({
        name: existingName,
        members,
      });
    }
    loaded.groups = finalGroups;
    return loaded;
  } catch {
    return defaultState();
  }
}

function loadLog(): AttemptLog[] {
  try {
    const raw = localStorage.getItem(LOG_KEY) || localStorage.getItem('ggr_log_v3');
    const parsed: AttemptLog[] = JSON.parse(raw || '[]') || [];
    return parsed.filter((l) => l && !l.id?.startsWith('sim-'));
  } catch {
    return [];
  }
}

function loadSurveys(): SurveyResponse[] {
  try {
    const raw = localStorage.getItem(SURVEY_KEY);
    return JSON.parse(raw || '[]') || [];
  } catch {
    return [];
  }
}

interface ConfettiItem {
  id: number;
  left: number;
  background: string;
  duration: number;
  delay: number;
}

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadState());
  const [logData, setLogData] = useState<AttemptLog[]>(() => loadLog());
  const [surveys, setSurveys] = useState<SurveyResponse[]>(() => loadSurveys());

  // Team Log In & Active Logged-In Team state: The website always starts with team log in!
  const [loggedTeamIndex, setLoggedTeamIndex] = useState<number | null>(null);

  // Screen routing: The website ALWAYS starts with log in!
  const [screen, setScreen] = useState<string>('team_login');
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number>(0);
  const [session, setSession] = useState<ActiveSession | null>(null);

  // Mandatory Login Guard:
  // 1. Students must log in first before going to race map or running sessions.
  // 2. Once logged in, students cannot navigate back to team login or access other teams' portals.
  useEffect(() => {
    if (loggedTeamIndex === null && screen !== 'team_login') {
      setScreen('team_login');
    } else if (loggedTeamIndex !== null && screen === 'team_login') {
      setScreen('map');
    }
  }, [loggedTeamIndex, screen]);

  const [loginTeamIndex, setLoginTeamIndex] = useState<number>(() => {
    const raw = localStorage.getItem('ggr_logged_team_index');
    if (raw !== null && !isNaN(Number(raw))) {
      const parsed = Number(raw);
      if (parsed >= 0 && parsed <= 3) return parsed;
    }
    return 0;
  });
  const [loginTeamName, setLoginTeamName] = useState<string>(() => {
    const raw = localStorage.getItem('ggr_logged_team_index');
    const idx = raw !== null && !isNaN(Number(raw)) ? Math.max(0, Math.min(3, Number(raw))) : 0;
    return loadState().groups[idx]?.name || `Team ${idx + 1}`;
  });
  const [loginMemberNames, setLoginMemberNames] = useState<string[]>(() => {
    const raw = localStorage.getItem('ggr_logged_team_index');
    const idx = raw !== null && !isNaN(Number(raw)) ? Math.max(0, Math.min(3, Number(raw))) : 0;
    const g = loadState().groups[idx];
    return [
      g?.members[0] || 'Runner 1',
      g?.members[1] || 'Runner 2',
      g?.members[2] || 'Runner 3',
      g?.members[3] || 'Runner 4',
      g?.members[4] || 'Runner 5',
    ];
  });
  const [loginError, setLoginError] = useState<string | null>(null);

  // Overview & Standings Modal state
  const [isOverviewStandingsModalOpen, setIsOverviewStandingsModalOpen] = useState<boolean>(false);

  // Standing Desk Modal state
  const [isStandingDeskOpen, setIsStandingDeskOpen] = useState<boolean>(false);
  const [standingDeskTaskKey, setStandingDeskTaskKey] = useState<string | undefined>(undefined);
  const [isLiveSseConnected, setIsLiveSseConnected] = useState<boolean>(false);

  // Cloud & Multi-Phone Synchronization state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Instructional Sub-Steps within Missions (I DO, WE DO)
  const [iDoSubStep, setIDoSubStep] = useState<number>(0);
  const [weDoSubStep, setWeDoSubStep] = useState<number>(0);
  const [showHintBox, setShowHintBox] = useState<boolean>(false);
  const [interactiveSelectedAnswer, setInteractiveSelectedAnswer] = useState<number | null>(null);
  const [interactiveFeedback, setInteractiveFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);

  // Bonus Laps state
  const [bonusWeDoIndex, setBonusWeDoIndex] = useState<number>(0);
  const [bonusLap2WeDoIndex, setBonusLap2WeDoIndex] = useState<number>(0);

  // Item feedback & option selection
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [feedbackOverlayShow, setFeedbackOverlayShow] = useState<boolean>(false);
  const [feedbackCardType, setFeedbackCardType] = useState<'good' | 'bad' | 'neutral'>('neutral');
  const [feedbackTitle, setFeedbackTitle] = useState<string>('Correct!');
  const [feedbackSub, setFeedbackSub] = useState<string>('Nice grammar instincts.');

  // Confetti & Celebration
  const [confetti, setConfetti] = useState<ConfettiItem[]>([]);
  const [endBadge, setEndBadge] = useState<string>('🏅');
  const [endTitle, setEndTitle] = useState<string>('Mission Complete!');
  const [endMsg, setEndMsg] = useState<string>('Great teamwork out there.');

  // Survey Form State
  const [surveyQ1, setSurveyQ1] = useState<number>(5);
  const [surveyQ2, setSurveyQ2] = useState<number>(5);
  const [surveyQ3, setSurveyQ3] = useState<number>(5);
  const [surveyComment, setSurveyComment] = useState<string>('');

  // Admin and PIN modals
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);
  const [isCsvSyncModalOpen, setIsCsvSyncModalOpen] = useState<boolean>(false);
  const [lockedModalInfo, setLockedModalInfo] = useState<{
    title: string;
    message: string;
    icon: string;
  } | null>(null);

  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);
  const [adminNotification, setAdminNotification] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Background Theme State
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem('ggr_theme') || 'track';
  });
  const [showThemePicker, setShowThemePicker] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('ggr_theme', currentTheme);
  }, [currentTheme]);

  // Sync persistence
  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify(appState));
  }, [appState]);

  useEffect(() => {
    localStorage.setItem(LOG_KEY, JSON.stringify(logData));
  }, [logData]);

  useEffect(() => {
    localStorage.setItem(SURVEY_KEY, JSON.stringify(surveys));
  }, [surveys]);

  // Clean up legacy individual runner keys from previous session if any
  useEffect(() => {
    localStorage.removeItem('ggr_logged_student');
    localStorage.removeItem('ggr_logged_team_idx');
    localStorage.removeItem('ggr_logged_runner_idx');
  }, []);

  // Persist active logged-in team to ensure answers and progress are tied strictly to this team's device
  useEffect(() => {
    if (loggedTeamIndex !== null) {
      localStorage.setItem('ggr_logged_team_index', String(loggedTeamIndex));
    } else {
      localStorage.removeItem('ggr_logged_team_index');
    }
  }, [loggedTeamIndex]);

  // Real-Time Server-Sent Events (SSE) Live Stream: Instant push updates whenever ANY group answers, finishes, or when researcher deletes records
  useEffect(() => {
    const unsubscribe = subscribeToLiveSync(
      (cloud) => {
        if (!cloud || !cloud.success) return;
        setAppState((prev) => ({
          ...prev,
          completedToday: cloud.appState.completedToday !== undefined ? cloud.appState.completedToday : prev.completedToday,
          groups: cloud.appState.groups || prev.groups,
          pin: cloud.appState.pin || prev.pin,
          taskProgress: cloud.appState.taskProgress !== undefined ? cloud.appState.taskProgress : prev.taskProgress,
        }));

        if (Array.isArray(cloud.logData)) {
          setLogData(cloud.logData);
          localStorage.setItem(LOG_KEY, JSON.stringify(cloud.logData));
        }

        if (cloud.surveys && cloud.surveys.length > 0) {
          setSurveys((prev) => (cloud.surveys!.length !== prev.length ? cloud.surveys! : prev));
        }
        setLastSyncTime(new Date());
      },
      (isConnected) => {
        setIsLiveSseConnected(isConnected);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Initial Multi-Phone Cloud Sync reconciliation on application startup
  useEffect(() => {
    let active = true;
    fetchCloudSync().then((cloud) => {
      if (!active || !cloud || !cloud.success) return;
      setAppState((prev) => ({
        ...prev,
        completedToday: cloud.appState.completedToday !== undefined ? cloud.appState.completedToday : prev.completedToday,
        groups: cloud.appState.groups || prev.groups,
        pin: cloud.appState.pin || prev.pin,
        taskProgress: cloud.appState.taskProgress !== undefined ? cloud.appState.taskProgress : prev.taskProgress,
      }));
      if (Array.isArray(cloud.logData)) {
        setLogData(cloud.logData);
        localStorage.setItem(LOG_KEY, JSON.stringify(cloud.logData));
      }
      if (cloud.surveys && cloud.surveys.length > 0) {
        setSurveys(cloud.surveys);
      }
      setLastSyncTime(new Date());
    });
    return () => {
      active = false;
    };
  }, []);

  // Live Multi-Phone Polling fallback: automatically checks every 3 seconds
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      const cloud = await fetchCloudSync();
      if (!cloud || !cloud.success) return;

      setAppState((prev) => {
        const hasTaskDiff = JSON.stringify(cloud.appState.taskProgress) !== JSON.stringify(prev.taskProgress);
        const hasDoneDiff = JSON.stringify(cloud.appState.completedToday) !== JSON.stringify(prev.completedToday);
        if (hasDoneDiff || hasTaskDiff) {
          return {
            ...prev,
            completedToday: cloud.appState.completedToday !== undefined ? cloud.appState.completedToday : prev.completedToday,
            taskProgress: cloud.appState.taskProgress !== undefined ? cloud.appState.taskProgress : prev.taskProgress,
          };
        }
        return prev;
      });

      setLogData((prev) => {
        if (Array.isArray(cloud.logData) && (cloud.logData.length !== prev.length || JSON.stringify(cloud.logData) !== JSON.stringify(prev))) {
          localStorage.setItem(LOG_KEY, JSON.stringify(cloud.logData));
          return cloud.logData;
        }
        return prev;
      });

      if (cloud.surveys && cloud.surveys.length > 0) {
        setSurveys((prev) => (cloud.surveys!.length !== prev.length ? cloud.surveys! : prev));
      }

      setLastSyncTime(new Date());
    }, 3000);

    return () => clearInterval(syncInterval);
  }, []);

  // Manual live refresh for teacher/researcher dash
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const cloud = await fetchCloudSync();
      if (cloud && cloud.success) {
        setAppState((prev) => ({
          ...prev,
          completedToday: mergeCompletedToday(prev.completedToday, cloud.appState.completedToday),
          groups: cloud.appState.groups || prev.groups,
          pin: cloud.appState.pin || prev.pin,
        }));
        setLogData((prev) => mergeLogs(prev, cloud.logData || []));
        if (cloud.surveys) setSurveys(cloud.surveys);
        setLastSyncTime(new Date());
        setAdminNotification('Fetched latest live progress from all mobile devices!');
        setTimeout(() => setAdminNotification(null), 3500);
      } else {
        setAdminNotification('Multi-phone sync checked (working in local fallback mode).');
        setTimeout(() => setAdminNotification(null), 2500);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const activePhase = PHASES[selectedPhaseIndex] || PHASES[0];
  const activeMissionCurriculum = MISSIONS_CURRICULUM[activePhase.key];

  const triggerConfetti = () => {
    const pieces: ConfettiItem[] = [];
    for (let i = 0; i < 36; i++) {
      pieces.push({
        id: Date.now() + i,
        left: Math.random() * 100,
        background: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)],
        duration: 2 + Math.random() * 1.5,
        delay: Math.random() * 0.4,
      });
    }
    setConfetti(pieces);
    setTimeout(() => setConfetti([]), 4000);
  };

  const handleSelectLoginTeam = (idx: number) => {
    sounds.playTap();
    setLoginTeamIndex(idx);
    const grp = appState.groups[idx];
    setLoginTeamName(grp.name);
    setLoginMemberNames([...grp.members]);
    setLoginError(null);
  };

  const handleLoginSubmit = () => {
    sounds.playCorrect();
    // Update group name and members in appState
    const updatedGroups = appState.groups.map((g, idx) => {
      if (idx !== loginTeamIndex) return g;
      return {
        name: loginTeamName.trim() || g.name,
        members: loginMemberNames.map((m, mi) => m.trim() || `Runner ${mi + 1}`),
      };
    });
    setAppState((prev) => ({
      ...prev,
      groups: updatedGroups,
    }));
    setLoginError(null);
    setLoggedTeamIndex(loginTeamIndex);
    localStorage.setItem('ggr_logged_team_index', String(loginTeamIndex));

    // Broadcast updated roster to cloud server
    pushCloudSync({
      clientState: { groups: updatedGroups },
    });

    // Once logged in, students enter the Race Map!
    setSelectedPhaseIndex(appState.currentPhaseIndex);
    setScreen('map');
    window.scrollTo(0, 0);
  };

  const startSessionForGroup = (groupIndex: number, phaseIndex: number = selectedPhaseIndex) => {
    if (phaseIndex !== appState.currentPhaseIndex) {
      sounds.playWrong();
      const ph = PHASES[phaseIndex];
      setLockedModalInfo({
        title: `🔒 Station Not Active`,
        message: `${ph.label} is not currently active. Ask your teacher to activate it before racing!`,
        icon: '🔒',
      });
      return;
    }

    // Protection check: Make sure other teams cannot access questions or answer for this team!
    if (loggedTeamIndex !== null && groupIndex !== loggedTeamIndex) {
      sounds.playWrong();
      const myTeam = appState.groups[loggedTeamIndex]?.name || `Team ${loggedTeamIndex + 1}`;
      const targetTeam = appState.groups[groupIndex]?.name || `Team ${groupIndex + 1}`;
      setLockedModalInfo({
        title: `🔒 Team Access Restricted`,
        message: `This device is logged in as ${myTeam}. You cannot access, view questions, or answer on behalf of ${targetTeam}. Each team's progress and answers are strictly protected! To switch teams, tap your team badge on the Race Map header.`,
        icon: '🛡️',
      });
      return;
    }

    // If no team is logged in yet, prompt them to log in first
    if (loggedTeamIndex === null) {
      sounds.playTap();
      setLoginTeamIndex(groupIndex);
      const grp = appState.groups[groupIndex];
      setLoginTeamName(grp.name);
      setLoginMemberNames([...grp.members]);
      setLoginError(null);
      setScreen('team_login');
      window.scrollTo(0, 0);
      return;
    }

    sounds.playTap();
    const ph = PHASES[phaseIndex];

    // Check if this team has already completed this station today
    const doneList = appState.completedToday[ph.key] || [];
    if (doneList.includes(groupIndex)) {
      sounds.playWrong();
      const g = appState.groups[groupIndex];
      setLockedModalInfo({
        title: `${g.name} Already Finished Today!`,
        message: `Great job earlier! Your team has already completed ${ph.label} today. When this activity is deleted or reset by your teacher, it will become accessible again!`,
        icon: '✅',
      });
      return;
    }

    setSelectedPhaseIndex(phaseIndex);

    const itemCount = ph.itemCount;
    const itemOrder = Array.from({ length: itemCount }, (_, i) => i);
    setSession({
      phaseIndex,
      groupIndex,
      itemOrder,
      itemIndex: 0,
      turnPlayerIndex: 0,
    });
    setBonusWeDoIndex(0);
    setBonusLap2WeDoIndex(0);

    // Initialize team task progress on Standing Desk if not already started
    const g = appState.groups[groupIndex];
    const nowIso = new Date().toISOString();
    const currProg = appState.taskProgress?.[ph.key]?.[g.name];
    if (!currProg || currProg.status === 'not_started') {
      const initRecord: TaskProgressRecord = {
        teamIndex: groupIndex,
        teamName: g.name,
        phaseKey: ph.key,
        status: 'in_progress',
        currentQuestionIndex: 0,
        totalQuestions: itemCount,
        correctAnswers: 0,
        totalAttempts: 0,
        accuracy: 0,
        startedAt: nowIso,
        lastActiveTs: nowIso,
      };
      const updatedProg = {
        ...(appState.taskProgress || {}),
        [ph.key]: {
          ...(appState.taskProgress?.[ph.key] || {}),
          [g.name]: initRecord,
        },
      };
      setAppState((prev) => ({ ...prev, taskProgress: updatedProg }));
      pushCloudSync({ taskProgress: updatedProg });
    }

    if (ph.key === 'pretest') {
      setScreen('pretest_welcome');
    } else if (ph.key === 'posttest') {
      setScreen('posttest_welcome');
    } else {
      setScreen('mission_unlocked');
    }
    window.scrollTo(0, 0);
  };

  const handleGroupSelect = (groupIndex: number) => {
    startSessionForGroup(groupIndex, selectedPhaseIndex);
  };

  const handleNodeTap = (index: number) => {
    if (index !== appState.currentPhaseIndex) {
      sounds.playWrong();
      const ph = PHASES[index];
      if (index < appState.currentPhaseIndex) {
        setLockedModalInfo({
          title: `${ph.label} is Already Completed!`,
          message: `This station was already finished earlier by the class. To re-attempt ${ph.label}, ask your teacher to set it as active in the Teacher Area (⚙️ settings).`,
          icon: '🏁',
        });
      } else {
        setLockedModalInfo({
          title: `🔒 ${ph.label} is Locked!`,
          message: `This mission is not active yet! Please wait for your teacher to open ${ph.label} from the Teacher Area (⚙️ settings).`,
          icon: '🔒',
        });
      }
      return;
    }

    sounds.playTap();
    setSelectedPhaseIndex(index);

    // If logged in, immediately launch this station for the team
    if (loggedTeamIndex !== null) {
      startSessionForGroup(loggedTeamIndex, index);
    } else {
      // If not logged in yet, go to login screen
      setLoginTeamIndex(0);
      const grp = appState.groups[0];
      setLoginTeamName(grp.name);
      setLoginMemberNames([...grp.members]);
      setLoginError(null);
      setScreen('team_login');
      window.scrollTo(0, 0);
    }
  };

  const handleStartItemTurn = () => {
    sounds.playTap();
    setSelectedOptionIndex(null);
    setFeedbackOverlayShow(false);
    setScreen('item');
    window.scrollTo(0, 0);
  };

  const handleSelectOption = (choiceIndex: number, currentItem: QuizItem) => {
    if (selectedOptionIndex !== null || !session) return;
    const isCorrect = choiceIndex === currentItem.c;
    const ph = PHASES[session.phaseIndex];
    const g = appState.groups[session.groupIndex];

    const rotated = getRotatedRoles(g.members, session.itemIndex);
    const activeRunnerRole = rotated.find((r) => r.roleInfo.role === 'RUNNER');
    const runnerName = activeRunnerRole ? activeRunnerRole.member : g.members[session.turnPlayerIndex];

    setSelectedOptionIndex(choiceIndex);

    // Save attempt log with unique ID
    const newLog: AttemptLog = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ts: new Date().toISOString(),
      phase: ph.key,
      phaseLabel: ph.label,
      weekLabel: ph.weekLabel,
      team: g.name,
      player: runnerName,
      runnerIndex: session.turnPlayerIndex + 1,
      roleAtTurn: 'RUNNER',
      questionNumber: session.itemIndex + 1,
      prompt: currentItem.p.replace(/\*\*/g, ''),
      chosen: currentItem.o[choiceIndex],
      correctAnswer: currentItem.o[currentItem.c],
      correct: isCorrect,
    };
    setLogData((prev) => [...prev, newLog]);

    // Live Task Progress tracking for Standing Desk
    const currPhaseProgress = appState.taskProgress?.[ph.key] || {};
    const prevTeamProgress = currPhaseProgress[g.name];
    const newCorrectCount = (prevTeamProgress?.correctAnswers || 0) + (isCorrect ? 1 : 0);
    const newTotalAttempts = (prevTeamProgress?.totalAttempts || 0) + 1;
    const answerTs = new Date().toISOString();
    const updatedTeamProgress: TaskProgressRecord = {
      teamIndex: session.groupIndex,
      teamName: g.name,
      phaseKey: ph.key,
      status: 'in_progress',
      currentQuestionIndex: session.itemIndex + 1,
      totalQuestions: ph.itemCount || 15,
      correctAnswers: newCorrectCount,
      totalAttempts: newTotalAttempts,
      accuracy: Math.round((newCorrectCount / newTotalAttempts) * 100),
      startedAt: prevTeamProgress?.startedAt || answerTs,
      lastActiveTs: answerTs,
    };
    const updatedTaskMap = {
      ...(appState.taskProgress || {}),
      [ph.key]: {
        ...currPhaseProgress,
        [g.name]: updatedTeamProgress,
      },
    };
    setAppState((prev) => ({
      ...prev,
      taskProgress: updatedTaskMap,
    }));

    // Instant live multi-device sync broadcast including task progress!
    pushCloudSync({
      newLogs: [newLog],
      taskProgress: updatedTaskMap,
    });

    if (ph.showFeedback) {
      if (isCorrect) {
        sounds.playCorrect();
        setFeedbackCardType('good');
        setFeedbackTitle('Correct! 🎉');
        setFeedbackSub(currentItem.explanation || 'Nice grammar instincts!');
      } else {
        sounds.playWrong();
        setFeedbackCardType('bad');
        setFeedbackTitle("Not quite — that's okay!");
        setFeedbackSub(
          `The correct answer is "${currentItem.o[currentItem.c]}". ${currentItem.explanation || ''}`
        );
      }
    } else {
      sounds.playTap();
      setFeedbackCardType('neutral');
      setFeedbackTitle('Answer locked in!');
      setFeedbackSub('Baton secured! Moving to the next item.');
    }
    setFeedbackOverlayShow(true);
  };

  const handleNextTurnOrItem = () => {
    sounds.playTap();
    setFeedbackOverlayShow(false);
    setSelectedOptionIndex(null);
    if (!session) return;

    const g = appState.groups[session.groupIndex];
    const ph = PHASES[session.phaseIndex];
    const nextItemIndex = session.itemIndex + 1;
    const nextTurnPlayerIndex = (session.turnPlayerIndex + 1) % g.members.length;

    // Check for Bonus Lap 1 transition after Question 5 (index 4)
    if (ph.key.startsWith('session') && nextItemIndex === 5 && activeMissionCurriculum?.bonusLap1) {
      setSession({
        ...session,
        itemIndex: 5,
        turnPlayerIndex: nextTurnPlayerIndex,
      });
      setBonusWeDoIndex(0);
      setInteractiveSelectedAnswer(null);
      setInteractiveFeedback(null);
      setScreen('bonus_lap_1_unlocked');
      window.scrollTo(0, 0);
      return;
    }

    // Check for Bonus Lap 2 transition after Question 10 (index 9)
    if (ph.key.startsWith('session') && nextItemIndex === 10 && activeMissionCurriculum?.bonusLap2) {
      setSession({
        ...session,
        itemIndex: 10,
        turnPlayerIndex: nextTurnPlayerIndex,
      });
      setBonusLap2WeDoIndex(0);
      setInteractiveSelectedAnswer(null);
      setInteractiveFeedback(null);
      setScreen('bonus_lap_2_unlocked');
      window.scrollTo(0, 0);
      return;
    }

    if (nextItemIndex >= session.itemOrder.length) {
      // Completed current phase!
      const finishIso = new Date().toISOString();
      const currentDone = appState.completedToday[ph.key] || [];
      const updatedDoneList = Array.from(new Set([...currentDone, session.groupIndex]));
      const updatedCompleted = {
        ...appState.completedToday,
        [ph.key]: updatedDoneList,
      };

      const currPhaseProgress = appState.taskProgress?.[ph.key] || {};
      const prevTeamProgress = currPhaseProgress[g.name];
      const startedAt = prevTeamProgress?.startedAt || finishIso;
      const durationMs = Math.max(1000, new Date(finishIso).getTime() - new Date(startedAt).getTime());
      const durationSeconds = Math.round(durationMs / 1000);

      const completedTeamProgress: TaskProgressRecord = {
        teamIndex: session.groupIndex,
        teamName: g.name,
        phaseKey: ph.key,
        status: 'completed',
        currentQuestionIndex: ph.itemCount || 15,
        totalQuestions: ph.itemCount || 15,
        correctAnswers: prevTeamProgress?.correctAnswers || session.itemOrder.length,
        totalAttempts: prevTeamProgress?.totalAttempts || session.itemOrder.length,
        accuracy: prevTeamProgress?.accuracy || 100,
        startedAt,
        completedAt: finishIso,
        durationMs,
        durationSeconds,
        lastActiveTs: finishIso,
      };

      const updatedTaskMap = {
        ...(appState.taskProgress || {}),
        [ph.key]: {
          ...currPhaseProgress,
          [g.name]: completedTeamProgress,
        },
      };

      setAppState((prev) => ({
        ...prev,
        completedToday: updatedCompleted,
        taskProgress: updatedTaskMap,
      }));

      // Broadcast station completion and finish duration to cloud for Standing Desk and other devices
      pushCloudSync({
        clientState: { completedToday: updatedCompleted },
        taskProgress: updatedTaskMap,
      });

      sounds.playFanfare();
      triggerConfetti();

      if (ph.key === 'pretest') {
        setScreen('pretest_complete');
      } else if (ph.key === 'posttest') {
        setScreen('posttest_results');
      } else {
        setEndBadge(ph.badgeIcon || '🏅');
        setEndTitle(`${ph.label.toUpperCase()} COMPLETE!`);
        setEndMsg(
          `Amazing work, Relay Runners! You learned the core concepts and earned the ${ph.badgeName || 'Relay Medal'}!`
        );
        setScreen('mission_result');
      }
      window.scrollTo(0, 0);
    } else {
      setSession({
        ...session,
        itemIndex: nextItemIndex,
        turnPlayerIndex: nextTurnPlayerIndex,
      });
      setScreen('turn');
      window.scrollTo(0, 0);
    }
  };

  const handleSubmitSurvey = () => {
    sounds.playFanfare();
    triggerConfetti();
    const teamName = session ? appState.groups[session.groupIndex].name : 'Grade 6 Team';
    const newSurvey: SurveyResponse = {
      id: `survey-${Date.now()}`,
      teamName,
      timestamp: new Date().toISOString(),
      q1Rating: surveyQ1,
      q2Rating: surveyQ2,
      q3Rating: surveyQ3,
      comments: surveyComment.trim(),
    };
    setSurveys((prev) => [...prev, newSurvey]);
    // Broadcast survey to cloud
    pushCloudSync({ newSurveys: [newSurvey] });
    setScreen('thank_you');
    window.scrollTo(0, 0);
  };

  const handleCheckPin = () => {
    if (pinInput.trim() === appState.pin) {
      sounds.playTap();
      setIsPinModalOpen(false);
      setIsAdminModalOpen(true);
      setPinError(false);
      setPinInput('');
    } else {
      sounds.playWrong();
      setPinError(true);
    }
  };

  // Seed sample demo data
  const handleSeedSampleData = () => {
    sounds.playTap();
    const sampleLogs: AttemptLog[] = [];
    const now = new Date();

    ['pretest', 'session1', 'session2', 'session3', 'session4', 'posttest'].forEach((phaseKey, pOffset) => {
      const items = BANK[phaseKey as keyof typeof BANK] || [];
      appState.groups.forEach((group, gIdx) => {
        group.members.forEach((member, mIdx) => {
          const numItems = phaseKey === 'pretest' || phaseKey === 'posttest' ? 12 : 15;
          for (let q = 0; q < numItems; q++) {
            const item = items[q % items.length];
            const baseAcc = phaseKey === 'posttest' ? 0.88 : phaseKey === 'pretest' ? 0.58 : 0.75;
            const isCorrect = Math.random() < baseAcc;
            const chosen = isCorrect ? item.o[item.c] : item.o[(item.c + 1) % item.o.length];
            const logDate = new Date(now.getTime() - (5 - pOffset) * 86400000 + mIdx * 60000 + q * 10000);

            sampleLogs.push({
              id: `seed-${phaseKey}-${gIdx}-${mIdx}-${q}`,
              ts: logDate.toISOString(),
              phase: phaseKey,
              phaseLabel: PHASES.find((p) => p.key === phaseKey)?.label || phaseKey,
              weekLabel: PHASES.find((p) => p.key === phaseKey)?.weekLabel || 'Week',
              team: group.name,
              player: member,
              runnerIndex: mIdx + 1,
              roleAtTurn: RELAY_ROLES_INFO[q % 5].role,
              questionNumber: q + 1,
              prompt: item.p.replace(/\*\*/g, ''),
              chosen,
              correctAnswer: item.o[item.c],
              correct: isCorrect,
            });
          }
        });
      });
    });

    const sampleSurveys: SurveyResponse[] = appState.groups.map((g) => ({
      id: `seed-survey-${g.name}`,
      teamName: g.name,
      timestamp: new Date().toISOString(),
      q1Rating: 5,
      q2Rating: 5,
      q3Rating: 5,
      comments: 'We loved the relay roles and Coach Dash guides!',
    }));

    setLogData(sampleLogs);
    setSurveys(sampleSurveys);
    const newCompleted = recalculateCompletedToday(appState, sampleLogs);
    setAppState((prev) => ({
      ...prev,
      completedToday: newCompleted,
      surveyResponses: sampleSurveys,
    }));
    // Synchronize sample data to cloud server
    resetCloudDatabase(
      { ...appState, completedToday: newCompleted, surveyResponses: sampleSurveys },
      sampleLogs
    );
    setAdminNotification(`Loaded sample data for Pretest (12Q), Missions 1–4 (15Q), Posttest (12Q), and Surveys!`);
    setTimeout(() => setAdminNotification(null), 4000);
  };

  // Render Theme Drawer
  const renderThemeDrawer = () => {
    if (!showThemePicker) return null;
    return (
      <div className="theme-drawer" style={{ marginTop: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '18px' }}>🎨</span>
            <strong style={{ fontSize: '14px', fontFamily: 'Baloo 2' }}>
              Choose Background Color Theme
            </strong>
          </div>
          <button
            type="button"
            style={{ fontSize: '12px', fontWeight: 800, opacity: 0.6, cursor: 'pointer' }}
            onClick={() => setShowThemePicker(false)}
          >
            ✕ Close
          </button>
        </div>
        <div className="theme-options-grid">
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`theme-card-btn ${currentTheme === th.id ? 'active' : ''}`}
              onClick={() => {
                sounds.playTap();
                setCurrentTheme(th.id);
              }}
            >
              <span className="theme-dot" style={{ background: th.preview }} />
              <span>{th.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSessionHeader = () => (
    <div style={{ marginBottom: '14px', borderBottom: '2px solid var(--line)', paddingBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="brand-badge" style={{ width: '38px', height: '38px' }}>
            <span style={{ fontSize: '20px' }}>🏃</span>
          </div>
          <div>
            <div className="ggr-catchy-header">
              <span className="ggr-title-text" style={{ fontSize: '16px' }}>
                GAMIFIED GRAMMAR RELAY
              </span>
              <span className="ggr-ggr-badge">(GGR)</span>
            </div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, opacity: 0.75 }}>
              Grade 6 &bull; Basic Sentence Construction &amp; Parts of Speech &bull; Binanuahan ES
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {loggedTeamIndex !== null && (
            <div
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--cream-2)',
                border: `1.5px solid ${GROUP_COLORS[loggedTeamIndex % GROUP_COLORS.length]}`,
                color: 'var(--ink)',
              }}
              title={`Active Portal: ${appState.groups[loggedTeamIndex]?.name} (Locked)`}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: GROUP_COLORS[loggedTeamIndex % GROUP_COLORS.length],
                }}
              />
              <span>{appState.groups[loggedTeamIndex]?.name}</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{
              fontSize: '11px',
              fontWeight: 800,
              padding: '5px 11px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
            onClick={() => {
              sounds.playTap();
              setStandingDeskTaskKey(PHASES[session?.phaseIndex ?? appState.currentPhaseIndex]?.key || 'session1');
              setIsStandingDeskOpen(true);
            }}
            title="View Live Relay Standings & Check All Groups' Progress"
          >
            <span>🏆</span>
            <span>Standings</span>
          </button>
          {loggedTeamIndex !== null && (
            <button
              className="icon-btn"
              style={{ width: '32px', height: '32px' }}
              onClick={() => {
                sounds.playTap();
                setScreen('map');
                window.scrollTo(0, 0);
              }}
              aria-label="Back to track"
              title="Back to Race Map"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderRelayRolesBar = (groupMembers: string[], currentStepIndex: number) => {
    const rotated = getRotatedRoles(groupMembers, currentStepIndex);
    return (
      <div className="relay-roles-container">
        <div className="relay-roles-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>🤝</span>
            <span style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'Baloo 2' }}>
              Meet Relay Roles (Rotates Every Challenge)
            </span>
          </div>
          <div className="team-cheer-badge">READ → THINK → DISCUSS → RUN!</div>
        </div>
        <div className="relay-roles-grid">
          {rotated.map((r, i) => (
            <div
              key={i}
              className={`role-chip ${r.isCurrentTapRunner ? 'active-runner' : ''}`}
              title={`${r.roleInfo.title}: ${r.roleInfo.duty}`}
            >
              <span className="role-icon">{r.roleInfo.icon}</span>
              <div className="role-title">{r.roleInfo.title}</div>
              <div className="role-member">{r.member}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const currentGroup = session ? appState.groups[session.groupIndex] : appState.groups[0];
  const currentItemIndex = session ? session.itemOrder[session.itemIndex] : 0;
  const currentItem = session ? BANK[activePhase.key][currentItemIndex] : BANK.pretest[0];
  const currentItemPromptHtml = currentItem ? currentItem.p.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') : '';
  const letters = ['A', 'B', 'C', 'D'];

  return (
    <>
      {/* SCREEN: RACE MAP */}
      {screen === 'map' && (
        <div className="screen" id="screen-map">
          <div className="topbar">
            <div className="brand">
              <div className="brand-badge">
                <span style={{ fontSize: '24px' }}>🏃</span>
              </div>
              <div className="brand-name">
                <div className="ggr-catchy-header" style={{ gap: '6px' }}>
                  <span className="ggr-title-text" style={{ fontSize: '18px' }}>
                    Gamified Grammar Relay
                  </span>
                  <span className="ggr-ggr-badge" style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                    GGR
                  </span>
                </div>
                <small>BINANUAHAN ES &middot; COACH DASH</small>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loggedTeamIndex !== null && (
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    padding: '6px 12px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--cream-2)',
                    border: `2px solid ${GROUP_COLORS[loggedTeamIndex % GROUP_COLORS.length]}`,
                    color: 'var(--ink)',
                  }}
                  title={`Device locked to ${appState.groups[loggedTeamIndex]?.name}'s portal for the race`}
                >
                  <span
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      background: GROUP_COLORS[loggedTeamIndex % GROUP_COLORS.length],
                    }}
                  />
                  <span>{appState.groups[loggedTeamIndex]?.name}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      background: 'rgba(0,0,0,0.06)',
                      padding: '1px 6px',
                      borderRadius: '6px',
                      fontWeight: 800,
                      opacity: 0.85,
                    }}
                  >
                    🔒 Portal Locked
                  </span>
                </div>
              )}
              <button
                className="btn btn-primary btn-sm"
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                }}
                onClick={() => {
                  sounds.playTap();
                  setStandingDeskTaskKey(PHASES[appState.currentPhaseIndex]?.key || 'session1');
                  setIsStandingDeskOpen(true);
                }}
                title="View Live Relay Standings & Check All Groups' Progress"
              >
                <span>🏆</span>
                <span>Standings</span>
                {isLiveSseConnected && (
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: '#4ADE80',
                      boxShadow: '0 0 6px rgba(74, 222, 128, 0.8)',
                    }}
                    title="Live Real-Time Sync Connected"
                  />
                )}
              </button>
            </div>
          </div>

          {renderThemeDrawer()}

          <div className="mascot-wrap">
            <div className="speech-bubble" id="home-speech">
              &ldquo;Welcome, Relay Runners! Let&apos;s conquer our missions together!&rdquo; — Coach Dash
            </div>
            <Mascot type="idle" />
          </div>

          <div className="ggr-hero-title">
            <span>GAMIFIED GRAMMAR RELAY </span>
            <span className="ggr-ggr-badge" style={{ fontSize: '18px', verticalAlign: 'middle' }}>
              (GGR)
            </span>
          </div>
          <div className="hero-sub" style={{ textAlign: 'center' }}>
            Basic Sentence Construction &amp; Parts of Speech &bull; 5 Relay Roles per Team
          </div>

          {/* Full GGR Relay Roadmap */}
          <div id="track-container" className="track-wrap">
            {PHASES.map((ph, i) => {
              const isLeft = i % 2 === 0;
              let status = 'locked';
              if (i < appState.currentPhaseIndex) status = 'done';
              else if (i === appState.currentPhaseIndex) status = 'active';

              return (
                <div key={ph.key} className={`track-node-row ${isLeft ? 'left' : 'right'}`}>
                  <div
                    className={`track-node ${status}`}
                    onClick={() => handleNodeTap(i)}
                    style={{
                      cursor: status === 'active' ? 'pointer' : 'not-allowed',
                      opacity: status === 'active' ? 1 : status === 'done' ? 0.75 : 0.55,
                    }}
                  >
                    <div className={`node-dot ${status}`}>
                      {status === 'done' ? '✅' : status === 'locked' ? '🔒' : ph.icon}
                    </div>
                    <div>
                      <div className="node-label">
                        {ph.label} <span style={{ opacity: 0.65, fontSize: '12px' }}>({ph.weekLabel})</span>
                      </div>
                      <div className="node-sub">
                        {ph.sub} &middot; {ph.itemCount} items
                      </div>
                      {status === 'active' && <div className="node-tap">TAP TO START →</div>}
                      {status === 'done' && (
                        <div className="node-tap" style={{ color: 'var(--track)' }}>
                          COMPLETED ✓
                        </div>
                      )}
                      {status === 'locked' && (
                        <div className="node-tap" style={{ color: '#888888', fontWeight: 700 }}>
                          LOCKED 🔒
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SCREEN: TEAM LOG IN */}
      {screen === 'team_login' && (
        <div className="screen" id="screen-team-login">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>TEAM LOG IN &bull; MANDATORY ENTRY</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;Welcome, Relay Runners! Please log in with your assigned team and confirm your 5 runners. Once logged in, this device is locked to your team&apos;s portal for the race. To check other teams&apos; progress and speed, use the 🏆 Standings button above!&rdquo;
            </div>
          </div>

          <div className="item-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontFamily: 'Baloo 2' }}>Team Log In</h2>
                <div style={{ fontSize: '12px', opacity: 0.75, fontWeight: 700 }}>
                  Select your assigned team. Once logged in, this device is locked to your portal.
                </div>
              </div>
              <span
                className="pill"
                style={{
                  background: GROUP_COLORS[loginTeamIndex],
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                Team {loginTeamIndex + 1} &middot; {loginTeamName}
              </span>
            </div>

            {/* Portal Lock Info Notice */}
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1.5px solid rgba(59, 130, 246, 0.28)',
                borderRadius: '12px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>🔒</span>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>
                <strong>Single-Team Device Lock:</strong> Once logged in, you cannot switch or log into other teams&apos; portals. The <strong>🏆 Standings</strong> button is every team&apos;s live connection to see who is faster and done!
              </div>
            </div>

            {/* 1. Team Tabs */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '6px' }}>
                1. Select Your Team:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                {appState.groups.map((team, idx) => {
                  const isSelected = loginTeamIndex === idx;
                  const color = GROUP_COLORS[idx];
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`team-tab-btn ${isSelected ? 'active' : ''}`}
                      style={{
                        padding: '10px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        borderColor: isSelected ? color : 'var(--line)',
                        background: isSelected ? color : 'var(--cream)',
                        color: isSelected ? '#fff' : 'var(--ink)',
                        boxShadow: isSelected ? '0 3px 8px rgba(0,0,0,0.18)' : 'none',
                      }}
                      onClick={() => handleSelectLoginTeam(idx)}
                    >
                      <span style={{ fontWeight: 800, fontSize: '13px' }}>
                        Team {idx + 1}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          opacity: isSelected ? 0.95 : 0.8,
                        }}
                      >
                        {team.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Team Name Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px' }}>
                2. Team Name:
              </label>
              <input
                className="text-input"
                style={{ fontSize: '14px', fontWeight: 700 }}
                placeholder={`Team ${loginTeamIndex + 1} Name`}
                value={loginTeamName}
                onChange={(e) => {
                  setLoginTeamName(e.target.value);
                  setLoginError(null);
                }}
              />
            </div>

            {/* 3. 5 Runners Roster */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>
                  3. Enter 5 Runners &amp; Assign Relay Roles:
                </label>
                <span className="small-note">5 Runners per Team</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {loginMemberNames.map((name, mIdx) => {
                  const role = RELAY_ROLES_INFO[mIdx % 5];
                  return (
                    <div
                      key={mIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: 'var(--cream-2)',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        border: '1.5px solid var(--line)',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>{role.icon}</span>
                      <div style={{ minWidth: '95px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'Baloo 2' }}>
                          Runner {mIdx + 1}
                        </div>
                        <div style={{ fontSize: '10px', opacity: 0.7, fontWeight: 700 }}>
                          {role.title}
                        </div>
                      </div>
                      <input
                        className="text-input"
                        style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
                        placeholder={`Runner ${mIdx + 1} Name`}
                        value={name}
                        onChange={(e) => {
                          const updated = [...loginMemberNames];
                          updated[mIdx] = e.target.value;
                          setLoginMemberNames(updated);
                          setLoginError(null);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {loginError && (
              <div
                style={{
                  background: '#FCE7E4',
                  border: '1.5px solid var(--danger)',
                  color: 'var(--danger)',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  marginBottom: '14px',
                }}
              >
                ⚠️ {loginError}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleLoginSubmit}>
              [ 🏃 LOG IN TEAM &amp; ENTER RACE MAP ]
            </button>
            {loggedTeamIndex !== null && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: '8px' }}
                onClick={() => {
                  sounds.playTap();
                  setScreen('map');
                  window.scrollTo(0, 0);
                }}
              >
                Return to Race Map
              </button>
            )}
          </div>
        </div>
      )}

      {/* SCREEN: GROUP SELECTION */}
      {screen === 'groups' && (
        <div className="screen" id="screen-groups">
          {renderSessionHeader()}
          <div className="topbar" style={{ marginBottom: '8px' }}>
            <button
              className="icon-btn"
              onClick={() => {
                sounds.playTap();
                setScreen('map');
                window.scrollTo(0, 0);
              }}
              aria-label="Back to map"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="pill">
              {activePhase.label} &middot; {activePhase.sub}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                border: '1.5px solid var(--line)',
              }}
              onClick={() => {
                sounds.playTap();
                setIsOverviewStandingsModalOpen(true);
              }}
              title="View Live Standings"
            >
              <span>🏆</span>
              <span>Standings</span>
            </button>
          </div>

          <h2 className="hero-line" style={{ marginBottom: '4px' }}>
            Select Your Relay Group
          </h2>
          <div className="hero-sub">
            4 groups &times; 5 runners. Each group shares 1 device and rotates 5 relay roles!
          </div>

          <div className="group-grid">
            {appState.groups.map((g, gi) => {
              const doneList = appState.completedToday[activePhase.key] || [];
              const isDone = doneList.includes(gi);
              const isMyTeam = loggedTeamIndex !== null && loggedTeamIndex === gi;
              const isOtherTeam = loggedTeamIndex !== null && loggedTeamIndex !== gi;
              return (
                <button
                  key={gi}
                  className="group-card"
                  style={{
                    background: isOtherTeam
                      ? 'var(--cream-2)'
                      : GROUP_COLORS[gi % GROUP_COLORS.length],
                    opacity: isOtherTeam ? 0.72 : 1,
                    border: isMyTeam
                      ? `3px solid var(--track-dark)`
                      : isOtherTeam
                      ? '2px dashed var(--line)'
                      : 'none',
                    transform: isMyTeam ? 'scale(1.02)' : 'none',
                    boxShadow: isMyTeam ? '0 4px 12px rgba(0,0,0,0.18)' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleGroupSelect(gi)}
                >
                  <span className="g-icon">{isOtherTeam ? '🔒' : '🏃'}</span>
                  <span className="g-name" style={{ color: isOtherTeam ? 'var(--ink)' : '#fff' }}>
                    {g.name}
                  </span>
                  <div
                    className="g-sub"
                    style={{
                      color: isOtherTeam ? 'var(--ink)' : '#fff',
                      opacity: isOtherTeam ? 0.75 : 0.95,
                    }}
                  >
                    {isMyTeam
                      ? '⭐ Your Logged-In Team'
                      : isOtherTeam
                      ? 'Assigned to another device'
                      : '5 Runners • Relay Rotation'}
                  </div>
                  {isDone ? (
                    <span className="g-status">Completed Today ✅</span>
                  ) : isOtherTeam ? (
                    <span
                      className="g-status"
                      style={{
                        background: '#F1F5F9',
                        color: '#475569',
                        border: '1px solid #CBD5E1',
                      }}
                    >
                      🔒 Protected &bull; Other Team
                    </span>
                  ) : (
                    <span className="g-status" style={{ background: 'rgba(255,255,255,0.35)' }}>
                      Ready to Race ⚡
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loggedTeamIndex !== null && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 14px',
                background: 'var(--cream-2)',
                border: '1.5px solid var(--line)',
                borderRadius: '14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '3px' }}>
                🛡️ Team Privacy Active: Device is logged in as <b>{appState.groups[loggedTeamIndex]?.name}</b>
              </div>
              <div style={{ fontSize: '11px', opacity: 0.75, fontWeight: 700, marginBottom: '8px' }}>
                Other teams cannot see your answers or alter your score. Each team races on their own assigned device.
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '11.5px', fontWeight: 800 }}
                onClick={() => {
                  sounds.playTap();
                  setLoginTeamIndex(loggedTeamIndex);
                  const grp = appState.groups[loggedTeamIndex];
                  setLoginTeamName(grp.name);
                  setLoginMemberNames([...grp.members]);
                  setLoginError(null);
                  setScreen('team_login');
                  window.scrollTo(0, 0);
                }}
              >
                🔄 Switch or Re-verify Team Log In
              </button>
            </div>
          )}
        </div>
      )}

      {/* SCREEN: PRETEST WELCOME */}
      {screen === 'pretest_welcome' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>Relay Head Coach</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;Hello, {appState.groups[session?.groupIndex ?? loginTeamIndex].name}! Welcome to the Gamified Grammar Relay! Let&apos;s take your 12-item Pretest to see what you already know about sentences and words.&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>🏁</div>
            <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>WELCOME TO THE RELAY!</h2>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--track-dark)', marginBottom: '10px' }}>
              Logged in: {appState.groups[session?.groupIndex ?? loginTeamIndex].name} &bull; 5 Runners Ready
            </div>
            <p style={{ fontSize: '13.5px', opacity: 0.8, lineHeight: 1.6, marginBottom: '20px' }}>
              Standard test conditions &mdash; 12 baseline items, no timer, individual seatwork, adequate time allotment.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('pretest_orientation');
                window.scrollTo(0, 0);
              }}
            >
              [ START PRETEST ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: PRETEST ORIENTATION */}
      {screen === 'pretest_orientation' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>ORIENTATION</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;Answer each item on your own first. There&apos;s no timer here — take your time and do your best on all 12 items!&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '10px' }}>Pretest Instructions</h2>
            <ul style={{ textAlign: 'left', fontSize: '13px', lineHeight: 1.7, opacity: 0.85, marginBottom: '20px', paddingLeft: '18px' }}>
              <li>12 items covering Basic Sentence Construction and Parts of Speech.</li>
              <li>Read each question carefully before choosing your answer.</li>
              <li>No timer &mdash; do your best!</li>
            </ul>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('turn');
                window.scrollTo(0, 0);
              }}
            >
              [ BEGIN 12 ITEMS ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: PRETEST COMPLETE */}
      {screen === 'pretest_complete' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="end-wrap">
            <Mascot type="cheer" isBig />
            <div className="end-badge">🏁</div>
            <div className="end-title display">PRETEST COMPLETE</div>
            <div className="coach-dash-card" style={{ textAlign: 'left', marginTop: '16px' }}>
              <div className="coach-header">
                <div className="coach-avatar-badge">🏃</div>
                <div>
                  <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                </div>
              </div>
              <div className="coach-dialogue">
                &ldquo;Great job completing all 12 items! This is your baseline score before the relay begins. Let&apos;s head to Mission 1!&rdquo;
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: '16px' }}
              onClick={() => {
                sounds.playTap();
                setScreen('map');
                window.scrollTo(0, 0);
              }}
            >
              Back to Race Map
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: MISSION UNLOCKED */}
      {screen === 'mission_unlocked' && activeMissionCurriculum && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>
                  MISSION {activeMissionCurriculum.missionNumber} UNLOCKED!
                </div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.briefing.welcome}&rdquo;
            </div>
          </div>

          <div className="item-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '24px' }}>{activePhase.icon}</span>
              <div>
                <h2 style={{ fontSize: '20px' }}>
                  MISSION {activeMissionCurriculum.missionNumber} &mdash; {activePhase.weekLabel}
                </h2>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--sky)' }}>
                  {activeMissionCurriculum.title} &bull; {activeMissionCurriculum.subtitle}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 800, opacity: 0.6, marginBottom: '6px', textTransform: 'uppercase' }}>
              Domain: {activeMissionCurriculum.domain}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              Today you will learn how to:
            </div>
            <ul style={{ fontSize: '13px', lineHeight: 1.7, opacity: 0.9, paddingLeft: '18px', marginBottom: '16px' }}>
              {activeMissionCurriculum.briefing.objectives.map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('how_to_play');
                window.scrollTo(0, 0);
              }}
            >
              [ START MISSION {activeMissionCurriculum.missionNumber} ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: HOW TO PLAY & RELAY ROLES ORIENTATION */}
      {screen === 'how_to_play' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>HOW TO PLAY</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;You&apos;ll race through this mission as a team. Listen, think, discuss, then run!&rdquo;
            </div>
          </div>

          <div className="item-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h2 style={{ fontSize: '18px' }}>5 Team Relay Roles</h2>
              <span className="team-cheer-badge">ROTATE EACH CHALLENGE</span>
            </div>
            <p style={{ fontSize: '13px', opacity: 0.8, marginBottom: '12px' }}>
              Every group of 5 shares one device and rotates these relay roles after each challenge:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {RELAY_ROLES_INFO.map((r, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--cream)',
                    border: '1.5px solid var(--line)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '22px' }}>{r.icon}</span>
                  <div>
                    <strong style={{ fontSize: '13px', fontFamily: 'Baloo 2' }}>{r.title}</strong>
                    <div style={{ fontSize: '11.5px', opacity: 0.8 }}>{r.duty}</div>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                textAlign: 'center',
                background: 'var(--cream-2)',
                padding: '10px',
                borderRadius: '12px',
                marginBottom: '16px',
                fontFamily: 'Baloo 2',
                fontWeight: 800,
                fontSize: '14px',
                color: 'var(--baton-dark)',
              }}
            >
              Team Cheer: &ldquo;READ → THINK → DISCUSS → RUN!&rdquo;
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setIDoSubStep(0);
                setScreen('i_do');
                window.scrollTo(0, 0);
              }}
            >
              [ GOT IT! LET&apos;S GO ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: I DO */}
      {screen === 'i_do' && activeMissionCurriculum && (
        <div className="screen">
          {renderSessionHeader()}
          {renderRelayRolesBar(currentGroup.members, 0)}
          <div className="instruction-stage-beads">
            <span className="stage-bead active">I DO 👀</span>
            <span className="stage-bead">WE DO 🤝</span>
            <span className="stage-bead">YOU DO 🏃</span>
          </div>

          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>I DO &mdash; WATCH ME FIRST!</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.iDo.coachMessage}&rdquo;
            </div>
          </div>

          {iDoSubStep === 0 && (
            <div className="item-card">
              <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Essential Grammar Rules</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {activeMissionCurriculum.iDo.rules.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--cream)',
                      border: '1.5px solid var(--line)',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      fontSize: '13.5px',
                    }}
                  >
                    {r}
                  </div>
                ))}
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  sounds.playTap();
                  setIDoSubStep(1);
                  window.scrollTo(0, 0);
                }}
              >
                [ SHOW ME AN EXAMPLE ]
              </button>
            </div>
          )}

          {iDoSubStep === 1 && activeMissionCurriculum.iDo.examples[0] && (() => {
            const ex = activeMissionCurriculum.iDo.examples[0];
            return (
              <div className="item-card">
                <div className="item-eyebrow">EXAMPLE 1 &mdash; COMPLETE DEMONSTRATION</div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    marginBottom: '14px',
                    background: 'var(--cream-2)',
                    padding: '12px',
                    borderRadius: '12px',
                  }}
                >
                  &ldquo;{ex.text}&rdquo;
                </div>
                <div className="chunk-analysis-wrap">
                  {ex.analysis.map((an, i) => (
                    <div key={i} className="chunk-card">
                      <div className="chunk-label">
                        <span>{an.icon}</span>
                        <span>{an.label}</span>
                      </div>
                      <div>{an.text}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '13px', opacity: 0.8, margin: '14px 0', lineHeight: 1.5 }}>
                  {ex.explanation}
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    sounds.playTap();
                    setIDoSubStep(2);
                    window.scrollTo(0, 0);
                  }}
                >
                  [ NEXT STEP ]
                </button>
              </div>
            );
          })()}

          {iDoSubStep === 2 && (
            <div className="item-card">
              <div className="item-eyebrow">COACH DASH&apos;S GUIDE</div>
              <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>
                {activeMissionCurriculum.iDo.guideSummary.title}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {activeMissionCurriculum.iDo.guideSummary.steps.map((st, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--cream)',
                      border: '1.5px solid var(--line)',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    {st}
                  </div>
                ))}
              </div>
              {activeMissionCurriculum.iDo.guideSummary.formula && (
                <div
                  style={{
                    background: '#E4F7EC',
                    border: '2px solid var(--track)',
                    color: 'var(--track-dark)',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '13px',
                    textAlign: 'center',
                    marginBottom: '16px',
                  }}
                >
                  🏃 Easy Reminder: {activeMissionCurriculum.iDo.guideSummary.formula}
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  sounds.playTap();
                  setIDoSubStep(3);
                  setInteractiveSelectedAnswer(null);
                  setInteractiveFeedback(null);
                  window.scrollTo(0, 0);
                }}
              >
                [ PRACTICE QUICK CHECK ]
              </button>
            </div>
          )}

          {iDoSubStep === 3 && (() => {
            const qc = activeMissionCurriculum.iDo.quickCheck;
            return (
              <div className="item-card">
                <div className="item-eyebrow">QUICK I DO CHECK</div>
                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '14px' }}>
                  {qc.question}
                </div>
                <div className="options-grid">
                  {qc.options.map((opt, i) => {
                    const isSelected = interactiveSelectedAnswer === i;
                    const isCorrect = i === qc.correct;
                    let extra = '';
                    if (interactiveSelectedAnswer !== null) {
                      extra = isCorrect ? 'correct' : isSelected ? 'wrong' : '';
                    }
                    return (
                      <button
                        key={i}
                        className={`option-btn ${extra}`}
                        disabled={interactiveSelectedAnswer !== null}
                        onClick={() => {
                          sounds.playTap();
                          setInteractiveSelectedAnswer(i);
                          if (i === qc.correct) {
                            sounds.playCorrect();
                            setInteractiveFeedback({ isCorrect: true, message: qc.explanation });
                          } else {
                            sounds.playWrong();
                            setInteractiveFeedback({
                              isCorrect: false,
                              message: `Not quite! ${qc.explanation}`,
                            });
                          }
                        }}
                      >
                        <span className="opt-letter">{letters[i]}</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {interactiveFeedback && (
                  <div
                    style={{
                      background: interactiveFeedback.isCorrect ? '#E4F7EC' : '#FCE7E4',
                      border: `2px solid ${interactiveFeedback.isCorrect ? 'var(--track)' : 'var(--danger)'}`,
                      borderRadius: '12px',
                      padding: '10px 14px',
                      marginTop: '14px',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    {interactiveFeedback.message}
                  </div>
                )}
                {interactiveSelectedAnswer !== null && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '16px' }}
                    onClick={() => {
                      sounds.playTap();
                      setWeDoSubStep(0);
                      setInteractiveSelectedAnswer(null);
                      setInteractiveFeedback(null);
                      setScreen('we_do');
                      window.scrollTo(0, 0);
                    }}
                  >
                    [ START WE DO GROUP PRACTICE ]
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* SCREEN: WE DO */}
      {screen === 'we_do' && activeMissionCurriculum && (() => {
        const challenge = activeMissionCurriculum.weDo.challenges[weDoSubStep] || activeMissionCurriculum.weDo.challenges[0];
        return (
          <div className="screen">
            {renderSessionHeader()}
            {renderRelayRolesBar(currentGroup.members, weDoSubStep + 1)}
            <div className="instruction-stage-beads">
              <span className="stage-bead">I DO 👀</span>
              <span className="stage-bead active">WE DO 🤝</span>
              <span className="stage-bead">YOU DO 🏃</span>
            </div>

            <div className="coach-dash-card">
              <div className="coach-header">
                <div className="coach-avatar-badge">🏃</div>
                <div>
                  <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>WE DO &mdash; PRACTICE TOGETHER!</div>
                </div>
              </div>
              <div className="coach-dialogue">
                &ldquo;{activeMissionCurriculum.weDo.coachMessage}&rdquo;
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                className="hint-toggle-btn"
                onClick={() => {
                  sounds.playTap();
                  setShowHintBox(!showHintBox);
                }}
              >
                💡 {showHintBox ? 'Close Hints' : 'Need a Hint?'}
              </button>
            </div>

            {showHintBox && (
              <div className="hint-box">
                <strong style={{ fontSize: '12.5px', color: '#B45309', display: 'block', marginBottom: '6px' }}>
                  Coach Dash&apos;s Hints:
                </strong>
                {activeMissionCurriculum.weDo.hints.map((h, i) => (
                  <div key={i} className="hint-item">
                    {h}
                  </div>
                ))}
              </div>
            )}

            <div className="item-card">
              <div className="item-eyebrow">
                {challenge.title} ({weDoSubStep + 1} of {activeMissionCurriculum.weDo.challenges.length})
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '14px' }}>
                {challenge.prompt}
              </div>
              <div
                style={{
                  background: 'var(--cream)',
                  border: '1px solid var(--line)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  opacity: 0.85,
                  marginBottom: '12px',
                }}
              >
                🤝 <b>Group task:</b> Reader reads → Solver answers → Checker checks → Explainer explains → Runner taps.
              </div>

              <div className="options-grid">
                {challenge.options.map((opt, i) => {
                  const isSelected = interactiveSelectedAnswer === i;
                  const isCorrect = i === challenge.correct;
                  let extra = '';
                  if (interactiveSelectedAnswer !== null) {
                    extra = isCorrect ? 'correct' : isSelected ? 'wrong' : '';
                  }
                  return (
                    <button
                      key={i}
                      className={`option-btn ${extra}`}
                      disabled={interactiveSelectedAnswer !== null}
                      onClick={() => {
                        sounds.playTap();
                        setInteractiveSelectedAnswer(i);
                        if (i === challenge.correct) {
                          sounds.playCorrect();
                          setInteractiveFeedback({ isCorrect: true, message: challenge.explanation });
                        } else {
                          sounds.playWrong();
                          setInteractiveFeedback({
                            isCorrect: false,
                            message: `Close! ${challenge.explanation}`,
                          });
                        }
                      }}
                    >
                      <span className="opt-letter">{letters[i]}</span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {interactiveFeedback && (
                <div
                  style={{
                    background: interactiveFeedback.isCorrect ? '#E4F7EC' : '#FCE7E4',
                    border: `2px solid ${interactiveFeedback.isCorrect ? 'var(--track)' : 'var(--danger)'}`,
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginTop: '14px',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                >
                  {interactiveFeedback.message}
                </div>
              )}

              {interactiveSelectedAnswer !== null && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => {
                    sounds.playTap();
                    setInteractiveSelectedAnswer(null);
                    setInteractiveFeedback(null);
                    if (weDoSubStep + 1 < activeMissionCurriculum.weDo.challenges.length) {
                      setWeDoSubStep(weDoSubStep + 1);
                      window.scrollTo(0, 0);
                    } else {
                      setSession({
                        phaseIndex: selectedPhaseIndex,
                        groupIndex: session ? session.groupIndex : 0,
                        itemOrder: Array.from({ length: activePhase.itemCount }, (_, i) => i),
                        itemIndex: 0,
                        turnPlayerIndex: 0,
                      });
                      setScreen('you_do_intro');
                      window.scrollTo(0, 0);
                    }
                  }}
                >
                  {weDoSubStep + 1 < activeMissionCurriculum.weDo.challenges.length
                    ? '[ NEXT CHALLENGE ]'
                    : '[ READY FOR YOU DO! ]'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* SCREEN: YOU DO INTRO */}
      {screen === 'you_do_intro' && activeMissionCurriculum && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="instruction-stage-beads">
            <span className="stage-bead">I DO 👀</span>
            <span className="stage-bead">WE DO 🤝</span>
            <span className="stage-bead active">YOU DO 🏃</span>
          </div>

          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>YOU DO &mdash; YOUR TURN!</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.youDo.coachMessage}&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Relay Main Stretch — Lap 1</h2>
            <p style={{ fontSize: '13px', opacity: 0.8, lineHeight: 1.6, marginBottom: '20px' }}>
              Rotate roles after every question! Everyone thinks first; the Runner taps the group&apos;s final answer.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('turn');
                window.scrollTo(0, 0);
              }}
            >
              [ START YOU DO ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: BONUS LAP 1 UNLOCKED */}
      {screen === 'bonus_lap_1_unlocked' && activeMissionCurriculum?.bonusLap1 && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>🏁 BONUS LAP UNLOCKED!</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.bonusLap1.unlockedDialogue}&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🏁</div>
            <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>BONUS LAP 1 — EXTRA TURN!</h2>
            <p style={{ fontSize: '13.5px', opacity: 0.8, lineHeight: 1.6, marginBottom: '20px' }}>
              Great run on the main course! Ready for an extra lap? New sentences, same skills &mdash; let&apos;s keep those legs warm!
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('bonus_lap_1_i_do');
                window.scrollTo(0, 0);
              }}
            >
              [ START BONUS LAP ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: BONUS LAP 1 I DO */}
      {screen === 'bonus_lap_1_i_do' && activeMissionCurriculum?.bonusLap1 && (
        <div className="screen">
          {renderSessionHeader()}
          {renderRelayRolesBar(currentGroup.members, 5)}
          <div className="instruction-stage-beads">
            <span className="stage-bead active">BONUS 1: I DO 👀</span>
            <span className="stage-bead">BONUS 1: WE DO 🤝</span>
            <span className="stage-bead">BONUS 1: YOU DO 🏃</span>
          </div>

          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>COACH DASH&apos;S EXTRA TURN</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.bonusLap1.iDo.coachMessage}&rdquo;
            </div>
          </div>

          <div className="item-card">
            <div className="item-eyebrow">EXTRA DEMONSTRATIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {activeMissionCurriculum.bonusLap1.iDo.displays.map((disp, i) => (
                <div
                  key={i}
                  style={{
                    background: disp.type === 'incomplete' ? '#FFF3F0' : 'var(--cream)',
                    border: `1.5px solid ${disp.type === 'incomplete' ? 'var(--danger)' : 'var(--line)'}`,
                    borderRadius: '14px',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>
                    {disp.type === 'incomplete' ? '❌ ' : '✅ '}&ldquo;{disp.text}&rdquo;
                  </div>
                  <div style={{ fontSize: '13px', opacity: 0.85, lineHeight: 1.5, marginBottom: disp.fix ? '8px' : '0' }}>
                    {disp.coachExplanation}
                  </div>
                  {disp.fix && (
                    <div style={{ background: '#E4F7EC', border: '1px solid var(--track)', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, color: 'var(--track-dark)', marginTop: '6px' }}>
                      💡 Fix: &ldquo;{disp.fix}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>

            {activeMissionCurriculum.bonusLap1.iDo.formula && (
              <div
                style={{
                  background: '#FFF8E1',
                  border: '2px solid #FCD34D',
                  color: '#92400E',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                {activeMissionCurriculum.bonusLap1.iDo.formula}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setBonusWeDoIndex(0);
                setInteractiveSelectedAnswer(null);
                setInteractiveFeedback(null);
                setScreen('bonus_lap_1_we_do');
                window.scrollTo(0, 0);
              }}
            >
              [ I UNDERSTAND — PRACTICE TOGETHER ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: BONUS LAP 1 WE DO */}
      {screen === 'bonus_lap_1_we_do' && activeMissionCurriculum?.bonusLap1 && (() => {
        const challenges = activeMissionCurriculum.bonusLap1.weDo.challenges;
        const currentChallenge = challenges[bonusWeDoIndex] || challenges[0];
        return (
          <div className="screen">
            {renderSessionHeader()}
            {renderRelayRolesBar(currentGroup.members, 5 + bonusWeDoIndex + 1)}
            <div className="instruction-stage-beads">
              <span className="stage-bead">BONUS 1: I DO 👀</span>
              <span className="stage-bead active">BONUS 1: WE DO 🤝</span>
              <span className="stage-bead">BONUS 1: YOU DO 🏃</span>
            </div>

            <div className="coach-dash-card">
              <div className="coach-header">
                <div className="coach-avatar-badge">🏃</div>
                <div>
                  <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>BONUS WE DO PRACTICE</div>
                </div>
              </div>
              <div className="coach-dialogue">
                &ldquo;{activeMissionCurriculum.bonusLap1.weDo.coachMessage}&rdquo;
              </div>
            </div>

            <div className="item-card">
              <div className="item-eyebrow">
                {currentChallenge.title} ({bonusWeDoIndex + 1} of {challenges.length})
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '14px' }}>
                {currentChallenge.prompt}
              </div>

              <div className="options-grid">
                {currentChallenge.options.map((opt, i) => {
                  const isSelected = interactiveSelectedAnswer === i;
                  const isCorrect = i === currentChallenge.correct;
                  let extra = '';
                  if (interactiveSelectedAnswer !== null) {
                    extra = isCorrect ? 'correct' : isSelected ? 'wrong' : '';
                  }
                  return (
                    <button
                      key={i}
                      className={`option-btn ${extra}`}
                      disabled={interactiveSelectedAnswer !== null}
                      onClick={() => {
                        sounds.playTap();
                        setInteractiveSelectedAnswer(i);
                        if (i === currentChallenge.correct) {
                          sounds.playCorrect();
                          setInteractiveFeedback({ isCorrect: true, message: currentChallenge.explanation });
                        } else {
                          sounds.playWrong();
                          setInteractiveFeedback({
                            isCorrect: false,
                            message: `Close! ${currentChallenge.explanation}`,
                          });
                        }
                      }}
                    >
                      <span className="opt-letter">{letters[i]}</span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {interactiveFeedback && (
                <div
                  style={{
                    background: interactiveFeedback.isCorrect ? '#E4F7EC' : '#FCE7E4',
                    border: `2px solid ${interactiveFeedback.isCorrect ? 'var(--track)' : 'var(--danger)'}`,
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginTop: '14px',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                >
                  {interactiveFeedback.message}
                </div>
              )}

              {interactiveSelectedAnswer !== null && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => {
                    sounds.playTap();
                    setInteractiveSelectedAnswer(null);
                    setInteractiveFeedback(null);
                    if (bonusWeDoIndex + 1 < challenges.length) {
                      setBonusWeDoIndex(bonusWeDoIndex + 1);
                      window.scrollTo(0, 0);
                    } else {
                      setScreen('bonus_lap_1_you_do_intro');
                      window.scrollTo(0, 0);
                    }
                  }}
                >
                  {bonusWeDoIndex + 1 < challenges.length
                    ? '[ NEXT CHALLENGE ]'
                    : '[ READY FOR BONUS YOU DO ]'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* SCREEN: BONUS LAP 1 YOU DO INTRO */}
      {screen === 'bonus_lap_1_you_do_intro' && activeMissionCurriculum?.bonusLap1 && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="instruction-stage-beads">
            <span className="stage-bead">BONUS 1: I DO 👀</span>
            <span className="stage-bead">BONUS 1: WE DO 🤝</span>
            <span className="stage-bead active">BONUS 1: YOU DO 🏃</span>
          </div>

          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>BONUS YOU DO &mdash; YOUR TURN!</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.bonusLap1.youDo.coachMessage}&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Bonus Lap 1 Challenge!</h2>
            <p style={{ fontSize: '13px', opacity: 0.8, lineHeight: 1.6, marginBottom: '20px' }}>
              Think first, then the Runner taps the group&apos;s final answer. No hints this time!
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('turn');
                window.scrollTo(0, 0);
              }}
            >
              [ START BONUS YOU DO ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: BONUS LAP 2 UNLOCKED */}
      {screen === 'bonus_lap_2_unlocked' && activeMissionCurriculum?.bonusLap2 && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>🏁 BONUS LAP 2 UNLOCKED!</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.bonusLap2.unlockedDialogue}&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🏁</div>
            <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>BONUS LAP 2 — CHAMPION EXTRA TURN!</h2>
            <p style={{ fontSize: '13.5px', opacity: 0.8, lineHeight: 1.6, marginBottom: '20px' }}>
              Two laps done, Relay Runners &mdash; and you&apos;re still running strong! Here&apos;s one more with brand-new sentences!
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('bonus_lap_2_i_do');
                window.scrollTo(0, 0);
              }}
            >
              [ START BONUS LAP 2 ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: BONUS LAP 2 I DO */}
      {screen === 'bonus_lap_2_i_do' && activeMissionCurriculum?.bonusLap2 && (
        <div className="screen">
          {renderSessionHeader()}
          {renderRelayRolesBar(currentGroup.members, 10)}
          <div className="instruction-stage-beads">
            <span className="stage-bead active">BONUS 2: I DO 👀</span>
            <span className="stage-bead">BONUS 2: WE DO 🤝</span>
            <span className="stage-bead">BONUS 2: YOU DO 🏃</span>
          </div>

          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>BONUS LAP 2 &mdash; COACH DASH&apos;S TURN</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.bonusLap2.iDo.coachMessage}&rdquo;
            </div>
          </div>

          <div className="item-card">
            <div className="item-eyebrow">CHAMPION DEMONSTRATIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {activeMissionCurriculum.bonusLap2.iDo.displays.map((disp, i) => (
                <div
                  key={i}
                  style={{
                    background: disp.type === 'incomplete' ? '#FFF3F0' : 'var(--cream)',
                    border: `1.5px solid ${disp.type === 'incomplete' ? 'var(--danger)' : 'var(--line)'}`,
                    borderRadius: '14px',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>
                    {disp.type === 'incomplete' ? '❌ ' : '✅ '}&ldquo;{disp.text}&rdquo;
                  </div>
                  <div style={{ fontSize: '13px', opacity: 0.85, lineHeight: 1.5, marginBottom: disp.fix ? '8px' : '0' }}>
                    {disp.coachExplanation}
                  </div>
                  {disp.fix && (
                    <div style={{ background: '#E4F7EC', border: '1px solid var(--track)', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, color: 'var(--track-dark)', marginTop: '6px' }}>
                      💡 Fix: &ldquo;{disp.fix}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>

            {activeMissionCurriculum.bonusLap2.iDo.formula && (
              <div
                style={{
                  background: '#FFF8E1',
                  border: '2px solid #FCD34D',
                  color: '#92400E',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                {activeMissionCurriculum.bonusLap2.iDo.formula}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setBonusLap2WeDoIndex(0);
                setInteractiveSelectedAnswer(null);
                setInteractiveFeedback(null);
                setScreen('bonus_lap_2_we_do');
                window.scrollTo(0, 0);
              }}
            >
              [ I UNDERSTAND — PRACTICE TOGETHER ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: BONUS LAP 2 WE DO */}
      {screen === 'bonus_lap_2_we_do' && activeMissionCurriculum?.bonusLap2 && (() => {
        const challenges = activeMissionCurriculum.bonusLap2.weDo.challenges;
        const currentChallenge = challenges[bonusLap2WeDoIndex] || challenges[0];
        return (
          <div className="screen">
            {renderSessionHeader()}
            {renderRelayRolesBar(currentGroup.members, 10 + bonusLap2WeDoIndex + 1)}
            <div className="instruction-stage-beads">
              <span className="stage-bead">BONUS 2: I DO 👀</span>
              <span className="stage-bead active">BONUS 2: WE DO 🤝</span>
              <span className="stage-bead">BONUS 2: YOU DO 🏃</span>
            </div>

            <div className="coach-dash-card">
              <div className="coach-header">
                <div className="coach-avatar-badge">🏃</div>
                <div>
                  <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>BONUS LAP 2 WE DO PRACTICE</div>
                </div>
              </div>
              <div className="coach-dialogue">
                &ldquo;{activeMissionCurriculum.bonusLap2.weDo.coachMessage}&rdquo;
              </div>
            </div>

            <div className="item-card">
              <div className="item-eyebrow">
                {currentChallenge.title} ({bonusLap2WeDoIndex + 1} of {challenges.length})
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '14px' }}>
                {currentChallenge.prompt}
              </div>

              <div className="options-grid">
                {currentChallenge.options.map((opt, i) => {
                  const isSelected = interactiveSelectedAnswer === i;
                  const isCorrect = i === currentChallenge.correct;
                  let extra = '';
                  if (interactiveSelectedAnswer !== null) {
                    extra = isCorrect ? 'correct' : isSelected ? 'wrong' : '';
                  }
                  return (
                    <button
                      key={i}
                      className={`option-btn ${extra}`}
                      disabled={interactiveSelectedAnswer !== null}
                      onClick={() => {
                        sounds.playTap();
                        setInteractiveSelectedAnswer(i);
                        if (i === currentChallenge.correct) {
                          sounds.playCorrect();
                          setInteractiveFeedback({ isCorrect: true, message: currentChallenge.explanation });
                        } else {
                          sounds.playWrong();
                          setInteractiveFeedback({
                            isCorrect: false,
                            message: `Close! ${currentChallenge.explanation}`,
                          });
                        }
                      }}
                    >
                      <span className="opt-letter">{letters[i]}</span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {interactiveFeedback && (
                <div
                  style={{
                    background: interactiveFeedback.isCorrect ? '#E4F7EC' : '#FCE7E4',
                    border: `2px solid ${interactiveFeedback.isCorrect ? 'var(--track)' : 'var(--danger)'}`,
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginTop: '14px',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                >
                  {interactiveFeedback.message}
                </div>
              )}

              {interactiveSelectedAnswer !== null && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => {
                    sounds.playTap();
                    setInteractiveSelectedAnswer(null);
                    setInteractiveFeedback(null);
                    if (bonusLap2WeDoIndex + 1 < challenges.length) {
                      setBonusLap2WeDoIndex(bonusLap2WeDoIndex + 1);
                      window.scrollTo(0, 0);
                    } else {
                      setScreen('bonus_lap_2_you_do_intro');
                      window.scrollTo(0, 0);
                    }
                  }}
                >
                  {bonusLap2WeDoIndex + 1 < challenges.length
                    ? '[ NEXT CHALLENGE ]'
                    : '[ READY FOR BONUS YOU DO ]'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* SCREEN: BONUS LAP 2 YOU DO INTRO */}
      {screen === 'bonus_lap_2_you_do_intro' && activeMissionCurriculum?.bonusLap2 && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="instruction-stage-beads">
            <span className="stage-bead">BONUS 2: I DO 👀</span>
            <span className="stage-bead">BONUS 2: WE DO 🤝</span>
            <span className="stage-bead active">BONUS 2: YOU DO 🏃</span>
          </div>

          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>CHAMPION FINAL LAP &mdash; YOUR TURN!</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;{activeMissionCurriculum.bonusLap2.youDo.coachMessage}&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Bonus Lap 2 Final Stretch!</h2>
            <p style={{ fontSize: '13px', opacity: 0.8, lineHeight: 1.6, marginBottom: '20px' }}>
              Final 5 questions of this mission! Rotate roles, think together, and cross the finish line!
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('turn');
                window.scrollTo(0, 0);
              }}
            >
              [ START BONUS LAP 2 ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: TURN / BATON PASS */}
      {screen === 'turn' && session && (() => {
        const rotated = getRotatedRoles(currentGroup.members, session.itemIndex);
        const tapRunner = rotated.find((r) => r.roleInfo.role === 'RUNNER') || rotated[0];

        return (
          <div className="screen" id="screen-turn">
            {renderSessionHeader()}
            {renderRelayRolesBar(currentGroup.members, session.itemIndex)}

            <div className="turn-wrap">
              <Mascot type="ready" />
              <div className="turn-hint">Current Baton Holder:</div>
              <div
                className="player-avatar"
                style={{ background: GROUP_COLORS[session.groupIndex % GROUP_COLORS.length] }}
              >
                {tapRunner.member.trim().charAt(0).toUpperCase() || 'R'}
              </div>
              <div className="player-name display">{tapRunner.member}</div>
              <div className="turn-hint" style={{ marginBottom: '12px' }}>
                Role: <b>🏃 RUNNER (Taps &amp; Submits Answer)</b> &bull; Item {session.itemIndex + 1} of {session.itemOrder.length}
              </div>

              <button className="btn btn-baton" onClick={handleStartItemTurn}>
                I&apos;m ready! Hand me the baton 🤝
              </button>
            </div>
          </div>
        );
      })()}

      {/* SCREEN: ITEM */}
      {screen === 'item' && session && (() => {
        const rotated = getRotatedRoles(currentGroup.members, session.itemIndex);
        const tapRunner = rotated.find((r) => r.roleInfo.role === 'RUNNER') || rotated[0];
        const isMission = activePhase.key.startsWith('session');
        const currentLapTitle = isMission
          ? session.itemIndex < 5
            ? 'Main Lap 1'
            : session.itemIndex < 10
            ? 'Bonus Lap 1'
            : 'Bonus Lap 2'
          : '';
        const questionInLap = isMission ? (session.itemIndex % 5) + 1 : session.itemIndex + 1;

        return (
          <div className="screen" id="screen-item">
            {renderSessionHeader()}
            {renderRelayRolesBar(currentGroup.members, session.itemIndex)}

            <div className="item-topline">
              <div
                className="pill"
                style={{ color: GROUP_COLORS[session.groupIndex % GROUP_COLORS.length] }}
              >
                🏃 {tapRunner.member} (Runner)
              </div>
              <div className="pill">
                {isMission
                  ? `${currentLapTitle} • Q${questionInLap}/5 (Item ${session.itemIndex + 1}/${session.itemOrder.length})`
                  : `Item ${session.itemIndex + 1} / ${session.itemOrder.length}`}
              </div>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.round((session.itemIndex / session.itemOrder.length) * 100)}%`,
                  background: GROUP_COLORS[session.groupIndex % GROUP_COLORS.length],
                }}
              />
            </div>

            <div className="item-card">
              <div className="item-eyebrow">
                {isMission ? `${currentLapTitle.toUpperCase()} • ${activePhase.eyebrow}` : activePhase.eyebrow}
              </div>
              <div
                className="item-prompt"
                dangerouslySetInnerHTML={{ __html: currentItemPromptHtml }}
              />
            </div>

            <div className="options-grid">
              {currentItem.o.map((opt, oi) => {
                const isSelected = selectedOptionIndex === oi;
                const isCorrect = oi === currentItem.c;
                let extraClass = '';
                if (selectedOptionIndex !== null) {
                  if (activePhase.showFeedback) {
                    if (isCorrect) extraClass = 'correct';
                    else if (isSelected) extraClass = 'wrong';
                  } else {
                    if (isSelected) extraClass = 'selected';
                  }
                }
                return (
                  <button
                    key={oi}
                    disabled={selectedOptionIndex !== null}
                    className={`option-btn ${extraClass}`}
                    onClick={() => handleSelectOption(oi, currentItem)}
                  >
                    <span className="opt-letter">{letters[oi]}</span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* FEEDBACK OVERLAY */}
      {feedbackOverlayShow && (
        <div className="feedback-overlay show" id="feedback-overlay">
          <div className={`feedback-card ${feedbackCardType}`}>
            <div className="feedback-title">{feedbackTitle}</div>
            <div className="feedback-sub">{feedbackSub}</div>
            <button className="btn btn-primary" onClick={handleNextTurnOrItem}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: MISSION RESULT & BADGE */}
      {screen === 'mission_result' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="end-wrap">
            <Mascot type="cheer" isBig />
            <div className="end-badge">{endBadge}</div>
            <div className="end-title display">{endTitle}</div>
            <div className="end-msg">{endMsg}</div>
            <div
              style={{
                background: '#FFF9E6',
                border: '2px solid #FCD34D',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '4px' }}>
                {activePhase.badgeIcon || '🏅'}
              </div>
              <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2', color: '#B45309' }}>
                BADGE UNLOCKED: {activePhase.badgeName || 'RELAY CHAMPION'}
              </strong>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('map');
                window.scrollTo(0, 0);
              }}
            >
              Back to Race Map
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: POSTTEST WELCOME */}
      {screen === 'posttest_welcome' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>POSTTEST INTRO</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;🏁 FINAL STRETCH! You&apos;ve completed all 4 missions! Now let&apos;s see how much you&apos;ve improved since the Pretest on this 12-item Summative Test.&rdquo;
            </div>
          </div>

          <div className="item-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>🎓</div>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>FINISH-LINE POSTTEST</h2>
            <p style={{ fontSize: '13px', opacity: 0.8, lineHeight: 1.6, marginBottom: '20px' }}>
              Parallel in format and difficulty to the Pretest &mdash; 12 items under standard conditions (no timer, individual seatwork), covering both competencies.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setScreen('turn');
                window.scrollTo(0, 0);
              }}
            >
              [ START POSTTEST ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: POSTTEST RESULTS */}
      {screen === 'posttest_results' && (() => {
        const teamName = session ? appState.groups[session.groupIndex].name : 'Your Team';
        const teamLogs = logData.filter((l) => l.team === teamName);
        const pretestLogs = teamLogs.filter((l) => l.phase === 'pretest');
        const posttestLogs = teamLogs.filter((l) => l.phase === 'posttest');

        const preScore = pretestLogs.filter((l) => l.correct).length;
        const preTotal = pretestLogs.length || 12;
        const prePct = Math.round((preScore / preTotal) * 100);

        const postScore = posttestLogs.filter((l) => l.correct).length;
        const postTotal = posttestLogs.length || 12;
        const postPct = Math.round((postScore / postTotal) * 100);

        const meanGain = postPct - prePct;
        const preRating = getDepEdRating(prePct);
        const postRating = getDepEdRating(postPct);

        return (
          <div className="screen">
            {renderSessionHeader()}
            <div className="end-wrap" style={{ paddingTop: '10px' }}>
              <Mascot type="cheer" isBig />
              <div className="end-badge">🏆</div>
              <div className="end-title display">PRETEST VS POSTTEST RESULTS</div>

              <div className="coach-dash-card" style={{ textAlign: 'left', marginTop: '12px' }}>
                <div className="coach-header">
                  <div className="coach-avatar-badge">🏃</div>
                  <div>
                    <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                  </div>
                </div>
                <div className="coach-dialogue">
                  &ldquo;Let&apos;s see your results! Here&apos;s how you did across all 12 items:&rdquo;
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '16px 0' }}>
                <div style={{ background: 'var(--cream)', border: '2px solid var(--line)', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, opacity: 0.6 }}>PRETEST (BASELINE)</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'Baloo 2', color: 'var(--ink)' }}>
                    {prePct}%
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '6px' }}>
                    {preScore} / {preTotal} correct
                  </div>
                  <span
                    className="deped-badge"
                    style={{ background: preRating.bg, color: preRating.color }}
                  >
                    {preRating.label.split(' ')[0]}
                  </span>
                </div>

                <div style={{ background: '#E4F7EC', border: '2px solid var(--track)', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--track-dark)' }}>POSTTEST (SUMMATIVE)</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'Baloo 2', color: 'var(--track-dark)' }}>
                    {postPct}%
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '6px' }}>
                    {postScore} / {postTotal} correct
                  </div>
                  <span
                    className="deped-badge"
                    style={{ background: postRating.bg, color: postRating.color }}
                  >
                    {postRating.label.split(' ')[0]}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: meanGain >= 0 ? '#E4F7EC' : '#FFF3CD',
                  border: `2px solid ${meanGain >= 0 ? 'var(--track)' : '#D97706'}`,
                  borderRadius: '14px',
                  padding: '12px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, opacity: 0.8 }}>MEAN GAIN (POSTTEST % – PRETEST %)</div>
                <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'Baloo 2', color: meanGain >= 0 ? 'var(--track-dark)' : '#B45309' }}>
                  {meanGain >= 0 ? `+${meanGain}% Improvement! 🎉` : `${meanGain}%`}
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => {
                  sounds.playTap();
                  setScreen('survey');
                  window.scrollTo(0, 0);
                }}
              >
                [ CONTINUE TO FEEDBACK SURVEY ]
              </button>
            </div>
          </div>
        );
      })()}

      {/* SCREEN: FEEDBACK SURVEY */}
      {screen === 'survey' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="coach-dash-card">
            <div className="coach-header">
              <div className="coach-avatar-badge">🏃</div>
              <div>
                <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>FEEDBACK SURVEY</div>
              </div>
            </div>
            <div className="coach-dialogue">
              &ldquo;One last thing, Relay Runners! Tell us what you think of the GGR website.&rdquo;
            </div>
          </div>

          <div className="item-card">
            <div style={{ fontSize: '12px', fontWeight: 800, opacity: 0.7, marginBottom: '14px' }}>
              Rate 1 (Strongly Disagree) to 5 (Strongly Agree):
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '4px' }}>
                1. I enjoyed doing the Gamified Grammar Relay activities.
              </div>
              <div className="rating-group">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`rating-btn ${surveyQ1 === val ? 'selected' : ''}`}
                    onClick={() => {
                      sounds.playTap();
                      setSurveyQ1(val);
                    }}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '4px' }}>
                2. The GGR website helped me understand grammar better than usual worksheets.
              </div>
              <div className="rating-group">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`rating-btn ${surveyQ2 === val ? 'selected' : ''}`}
                    onClick={() => {
                      sounds.playTap();
                      setSurveyQ2(val);
                    }}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '4px' }}>
                3. I want to use the GGR website again in future lessons.
              </div>
              <div className="rating-group">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`rating-btn ${surveyQ3 === val ? 'selected' : ''}`}
                    onClick={() => {
                      sounds.playTap();
                      setSurveyQ3(val);
                    }}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px' }}>
                Comments / Feedback (Optional):
              </label>
              <textarea
                className="text-input"
                style={{ height: '60px', resize: 'none' }}
                placeholder="What did your team enjoy most about the relay?"
                value={surveyComment}
                onChange={(e) => setSurveyComment(e.target.value)}
              />
            </div>

            <button className="btn btn-primary" onClick={handleSubmitSurvey}>
              [ SUBMIT FEEDBACK ]
            </button>
          </div>
        </div>
      )}

      {/* SCREEN: THANK YOU */}
      {screen === 'thank_you' && (
        <div className="screen">
          {renderSessionHeader()}
          <div className="end-wrap">
            <Mascot type="cheer" isBig />
            <div className="end-badge">🏆</div>
            <div className="end-title display">SALAMAT! THANK YOU!</div>
            <div className="coach-dash-card" style={{ textAlign: 'left', marginTop: '12px' }}>
              <div className="coach-header">
                <div className="coach-avatar-badge">🏃</div>
                <div>
                  <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                </div>
              </div>
              <div className="coach-dialogue">
                &ldquo;You&apos;ve completed the full Gamified Grammar Relay cycle: Pretest → 4 Missions → Posttest → Feedback. Great job, Champion!&rdquo;
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: '16px' }}
              onClick={() => {
                sounds.playTap();
                setScreen('map');
                window.scrollTo(0, 0);
              }}
            >
              Back to Race Map
            </button>
          </div>
        </div>
      )}

      {/* Confetti particles */}
      {confetti.map((c) => (
        <div
          key={c.id}
          className="confetti-piece"
          style={{
            left: `${c.left}vw`,
            background: c.background,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}

      {/* Admin gear button */}
      {screen === 'map' && (
        <button
          className="icon-btn admin-gear"
          id="admin-gear-btn"
          onClick={() => {
            sounds.playTap();
            setPinInput('');
            setPinError(false);
            setIsPinModalOpen(true);
            setTimeout(() => pinInputRef.current?.focus(), 150);
          }}
          aria-label="Teacher settings and activity manager"
          title="Teacher &amp; Researcher Panel"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" />
            <path
              d="M19.4 13a1.6 1.6 0 00.32 1.77l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-1 1.47V19a2 2 0 11-4 0v-.09a1.6 1.6 0 00-1.47 1.6 1.6 0 00-1.77.32l-.06.06a2 2 0 112.83-2.83l.06-.06A1.6 1.6 0 004.6 13a1.6 1.6 0 00-1.47-1H3a2 2 0 110-4h.09A1.6 1.6 0 004.6 7a1.6 1.6 0 00-.32-1.77l-.06-.06a2 2 0 112.83-2.83l.06.06A1.6 1.6 0 007.18 2.6a1.6 1.6 0 001-1.47V1a2 2 0 114 0v.09a1.6 1.6 0 001 1.47 1.6 1.6 0 001.77-.32l.06-.06a2 2 0 112.83 2.83l-.06.06A1.6 1.6 0 0019.4 7a1.6 1.6 0 001.47 1H21a2 2 0 110 4h-.09a1.6 1.6 0 00-1.47 1z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      )}

      {/* LOCKED STATION COACH DASH MODAL */}
      {lockedModalInfo && (
        <div className="modal-backdrop show">
          <div className="modal-box" style={{ textAlign: 'center', padding: '26px 20px', maxWidth: '440px' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>
              {lockedModalInfo.icon}
            </div>
            <h2 style={{ fontSize: '20px', marginBottom: '6px' }}>
              {lockedModalInfo.title}
            </h2>
            <div className="coach-dash-card" style={{ textAlign: 'left', marginTop: '14px', marginBottom: '16px' }}>
              <div className="coach-header">
                <div className="coach-avatar-badge">🏃</div>
                <div>
                  <strong style={{ fontSize: '15px', fontFamily: 'Baloo 2' }}>Coach Dash</strong>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>Station Access</div>
                </div>
              </div>
              <div className="coach-dialogue">
                &ldquo;{lockedModalInfo.message}&rdquo;
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.playTap();
                setLockedModalInfo(null);
              }}
            >
              Got it, Coach!
            </button>
          </div>
        </div>
      )}

      {/* PIN MODAL */}
      {isPinModalOpen && (
        <div className="modal-backdrop show">
          <div className="modal-box">
            <h2>Teacher / Researcher Area</h2>
            <div className="modal-sub">Enter the PIN to manage phases, rosters, data exports, and analytics (Default: 1234)</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCheckPin();
              }}
            >
              <input
                ref={pinInputRef}
                className="pin-input"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
              />
              <button type="submit" className="btn btn-primary">
                Unlock
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: '8px' }}
                onClick={() => {
                  sounds.playTap();
                  setIsPinModalOpen(false);
                }}
              >
                Cancel
              </button>
              {pinError && (
                <div
                  style={{
                    color: 'var(--danger)',
                    fontWeight: 800,
                    fontSize: '13px',
                    textAlign: 'center',
                    marginTop: '10px',
                  }}
                >
                  Wrong PIN, try again.
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* STANDING DESK & REAL-TIME RACE MONITOR MODAL */}
      <StandingDeskModal
        isOpen={isStandingDeskOpen || isOverviewStandingsModalOpen}
        onClose={() => {
          setIsStandingDeskOpen(false);
          setIsOverviewStandingsModalOpen(false);
        }}
        appState={appState}
        setAppState={setAppState}
        logData={logData}
        setLogData={setLogData}
        loggedTeamIndex={loggedTeamIndex}
        isLiveConnected={isLiveSseConnected}
        onManualSync={handleManualSync}
        initialTaskKey={
          standingDeskTaskKey ||
          (isOverviewStandingsModalOpen && !isStandingDeskOpen
            ? 'overall'
            : PHASES[appState.currentPhaseIndex]?.key || 'session1')
        }
      />

      {/* TEACHER & RESEARCHER PANEL */}
      {isAdminModalOpen && (
        <TeacherPanel
          appState={appState}
          logData={logData}
          setAppState={setAppState}
          setLogData={setLogData}
          currentTheme={currentTheme}
          setCurrentTheme={setCurrentTheme}
          themes={THEMES}
          adminNotification={adminNotification}
          setAdminNotification={setAdminNotification}
          onOpenCsvSync={() => setIsCsvSyncModalOpen(true)}
          onSeedSampleData={handleSeedSampleData}
          onClose={() => setIsAdminModalOpen(false)}
          isSyncing={isSyncing}
          lastSyncTime={lastSyncTime}
          onManualSync={handleManualSync}
          onOpenStandingDesk={(taskKey) => {
            setStandingDeskTaskKey(taskKey);
            setIsStandingDeskOpen(true);
          }}
          loggedTeamIndex={loggedTeamIndex}
          onResetTeamLogin={() => {
            setLoggedTeamIndex(null);
            localStorage.removeItem('ggr_logged_team_index');
            setIsAdminModalOpen(false);
            setScreen('team_login');
            window.scrollTo(0, 0);
          }}
        />
      )}

      {/* CSV SYNC MODAL */}
      {isCsvSyncModalOpen && (
        <CsvSyncModal
          appState={appState}
          logData={logData}
          onSyncComplete={(newLogs, newCompleted, message) => {
            setLogData(newLogs);
            setAppState((prev) => ({
              ...prev,
              completedToday: newCompleted,
            }));
            setAdminNotification(message);
            setTimeout(() => setAdminNotification(null), 4000);
          }}
          onClose={() => setIsCsvSyncModalOpen(false)}
        />
      )}
    </>
  );
}
