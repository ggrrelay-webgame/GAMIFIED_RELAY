import React, { useState } from 'react';
import { AppState, AttemptLog } from '../types';
import { PHASES, GROUP_COLORS, BANK } from '../data/phases';
import {
  generateExcelWorkbook,
  generateMasterCSV,
  downloadFile,
  calculateStudentSummaries,
  calculateSessionDetail,
  recalculateTaskProgress,
} from '../utils/exportUtils';
import { getDepEdRating } from '../data/ggrCurriculum';
import { ActivityRecordsManager } from './ActivityRecordsManager';
import { sounds } from '../utils/audio';
import { analyzeTaskSpeedAndDone, pushCloudSync } from '../services/syncService';

interface TeacherPanelProps {
  appState: AppState;
  logData: AttemptLog[];
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  setLogData: React.Dispatch<React.SetStateAction<AttemptLog[]>>;
  currentTheme: string;
  setCurrentTheme: (theme: string) => void;
  themes: Array<{ id: string; name: string; preview: string }>;
  adminNotification: string | null;
  setAdminNotification: (msg: string | null) => void;
  onOpenCsvSync?: () => void;
  onSeedSampleData: () => void;
  onClose: () => void;
  isSyncing?: boolean;
  lastSyncTime?: Date | null;
  onManualSync?: () => Promise<void>;
  onOpenStandingDesk?: (taskKey?: string) => void;
  onResetTeamLogin?: () => void;
  loggedTeamIndex?: number | null;
}

export const TeacherPanel: React.FC<TeacherPanelProps> = ({
  appState,
  logData,
  setAppState,
  setLogData,
  currentTheme,
  setCurrentTheme,
  themes,
  adminNotification,
  setAdminNotification,
  onOpenCsvSync,
  onSeedSampleData,
  onClose,
  isSyncing,
  lastSyncTime,
  onManualSync,
  onOpenStandingDesk,
  onResetTeamLogin,
  loggedTeamIndex,
}) => {
  const [adminTab, setAdminTab] = useState<'overview' | 'sessions' | 'records' | 'rosters' | 'reports'>('overview');
  const [activeSessionDrillPhaseKey, setActiveSessionDrillPhaseKey] = useState<string>('session1');
  const [drillTeamFilter, setDrillTeamFilter] = useState<string>('all');
  const [taskSpeedPhaseKey, setTaskSpeedPhaseKey] = useState<string>(
    PHASES[appState.currentPhaseIndex]?.key || 'session1'
  );
  const [inspectedQuestionDetail, setInspectedQuestionDetail] = useState<{
    student: string;
    team: string;
    questionNum: number;
    prompt: string;
    chosen: string;
    correct: boolean;
  } | null>(null);
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  const totalClassAttempts = logData.length;
  const totalClassCorrect = logData.filter((l) => l.correct).length;
  const classAccuracy =
    totalClassAttempts > 0 ? Math.round((totalClassCorrect / totalClassAttempts) * 100) : 0;

  const teamStats = appState.groups.map((g, gi) => {
    const tLogs = logData.filter((l) => l.team === g.name);
    const attempts = tLogs.length;
    const correct = tLogs.filter((l) => l.correct).length;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    const completedPhases = PHASES.filter((ph) =>
      (appState.completedToday[ph.key] || []).includes(gi)
    );
    const isTodayDone = (appState.completedToday[PHASES[appState.currentPhaseIndex].key] || []).includes(gi);

    return {
      index: gi,
      group: g,
      color: GROUP_COLORS[gi % GROUP_COLORS.length],
      attempts,
      correct,
      accuracy,
      completedPhases,
      isTodayDone,
    };
  });

  const leadingTeam = [...teamStats].sort((a, b) => b.correct - a.correct)[0];
  const rankedTeams = [...teamStats].sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (b.completedPhases.length !== a.completedPhases.length) {
      return b.completedPhases.length - a.completedPhases.length;
    }
    return b.accuracy - a.accuracy;
  });
  const allStudentSummaries = calculateStudentSummaries(appState, logData);

  const activeDrillPhase =
    PHASES.find((p) => p.key === activeSessionDrillPhaseKey) || PHASES[1];

  const sessionDetailData = calculateSessionDetail(
    activeSessionDrillPhaseKey,
    appState,
    logData
  );

  const drillBankItems = BANK[activeSessionDrillPhaseKey as keyof typeof BANK] || [];
  const filteredDrillStudents =
    drillTeamFilter === 'all'
      ? sessionDetailData.students
      : sessionDetailData.students.filter((s) => s.teamName === drillTeamFilter);

  const renderAccuracyBadge = (accuracy: number | null, attempts: number) => {
    if (attempts === 0 || accuracy === null) {
      return <span className="acc-badge acc-none">Pending</span>;
    }
    if (accuracy >= 80) {
      return <span className="acc-badge acc-high">{accuracy}% High</span>;
    } else if (accuracy >= 60) {
      return <span className="acc-badge acc-mid">{accuracy}% Mid</span>;
    } else {
      return <span className="acc-badge acc-low">{accuracy}% Low</span>;
    }
  };

  const renderGroupTrackProgress = (
    color: string,
    progressPct: number,
    groupIndex: number,
    groupName: string,
    completedCount: number
  ) => {
    const isFinishedAll = completedCount >= PHASES.length;
    const safeLeft = isFinishedAll
      ? 'calc(100% - 24px)'
      : progressPct === 0
      ? '2px'
      : `calc(${Math.min(92, Math.max(2, progressPct))}% - 12px)`;

    return (
      <div className="relay-track-container" style={{ margin: '8px 0 12px' }}>
        <div
          className="relay-track-lane"
          style={{
            borderColor: `${color}88`,
            background: 'var(--cream-2)',
          }}
        >
          {/* Start line */}
          <div className="relay-start-line" title="Start Line" />
          {/* Center dashed lane line */}
          <div className="relay-track-lane-line" />

          {/* Progress colored fill */}
          <div
            className="relay-track-fill"
            style={{
              width: `${Math.max(3, progressPct)}%`,
              background: `linear-gradient(90deg, ${color}88, ${color})`,
              boxShadow: `0 0 8px ${color}44`,
            }}
          />

          {/* Station checkpoints along the track */}
          {PHASES.map((ph, pi) => {
            const stationPct = Math.round(((pi + 1) / PHASES.length) * 100);
            const isPassed = (appState.completedToday[ph.key] || []).includes(groupIndex);
            return (
              <div
                key={ph.key}
                style={{
                  position: 'absolute',
                  left: `calc(${stationPct}% - 4px)`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isPassed ? '#fff' : 'rgba(0,0,0,0.15)',
                  border: `1.5px solid ${isPassed ? color : 'var(--line)'}`,
                  zIndex: 3,
                  pointerEvents: 'none',
                }}
                title={`${ph.label}: ${isPassed ? 'Completed ✓' : 'Checkpoint'}`}
              />
            );
          })}

          {/* Finish flag */}
          <span className="relay-finish-flag" title="Finish Line (All 6 Stations)">
            🏁
          </span>

          {/* Running emoji moving along the track */}
          <div
            className={`relay-runner-emoji ${progressPct > 0 && !isFinishedAll ? 'sprinting' : ''}`}
            style={{
              left: safeLeft,
            }}
            title={`${groupName}: ${progressPct}% completed (${completedCount}/${PHASES.length} stations)`}
          >
            {isFinishedAll ? '🏃🏆' : progressPct > 0 ? '🏃💨' : '🏃'}
          </div>
        </div>
      </div>
    );
  };

  const handleSetActivePhase = (index: number) => {
    sounds.playTap();
    const updated = { ...appState, currentPhaseIndex: index };
    setAppState(updated);
  };

  const handleRenameGroup = (groupIndex: number, newName: string) => {
    const updated = appState.groups.map((g, idx) =>
      idx === groupIndex ? { ...g, name: newName || `Team ${idx + 1}` } : g
    );
    const updatedState = { ...appState, groups: updated };
    setAppState(updatedState);
  };

  const handleRenameMember = (groupIndex: number, memberIndex: number, newName: string) => {
    const updated = appState.groups.map((g, idx) => {
      if (idx !== groupIndex) return g;
      const newMembers = [...g.members];
      newMembers[memberIndex] = newName || `Runner ${memberIndex + 1}`;
      return { ...g, members: newMembers };
    });
    const updatedState = { ...appState, groups: updated };
    setAppState(updatedState);
  };

  const handleResetTodayCompletions = () => {
    sounds.playTap();
    const ph = PHASES[appState.currentPhaseIndex];
    const updatedCompleted = {
      ...appState.completedToday,
      [ph.key]: [],
    };
    const updatedTaskProgress = recalculateTaskProgress(appState.groups, updatedCompleted, logData);
    const updatedState = { ...appState, completedToday: updatedCompleted, taskProgress: updatedTaskProgress };
    setAppState(updatedState);
    localStorage.setItem('ggr_state_v4', JSON.stringify(updatedState));

    pushCloudSync({
      clientState: {
        completedToday: updatedCompleted,
        taskProgress: updatedTaskProgress,
      },
      logData,
      isDelete: true,
    });

    setAdminNotification(`Reset completions for ${ph.label}. All teams can now access it again!`);
    setTimeout(() => setAdminNotification(null), 3000);
  };

  const handleChangePin = () => {
    sounds.playTap();
    if (newPinInput.trim().length >= 4) {
      setAppState((prev) => ({ ...prev, pin: newPinInput.trim() }));
      setNewPinInput('');
      setAdminNotification('PIN updated successfully.');
      setTimeout(() => setAdminNotification(null), 3000);
    } else {
      setAdminNotification('Use at least 4 digits.');
      setTimeout(() => setAdminNotification(null), 3000);
    }
  };

  const handleExportExcel = async () => {
    sounds.playTap();
    setIsExportingExcel(true);
    try {
      const blob = await generateExcelWorkbook(appState, logData, appState.surveyResponses);
      const filename = `Binanuahan_ES_GGR_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      downloadFile(blob, filename);
      setAdminNotification('Excel report generated and downloaded!');
      setTimeout(() => setAdminNotification(null), 4000);
    } catch (err) {
      console.error(err);
      setAdminNotification('Failed to generate Excel file.');
      setTimeout(() => setAdminNotification(null), 3000);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportCSV = () => {
    sounds.playTap();
    const csvContent = generateMasterCSV(appState, logData, appState.surveyResponses);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `Binanuahan_ES_GGR_Master_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(blob, filename);
    setAdminNotification('Master CSV downloaded!');
    setTimeout(() => setAdminNotification(null), 4000);
  };

  return (
    <div className="modal-backdrop show">
      <div className="modal-box modal-wide">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
          <h2>Teacher &amp; Researcher Area</h2>
          <button
            className="icon-btn"
            style={{ width: '32px', height: '32px' }}
            onClick={() => {
              sounds.playTap();
              onClose();
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="modal-sub">
          Binanuahan ES Grade 6 &middot; Gamified Grammar Relay &middot; Coach Dash
        </div>

        {/* Live Multi-Phone Cloud Synchronization Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--cream-2, #F3F1EC)',
            border: '1.5px solid var(--border, #E4DFD5)',
            borderRadius: '12px',
            padding: '8px 12px',
            margin: '8px 0 14px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isSyncing ? '#EAB308' : '#22C55E',
                boxShadow: isSyncing
                  ? '0 0 8px rgba(234, 179, 8, 0.7)'
                  : '0 0 8px rgba(34, 197, 94, 0.7)',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>
              {isSyncing ? 'Syncing Mobile Devices...' : '🟢 Live Multi-Phone Sync Active'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
              &middot; {totalClassAttempts} total attempts from all phones
            </span>
            {lastSyncTime && (
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                (synced {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
              </span>
            )}
          </div>

          {onManualSync && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={isSyncing}
              onClick={() => {
                sounds.playTap();
                onManualSync();
              }}
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border, #E4DFD5)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
              }}
            >
              <span>🔄</span>
              <span>{isSyncing ? 'Refreshing...' : 'Refresh Live Data'}</span>
            </button>
          )}
        </div>

        {adminNotification && (
          <div
            style={{
              background: '#E4F7EC',
              color: 'var(--track-dark)',
              padding: '9px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
            }}
          >
            <span>✅</span>
            <span>{adminNotification}</span>
          </div>
        )}

        {/* 5 Tabs Navigation */}
        <div className="tab-bar">
          <button
            type="button"
            className={`tab-btn ${adminTab === 'overview' ? 'active' : ''}`}
            onClick={() => {
              sounds.playTap();
              setAdminTab('overview');
            }}
          >
            📊 Overview &amp; Standings
          </button>
          <button
            type="button"
            className={`tab-btn ${adminTab === 'sessions' ? 'active' : ''}`}
            onClick={() => {
              sounds.playTap();
              setAdminTab('sessions');
            }}
          >
            🎯 Items Drilldown
          </button>
          <button
            type="button"
            className={`tab-btn ${adminTab === 'records' ? 'active' : ''}`}
            onClick={() => {
              sounds.playTap();
              setAdminTab('records');
            }}
          >
            📋 Activity Records
          </button>
          <button
            type="button"
            className={`tab-btn ${adminTab === 'rosters' ? 'active' : ''}`}
            onClick={() => {
              sounds.playTap();
              setAdminTab('rosters');
            }}
          >
            👥 5-Runner Rosters
          </button>
          <button
            type="button"
            className={`tab-btn ${adminTab === 'reports' ? 'active' : ''}`}
            onClick={() => {
              sounds.playTap();
              setAdminTab('reports');
            }}
          >
            📑 Export Excel &amp; CSV
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: OVERVIEW & STANDINGS */}
        {/* ======================================================== */}
        {adminTab === 'overview' && (
          <div>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-num">{totalClassAttempts}</div>
                <div className="kpi-label">Answers Logged</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-num">
                  {totalClassAttempts > 0 ? (
                    <span
                      style={{
                        color:
                          classAccuracy >= 80
                            ? 'var(--track-dark)'
                            : classAccuracy >= 60
                            ? '#B45309'
                            : 'var(--danger)',
                      }}
                    >
                      {classAccuracy}%
                    </span>
                  ) : (
                    '0%'
                  )}
                </div>
                <div className="kpi-label">Overall Class Accuracy</div>
              </div>
              <div className="kpi-card">
                <div
                  className="kpi-num"
                  style={{ fontSize: '18px', color: leadingTeam ? leadingTeam.color : 'inherit' }}
                >
                  {leadingTeam && leadingTeam.correct > 0 ? leadingTeam.group.name : 'In Progress'}
                </div>
                <div className="kpi-label">
                  Leader &middot; {leadingTeam ? `${leadingTeam.correct} pts` : 'No score'}
                </div>
              </div>
            </div>

            {/* DEVICE TEAM LOCK & RESET (TEACHER ONLY) */}
            {loggedTeamIndex !== null && loggedTeamIndex !== undefined && onResetTeamLogin && (
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1.5px solid #F59E0B',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E' }}>
                    🔒 Device Assigned To: {appState.groups[loggedTeamIndex]?.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#B45309' }}>
                    Students on this device are locked into this team portal. Only the Standings connects all groups.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: '#DC2626',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 800,
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    sounds.playTap();
                    onResetTeamLogin();
                  }}
                >
                  🔓 Reset Device Team Login
                </button>
              </div>
            )}

            {/* STANDING DESK & TASK SPEED SYNCHRONIZATION */}
            {(() => {
              const currentSpeedPhase = PHASES.find((p) => p.key === taskSpeedPhaseKey) || PHASES[0];
              const taskSpeedResult = analyzeTaskSpeedAndDone(
                currentSpeedPhase.key,
                currentSpeedPhase.label,
                currentSpeedPhase.itemCount,
                appState,
                logData,
                GROUP_COLORS
              );

              return (
                <div className="admin-section" style={{ border: '2px solid #3B82F6', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: '#1E3A8A' }}>
                        <span>🏆</span>
                        <span>Live Standings: Real-Time Task Speed &amp; Group Progress</span>
                      </h3>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                        Live sync comparing which group is faster and done to a certain task (viewable by all groups)
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{
                        background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                        color: '#fff',
                        border: 'none',
                        fontSize: '12px',
                        padding: '6px 14px',
                        borderRadius: '10px',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                      onClick={() => onOpenStandingDesk?.(taskSpeedPhaseKey)}
                      title="Launch Full Live Relay Standings & Group Progress"
                    >
                      <span>🏆</span>
                      <span>Launch Full Standings &amp; Progress</span>
                    </button>
                  </div>

                  {/* Certain Task Selector */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '5px', textTransform: 'uppercase' }}>
                      Select Station to Compare Speed &amp; Completion:
                    </div>
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {PHASES.map((ph) => {
                        const isSelected = ph.key === taskSpeedPhaseKey;
                        const doneCount = (appState.completedToday[ph.key] || []).length;
                        return (
                          <button
                            key={ph.key}
                            type="button"
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              border: isSelected ? '2px solid #2563EB' : '1px solid var(--line)',
                              background: isSelected ? '#EFF6FF' : '#fff',
                              color: isSelected ? '#1D4ED8' : 'var(--ink)',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            onClick={() => {
                              sounds.playTap();
                              setTaskSpeedPhaseKey(ph.key);
                            }}
                          >
                            <span>{ph.icon}</span>
                            <span>{ph.label}</span>
                            <span style={{ fontSize: '10px', opacity: 0.75 }}>({doneCount}/4 Done)</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Highlights banner */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>⚡ FASTEST GROUP ON THIS TASK</div>
                      {taskSpeedResult.fastestTeam ? (
                        <div style={{ marginTop: '2px' }}>
                          <strong style={{ fontSize: '15px', color: '#B45309', fontFamily: 'Baloo 2' }}>
                            {taskSpeedResult.fastestTeam.teamName}
                          </strong>
                          <div style={{ fontSize: '12px', color: '#475569' }}>
                            Time: <b>{taskSpeedResult.fastestTeam.durationFormatted}</b> ({taskSpeedResult.fastestTeam.paceFormatted})
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>Racing in progress...</div>
                      )}
                    </div>

                    <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>🥇 1ST TO CROSS FINISH LINE</div>
                      {taskSpeedResult.firstFinishedTeam ? (
                        <div style={{ marginTop: '2px' }}>
                          <strong style={{ fontSize: '15px', color: '#047857', fontFamily: 'Baloo 2' }}>
                            {taskSpeedResult.firstFinishedTeam.teamName}
                          </strong>
                          <div style={{ fontSize: '12px', color: '#475569' }}>
                            Finished at <b>{taskSpeedResult.firstFinishedTeam.completedAtFormatted || 'Recorded'}</b>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>Waiting for 1st finish...</div>
                      )}
                    </div>

                    <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>🏁 TASK COMPLETION STATUS</div>
                      <div style={{ marginTop: '2px' }}>
                        <strong style={{ fontSize: '15px', color: '#1E293B', fontFamily: 'Baloo 2' }}>
                          {taskSpeedResult.completedCount} of 4 Groups Done
                        </strong>
                        <div style={{ fontSize: '12px', color: '#475569' }}>
                          {taskSpeedResult.inProgressCount > 0 ? `${taskSpeedResult.inProgressCount} currently racing` : 'Station idle'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Task Speed Breakdown List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {taskSpeedResult.teams
                      .sort((a, b) => {
                        if (a.isDone && !b.isDone) return -1;
                        if (!a.isDone && b.isDone) return 1;
                        if (a.isDone && b.isDone) return (a.durationSeconds || 9999) - (b.durationSeconds || 9999);
                        return b.currentQuestion - a.currentQuestion;
                      })
                      .map((team, idx) => (
                        <div
                          key={team.teamIndex}
                          style={{
                            background: '#fff',
                            border: '1px solid #E2E8F0',
                            borderLeft: `5px solid ${team.color}`,
                            borderRadius: '8px',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, color: '#64748B' }}>#{idx + 1}</span>
                            <strong style={{ fontSize: '14px', fontFamily: 'Baloo 2' }}>{team.teamName}</strong>
                            {team.isDone ? (
                              <span style={{ fontSize: '10.5px', background: '#DCFCE7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                🏁 {team.completionOrder === 1 ? '1st DONE' : `${team.completionOrder}th DONE`}
                              </span>
                            ) : team.status === 'in_progress' ? (
                              <span style={{ fontSize: '10.5px', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                🏃 Q {team.currentQuestion} / {team.totalQuestions}
                              </span>
                            ) : (
                              <span style={{ fontSize: '10.5px', background: '#F1F5F9', color: '#64748B', padding: '2px 6px', borderRadius: '4px' }}>
                                ⏳ Not Started
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span>⏱️ <b>{team.durationFormatted}</b></span>
                            {team.isDone && team.isFastest && (
                              <span style={{ color: '#B45309', fontWeight: 800, fontSize: '11px' }}>⚡ Fastest</span>
                            )}
                            {team.isDone && !team.isFastest && team.secondsBehindFastest !== null && (
                              <span style={{ color: '#64748B', fontSize: '11px' }}>+{team.secondsBehindFastest}s</span>
                            )}
                            <span style={{ opacity: 0.75 }}>Pace: <b>{team.paceFormatted}</b></span>
                            <span>Score: <b>{team.correctAnswers} pts</b> ({team.accuracy}%)</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })()}

            {/* LIVE RELAY STANDINGS & RANKINGS */}
            <div className="admin-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🏆</span>
                  <span>Live Relay Standings &amp; Rankings</span>
                </h3>
                <span className="small-note">
                  Ranked by score &amp; stations completed
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                {rankedTeams.map((team, rankIdx) => {
                  const medals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place', '🏅 4th Place'];
                  const medalBadge = medals[rankIdx] || `Rank #${rankIdx + 1}`;
                  const progressPct = Math.round((team.completedPhases.length / PHASES.length) * 100);
                  const isLeader = rankIdx === 0 && team.correct > 0;

                  return (
                    <div
                      key={team.index}
                      className={`standings-card rank-${rankIdx + 1}`}
                      style={{ borderLeft: `6px solid ${team.color}` }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            fontFamily: 'Baloo 2',
                            color: rankIdx === 0 ? '#B45309' : rankIdx === 1 ? '#475569' : rankIdx === 2 ? '#92400E' : 'var(--ink)',
                            background: rankIdx === 0 ? '#FEF3C7' : rankIdx === 1 ? '#F1F5F9' : rankIdx === 2 ? '#FFEDD5' : 'var(--cream-2)',
                            padding: '2px 8px',
                            borderRadius: '8px',
                          }}
                        >
                          {medalBadge} {isLeader ? '👑' : ''}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--track-dark)' }}>
                          {team.correct} pts
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: team.color,
                            display: 'inline-block',
                          }}
                        />
                        <strong style={{ fontSize: '15px', fontFamily: 'Baloo 2' }}>
                          {team.group.name}
                        </strong>
                        <span style={{ fontSize: '11px', opacity: 0.65 }}>(5 Runners)</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, opacity: 0.85, marginBottom: '2px' }}>
                        <span>Accuracy: <b>{team.accuracy}%</b></span>
                        <span>Stations: <b>🏃 {team.completedPhases.length} / {PHASES.length}</b> ({progressPct}%)</span>
                      </div>

                      {/* Running emoji moving along the track */}
                      {renderGroupTrackProgress(team.color, progressPct, team.index, team.group.name, team.completedPhases.length)}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4 Teams Progress */}
            <div className="admin-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3>4 Teams Progress (5 Runners Each)</h3>
                <span className="small-note">
                  Active Station: <b>{PHASES[appState.currentPhaseIndex].label}</b>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {teamStats.map((t) => {
                  const progressPct = Math.round((t.completedPhases.length / PHASES.length) * 100);
                  return (
                    <div
                      key={t.index}
                      className="team-progress-card"
                      style={{ borderLeft: `6px solid ${t.color}` }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: t.color,
                              display: 'inline-block',
                            }}
                          />
                          <strong style={{ fontSize: '15px', fontFamily: 'Baloo 2' }}>
                            {t.group.name}
                          </strong>
                          <span style={{ fontSize: '11px', opacity: 0.7 }}>(5 Runners)</span>
                        </div>
                        <div>
                          {t.isTodayDone ? (
                            <span className="completed-chip">Finished today ✅</span>
                          ) : (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', opacity: 0.6 }}>
                              Ready for {PHASES[appState.currentPhaseIndex].label} 🏃
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                        <span>
                          Score: <b style={{ color: 'var(--track-dark)' }}>{t.correct} correct</b> ({t.attempts} answered)
                        </span>
                        <span>
                          Accuracy: {renderAccuracyBadge(t.accuracy, t.attempts)}
                        </span>
                        <span>
                          Stations: <b>🏃 {t.completedPhases.length} / {PHASES.length}</b> ({progressPct}%)
                        </span>
                      </div>

                      {/* Interactive Athletic Relay Track with Running Emoji */}
                      {renderGroupTrackProgress(t.color, progressPct, t.index, t.group.name, t.completedPhases.length)}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {PHASES.map((ph, pi) => {
                          const isDone = (appState.completedToday[ph.key] || []).includes(t.index);
                          const isCurrent = pi === appState.currentPhaseIndex;
                          return (
                            <span
                              key={ph.key}
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '6px',
                                background: isDone ? 'var(--track)' : isCurrent ? '#FFF1BF' : 'var(--cream-2)',
                                color: isDone ? '#fff' : isCurrent ? '#8A5200' : 'var(--ink)',
                                opacity: isDone || isCurrent ? 1 : 0.6,
                              }}
                            >
                              {ph.label} {isDone ? '✓' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pretest vs Posttest Mean Gain Analysis */}
            <div className="admin-section">
              <h3>Pretest vs Posttest Mean Gain Summary</h3>
              <div style={{ background: 'var(--cream)', borderRadius: '14px', border: '2px solid var(--line)', overflowX: 'auto' }}>
                <table className="score-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Team</th>
                      <th style={{ textAlign: 'center' }}>Pretest %</th>
                      <th style={{ textAlign: 'center' }}>Posttest %</th>
                      <th style={{ textAlign: 'center' }}>Mean Gain</th>
                      <th style={{ textAlign: 'right' }}>DepEd Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStudentSummaries.map((s, idx) => {
                      const pre = s.phases['pretest']?.accuracy ?? null;
                      const post = s.phases['posttest']?.accuracy ?? null;
                      const gain = pre !== null && post !== null ? post - pre : null;
                      const rating = s.totalAttempts > 0 ? getDepEdRating(s.overallAccuracy) : null;
                      return (
                        <tr key={idx}>
                          <td>{s.studentName}</td>
                          <td style={{ fontSize: '11px', opacity: 0.8 }}>{s.teamName}</td>
                          <td style={{ textAlign: 'center' }}>{pre !== null ? `${pre}%` : '—'}</td>
                          <td style={{ textAlign: 'center' }}>{post !== null ? `${post}%` : '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {gain !== null ? (
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: gain >= 0 ? '#0F5132' : '#842029',
                                  background: gain >= 0 ? '#D1E7DD' : '#F8D7DA',
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                }}
                              >
                                {gain >= 0 ? `+${gain}%` : `${gain}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {rating ? (
                              <span
                                className="deped-badge"
                                style={{ background: rating.bg, color: rating.color }}
                              >
                                {rating.label.split(' ')[0]}
                              </span>
                            ) : (
                              'Pending'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: WEEKLY SESSIONS DRILLDOWN */}
        {/* ======================================================== */}
        {adminTab === 'sessions' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ marginBottom: '2px' }}>Items Drilldown</h3>
                <div className="small-note">
                  See whether each student got each question <b>RIGHT (✅)</b> or <b>WRONG (❌)</b>, with color-coded accuracy scores.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-sky"
                onClick={handleExportExcel}
                disabled={isExportingExcel}
              >
                {isExportingExcel ? 'Exporting...' : '📊 Download Excel (.xlsx)'}
              </button>
            </div>

            {/* Station / Week Selector Pills */}
            <div className="session-pill-strip">
              {PHASES.map((ph) => {
                const isActive = ph.key === activeSessionDrillPhaseKey;
                const phaseAttempts = logData.filter((l) => l.phase === ph.key).length;
                return (
                  <button
                    key={ph.key}
                    type="button"
                    className={`session-pill-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      sounds.playTap();
                      setActiveSessionDrillPhaseKey(ph.key);
                    }}
                  >
                    <span>{ph.icon}</span> {ph.label} ({ph.weekLabel})
                    {phaseAttempts > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          background: isActive ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.08)',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontSize: '10px',
                        }}
                      >
                        {phaseAttempts} ans
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Station Banner */}
            <div
              style={{
                background: 'var(--cream-2)',
                border: '2px solid var(--line)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'Baloo 2' }}>
                  {activeDrillPhase.label} &middot; {activeDrillPhase.eyebrow}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.75 }}>
                  Intervention: <b>{activeDrillPhase.weekLabel}</b> &bull; Domain: <b>{activeDrillPhase.domain}</b> &bull; {drillBankItems.length} Relay Questions
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, opacity: 0.7 }}>Filter:</span>
                <select
                  className="text-input"
                  style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                  value={drillTeamFilter}
                  onChange={(e) => setDrillTeamFilter(e.target.value)}
                >
                  <option value="all">All 4 Teams (20 Runners)</option>
                  {appState.groups.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.name} (5 Runners)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Accuracy Legend */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '11px',
                fontWeight: 800,
                marginBottom: '10px',
                flexWrap: 'wrap',
              }}
            >
              <span>Accuracy Legend:</span>
              <span className="acc-badge acc-high">≥ 80% High Accuracy</span>
              <span className="acc-badge acc-mid">60% - 79% Moderate</span>
              <span className="acc-badge acc-low">&lt; 60% Needs Support</span>
              <span style={{ borderLeft: '2px solid var(--line)', paddingLeft: '8px', display: 'inline-flex', gap: '8px' }}>
                <span style={{ color: '#0F5132' }}>✅ = Right</span>
                <span style={{ color: '#842029' }}>❌ = Wrong</span>
                <span style={{ opacity: 0.5 }}>⚪ = Pending</span>
              </span>
            </div>

            {/* Question-by-Question Matrix */}
            <div style={{ background: 'var(--cream)', borderRadius: '14px', border: '2px solid var(--line)', overflowX: 'auto', marginBottom: '14px' }}>
              <table className="score-table" style={{ minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '150px' }}>Student Runner</th>
                    <th style={{ width: '100px' }}>Team</th>
                    <th style={{ textAlign: 'center', width: '70px' }}>Answered</th>
                    <th style={{ textAlign: 'center', width: '70px' }}>Correct</th>
                    <th style={{ textAlign: 'center', width: '110px' }}>Accuracy Score</th>
                    {drillBankItems.map((_, qIdx) => (
                      <th
                        key={qIdx}
                        style={{
                          textAlign: 'center',
                          width: '36px',
                          padding: '6px 2px',
                          cursor: 'help',
                        }}
                        title={`Question ${qIdx + 1}: ${drillBankItems[qIdx].p}`}
                      >
                        Q{qIdx + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDrillStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5 + drillBankItems.length} style={{ textAlign: 'center', padding: '20px', opacity: 0.6 }}>
                        No runner records found for this station.
                      </td>
                    </tr>
                  ) : (
                    filteredDrillStudents.map((stu, sIdx) => (
                      <tr key={sIdx}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background:
                                  GROUP_COLORS[
                                    appState.groups.findIndex((g) => g.name === stu.teamName) %
                                      GROUP_COLORS.length
                                  ],
                              }}
                            />
                            <span>{stu.studentName}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '11px', opacity: 0.8 }}>
                          {stu.teamName} <small>(R#{stu.runnerIndex})</small>
                        </td>
                        <td style={{ textAlign: 'center' }}>{stu.attempts}</td>
                        <td style={{ textAlign: 'center' }}>
                          <strong style={{ color: stu.correct > 0 ? 'var(--track-dark)' : 'inherit' }}>
                            {stu.correct}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {renderAccuracyBadge(stu.accuracy, stu.attempts)}
                        </td>
                        {drillBankItems.map((_, qIdx) => {
                          const qNumber = qIdx + 1;
                          const qRes = stu.questionResults[qNumber];
                          if (!qRes) {
                            return (
                              <td key={qIdx} style={{ textAlign: 'center', padding: '4px 2px' }}>
                                <span className="q-result-pill q-result-empty" title="Not answered by this runner">⚪</span>
                              </td>
                            );
                          }
                          return (
                            <td key={qIdx} style={{ textAlign: 'center', padding: '4px 2px' }}>
                              <button
                                type="button"
                                className={`q-result-pill ${qRes.correct ? 'q-result-right' : 'q-result-wrong'}`}
                                title={`Q${qNumber}: ${qRes.correct ? 'RIGHT' : 'WRONG'}. Selected: "${qRes.chosen}". Tap for details.`}
                                onClick={() => {
                                  sounds.playTap();
                                  setInspectedQuestionDetail({
                                    student: stu.studentName,
                                    team: stu.teamName,
                                    questionNum: qNumber,
                                    prompt: qRes.prompt,
                                    chosen: qRes.chosen,
                                    correct: qRes.correct,
                                  });
                                }}
                              >
                                {qRes.correct ? '✓' : '✗'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {inspectedQuestionDetail && (
              <div
                style={{
                  background: inspectedQuestionDetail.correct ? '#E4F7EC' : '#FCE7E4',
                  border: `2px solid ${inspectedQuestionDetail.correct ? 'var(--track)' : 'var(--danger)'}`,
                  borderRadius: '14px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '14px' }}>
                    Question #{inspectedQuestionDetail.questionNum} &bull; {inspectedQuestionDetail.student} ({inspectedQuestionDetail.team})
                  </strong>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    style={{ padding: '2px 8px' }}
                    onClick={() => setInspectedQuestionDetail(null)}
                  >
                    ✕ Close
                  </button>
                </div>
                <div style={{ fontSize: '13px', marginBottom: '6px' }}>
                  Prompt: &ldquo;{inspectedQuestionDetail.prompt}&rdquo;
                </div>
                <div style={{ fontSize: '12px', fontWeight: 800 }}>
                  Student Selected: <span style={{ color: inspectedQuestionDetail.correct ? 'var(--track-dark)' : 'var(--danger)' }}>&ldquo;{inspectedQuestionDetail.chosen}&rdquo;</span> — Result:{' '}
                  {inspectedQuestionDetail.correct ? '✅ Got it RIGHT' : '❌ Got it WRONG'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: ACTIVITY & RECORDS MANAGER                        */}
        {/* ======================================================== */}
        {adminTab === 'records' && (
          <ActivityRecordsManager
            appState={appState}
            logData={logData}
            setAppState={setAppState}
            setLogData={setLogData}
            onOpenCsvSync={onOpenCsvSync}
            setAdminNotification={setAdminNotification}
          />
        )}

        {/* ======================================================== */}
        {/* TAB 4: ROSTERS & CONTROLS */}
        {/* ======================================================== */}
        {adminTab === 'rosters' && (
          <div>
            <div className="admin-section">
              <h3>Today's Active Station</h3>
              <div id="admin-phase-list">
                {PHASES.map((ph, i) => {
                  const isCurrent = i === appState.currentPhaseIndex;
                  return (
                    <div key={ph.key} className={`phase-row ${isCurrent ? 'is-current' : ''}`}>
                      <span>
                        {ph.icon} {ph.label} &middot; <small>{ph.sub} ({ph.itemCount} items &bull; {ph.weekLabel})</small>
                      </span>
                      <button
                        className={`btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => handleSetActivePhase(i)}
                      >
                        {isCurrent ? 'Active' : 'Set active'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="admin-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h3>Team Rosters (4 Groups &times; 5 Runners)</h3>
                <span className="small-note">5 runners each</span>
              </div>
              <div className="small-note" style={{ marginBottom: '12px' }}>
                Customize names for all 5 runners in each group. The 5 relay roles rotate automatically in order: Reader → Solver → Checker → Explainer → Runner.
              </div>
              <div>
                {appState.groups.map((g, gi) => (
                  <div
                    key={gi}
                    className="roster-group"
                    style={{ borderLeft: `6px solid ${GROUP_COLORS[gi % GROUP_COLORS.length]}` }}
                  >
                    <div className="rg-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Group {gi + 1} Name</span>
                    </div>
                    <input
                      className="text-input"
                      style={{ marginBottom: '10px' }}
                      value={g.name}
                      onChange={(e) => handleRenameGroup(gi, e.target.value)}
                    />
                    <div className="rg-title" style={{ fontSize: '12px', opacity: 0.8 }}>
                      5 Runners (Relay order: 1 to 5)
                    </div>
                    <div className="roster-inputs">
                      {g.members.map((m, mi) => (
                        <div key={mi} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 800, opacity: 0.6 }}>
                            Runner {mi + 1}
                          </label>
                          <input
                            className="text-input"
                            value={m}
                            onChange={(e) => handleRenameMember(gi, mi, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="admin-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h3>🎨 Background Color Themes</h3>
                <span className="small-note">7 kid-friendly color themes</span>
              </div>
              <div className="small-note" style={{ marginBottom: '10px' }}>
                Select the background theme for the app:
              </div>
              <div className="theme-options-grid">
                {themes.map((th) => (
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

            <div className="admin-section">
              <h3>Reset Completions &amp; Change PIN</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleResetTodayCompletions}
                >
                  Reset Today's Completions for {PHASES[appState.currentPhaseIndex].label}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={onSeedSampleData}
                >
                  Load Sample Demo Data
                </button>
              </div>
              <div>
                <input
                  className="text-input"
                  placeholder="New 4-6 digit PIN"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                />
                <button className="btn btn-ghost" style={{ marginTop: '8px' }} onClick={handleChangePin}>
                  Save PIN
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: EXPORT EXCEL & CSV */}
        {/* ======================================================== */}
        {adminTab === 'reports' && (
          <div>
            <div className="admin-section">
              <h3>Academic Reports &amp; Data Export</h3>
              <div className="small-note" style={{ marginBottom: '14px' }}>
                Export Grade 6 Binanuahan ES Gamified Grammar Relay performance data. Includes color-coded accuracy scores, individual sheets/tabs for each weekly session, question correctness audits, and Pretest vs Posttest mean gain analysis.
              </div>
              <div className="export-card-grid">
                <div className="export-card" style={{ borderColor: 'var(--track)' }}>
                  <div>
                    <h4 style={{ color: 'var(--track-dark)' }}>
                      <span>📗</span> Excel Workbook (.xlsx)
                    </h4>
                    <p style={{ fontSize: '12px', opacity: 0.75, marginBottom: '10px' }}>
                      Multi-tab formatted spreadsheet with:
                    </p>
                    <ul style={{ fontSize: '11px', paddingLeft: '16px', lineHeight: 1.6, opacity: 0.85, marginBottom: '14px' }}>
                      <li><b>Overview Tab:</b> Class standings &amp; student master matrix</li>
                      <li><b>Weekly Tabs:</b> A different tab for each session (Pretest, Missions 1–4, Posttest)</li>
                      <li><b>Right / Wrong Matrix:</b> Question-by-question checkmarks (✅/❌)</li>
                      <li><b>Conditional Formatting:</b> Color-coded accuracy scores (Green ≥80%, Amber 60–79%, Red &lt;60%)</li>
                      <li><b>Mean Gain:</b> Baseline vs Summative gain analysis</li>
                      <li><b>Survey Sheet:</b> Student Likert responses</li>
                    </ul>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleExportExcel}
                    disabled={isExportingExcel}
                  >
                    {isExportingExcel ? 'Generating Workbook...' : 'Download Excel (.xlsx)'}
                  </button>
                </div>

                <div className="export-card" style={{ borderColor: 'var(--sky)' }}>
                  <div>
                    <h4 style={{ color: 'var(--sky)' }}>
                      <span>📄</span> Master Results CSV
                    </h4>
                    <p style={{ fontSize: '12px', opacity: 0.75, marginBottom: '10px' }}>
                      Comprehensive CSV structured for statistical tools &amp; Google Sheets:
                    </p>
                    <ul style={{ fontSize: '11px', paddingLeft: '16px', lineHeight: 1.6, opacity: 0.85, marginBottom: '14px' }}>
                      <li><b>Weekly Student Matrix:</b> Weekly percentages per student runner</li>
                      <li><b>DepEd Scale:</b> Performance rating classifications</li>
                      <li><b>Roles:</b> Reader, Solver, Checker, Explainer, Runner</li>
                      <li><b>Binary Markers:</b> 1 (Right) and 0 (Wrong) for statistical analysis</li>
                    </ul>
                  </div>
                  <button className="btn btn-sky" onClick={handleExportCSV}>
                    Download CSV (.csv)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ marginTop: '16px' }}
          onClick={() => {
            sounds.playTap();
            onClose();
          }}
        >
          Close Teacher Area
        </button>
      </div>
    </div>
  );
};
