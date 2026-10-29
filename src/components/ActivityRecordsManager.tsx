import React, { useState } from 'react';
import { AppState, AttemptLog } from '../types';
import { PHASES, GROUP_COLORS } from '../data/phases';
import { recalculateCompletedToday, recalculateTaskProgress } from '../utils/exportUtils';
import { pushCloudSync } from '../services/syncService';
import { sounds } from '../utils/audio';

interface ActivityRecordsManagerProps {
  appState: AppState;
  logData: AttemptLog[];
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  setLogData: React.Dispatch<React.SetStateAction<AttemptLog[]>>;
  onOpenCsvSync?: () => void;
  setAdminNotification: (msg: string | null) => void;
}

export const ActivityRecordsManager: React.FC<ActivityRecordsManagerProps> = ({
  appState,
  logData,
  setAppState,
  setLogData,
  onOpenCsvSync,
  setAdminNotification,
}) => {
  const [selectedTeamTab, setSelectedTeamTab] = useState<string>('all');
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'separated' | 'combined'>('separated');
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmBtnText?: string;
    onConfirm: () => void;
  } | null>(null);

  // Helper to commit log & state updates synchronously across local storage, Overview, Standings, and Cloud Sync
  const commitUpdatedLogs = (newLogs: AttemptLog[], notifyMsg: string) => {
    sounds.playTap();
    setLogData(newLogs);
    localStorage.setItem('ggr_log_v4', JSON.stringify(newLogs));

    // Recalculate completedToday AND taskProgress from the remaining logs
    // This ensures deleted records are immediately removed from Overview, Live Race Monitors, and Standings!
    const newCompleted = recalculateCompletedToday(appState, newLogs);
    const newTaskProgress = recalculateTaskProgress(appState.groups, newCompleted, newLogs);

    setAppState((prev) => {
      const updated = {
        ...prev,
        completedToday: newCompleted,
        taskProgress: newTaskProgress,
      };
      localStorage.setItem('ggr_state_v4', JSON.stringify(updated));
      return updated;
    });

    // Authoritative cloud sync push with isDelete: true so all devices delete the records from their Standings & Overview
    pushCloudSync({
      clientState: {
        completedToday: newCompleted,
        taskProgress: newTaskProgress,
      },
      logData: newLogs,
      isDelete: true,
    });

    setAdminNotification(notifyMsg);
    setTimeout(() => setAdminNotification(null), 4000);
  };

  // 1. FAST SINGLE DELETE ACTION: Clear ALL logs in 1 single click
  const handleFastClearAllLogs = () => {
    if (logData.length === 0) return;
    setConfirmModal({
      title: 'Fast Clear All Attempt Logs',
      message: `Are you sure you want to delete all ${logData.length} records from the database? All student answers and scores will reset, and all stations will become ACCESSIBLE AGAIN to runners.`,
      confirmBtnText: 'Yes, Clear All Logs',
      onConfirm: () => {
        setSelectedLogIds(new Set());
        commitUpdatedLogs(
          [],
          `🗑️ Fast Cleared all ${logData.length} attempt logs! All stations are now accessible again to runners.`
        );
      },
    });
  };

  // 2. FAST SINGLE DELETE ACTION: Clear a specific Team's logs
  const handleFastClearTeamLogs = (teamName: string) => {
    const teamLogsCount = logData.filter((l) => l.team === teamName).length;
    if (teamLogsCount === 0) return;
    setConfirmModal({
      title: `Fast Clear ${teamName} Records`,
      message: `Delete all ${teamLogsCount} records for ${teamName}? This team's scores will reset and their stations will become ACCESSIBLE AGAIN.`,
      confirmBtnText: `Yes, Clear ${teamName} Logs`,
      onConfirm: () => {
        const newLogs = logData.filter((l) => l.team !== teamName);
        setSelectedLogIds((prev) => {
          const next = new Set(prev);
          logData.filter((l) => l.team === teamName).forEach((l) => next.delete(l.id));
          return next;
        });
        commitUpdatedLogs(
          newLogs,
          `🗑️ Fast Cleared all ${teamLogsCount} logs for ${teamName}! Stations are now accessible again.`
        );
      },
    });
  };

  // 3. FAST DELETE ACTION: Clear currently filtered logs
  const handleFastClearFilteredLogs = (targetLogs: AttemptLog[]) => {
    if (targetLogs.length === 0) return;
    setConfirmModal({
      title: 'Clear Filtered Records',
      message: `Delete these ${targetLogs.length} filtered records from the database? Stations with removed activities will become ACCESSIBLE AGAIN.`,
      confirmBtnText: `Yes, Clear ${targetLogs.length} Records`,
      onConfirm: () => {
        const targetIdSet = new Set(targetLogs.map((l) => l.id));
        const newLogs = logData.filter((l) => !targetIdSet.has(l.id));
        setSelectedLogIds(new Set());
        commitUpdatedLogs(
          newLogs,
          `🗑️ Deleted ${targetLogs.length} filtered records. Database updated and stations made accessible again!`
        );
      },
    });
  };

  // 4. BATCH DELETE ACTION: Delete selected checked records
  const handleDeleteSelectedLogs = () => {
    if (selectedLogIds.size === 0) return;
    setConfirmModal({
      title: 'Delete Selected Records',
      message: `Delete ${selectedLogIds.size} selected entries from database? Corresponding scores will update and stations will become accessible again.`,
      confirmBtnText: `Yes, Delete Selected (${selectedLogIds.size})`,
      onConfirm: () => {
        const count = selectedLogIds.size;
        const newLogs = logData.filter((l) => !selectedLogIds.has(l.id));
        setSelectedLogIds(new Set());
        commitUpdatedLogs(newLogs, `🗑️ Deleted ${count} selected records.`);
      },
    });
  };

  // 5. Delete an entire activity session for a specific team
  const handleDeleteActivitySession = (phaseKey: string, teamName: string) => {
    const ph = PHASES.find((p) => p.key === phaseKey);
    const count = logData.filter((l) => l.phase === phaseKey && l.team === teamName).length;
    setConfirmModal({
      title: `Delete ${teamName} – ${ph?.label || phaseKey}`,
      message: `Delete ${teamName}'s activity for "${ph?.label || phaseKey}"? (${count} attempt records will be removed from database, and the activity will become ACCESSIBLE AGAIN to runners).`,
      confirmBtnText: 'Yes, Delete Activity',
      onConfirm: () => {
        const newLogs = logData.filter((l) => !(l.phase === phaseKey && l.team === teamName));
        commitUpdatedLogs(
          newLogs,
          `Deleted ${count} records for ${teamName} (${ph?.label}). Station is now accessible again!`
        );
      },
    });
  };

  // 6. Delete a single attempt log entry
  const handleDeleteSingleEntry = (attemptId: string) => {
    const item = logData.find((l) => l.id === attemptId);
    if (!item) return;
    const newLogs = logData.filter((l) => l.id !== attemptId);
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      next.delete(attemptId);
      return next;
    });
    commitUpdatedLogs(
      newLogs,
      `Removed question attempt for ${item.player} (${item.team}). Scores updated!`
    );
  };

  // 7. Toggle station access
  const handleToggleAccessible = (phaseKey: string, groupIndex: number) => {
    sounds.playTap();
    const g = appState.groups[groupIndex];
    const ph = PHASES.find((p) => p.key === phaseKey);
    const currentList = appState.completedToday[phaseKey] || [];
    const isDone = currentList.includes(groupIndex);

    let updatedList: number[];
    if (isDone) {
      updatedList = currentList.filter((idx) => idx !== groupIndex);
      setAdminNotification(`Unlocked ${ph?.label} for ${g.name}. It is now accessible again!`);
    } else {
      updatedList = [...currentList, groupIndex];
      setAdminNotification(`Marked ${ph?.label} as completed for ${g.name}.`);
    }

    const updatedCompleted = {
      ...appState.completedToday,
      [phaseKey]: updatedList,
    };
    const updatedTaskProgress = recalculateTaskProgress(appState.groups, updatedCompleted, logData);

    setAppState((prev) => {
      const updated = {
        ...prev,
        completedToday: updatedCompleted,
        taskProgress: updatedTaskProgress,
      };
      localStorage.setItem('ggr_state_v4', JSON.stringify(updated));
      return updated;
    });

    pushCloudSync({
      clientState: {
        completedToday: updatedCompleted,
        taskProgress: updatedTaskProgress,
      },
      logData,
      isDelete: isDone, // if uncompleting, treat as deletion sync so server drops completed status
    });
    setTimeout(() => setAdminNotification(null), 3000);
  };

  // Filter helper for any array of attempt logs
  const filterLogsList = (logs: AttemptLog[], teamFilter: string) => {
    return logs.filter((l) => {
      if (teamFilter !== 'all' && l.team !== teamFilter) return false;
      if (filterPhase !== 'all' && l.phase !== filterPhase) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPlayer = l.player.toLowerCase().includes(q);
        const matchPrompt = l.prompt.toLowerCase().includes(q);
        const matchChosen = l.chosen.toLowerCase().includes(q);
        if (!matchPlayer && !matchPrompt && !matchChosen) return false;
      }
      return true;
    });
  };

  const allFilteredLogs = filterLogsList(logData, selectedTeamTab);

  // Toggle selection checkbox
  const handleToggleSelectId = (id: string) => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Render attempt table for a specific team or list of logs
  const renderAttemptTable = (tableLogs: AttemptLog[], teamContextName?: string) => {
    const isAllChecked = tableLogs.length > 0 && tableLogs.every((l) => selectedLogIds.has(l.id));

    const handleSelectAllInTable = () => {
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        if (isAllChecked) {
          tableLogs.forEach((l) => next.delete(l.id));
        } else {
          tableLogs.forEach((l) => next.add(l.id));
        }
        return next;
      });
    };

    return (
      <div style={{ background: 'var(--cream)', borderRadius: '14px', border: '2px solid var(--line)', overflowX: 'auto', maxHeight: '360px' }}>
        <table className="score-table" style={{ minWidth: '720px' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllChecked}
                  onChange={handleSelectAllInTable}
                  title="Select all"
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ width: '120px' }}>Timestamp</th>
              <th style={{ width: '100px' }}>Station</th>
              {!teamContextName && <th style={{ width: '90px' }}>Team</th>}
              <th style={{ width: '110px' }}>Runner</th>
              <th>Prompt &amp; Selected Answer</th>
              <th style={{ textAlign: 'center', width: '80px' }}>Result</th>
              <th style={{ textAlign: 'center', width: '70px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {tableLogs.length === 0 ? (
              <tr>
                <td colSpan={teamContextName ? 7 : 8} style={{ textAlign: 'center', padding: '24px', opacity: 0.6 }}>
                  No attempt entries match the filter.
                </td>
              </tr>
            ) : (
              tableLogs.map((l) => {
                const ph = PHASES.find((p) => p.key === l.phase);
                const isChecked = selectedLogIds.has(l.id);
                return (
                  <tr key={l.id} style={{ background: isChecked ? '#FFF3CD' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelectId(l.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontSize: '10.5px', opacity: 0.7 }}>
                      {new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ fontSize: '11px', fontWeight: 800 }}>
                      {ph?.label || l.phase}
                    </td>
                    {!teamContextName && <td style={{ fontSize: '11px' }}>{l.team}</td>}
                    <td style={{ fontSize: '11px', fontWeight: 700 }}>
                      {l.player} <small style={{ opacity: 0.6 }}>(#{l.runnerIndex})</small>
                    </td>
                    <td style={{ fontSize: '11px' }}>
                      <div><b>Q:</b> {l.prompt.slice(0, 48)}...</div>
                      <div style={{ color: l.correct ? 'var(--track-dark)' : 'var(--danger)', fontWeight: 700 }}>
                        Ans: &ldquo;{l.chosen}&rdquo;
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`badge-tag ${l.correct ? 'badge-tag-done' : 'badge-tag-open'}`}
                        style={{ fontSize: '10px', padding: '2px 6px' }}
                      >
                        {l.correct ? '✅ Correct' : '❌ Wrong'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: 'var(--danger)',
                          padding: '3px 6px',
                          borderRadius: '6px',
                          background: '#FCE7E4',
                          border: '1px solid #F1AEB5',
                          cursor: 'pointer',
                        }}
                        title="Delete entry from database (scores and progress will update)"
                        onClick={() => handleDeleteSingleEntry(l.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div className="admin-section">
        {/* Top Header & Fast Delete Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ marginBottom: '2px' }}>Activity Records Manager</h3>
            <div className="small-note">
              Separate data for every team with 1-click fast log clearing and automatic station re-access.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Single Delete Action: Fast Clear All */}
            {logData.length > 0 && (
              <button
                type="button"
                className="fast-delete-btn fast-delete-btn-primary"
                onClick={handleFastClearAllLogs}
                title="Single 1-click action to clear all database attempt logs"
              >
                🗑️ Fast Clear All Logs ({logData.length})
              </button>
            )}
          </div>
        </div>

        {/* Dedicated Team Tabs (Separate Data Navigation for Every Team) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className={`team-tab-btn ${selectedTeamTab === 'all' ? 'active' : ''}`}
              style={{ borderColor: selectedTeamTab === 'all' ? 'var(--track)' : undefined }}
              onClick={() => {
                sounds.playTap();
                setSelectedTeamTab('all');
              }}
            >
              <span>👥</span>
              <span>All Teams ({logData.length})</span>
            </button>
            {appState.groups.map((group, gi) => {
              const count = logData.filter((l) => l.team === group.name).length;
              const color = GROUP_COLORS[gi % GROUP_COLORS.length];
              const isActive = selectedTeamTab === group.name;
              return (
                <button
                  key={group.name}
                  type="button"
                  className={`team-tab-btn ${isActive ? 'active' : ''}`}
                  style={{
                    borderColor: isActive ? color : undefined,
                    color: isActive ? color : 'inherit',
                  }}
                  onClick={() => {
                    sounds.playTap();
                    setSelectedTeamTab(group.name);
                  }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: color,
                      display: 'inline-block',
                    }}
                  />
                  <span>{group.name} ({count})</span>
                </button>
              );
            })}
          </div>

          {/* View mode toggle */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--cream-2)', padding: '3px', borderRadius: '10px' }}>
            <button
              type="button"
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: '8px',
                background: viewMode === 'separated' ? 'var(--card)' : 'transparent',
                boxShadow: viewMode === 'separated' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
              }}
              onClick={() => setViewMode('separated')}
            >
              🗂️ Separate Team Cards
            </button>
            <button
              type="button"
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: '8px',
                background: viewMode === 'combined' ? 'var(--card)' : 'transparent',
                boxShadow: viewMode === 'combined' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
              }}
              onClick={() => setViewMode('combined')}
            >
              📋 Single Table
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="text-input"
            style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
            value={selectedTeamTab}
            onChange={(e) => setSelectedTeamTab(e.target.value)}
          >
            <option value="all">All Teams</option>
            {appState.groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>

          <select
            className="text-input"
            style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value)}
          >
            <option value="all">All Phases / Stations</option>
            {PHASES.map((ph) => (
              <option key={ph.key} value={ph.key}>
                {ph.label} ({ph.weekLabel})
              </option>
            ))}
          </select>

          <input
            className="text-input"
            style={{ flex: 1, minWidth: '160px', padding: '6px 10px', fontSize: '12px' }}
            placeholder="Search runner, prompt or answer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Fast single delete action for filtered view */}
          {allFilteredLogs.length > 0 && (
            <button
              type="button"
              className="fast-delete-btn"
              onClick={() => handleFastClearFilteredLogs(allFilteredLogs)}
              title="Fast clear all attempt entries currently matching this filter"
            >
              🗑️ Clear Filtered ({allFilteredLogs.length})
            </button>
          )}

          {/* Batch delete selected */}
          {selectedLogIds.size > 0 && (
            <button
              type="button"
              className="fast-delete-btn fast-delete-btn-primary"
              onClick={handleDeleteSelectedLogs}
              title="Delete checked items"
            >
              🗑️ Delete Selected ({selectedLogIds.size})
            </button>
          )}
        </div>

        {/* ======================================================== */}
        {/* VIEW 1: SEPARATE DATA FOR EVERY TEAM (Dedicated cards)   */}
        {/* ======================================================== */}
        {viewMode === 'separated' && (
          <div>
            {appState.groups
              .filter((g) => selectedTeamTab === 'all' || g.name === selectedTeamTab)
              .map((group, gi) => {
                const globalGroupIndex = appState.groups.findIndex((x) => x.name === group.name);
                const gIdx = globalGroupIndex >= 0 ? globalGroupIndex : gi;
                const teamColor = GROUP_COLORS[gIdx % GROUP_COLORS.length];
                const teamAllLogs = logData.filter((l) => l.team === group.name);
                const teamFilteredLogs = filterLogsList(teamAllLogs, group.name);
                const totalCorrect = teamAllLogs.filter((l) => l.correct).length;
                const accuracy = teamAllLogs.length > 0 ? Math.round((totalCorrect / teamAllLogs.length) * 100) : 0;

                return (
                  <div
                    key={group.name}
                    className="team-section-card"
                    style={{ borderLeft: `6px solid ${teamColor}` }}
                  >
                    {/* Separate Team Header with Fast Clear Action */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: teamColor,
                            display: 'inline-block',
                          }}
                        />
                        <strong style={{ fontSize: '16px', fontFamily: 'Baloo 2' }}>
                          {group.name}
                        </strong>
                        <span style={{ fontSize: '11px', opacity: 0.7 }}>
                          (5 Runners: {group.members.join(', ')})
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800 }}>
                          <span style={{ color: 'var(--track-dark)' }}>{totalCorrect}</span> / {teamAllLogs.length} correct ({accuracy}%)
                        </div>
                        {/* Single Fast Delete Action for this specific Team */}
                        {teamAllLogs.length > 0 && (
                          <button
                            type="button"
                            className="fast-delete-btn"
                            onClick={() => handleFastClearTeamLogs(group.name)}
                            title={`Single click to delete all logs for ${group.name} and unlock stations`}
                          >
                            🗑️ Fast Clear {group.name} Logs ({teamAllLogs.length})
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stations Status Grid for this team */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: '6px',
                        background: 'var(--cream-2)',
                        padding: '8px 10px',
                        borderRadius: '12px',
                        marginBottom: '10px',
                      }}
                    >
                      {PHASES.map((ph) => {
                        const phaseLogs = teamAllLogs.filter((l) => l.phase === ph.key);
                        const isDone = (appState.completedToday[ph.key] || []).includes(gIdx);
                        return (
                          <div
                            key={ph.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              background: 'var(--card)',
                              padding: '5px 8px',
                              borderRadius: '8px',
                              border: '1px solid var(--line)',
                            }}
                          >
                            <span>
                              <b>{ph.icon} {ph.label}:</b> {phaseLogs.length}/{ph.itemCount}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span
                                className={`badge-tag ${isDone ? 'badge-tag-done' : 'badge-tag-open'}`}
                                style={{ fontSize: '9.5px', padding: '1px 5px' }}
                              >
                                {isDone ? 'Finished ✅' : 'Accessible 🔓'}
                              </span>
                              {phaseLogs.length > 0 && (
                                <button
                                  type="button"
                                  style={{
                                    fontSize: '9.5px',
                                    fontWeight: 800,
                                    color: 'var(--danger)',
                                    padding: '1px 4px',
                                    borderRadius: '4px',
                                    background: '#FCE7E4',
                                    cursor: 'pointer',
                                  }}
                                  title={`Delete ${group.name}'s records for ${ph.label}`}
                                  onClick={() => handleDeleteActivitySession(ph.key, group.name)}
                                >
                                  Delete
                                </button>
                              )}
                              <button
                                type="button"
                                style={{
                                  fontSize: '9.5px',
                                  fontWeight: 800,
                                  color: 'var(--ink)',
                                  padding: '1px 4px',
                                  borderRadius: '4px',
                                  background: 'var(--cream)',
                                  border: '1px solid var(--line)',
                                  cursor: 'pointer',
                                }}
                                title={isDone ? 'Make accessible again' : 'Mark finished'}
                                onClick={() => handleToggleAccessible(ph.key, gIdx)}
                              >
                                {isDone ? 'Unlock' : 'Lock'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Team's Separate Attempts Table */}
                    {renderAttemptTable(teamFilteredLogs, group.name)}
                  </div>
                );
              })}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: COMBINED DATA TABLE VIEW                         */}
        {/* ======================================================== */}
        {viewMode === 'combined' && (
          <div>
            {renderAttemptTable(allFilteredLogs)}
          </div>
        )}
      </div>

      {/* IN-APP CONFIRMATION MODAL (Reliable in sandboxed iframes) */}
      {confirmModal && (
        <div className="modal-backdrop show" style={{ zIndex: 90 }}>
          <div
            className="modal-box"
            style={{
              maxWidth: '440px',
              textAlign: 'center',
              padding: '24px 20px',
              border: '2px solid var(--danger)',
              boxShadow: '0 8px 24px rgba(230, 72, 58, 0.25)',
            }}
          >
            <div style={{ fontSize: '44px', marginBottom: '8px' }}>⚠️</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--danger)' }}>
              {confirmModal.title}
            </h3>
            <p style={{ fontSize: '13px', opacity: 0.85, marginBottom: '20px', lineHeight: 1.5 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ flex: 1, padding: '10px 14px', fontSize: '13px' }}
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {confirmModal.confirmBtnText || 'Yes, Delete'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ flex: 1, padding: '10px 14px', fontSize: '13px' }}
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
