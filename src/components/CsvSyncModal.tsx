import React, { useState, useRef } from 'react';
import { AppState, AttemptLog } from '../types';
import { PHASES } from '../data/phases';
import { parseMasterCSV, recalculateCompletedToday } from '../utils/exportUtils';
import { sounds } from '../utils/audio';

interface CsvSyncModalProps {
  appState: AppState;
  logData: AttemptLog[];
  onSyncComplete: (
    newLogs: AttemptLog[],
    newCompletedToday: Record<string, number[]>,
    message: string
  ) => void;
  onClose: () => void;
}

export const CsvSyncModal: React.FC<CsvSyncModalProps> = ({
  appState,
  logData,
  onSyncComplete,
  onClose,
}) => {
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [previewInfo, setPreviewInfo] = useState<{
    parsedCount: number;
    removedCount: number;
    removedPhaseKeys: string[];
    affectedTeams: string[];
    accessibleAgain: Array<{ phaseLabel: string; teamName: string }>;
    parsedLogs: AttemptLog[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeCSV = (content: string) => {
    setErrorMsg(null);
    try {
      const { parsedLogs, hasAuditLogsSection } = parseMasterCSV(content);
      if (!hasAuditLogsSection && parsedLogs.length === 0) {
        setErrorMsg('No valid Attempt Logs section found in CSV. Make sure it contains "# --- ITEM-BY-ITEM ATTEMPT AUDIT LOGS ---".');
        setPreviewInfo(null);
        return;
      }

      // Map parsed IDs and existing IDs
      const parsedIdSet = new Set(parsedLogs.map((l) => l.id));
      const removedLogs = logData.filter((l) => !parsedIdSet.has(l.id));

      // Calculate which activities were previously completed by which teams
      const affectedTeams = Array.from(new Set(removedLogs.map((l) => l.team)));
      const removedPhaseKeys = Array.from(new Set(removedLogs.map((l) => l.phase)));

      // Calculate which activities will be made accessible again
      const newCompleted = recalculateCompletedToday(appState, parsedLogs);
      const accessibleAgain: Array<{ phaseLabel: string; teamName: string }> = [];

      PHASES.forEach((ph) => {
        const oldDoneList = appState.completedToday[ph.key] || [];
        const newDoneList = newCompleted[ph.key] || [];

        oldDoneList.forEach((gIdx) => {
          if (!newDoneList.includes(gIdx)) {
            const team = appState.groups[gIdx];
            if (team) {
              accessibleAgain.push({
                phaseLabel: ph.label,
                teamName: team.name,
              });
            }
          }
        });
      });

      setPreviewInfo({
        parsedCount: parsedLogs.length,
        removedCount: removedLogs.length,
        removedPhaseKeys,
        affectedTeams,
        accessibleAgain,
        parsedLogs,
      });
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to parse CSV file. Please verify the CSV format.');
      setPreviewInfo(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setCsvText(text);
      analyzeCSV(text);
    };
    reader.readAsText(file);
  };

  const handleApplySync = () => {
    if (!previewInfo) return;
    sounds.playCorrect();
    const newCompleted = recalculateCompletedToday(appState, previewInfo.parsedLogs);
    let msg = `Synchronized database from CSV. ${previewInfo.parsedCount} records active.`;
    if (previewInfo.removedCount > 0) {
      msg += ` ${previewInfo.removedCount} deleted entries removed from database.`;
    }
    if (previewInfo.accessibleAgain.length > 0) {
      msg += ` Made ${previewInfo.accessibleAgain.map((a) => `${a.teamName} (${a.phaseLabel})`).join(', ')} accessible again to runners!`;
    }
    onSyncComplete(previewInfo.parsedLogs, newCompleted, msg);
    onClose();
  };

  return (
    <div className="modal-backdrop show">
      <div className="modal-box" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '20px' }}>Sync Database from CSV</h2>
          <button className="icon-btn" style={{ width: '30px', height: '30px' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="small-note" style={{ marginBottom: '14px' }}>
          Upload your edited CSV file or paste CSV content below. Any rows/activities that you deleted in the CSV will be automatically removed from the database, runner pretest/posttest scores and progress will update, and deleted activities will be made <b>accessible again</b> to runners!
        </p>

        {/* Upload Button */}
        <div style={{ marginBottom: '14px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button
            type="button"
            className="btn btn-sky btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            📁 Choose CSV File {fileName ? `(${fileName})` : ''}
          </button>
        </div>

        {/* Or Paste Area */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, display: 'block', marginBottom: '4px' }}>
            Or paste CSV content here:
          </label>
          <textarea
            className="text-input"
            style={{ height: '110px', fontSize: '11px', fontFamily: 'monospace' }}
            placeholder="Paste Master CSV contents here..."
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              analyzeCSV(e.target.value);
            }}
          />
        </div>

        {errorMsg && (
          <div style={{ background: '#FCE7E4', color: 'var(--danger)', padding: '10px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Sync Preview */}
        {previewInfo && (
          <div className="sync-callout">
            <strong style={{ fontSize: '13px', color: 'var(--ink)', display: 'block', marginBottom: '6px' }}>
              📊 Sync Preview Analysis:
            </strong>
            <ul style={{ fontSize: '12px', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
              <li>
                <b>{previewInfo.parsedCount}</b> valid attempt entries found in CSV.
              </li>
              <li>
                <b>{previewInfo.removedCount}</b> previously saved entries were deleted in this CSV and will be removed from the database.
              </li>
              {previewInfo.accessibleAgain.length > 0 ? (
                <li style={{ color: 'var(--track-dark)', fontWeight: 800 }}>
                  🔓 <b>Made accessible again to runners:</b>{' '}
                  {previewInfo.accessibleAgain.map((a) => `${a.teamName} for ${a.phaseLabel}`).join(', ')}
                </li>
              ) : (
                <li style={{ opacity: 0.8 }}>
                  No completed stations changed status.
                </li>
              )}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!previewInfo}
            onClick={handleApplySync}
          >
            Apply Sync &amp; Update Database
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
