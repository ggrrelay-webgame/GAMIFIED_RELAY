import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState, AttemptLog, Phase } from '../types';
import { PHASES, GROUP_COLORS } from '../data/phases';
import {
  analyzeTaskSpeedAndDone,
  formatDurationSeconds,
  pushCloudSync,
  TaskSpeedComparisonResult,
} from '../services/syncService';
import { sounds } from '../utils/audio';

interface StandingDeskModalProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  logData: AttemptLog[];
  setLogData: React.Dispatch<React.SetStateAction<AttemptLog[]>>;
  loggedTeamIndex: number | null;
  isLiveConnected: boolean;
  onManualSync: () => Promise<void>;
  initialTaskKey?: string;
}

export const StandingDeskModal: React.FC<StandingDeskModalProps> = ({
  isOpen,
  onClose,
  appState,
  setAppState,
  logData,
  setLogData,
  loggedTeamIndex,
  isLiveConnected,
  onManualSync,
  initialTaskKey,
}) => {
  // Task selection: 'overall' or phaseKey ('pretest', 'session1', etc.)
  const activePhaseKey = PHASES[appState.currentPhaseIndex]?.key || 'session1';
  const [selectedTaskKey, setSelectedTaskKey] = useState<string>(initialTaskKey || activePhaseKey);

  // Sorting method: 'speed' (fastest finish), 'completion' (first to cross line), 'accuracy' (highest score)
  const [sortBy, setSortBy] = useState<'speed' | 'completion' | 'accuracy'>('speed');

  // Fullscreen / Kiosk Mode
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);

  // Sound alert toggle
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Live timer tick every second for in-progress teams
  const [, setTick] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // When initialTaskKey changes, update selected
  useEffect(() => {
    if (initialTaskKey) {
      setSelectedTaskKey(initialTaskKey);
    }
  }, [initialTaskKey]);

  // Find phase definition for selected task
  const currentPhase: Phase | undefined = useMemo(() => {
    return PHASES.find((p) => p.key === selectedTaskKey);
  }, [selectedTaskKey]);

  // Analyze speed and completion data for the chosen task
  const taskAnalysis: TaskSpeedComparisonResult = useMemo(() => {
    const phKey = selectedTaskKey === 'overall' ? activePhaseKey : selectedTaskKey;
    const ph = PHASES.find((p) => p.key === phKey) || PHASES[0];
    return analyzeTaskSpeedAndDone(
      ph.key,
      ph.label,
      ph.itemCount,
      appState,
      logData,
      GROUP_COLORS
    );
  }, [selectedTaskKey, activePhaseKey, appState, logData]);

  // Overall Standings calculation across all phases
  const overallStandings = useMemo(() => {
    return appState.groups.map((g, gi) => {
      const color = GROUP_COLORS[gi % GROUP_COLORS.length];
      const tLogs = logData.filter((l) => l.team === g.name);
      const attempts = tLogs.length;
      const correct = tLogs.filter((l) => l.correct).length;
      const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
      const completedPhases = PHASES.filter((ph) =>
        (appState.completedToday[ph.key] || []).includes(gi)
      );

      // Sum of task durations across completed tasks
      let totalTimeSeconds = 0;
      let timedCount = 0;
      PHASES.forEach((ph) => {
        const stored = appState.taskProgress?.[ph.key]?.[g.name];
        if (stored?.durationSeconds) {
          totalTimeSeconds += stored.durationSeconds;
          timedCount++;
        }
      });

      return {
        teamIndex: gi,
        group: g,
        color,
        attempts,
        correct,
        accuracy,
        completedPhases,
        totalTimeSeconds,
        totalTimeFormatted: formatDurationSeconds(totalTimeSeconds),
        timedCount,
      };
    });
  }, [appState, logData]);

  // Sort teams according to user selection
  const sortedTaskTeams = useMemo(() => {
    const list = [...taskAnalysis.teams];
    if (sortBy === 'speed') {
      return list.sort((a, b) => {
        // Completed teams first
        if (a.isDone && !b.isDone) return -1;
        if (!a.isDone && b.isDone) return 1;
        // Fastest duration first
        if (a.isDone && b.isDone) {
          return (a.durationSeconds || 99999) - (b.durationSeconds || 99999);
        }
        // In-progress next by current question
        if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
        if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
        return b.currentQuestion - a.currentQuestion;
      });
    } else if (sortBy === 'completion') {
      return list.sort((a, b) => {
        if (a.isDone && !b.isDone) return -1;
        if (!a.isDone && b.isDone) return 1;
        if (a.isDone && b.isDone) {
          return (a.completedAtTimestamp || 0) - (b.completedAtTimestamp || 0);
        }
        return b.currentQuestion - a.currentQuestion;
      });
    } else {
      // Sort by accuracy & correct
      return list.sort((a, b) => {
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return b.correctAnswers - a.correctAnswers;
      });
    }
  }, [taskAnalysis.teams, sortBy]);

  // Check whether ANY group has completed ANY mission or test across the whole app
  const hasAnyCompletedMission = useMemo(() => {
    return (
      Object.values(appState.completedToday || {}).some(
        (arr) => Array.isArray(arr) && arr.length > 0
      ) ||
      Object.values(appState.taskProgress || {}).some((phaseMap) =>
        Object.values(phaseMap || {}).some((rec) => rec?.status === 'completed')
      )
    );
  }, [appState.completedToday, appState.taskProgress]);

  // Check whether the currently selected task has been completed by at least 1 team
  const isCurrentTaskCompleted = useMemo(() => {
    if (selectedTaskKey === 'overall') {
      return hasAnyCompletedMission;
    }
    const doneList = appState.completedToday[selectedTaskKey] || [];
    return doneList.length > 0 || taskAnalysis.completedCount > 0;
  }, [selectedTaskKey, hasAnyCompletedMission, appState.completedToday, taskAnalysis.completedCount]);

  if (!isOpen) return null;

  return (
    <div
      className={`modal-backdrop show standing-desk-overlay ${isKioskMode ? 'kiosk-mode' : ''}`}
      style={{
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        padding: isKioskMode ? 0 : '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="modal-box modal-wide standing-desk-panel"
        style={{
          width: isKioskMode ? '100vw' : '96vw',
          maxWidth: isKioskMode ? '100vw' : '1100px',
          height: isKioskMode ? '100vh' : 'auto',
          maxHeight: isKioskMode ? '100vh' : '92vh',
          borderRadius: isKioskMode ? '0' : '20px',
          padding: isKioskMode ? '20px 28px' : '18px 22px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          background: 'var(--cream)',
          border: isKioskMode ? 'none' : '3px solid var(--track-dark)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* HEADER BAR */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '2px solid var(--line)',
            marginBottom: '14px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
              }}
            >
              🏆
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2
                  style={{
                    fontSize: isKioskMode ? '24px' : '20px',
                    fontFamily: 'Baloo 2',
                    margin: 0,
                    color: 'var(--ink)',
                    lineHeight: 1.1,
                  }}
                >
                  Relay Race Standings &amp; Group Progress
                </h2>
                {/* Real-Time SSE Indicator */}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: isLiveConnected ? '#DCFCE7' : '#FEF3C7',
                    color: isLiveConnected ? '#15803D' : '#B45309',
                    border: `1.5px solid ${isLiveConnected ? '#86EFAC' : '#FCD34D'}`,
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isLiveConnected ? '#22C55E' : '#F59E0B',
                      animation: 'pulse 1.8s infinite',
                    }}
                  />
                  {isLiveConnected ? 'REAL-TIME LIVE SYNC' : 'CONNECTING...'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink)', opacity: 0.7, marginTop: '2px' }}>
                Binanuahan ES Grade 6 &middot; Live Progress of All 4 Teams (Every group can view each other&apos;s live progress)
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            {/* Manual refresh */}
            <button
              type="button"
              className="icon-btn"
              style={{ width: '34px', height: '34px', fontSize: '14px' }}
              onClick={async () => {
                sounds.playTap();
                await onManualSync();
              }}
              title="Ping Cloud Server Now"
            >
              🔄
            </button>

            {/* Sound toggle */}
            <button
              type="button"
              className="icon-btn"
              style={{ width: '34px', height: '34px', fontSize: '14px' }}
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                sounds.playTap();
              }}
              title={soundEnabled ? 'Mute Audio Alerts' : 'Enable Audio Alerts'}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>

            {/* Fullscreen / Kiosk Toggle */}
            <button
              type="button"
              className="icon-btn"
              style={{ width: '34px', height: '34px', fontSize: '14px' }}
              onClick={() => {
                setIsKioskMode(!isKioskMode);
                sounds.playTap();
              }}
              title={isKioskMode ? 'Exit Fullscreen' : 'Fullscreen / Kiosk Mode'}
            >
              {isKioskMode ? '🗗' : '⛶'}
            </button>

            {/* Close button */}
            <button
              type="button"
              className="icon-btn"
              style={{ width: '34px', height: '34px', fontSize: '15px' }}
              onClick={() => {
                sounds.playTap();
                onClose();
              }}
              aria-label="Close Standing Desk"
            >
              ✕
            </button>
          </div>
        </div>

        {/* TASK SELECTOR: "CERTAIN TASK" SELECTOR */}
        <div style={{ marginBottom: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
                🎯 Select Task / Station:
              </span>
              <span style={{ fontSize: '11px', opacity: 0.65 }}>
                (Comparing live speed &amp; completion order for this task)
              </span>
            </div>

            {/* Sort Filter Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, opacity: 0.75 }}>Sort by:</span>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--cream-2)', padding: '2px', borderRadius: '8px' }}>
                <button
                  type="button"
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: sortBy === 'speed' ? 'var(--track-dark)' : 'transparent',
                    color: sortBy === 'speed' ? '#fff' : 'var(--ink)',
                  }}
                  onClick={() => {
                    sounds.playTap();
                    setSortBy('speed');
                  }}
                >
                  ⚡ Fastest Finish
                </button>
                <button
                  type="button"
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: sortBy === 'completion' ? 'var(--track-dark)' : 'transparent',
                    color: sortBy === 'completion' ? '#fff' : 'var(--ink)',
                  }}
                  onClick={() => {
                    sounds.playTap();
                    setSortBy('completion');
                  }}
                >
                  🏁 Finish Order
                </button>
                <button
                  type="button"
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: sortBy === 'accuracy' ? 'var(--track-dark)' : 'transparent',
                    color: sortBy === 'accuracy' ? '#fff' : 'var(--ink)',
                  }}
                  onClick={() => {
                    sounds.playTap();
                    setSortBy('accuracy');
                  }}
                >
                  🎯 Highest Score
                </button>
              </div>
            </div>
          </div>

          {/* Task Pills */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '4px',
            }}
          >
            {/* Active Station Quick Button */}
            <button
              type="button"
              style={{
                padding: '6px 12px',
                borderRadius: '10px',
                border: selectedTaskKey === activePhaseKey ? '2px solid #2563EB' : '1.5px solid var(--line)',
                background: selectedTaskKey === activePhaseKey ? '#EFF6FF' : 'var(--cream-2)',
                color: selectedTaskKey === activePhaseKey ? '#1D4ED8' : 'var(--ink)',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onClick={() => {
                sounds.playTap();
                setSelectedTaskKey(activePhaseKey);
              }}
            >
              <span>📍</span>
              <span>Active Station ({PHASES[appState.currentPhaseIndex]?.label})</span>
            </button>

            {/* Individual Phases */}
            {PHASES.map((ph, pi) => {
              const isSelected = selectedTaskKey === ph.key;
              const doneCount = (appState.completedToday[ph.key] || []).length;
              const allDone = doneCount >= 4;

              return (
                <button
                  key={ph.key}
                  type="button"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid var(--track-dark)' : '1.5px solid var(--line)',
                    background: isSelected ? 'var(--track-dark)' : 'var(--cream-2)',
                    color: isSelected ? '#fff' : 'var(--ink)',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: pi > appState.currentPhaseIndex && doneCount === 0 ? 0.65 : 1,
                  }}
                  onClick={() => {
                    sounds.playTap();
                    setSelectedTaskKey(ph.key);
                  }}
                >
                  <span>{ph.icon}</span>
                  <span>{ph.label}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '6px',
                      background: isSelected ? 'rgba(255,255,255,0.2)' : allDone ? '#DCFCE7' : 'rgba(0,0,0,0.06)',
                      color: isSelected ? '#fff' : allDone ? '#166534' : 'inherit',
                      fontWeight: 800,
                    }}
                  >
                    {allDone ? '✓ 4/4 Done' : `${doneCount}/4 Done`}
                  </span>
                </button>
              );
            })}

            {/* Overall Relay Standings */}
            <button
              type="button"
              style={{
                padding: '6px 12px',
                borderRadius: '10px',
                border: selectedTaskKey === 'overall' ? '2px solid #D97706' : '1.5px solid var(--line)',
                background: selectedTaskKey === 'overall' ? '#FFFBEB' : 'var(--cream-2)',
                color: selectedTaskKey === 'overall' ? '#B45309' : 'var(--ink)',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onClick={() => {
                sounds.playTap();
                setSelectedTaskKey('overall');
              }}
            >
              <span>🏆</span>
              <span>Overall Standings (All 6 Stations)</span>
            </button>
          </div>
        </div>

        {/* Live Group Progress Transparency Notice */}
        <div
          style={{
            background: '#F0FDF4',
            border: '1.5px solid #86EFAC',
            borderRadius: '10px',
            padding: '8px 14px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#166534',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>👥</span>
            <span>
              <b>Live Standings for Every Group:</b> All 4 teams (Team 1, Team 2, Team 3, Team 4) can view this board in real time to check who finished first, compare speed, and see live race progress!
            </span>
          </div>
          {loggedTeamIndex !== null && appState.groups[loggedTeamIndex] && (
            <span
              style={{
                background: '#DCFCE7',
                border: '1px solid #16A34A',
                color: '#166534',
                padding: '3px 9px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              Viewing as: {appState.groups[loggedTeamIndex].name} ⭐
            </span>
          )}
        </div>

        {/* CONDITIONAL DISPLAY: STANDINGS ONLY WORK WHEN A MISSION OR TEST HAS BEEN COMPLETED */}
        {!isCurrentTaskCompleted ? (
          <div
            style={{
              background: '#fff',
              border: '2px dashed var(--line)',
              borderRadius: '16px',
              padding: '36px 20px',
              textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
              margin: '12px 0 20px',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>🔒🏁</div>
            <h3
              style={{
                fontSize: '22px',
                fontWeight: 800,
                fontFamily: 'Baloo 2',
                color: 'var(--ink)',
                marginBottom: '8px',
              }}
            >
              {selectedTaskKey === 'overall'
                ? 'Master Standings Locked — Waiting for First Mission'
                : `${currentPhase?.label || 'Mission'} Standings Locked`}
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--ink)',
                opacity: 0.85,
                maxWidth: '520px',
                margin: '0 auto 16px',
                lineHeight: 1.55,
              }}
            >
              {selectedTaskKey === 'overall'
                ? 'The Master Leaderboard unlocks automatically once any team finishes their first mission or test! Race to the finish line to activate rankings.'
                : `Standings, rankings, and real-time speed data for ${currentPhase?.label || 'this station'} will activate the moment any group completes all questions and finishes the task!`}
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: taskAnalysis.inProgressCount > 0 ? '#EFF6FF' : 'var(--cream-2)',
                border: taskAnalysis.inProgressCount > 0 ? '1.5px solid #93C5FD' : '1.5px solid var(--line)',
                borderRadius: '10px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 700,
                color: taskAnalysis.inProgressCount > 0 ? '#1D4ED8' : 'var(--ink)',
                marginBottom: '20px',
              }}
            >
              <span>{taskAnalysis.inProgressCount > 0 ? '🏃💨' : '⏳'}</span>
              <span>
                {taskAnalysis.inProgressCount > 0
                  ? `${taskAnalysis.inProgressCount} team(s) are currently running this station! Standings unlock when the first team finishes.`
                  : 'No teams have completed this station yet. Open the Race Map and be the 1st to complete it!'}
              </span>
            </div>

            <div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '8px 24px', fontSize: '13px' }}
                onClick={() => {
                  sounds.playTap();
                  onClose();
                }}
              >
                🏃 Return to Race Map &amp; Start Station
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* SPEED SPOTLIGHT BANNER: "WHICH GROUP IS FASTER AND DONE" */}
            {selectedTaskKey !== 'overall' && (
          <div
            style={{
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              color: '#fff',
              borderRadius: '16px',
              padding: '14px 18px',
              marginBottom: '16px',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
              border: '1.5px solid #334155',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>⚡</span>
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94A3B8', fontWeight: 800 }}>
                    TASK SPEED &amp; COMPLETION SPOTLIGHT
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'Baloo 2' }}>
                    {currentPhase?.label || 'Selected Task'} &middot; {currentPhase?.sub || 'Station Challenge'} ({currentPhase?.itemCount} Questions)
                  </div>
                </div>
              </div>

              {/* Status tally pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid #22C55E',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#4ADE80',
                  }}
                >
                  🏁 {taskAnalysis.completedCount} of 4 Groups Done
                </div>
                {taskAnalysis.inProgressCount > 0 && (
                  <div
                    style={{
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid #3B82F6',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#60A5FA',
                    }}
                  >
                    🏃 {taskAnalysis.inProgressCount} Racing Now
                  </div>
                )}
              </div>
            </div>

            {/* Grid of Key Insights */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              {/* FASTEST GROUP CALLOUT */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 700, marginBottom: '2px' }}>
                  ⚡ FASTEST TO FINISH
                </div>
                {taskAnalysis.fastestTeam ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: taskAnalysis.fastestTeam.color,
                        }}
                      />
                      <strong style={{ fontSize: '16px', color: '#FCD34D', fontFamily: 'Baloo 2' }}>
                        {taskAnalysis.fastestTeam.teamName}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#4ADE80', fontWeight: 800 }}>
                        (1st Speed)
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#E2E8F0', marginTop: '2px' }}>
                      Time: <b>{taskAnalysis.fastestTeam.durationFormatted}</b> ({taskAnalysis.fastestTeam.paceFormatted})
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                    Teams currently racing this task...
                  </div>
                )}
              </div>

              {/* FIRST TO COMPLETE */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 700, marginBottom: '2px' }}>
                  🥇 1ST TO CROSS FINISH LINE
                </div>
                {taskAnalysis.firstFinishedTeam ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: taskAnalysis.firstFinishedTeam.color,
                        }}
                      />
                      <strong style={{ fontSize: '16px', color: '#6EE7B7', fontFamily: 'Baloo 2' }}>
                        {taskAnalysis.firstFinishedTeam.teamName}
                      </strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#E2E8F0', marginTop: '2px' }}>
                      Finished at <b>{taskAnalysis.firstFinishedTeam.completedAtFormatted || 'Recorded'}</b>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                    Waiting for first group to cross line...
                  </div>
                )}
              </div>

              {/* HIGHEST ACCURACY */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 700, marginBottom: '2px' }}>
                  🎯 HIGHEST ACCURACY
                </div>
                {taskAnalysis.highestAccuracyTeam && taskAnalysis.highestAccuracyTeam.totalAttempts > 0 ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: taskAnalysis.highestAccuracyTeam.color,
                        }}
                      />
                      <strong style={{ fontSize: '16px', color: '#93C5FD', fontFamily: 'Baloo 2' }}>
                        {taskAnalysis.highestAccuracyTeam.teamName}
                      </strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#E2E8F0', marginTop: '2px' }}>
                      Accuracy: <b>{taskAnalysis.highestAccuracyTeam.accuracy}%</b> ({taskAnalysis.highestAccuracyTeam.correctAnswers}/{taskAnalysis.highestAccuracyTeam.totalAttempts} correct)
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                    Awaiting answers...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TEAM RACE LANES & SPEED CARDS (FOR SELECTED TASK) */}
        {selectedTaskKey !== 'overall' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {sortedTaskTeams.map((team, rankIdx) => {
              const isUserTeam = loggedTeamIndex !== null && loggedTeamIndex === team.teamIndex;
              const isFinished = team.isDone;
              const isRunning = team.status === 'in_progress';

              return (
                <div
                  key={team.teamIndex}
                  className="standing-desk-card"
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    borderLeft: `8px solid ${team.color}`,
                    border: '1.5px solid var(--line)',
                    borderLeftWidth: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                    position: 'relative',
                  }}
                >
                  {/* Top row: Name, Badges, Done Status, Speed Rank */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Rank number */}
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '8px',
                          background:
                            rankIdx === 0
                              ? '#FEF3C7'
                              : rankIdx === 1
                              ? '#F1F5F9'
                              : rankIdx === 2
                              ? '#FFEDD5'
                              : 'var(--cream-2)',
                          color:
                            rankIdx === 0
                              ? '#B45309'
                              : rankIdx === 1
                              ? '#475569'
                              : rankIdx === 2
                              ? '#92400E'
                              : 'var(--ink)',
                          fontFamily: 'Baloo 2',
                        }}
                      >
                        {sortBy === 'speed' && team.speedRank
                          ? `⚡ Speed #${team.speedRank}`
                          : sortBy === 'completion' && team.completionOrder
                          ? `🏁 Finish #${team.completionOrder}`
                          : `#${rankIdx + 1}`}
                      </span>

                      {/* Team Name */}
                      <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2', color: 'var(--ink)' }}>
                        {team.teamName}
                      </strong>

                      {isUserTeam && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            background: team.color,
                            color: '#fff',
                            padding: '1px 6px',
                            borderRadius: '6px',
                          }}
                        >
                          ⭐ YOUR TEAM
                        </span>
                      )}

                      {/* Runner Count */}
                      <span style={{ fontSize: '11px', opacity: 0.65 }}>
                        (5 Runners)
                      </span>
                    </div>

                    {/* Right side: Status and Speed Comparison badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Done vs In-progress pill */}
                      {isFinished ? (
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            background: '#DCFCE7',
                            color: '#15803D',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            border: '1.5px solid #86EFAC',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>🏁</span>
                          <span>
                            {team.completionOrder === 1
                              ? '1st DONE'
                              : team.completionOrder === 2
                              ? '2nd DONE'
                              : team.completionOrder === 3
                              ? '3rd DONE'
                              : 'DONE'}
                          </span>
                        </span>
                      ) : isRunning ? (
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            border: '1.5px solid #93C5FD',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span style={{ animation: 'pulse 1s infinite' }}>🏃</span>
                          <span>SPURTING (Q {team.currentQuestion} / {team.totalQuestions})</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            background: '#F1F5F9',
                            color: '#64748B',
                            padding: '3px 8px',
                            borderRadius: '20px',
                          }}
                        >
                          ⏳ WAITING
                        </span>
                      )}

                      {/* Speed badge */}
                      {isFinished && team.isFastest && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            background: '#FEF3C7',
                            color: '#B45309',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            border: '1px solid #FCD34D',
                          }}
                        >
                          ⚡ FASTEST (Baseline)
                        </span>
                      )}

                      {isFinished && !team.isFastest && team.secondsBehindFastest !== null && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            background: '#F8FAFC',
                            color: '#64748B',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                          }}
                        >
                          +{team.secondsBehindFastest}s behind fastest
                        </span>
                      )}

                      {/* Total Duration pill */}
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          background: isFinished ? 'var(--cream-2)' : '#F0FDF4',
                          color: 'var(--ink)',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          border: '1px solid var(--line)',
                        }}
                      >
                        ⏱️ {team.durationFormatted}
                      </span>
                    </div>
                  </div>

                  {/* Middle row: Stats Breakdown */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      opacity: 0.85,
                      marginBottom: '6px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <span>
                      Progress: <b>{team.currentQuestion} / {team.totalQuestions} questions</b> ({team.progressPct}%)
                    </span>
                    <span>
                      Score: <b>{team.correctAnswers} pts</b> ({team.accuracy}% accuracy)
                    </span>
                    <span>
                      Pace: <b>{team.paceFormatted}</b> ({team.speedBadge})
                    </span>
                    {team.completedAtFormatted && (
                      <span style={{ color: '#047857' }}>
                        Finished at: <b>{team.completedAtFormatted}</b>
                      </span>
                    )}
                  </div>

                  {/* ATHLETIC RELAY TRACK WITH RUNNING EMOJI */}
                  <div className="relay-track-container" style={{ margin: '6px 0 8px' }}>
                    <div
                      className="relay-track-lane"
                      style={{
                        borderColor: `${team.color}88`,
                        background: 'var(--cream-2)',
                        height: '24px',
                      }}
                    >
                      <div className="relay-start-line" title="Start Line" />
                      <div className="relay-track-lane-line" />

                      {/* Lane progress fill */}
                      <div
                        className="relay-track-fill"
                        style={{
                          width: `${Math.max(2, team.progressPct)}%`,
                          background: `linear-gradient(90deg, ${team.color}88, ${team.color})`,
                          boxShadow: `0 0 10px ${team.color}44`,
                        }}
                      />

                      {/* Checkpoint dots for questions */}
                      {Array.from({ length: team.totalQuestions || 15 }, (_, i) => {
                        const pct = Math.round(((i + 1) / (team.totalQuestions || 15)) * 100);
                        const isAnswered = i < team.currentQuestion;
                        return (
                          <div
                            key={i}
                            style={{
                              position: 'absolute',
                              left: `calc(${pct}% - 3px)`,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: isAnswered ? '#fff' : 'rgba(0,0,0,0.15)',
                              border: `1px solid ${isAnswered ? team.color : 'var(--line)'}`,
                              zIndex: 2,
                            }}
                            title={`Question ${i + 1}`}
                          />
                        );
                      })}

                      {/* Finish flag */}
                      <span className="relay-finish-flag" title="Task Finish Line">
                        🏁
                      </span>

                      {/* Real-time runner moving along the lane */}
                      <div
                        className={`relay-runner-emoji ${isRunning ? 'sprinting' : ''}`}
                        style={{
                          left: isFinished
                            ? 'calc(100% - 24px)'
                            : team.progressPct === 0
                            ? '2px'
                            : `calc(${Math.min(92, Math.max(2, team.progressPct))}% - 12px)`,
                        }}
                      >
                        {isFinished ? '🏃🏆' : isRunning ? '🏃💨' : '🏃'}
                      </div>
                    </div>
                  </div>

                  {/* Runner rotation bar for this team */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      opacity: 0.75,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 800 }}>Runners:</span>
                    {appState.groups[team.teamIndex]?.members.map((member, mi) => (
                      <span
                        key={mi}
                        style={{
                          background: 'var(--cream-2)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--line)',
                        }}
                      >
                        R{mi + 1}: {member}
                      </span>
                    ))}
                    <span style={{ marginLeft: 'auto', fontSize: '10.5px' }}>
                      Last active: {team.lastActiveTimeAgo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* OVERALL ALL-STATIONS MASTER STANDINGS */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <div
              style={{
                background: 'var(--cream-2)',
                border: '1.5px solid var(--line)',
                borderRadius: '12px',
                padding: '10px 14px',
                marginBottom: '4px',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--ink)',
              }}
            >
              🏆 <b>Overall Master Standings across all 6 Stations:</b> Ranked by total score, stations completed, and accuracy.
            </div>

            {overallStandings
              .sort((a, b) => {
                if (b.correct !== a.correct) return b.correct - a.correct;
                if (b.completedPhases.length !== a.completedPhases.length) {
                  return b.completedPhases.length - a.completedPhases.length;
                }
                return b.accuracy - a.accuracy;
              })
              .map((t, rankIdx) => {
                const medals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place', '🏅 4th Place'];
                const progressPct = Math.round((t.completedPhases.length / PHASES.length) * 100);

                return (
                  <div
                    key={t.teamIndex}
                    style={{
                      background: '#fff',
                      borderRadius: '14px',
                      padding: '12px 16px',
                      borderLeft: `8px solid ${t.color}`,
                      border: '1.5px solid var(--line)',
                      borderLeftWidth: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '8px',
                            background: rankIdx === 0 ? '#FEF3C7' : '#F1F5F9',
                            color: rankIdx === 0 ? '#B45309' : 'inherit',
                          }}
                        >
                          {medals[rankIdx]}
                        </span>
                        <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>{t.group.name}</strong>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--track-dark)' }}>
                        {t.correct} pts
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
                      <span>Completed: <b>{t.completedPhases.length} / {PHASES.length} stations</b> ({progressPct}%)</span>
                      <span>Accuracy: <b>{t.accuracy}%</b> ({t.correct}/{t.attempts})</span>
                      <span>Timed Duration: <b>{t.totalTimeFormatted}</b></span>
                    </div>

                    {/* Station badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {PHASES.map((ph) => {
                        const isDone = (appState.completedToday[ph.key] || []).includes(t.teamIndex);
                        const teamProg = appState.taskProgress?.[ph.key]?.[t.group.name];

                        return (
                          <span
                            key={ph.key}
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: isDone ? 'var(--track)' : 'var(--cream-2)',
                              color: isDone ? '#fff' : 'var(--ink)',
                              opacity: isDone ? 1 : 0.6,
                            }}
                          >
                            {ph.label} {isDone ? '✓' : ''} {teamProg?.durationSeconds ? `(${teamProg.durationSeconds}s)` : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
          </>
        )}

        {/* BOTTOM REAL-TIME ACTIVITY FOOTER */}
        <div
          style={{
            marginTop: '14px',
            paddingTop: '10px',
            borderTop: '2px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '11.5px',
            color: 'var(--ink)',
            opacity: 0.85,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡ <b>Live Relay Standings Sync:</b> Every group can view and check each other&apos;s live progress, answering pace, and completed stations in real time.</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '6px 16px', fontSize: '12px', height: '34px' }}
            onClick={() => {
              sounds.playTap();
              onClose();
            }}
          >
            Return to Race Map
          </button>
        </div>
      </div>
    </div>
  );
};
