import ExcelJS from 'exceljs';
import { AppState, AttemptLog, SurveyResponse, RelayRole, TaskProgressRecord } from '../types';
import { PHASES, BANK } from '../data/phases';
import { getDepEdRating } from '../data/ggrCurriculum';

export interface StudentWeekResult {
  studentName: string;
  teamName: string;
  runnerIndex: number;
  attempts: number;
  correct: number;
  accuracy: number;
  questionResults: Record<number, { correct: boolean; chosen: string; prompt: string }>;
}

export interface StudentWeeklySummary {
  studentName: string;
  teamName: string;
  runnerIndex: number;
  teamIndex: number;
  totalAttempts: number;
  totalCorrect: number;
  overallAccuracy: number;
  pretestAccuracy: number | null;
  posttestAccuracy: number | null;
  meanGain: number | null; // posttest % - pretest %
  phases: Record<string, { attempts: number; correct: number; accuracy: number | null }>;
}

// Compute student performance matrix across all phases/weeks
export function calculateStudentSummaries(appState: AppState, logs: AttemptLog[]): StudentWeeklySummary[] {
  const summaries: StudentWeeklySummary[] = [];

  appState.groups.forEach((group, gIdx) => {
    group.members.forEach((memberName, mIdx) => {
      const studentLogs = logs.filter(
        (l) => l.player.trim().toLowerCase() === memberName.trim().toLowerCase() && l.team === group.name
      );
      const totalAttempts = studentLogs.length;
      const totalCorrect = studentLogs.filter((l) => l.correct).length;
      const overallAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

      const phaseStats: Record<string, { attempts: number; correct: number; accuracy: number | null }> = {};
      PHASES.forEach((ph) => {
        const phLogs = studentLogs.filter((l) => l.phase === ph.key);
        const pAtt = phLogs.length;
        const pCor = phLogs.filter((l) => l.correct).length;
        phaseStats[ph.key] = {
          attempts: pAtt,
          correct: pCor,
          accuracy: pAtt > 0 ? Math.round((pCor / pAtt) * 100) : null,
        };
      });

      const pretestAcc = phaseStats['pretest']?.accuracy ?? null;
      const posttestAcc = phaseStats['posttest']?.accuracy ?? null;
      const meanGain = pretestAcc !== null && posttestAcc !== null ? posttestAcc - pretestAcc : null;

      summaries.push({
        studentName: memberName,
        teamName: group.name,
        runnerIndex: mIdx + 1,
        teamIndex: gIdx,
        totalAttempts,
        totalCorrect,
        overallAccuracy: totalAttempts > 0 ? overallAccuracy : 0,
        pretestAccuracy: pretestAcc,
        posttestAccuracy: posttestAcc,
        meanGain,
        phases: phaseStats,
      });
    });
  });

  return summaries;
}

// Compute question-by-question breakdown for a specific phase/week
export function calculateSessionDetail(
  phaseKey: string,
  appState: AppState,
  logs: AttemptLog[]
): {
  students: StudentWeekResult[];
  questionStats: Array<{ prompt: string; total: number; correct: number; accuracy: number }>;
} {
  const bankItems = BANK[phaseKey as keyof typeof BANK] || [];
  const phaseLogs = logs.filter((l) => l.phase === phaseKey);
  const students: StudentWeekResult[] = [];

  appState.groups.forEach((group) => {
    group.members.forEach((memberName, mIdx) => {
      const pLogs = phaseLogs.filter(
        (l) => l.player.trim().toLowerCase() === memberName.trim().toLowerCase() && l.team === group.name
      );
      const attempts = pLogs.length;
      const correct = pLogs.filter((l) => l.correct).length;
      const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
      const questionResults: Record<number, { correct: boolean; chosen: string; prompt: string }> = {};

      pLogs.forEach((l) => {
        const promptClean = l.prompt.replace(/\*\*/g, '').trim();
        const bankIdx = bankItems.findIndex(
          (b) => b.p.replace(/\*\*/g, '').trim() === promptClean
        );
        const qIdx = bankIdx >= 0 ? bankIdx + 1 : (l.questionNumber || 1);
        questionResults[qIdx] = {
          correct: l.correct,
          chosen: l.chosen,
          prompt: l.prompt,
        };
      });

      students.push({
        studentName: memberName,
        teamName: group.name,
        runnerIndex: mIdx + 1,
        attempts,
        correct,
        accuracy: attempts > 0 ? accuracy : 0,
        questionResults,
      });
    });
  });

  // Calculate stats per question
  const questionStats = bankItems.map((item, idx) => {
    const cleanPrompt = item.p.replace(/\*\*/g, '').trim();
    const itemLogs = phaseLogs.filter(
      (l) => l.prompt.replace(/\*\*/g, '').trim() === cleanPrompt
    );
    const total = itemLogs.length;
    const correct = itemLogs.filter((l) => l.correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return {
      prompt: cleanPrompt,
      total,
      correct,
      accuracy,
    };
  });

  return { students, questionStats };
}

// Color formatting helpers for Excel
function getAccuracyColor(accuracy: number | null): { bgArgb: string; fontArgb: string; label: string } {
  if (accuracy === null) {
    return { bgArgb: 'FFF2F2F2', fontArgb: 'FF777777', label: 'Not Attempted' };
  }
  if (accuracy >= 80) {
    return { bgArgb: 'FFD1E7DD', fontArgb: 'FF0F5132', label: 'High (>=80%)' };
  } else if (accuracy >= 60) {
    return { bgArgb: 'FFFFF3CD', fontArgb: 'FF664D03', label: 'Moderate (60-79%)' };
  } else {
    return { bgArgb: 'FFF8D7DA', fontArgb: 'FF842029', label: 'Needs Support (<60%)' };
  }
}

// Style header cell helper
function styleHeaderCell(cell: ExcelJS.Cell, text: string, bgArgb = 'FF1F9D68', fontArgb = 'FFFFFFFF') {
  cell.value = text;
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: fontArgb } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFB0BEC5' } },
    left: { style: 'thin', color: { argb: 'FFB0BEC5' } },
    bottom: { style: 'medium', color: { argb: 'FF37474F' } },
    right: { style: 'thin', color: { argb: 'FFB0BEC5' } },
  };
}

// Generate the Comprehensive Multi-Tab Excel Workbook (.xlsx)
export async function generateExcelWorkbook(
  appState: AppState,
  logs: AttemptLog[],
  surveys?: SurveyResponse[]
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gamified Grammar Relay - Binanuahan ES';
  workbook.created = new Date();
  workbook.properties.date1904 = true;

  const summaries = calculateStudentSummaries(appState, logs);

  // -------------------------------------------------------------
  // TAB 1: OVERVIEW & MASTER ACCURACY DASHBOARD
  // -------------------------------------------------------------
  const overviewSheet = workbook.addWorksheet('Overview & Summary', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 6 }],
  });

  // Title Block
  overviewSheet.mergeCells('A1:N1');
  const titleCell = overviewSheet.getCell('A1');
  titleCell.value = 'GAMIFIED GRAMMAR RELAY (GGR) — BINANUAHAN ELEMENTARY SCHOOL';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF167A51' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  overviewSheet.getRow(1).height = 30;

  overviewSheet.mergeCells('A2:N2');
  const subtitleCell = overviewSheet.getCell('A2');
  subtitleCell.value = `Grade 6 • Basic Sentence Construction & Parts of Speech • Coach Dash & 5 Relay Roles • Exported: ${new Date().toLocaleDateString()}`;
  subtitleCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F9D68' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  overviewSheet.getRow(2).height = 20;

  // Legend / Color code key
  overviewSheet.getCell('A4').value = 'Color-Coded Accuracy Legend:';
  overviewSheet.getCell('A4').font = { bold: true, size: 10 };

  const legHigh = overviewSheet.getCell('B4');
  legHigh.value = '≥ 80% (High / Mastered)';
  legHigh.font = { size: 10, bold: true, color: { argb: 'FF0F5132' } };
  legHigh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7DD' } };
  legHigh.alignment = { horizontal: 'center' };

  const legMid = overviewSheet.getCell('C4');
  legMid.value = '60% - 79% (Moderate)';
  legMid.font = { size: 10, bold: true, color: { argb: 'FF664D03' } };
  legMid.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
  legMid.alignment = { horizontal: 'center' };

  const legLow = overviewSheet.getCell('D4');
  legLow.value = '< 60% (Needs Support)';
  legLow.font = { size: 10, bold: true, color: { argb: 'FF842029' } };
  legLow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
  legLow.alignment = { horizontal: 'center' };

  const legGain = overviewSheet.getCell('E4');
  legGain.value = 'Mean Gain = Posttest % – Pretest %';
  legGain.font = { size: 10, bold: true, color: { argb: 'FF167A51' } };
  legGain.alignment = { horizontal: 'center' };

  // Headers for Master Student Table
  overviewSheet.getRow(6).height = 28;
  const headers = [
    'Student Runner',
    'Team',
    'Runner #',
    'Pretest (Baseline)',
    'Mission 1 (Day 1)',
    'Mission 2 (Day 2)',
    'Mission 3 (Day 3)',
    'Mission 4 (Day 4)',
    'Posttest (Summative)',
    'Mean Gain (Gain %)',
    'Overall Accuracy',
    'Total Correct',
    'Total Answered',
    'DepEd Performance Rating',
  ];

  headers.forEach((h, i) => {
    const colLetter = String.fromCharCode(65 + i);
    const cell = overviewSheet.getCell(`${colLetter}6`);
    styleHeaderCell(cell, h, 'FF2D82B7', 'FFFFFFFF');
  });

  // Populate Students
  let currentRow = 7;
  summaries.forEach((s) => {
    const row = overviewSheet.getRow(currentRow);
    row.height = 22;

    row.getCell(1).value = s.studentName;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = s.teamName;
    row.getCell(3).value = `Runner ${s.runnerIndex}`;
    row.getCell(3).alignment = { horizontal: 'center' };

    // Phases: Pretest, Mission 1, Mission 2, Mission 3, Mission 4, Posttest
    PHASES.forEach((ph, pIdx) => {
      const cell = row.getCell(4 + pIdx);
      const stat = s.phases[ph.key];
      if (stat && stat.accuracy !== null) {
        cell.value = stat.accuracy / 100;
        cell.numFmt = '0.0%';
        const color = getAccuracyColor(stat.accuracy);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.bgArgb } };
        cell.font = { bold: true, color: { argb: color.fontArgb } };
      } else {
        cell.value = '-';
        cell.alignment = { horizontal: 'center' };
        cell.font = { color: { argb: 'FF9E9E9E' } };
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Mean Gain
    const gainCell = row.getCell(10);
    if (s.meanGain !== null) {
      gainCell.value = `${s.meanGain >= 0 ? '+' : ''}${s.meanGain}%`;
      gainCell.font = {
        bold: true,
        color: { argb: s.meanGain >= 0 ? 'FF0F5132' : 'FF842029' },
      };
      gainCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: s.meanGain >= 0 ? 'FFE4F7EC' : 'FFFCE7E4' },
      };
    } else {
      gainCell.value = '-';
    }
    gainCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Overall Accuracy
    const overallCell = row.getCell(11);
    if (s.totalAttempts > 0) {
      overallCell.value = s.overallAccuracy / 100;
      overallCell.numFmt = '0.0%';
      const color = getAccuracyColor(s.overallAccuracy);
      overallCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.bgArgb } };
      overallCell.font = { bold: true, size: 11, color: { argb: color.fontArgb } };
    } else {
      overallCell.value = '-';
      overallCell.alignment = { horizontal: 'center' };
    }
    overallCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Total Correct / Answered
    const corCell = row.getCell(12);
    corCell.value = s.totalCorrect;
    corCell.alignment = { horizontal: 'center' };

    const attCell = row.getCell(13);
    attCell.value = s.totalAttempts;
    attCell.alignment = { horizontal: 'center' };

    // DepEd Descriptive Rating
    const depedCell = row.getCell(14);
    if (s.totalAttempts === 0) {
      depedCell.value = 'Not Started';
      depedCell.font = { italic: true, color: { argb: 'FF777777' } };
    } else {
      const rating = getDepEdRating(s.overallAccuracy);
      depedCell.value = rating.label;
      depedCell.font = { bold: true };
    }

    // Border styling
    for (let c = 1; c <= 14; c++) {
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    }

    currentRow++;
  });

  overviewSheet.columns = [
    { width: 18 }, // Student Runner
    { width: 14 }, // Team
    { width: 11 }, // Runner #
    { width: 14 }, // Pretest
    { width: 14 }, // Mission 1
    { width: 14 }, // Mission 2
    { width: 14 }, // Mission 3
    { width: 14 }, // Mission 4
    { width: 14 }, // Posttest
    { width: 14 }, // Mean Gain
    { width: 15 }, // Overall
    { width: 12 }, // Total Correct
    { width: 14 }, // Total Answered
    { width: 28 }, // DepEd Rating
  ];

  // -------------------------------------------------------------
  // TABS 2-7: A DIFFERENT TAB FOR EACH SESSION / WEEK
  // -------------------------------------------------------------
  PHASES.forEach((ph, pIndex) => {
    const tabName = `${ph.label} (${ph.weekLabel || `M${pIndex}`})`.slice(0, 31);
    const sessionSheet = workbook.addWorksheet(tabName, {
      views: [{ showGridLines: true, state: 'frozen', ySplit: 5, xSplit: 3 }],
    });

    const sessionData = calculateSessionDetail(ph.key, appState, logs);
    const bankItems = BANK[ph.key] || [];

    // Header Title
    sessionSheet.mergeCells('A1:N1');
    const h1 = sessionSheet.getCell('A1');
    h1.value = `BINANUAHAN ES — ${ph.label.toUpperCase()} (${ph.weekLabel}) — ${ph.eyebrow}`;
    h1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF167A51' } };
    h1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sessionSheet.getRow(1).height = 28;

    sessionSheet.mergeCells('A2:N2');
    const h2 = sessionSheet.getCell('A2');
    h2.value = `Domain: ${ph.domain || ph.sub} • Target: ${ph.itemCount} Items • 5 Relay Roles: Reader • Solver • Checker • Explainer • Runner`;
    h2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F9D68' } };
    h2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sessionSheet.getRow(2).height = 18;

    // Legend line
    sessionSheet.getCell('A4').value = 'Icon Legend:';
    sessionSheet.getCell('A4').font = { bold: true, size: 10 };

    const cRight = sessionSheet.getCell('B4');
    cRight.value = '✅ RIGHT (Correct)';
    cRight.font = { size: 10, bold: true, color: { argb: 'FF0F5132' } };
    cRight.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7DD' } };
    cRight.alignment = { horizontal: 'center' };

    const cWrong = sessionSheet.getCell('C4');
    cWrong.value = '❌ WRONG (Incorrect)';
    cWrong.font = { size: 10, bold: true, color: { argb: 'FF842029' } };
    cWrong.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
    cWrong.alignment = { horizontal: 'center' };

    const cPending = sessionSheet.getCell('D4');
    cPending.value = '⚪ Pending / Not Raced';
    cPending.font = { size: 10, color: { argb: 'FF777777' } };
    cPending.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    cPending.alignment = { horizontal: 'center' };

    // Column Headers row 5
    sessionSheet.getRow(5).height = 26;
    styleHeaderCell(sessionSheet.getCell('A5'), 'Student Runner', 'FF2D82B7');
    styleHeaderCell(sessionSheet.getCell('B5'), 'Team', 'FF2D82B7');
    styleHeaderCell(sessionSheet.getCell('C5'), 'Relay #', 'FF2D82B7');
    styleHeaderCell(sessionSheet.getCell('D5'), 'Answered', 'FF2D82B7');
    styleHeaderCell(sessionSheet.getCell('E5'), 'Correct', 'FF2D82B7');
    styleHeaderCell(sessionSheet.getCell('F5'), 'Accuracy %', 'FF2D82B7');
    styleHeaderCell(sessionSheet.getCell('G5'), 'DepEd Rating', 'FF2D82B7');

    // Individual Question Columns
    bankItems.forEach((_, qIdx) => {
      const colIndex = 8 + qIdx;
      const cell = sessionSheet.getRow(5).getCell(colIndex);
      styleHeaderCell(cell, `Q${qIdx + 1}`, 'FF1F9D68');
    });

    // Populate Students
    let sRow = 6;
    sessionData.students.forEach((stu) => {
      const row = sessionSheet.getRow(sRow);
      row.height = 22;

      row.getCell(1).value = stu.studentName;
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = stu.teamName;
      row.getCell(3).value = `Runner ${stu.runnerIndex}`;
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).value = stu.attempts;
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).value = stu.correct;
      row.getCell(5).alignment = { horizontal: 'center' };

      // Highlight Accuracy score with color-coded conditional formatting
      const accCell = row.getCell(6);
      if (stu.attempts > 0) {
        accCell.value = stu.accuracy / 100;
        accCell.numFmt = '0.0%';
        const color = getAccuracyColor(stu.accuracy);
        accCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.bgArgb } };
        accCell.font = { bold: true, color: { argb: color.fontArgb } };
      } else {
        accCell.value = '-';
        accCell.alignment = { horizontal: 'center' };
        accCell.font = { color: { argb: 'FF9E9E9E' } };
      }
      accCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // DepEd Rating
      const stCell = row.getCell(7);
      if (stu.attempts === 0) {
        stCell.value = 'Pending';
        stCell.font = { italic: true, color: { argb: 'FF777777' } };
      } else {
        const rating = getDepEdRating(stu.accuracy);
        stCell.value = rating.label.split(' ')[0]; // short rating
        stCell.font = { bold: true };
      }

      // Question breakdown: Did the student get it right or not?
      bankItems.forEach((_, qIdx) => {
        const qNumber = qIdx + 1;
        const cell = row.getCell(8 + qIdx);
        const res = stu.questionResults[qNumber];
        if (!res) {
          cell.value = '—';
          cell.font = { color: { argb: 'FFAAAAAA' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (res.correct) {
          cell.value = '✅ RIGHT';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7DD' } };
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F5132' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.value = '❌ WRONG';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF842029' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });

      // Borders
      const totalCols = 7 + bankItems.length;
      for (let c = 1; c <= totalCols; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        };
      }
      sRow++;
    });

    // Summary row
    const summaryRow = sessionSheet.getRow(sRow);
    summaryRow.height = 24;
    summaryRow.getCell(1).value = 'Class Accuracy per Question';
    summaryRow.getCell(1).font = { bold: true, color: { argb: 'FF1F9D68' } };
    summaryRow.getCell(2).value = 'All Teams';
    summaryRow.getCell(3).value = 'Average';

    bankItems.forEach((_, qIdx) => {
      const qStat = sessionData.questionStats[qIdx];
      const cell = summaryRow.getCell(8 + qIdx);
      if (qStat && qStat.total > 0) {
        cell.value = qStat.accuracy / 100;
        cell.numFmt = '0%';
        const color = getAccuracyColor(qStat.accuracy);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.bgArgb } };
        cell.font = { bold: true, size: 9, color: { argb: color.fontArgb } };
      } else {
        cell.value = '-';
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1F9D68' } },
        bottom: { style: 'medium', color: { argb: 'FF1F9D68' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });

    sessionSheet.getColumn(1).width = 18;
    sessionSheet.getColumn(2).width = 14;
    sessionSheet.getColumn(3).width = 11;
    sessionSheet.getColumn(4).width = 11;
    sessionSheet.getColumn(5).width = 11;
    sessionSheet.getColumn(6).width = 14;
    sessionSheet.getColumn(7).width = 16;
    for (let q = 0; q < bankItems.length; q++) {
      sessionSheet.getColumn(8 + q).width = 11;
    }
  });

  // -------------------------------------------------------------
  // TAB 8: FEEDBACK SURVEY SHEET (If any submitted)
  // -------------------------------------------------------------
  if (surveys && surveys.length > 0) {
    const surveySheet = workbook.addWorksheet('Feedback Survey', {
      views: [{ showGridLines: true, state: 'frozen', ySplit: 2 }],
    });
    surveySheet.getRow(1).height = 24;
    const surveyHeaders = [
      'Timestamp',
      'Team Name',
      'Q1: Enjoyed GGR Activities (1-5)',
      'Q2: Better Than Worksheets (1-5)',
      'Q3: Want to Use Again (1-5)',
      'Team Comments / Feedback',
    ];
    surveyHeaders.forEach((h, i) => {
      styleHeaderCell(surveySheet.getRow(1).getCell(i + 1), h, 'FF2D82B7');
    });

    surveys.forEach((sv, idx) => {
      const row = surveySheet.getRow(idx + 2);
      row.getCell(1).value = sv.timestamp;
      row.getCell(2).value = sv.teamName;
      row.getCell(3).value = `${sv.q1Rating} / 5`;
      row.getCell(4).value = `${sv.q2Rating} / 5`;
      row.getCell(5).value = `${sv.q3Rating} / 5`;
      row.getCell(6).value = sv.comments || 'No comments';
    });

    surveySheet.columns = [
      { width: 22 },
      { width: 16 },
      { width: 30 },
      { width: 30 },
      { width: 26 },
      { width: 35 },
    ];
  }

  // -------------------------------------------------------------
  // TAB 9: RAW AUDIT LOG (ALL ATTEMPTS WITH RELAY ROLES)
  // -------------------------------------------------------------
  const logsSheet = workbook.addWorksheet('Raw Attempt Logs', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 2 }],
  });
  logsSheet.getRow(1).height = 24;

  const rawHeaders = [
    'Attempt ID',
    'Timestamp (ISO)',
    'Phase / Session Key',
    'Week Intervention',
    'Team Name',
    'Student Runner',
    'Role at Turn',
    'Question Prompt',
    'Answer Selected by Student',
    'Result Status',
    'Score (1 or 0)',
  ];

  rawHeaders.forEach((h, i) => {
    const cell = logsSheet.getRow(1).getCell(i + 1);
    styleHeaderCell(cell, h, 'FF37474F');
  });

  logs.forEach((l, idx) => {
    const row = logsSheet.getRow(idx + 2);
    row.height = 20;
    const matchedPhase = PHASES.find((p) => p.key === l.phase);

    row.getCell(1).value = l.id;
    row.getCell(2).value = l.ts;
    row.getCell(3).value = l.phase;
    row.getCell(4).value = matchedPhase?.weekLabel || l.weekLabel || 'Session';
    row.getCell(5).value = l.team;
    row.getCell(6).value = l.player;
    row.getCell(7).value = l.roleAtTurn || 'RUNNER';
    row.getCell(8).value = l.prompt.replace(/\*\*/g, '');
    row.getCell(9).value = l.chosen;

    const statusCell = row.getCell(10);
    statusCell.value = l.correct ? 'CORRECT (✅)' : 'INCORRECT (❌)';
    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: l.correct ? 'FFD1E7DD' : 'FFF8D7DA' },
    };
    statusCell.font = {
      bold: true,
      color: { argb: l.correct ? 'FF0F5132' : 'FF842029' },
    };
    statusCell.alignment = { horizontal: 'center' };

    row.getCell(11).value = l.correct ? 1 : 0;
    row.getCell(11).alignment = { horizontal: 'center' };
  });

  logsSheet.columns = [
    { width: 22 },
    { width: 22 },
    { width: 14 },
    { width: 16 },
    { width: 15 },
    { width: 18 },
    { width: 14 },
    { width: 38 },
    { width: 26 },
    { width: 16 },
    { width: 14 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Generate Master CSV with full weekly & student breakdown + Raw Attempt Logs with IDs
export function generateMasterCSV(
  appState: AppState,
  logs: AttemptLog[],
  surveys?: SurveyResponse[]
): string {
  const lines: string[] = [];

  // Section 1: Metadata
  lines.push('# GAMIFIED GRAMMAR RELAY (GGR) — BINANUAHAN ELEMENTARY SCHOOL');
  lines.push('# Grade 6 — Basic Sentence Construction & Parts of Speech Recognition');
  lines.push('# Relay Roles: Reader -> Solver -> Checker -> Explainer -> Runner');
  lines.push(`# Exported At: ${new Date().toISOString()}`);
  lines.push('');

  // Section 2: Student Weekly Accuracy Matrix
  lines.push('# --- WEEKLY STUDENT ACCURACY SUMMARY MATRIX ---');
  const matrixHeaders = [
    'Student Name',
    'Team Name',
    'Runner Position',
    'Pretest (Baseline) %',
    'Mission 1 (Day 1) %',
    'Mission 2 (Day 2) %',
    'Mission 3 (Day 3) %',
    'Mission 4 (Day 4) %',
    'Posttest (Summative) %',
    'Mean Gain %',
    'Total Answered',
    'Total Correct',
    'Overall Accuracy %',
    'DepEd Performance Rating',
  ];
  lines.push(matrixHeaders.map((h) => `"${h}"`).join(','));

  const summaries = calculateStudentSummaries(appState, logs);
  summaries.forEach((s) => {
    const row = [
      s.studentName,
      s.teamName,
      `Runner ${s.runnerIndex}`,
      s.phases['pretest']?.accuracy !== null ? `${s.phases['pretest'].accuracy}%` : 'N/A',
      s.phases['session1']?.accuracy !== null ? `${s.phases['session1'].accuracy}%` : 'N/A',
      s.phases['session2']?.accuracy !== null ? `${s.phases['session2'].accuracy}%` : 'N/A',
      s.phases['session3']?.accuracy !== null ? `${s.phases['session3'].accuracy}%` : 'N/A',
      s.phases['session4']?.accuracy !== null ? `${s.phases['session4'].accuracy}%` : 'N/A',
      s.phases['posttest']?.accuracy !== null ? `${s.phases['posttest'].accuracy}%` : 'N/A',
      s.meanGain !== null ? `${s.meanGain >= 0 ? '+' : ''}${s.meanGain}%` : 'N/A',
      s.totalAttempts,
      s.totalCorrect,
      s.totalAttempts > 0 ? `${s.overallAccuracy}%` : 'N/A',
      s.totalAttempts > 0 ? getDepEdRating(s.overallAccuracy).label : 'Not Started',
    ];
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  });

  if (surveys && surveys.length > 0) {
    lines.push('');
    lines.push('# --- FEEDBACK SURVEY RESPONSES (1 to 5 Likert Scale) ---');
    lines.push('"Timestamp","Team Name","Enjoyed Activities (1-5)","Better Than Worksheets (1-5)","Want to Use Again (1-5)","Feedback"');
    surveys.forEach((sv) => {
      lines.push(
        `"${sv.timestamp}","${sv.teamName}","${sv.q1Rating}","${sv.q2Rating}","${sv.q3Rating}","${(sv.comments || '').replace(/"/g, '""')}"`
      );
    });
  }

  lines.push('');
  lines.push('# --- ITEM-BY-ITEM ATTEMPT AUDIT LOGS ---');
  // Including Attempt ID so any deleted row in the CSV can be mapped precisely back to the database
  const logHeaders = [
    'Attempt ID',
    'Timestamp',
    'Phase / Leg',
    'Week Label',
    'Team',
    'Student Runner',
    'Runner Position',
    'Role at Turn',
    'Question Number',
    'Question Prompt',
    'Answer Chosen',
    'Correct Answer',
    'Result Status',
    'Is Correct (Binary)',
  ];
  lines.push(logHeaders.map((h) => `"${h}"`).join(','));

  logs.forEach((l) => {
    const ph = PHASES.find((p) => p.key === l.phase);
    const row = [
      l.id,
      l.ts,
      l.phase,
      ph?.weekLabel || l.weekLabel || 'Session',
      l.team,
      l.player,
      l.runnerIndex ? `Runner ${l.runnerIndex}` : 'Runner 1',
      l.roleAtTurn || 'RUNNER',
      l.questionNumber || 1,
      l.prompt.replace(/\*\*/g, ''),
      l.chosen,
      l.correctAnswer || '',
      l.correct ? 'RIGHT' : 'WRONG',
      l.correct ? '1' : '0',
    ];
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  });

  return lines.join('\n');
}

// Helper parser for CSV lines with proper quote support
export function parseCSVLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

// Parse imported Master CSV and extract the AttemptLog[]
export function parseMasterCSV(csvText: string): {
  parsedLogs: AttemptLog[];
  parsedSurveys: SurveyResponse[];
  hasAuditLogsSection: boolean;
} {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const parsedLogs: AttemptLog[] = [];
  const parsedSurveys: SurveyResponse[] = [];
  let inAuditLogs = false;
  let inSurvey = false;
  let auditHeaders: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (line.includes('ITEM-BY-ITEM ATTEMPT AUDIT LOGS')) {
        inAuditLogs = true;
        inSurvey = false;
        auditHeaders = [];
      } else if (line.includes('FEEDBACK SURVEY RESPONSES')) {
        inSurvey = true;
        inAuditLogs = false;
      }
      continue;
    }
    const fields = parseCSVLine(line);
    if (fields.length < 2) continue;

    if (inAuditLogs) {
      if (auditHeaders.length === 0) {
        // First line is header
        auditHeaders = fields.map((f) => f.trim().toLowerCase());
        continue;
      }
      // Map row to AttemptLog
      const idIdx = auditHeaders.findIndex((h) => h.includes('attempt id') || h === 'id');
      const tsIdx = auditHeaders.findIndex((h) => h.includes('timestamp'));
      const phaseIdx = auditHeaders.findIndex((h) => h.includes('phase') || h.includes('leg'));
      const weekIdx = auditHeaders.findIndex((h) => h.includes('week'));
      const teamIdx = auditHeaders.findIndex((h) => h.includes('team'));
      const playerIdx = auditHeaders.findIndex((h) => h.includes('student') || h.includes('runner') || h.includes('player'));
      const runnerPosIdx = auditHeaders.findIndex((h) => h.includes('position'));
      const roleIdx = auditHeaders.findIndex((h) => h.includes('role'));
      const qNumIdx = auditHeaders.findIndex((h) => h.includes('question number') || h.includes('q #'));
      const promptIdx = auditHeaders.findIndex((h) => h.includes('prompt') || h.includes('question prompt'));
      const chosenIdx = auditHeaders.findIndex((h) => h.includes('chosen') || h.includes('answer chosen'));
      const correctAnsIdx = auditHeaders.findIndex((h) => h.includes('correct answer'));
      const isCorIdx = auditHeaders.findIndex((h) => h.includes('is correct') || h.includes('score') || h.includes('status'));

      const id = idIdx >= 0 && fields[idIdx] ? fields[idIdx].trim() : `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const ts = tsIdx >= 0 && fields[tsIdx] ? fields[tsIdx].trim() : new Date().toISOString();
      const rawPhase = phaseIdx >= 0 && fields[phaseIdx] ? fields[phaseIdx].trim() : 'session1';

      // Normalize phase key: e.g. "Pretest" -> "pretest", "Mission 1" -> "session1"
      let phaseKey = rawPhase.toLowerCase();
      const foundPhase = PHASES.find(
        (p) => p.key === phaseKey || p.label.toLowerCase() === phaseKey || p.weekLabel?.toLowerCase() === phaseKey
      );
      if (foundPhase) {
        phaseKey = foundPhase.key;
      }

      const team = teamIdx >= 0 && fields[teamIdx] ? fields[teamIdx].trim() : 'Team 1';
      const player = playerIdx >= 0 && fields[playerIdx] ? fields[playerIdx].trim() : 'Runner 1';
      const prompt = promptIdx >= 0 && fields[promptIdx] ? fields[promptIdx].trim() : '';
      const chosen = chosenIdx >= 0 && fields[chosenIdx] ? fields[chosenIdx].trim() : '';
      const correctAnswer = correctAnsIdx >= 0 && fields[correctAnsIdx] ? fields[correctAnsIdx].trim() : '';

      let correct = false;
      if (isCorIdx >= 0 && fields[isCorIdx]) {
        const val = fields[isCorIdx].trim().toLowerCase();
        correct = val === '1' || val === 'true' || val === 'right' || val.includes('correct');
      }

      let runnerIndex = 1;
      if (runnerPosIdx >= 0 && fields[runnerPosIdx]) {
        const numMatch = fields[runnerPosIdx].match(/\d+/);
        if (numMatch) runnerIndex = parseInt(numMatch[0], 10);
      }

      let questionNumber = 1;
      if (qNumIdx >= 0 && fields[qNumIdx]) {
        const numMatch = fields[qNumIdx].match(/\d+/);
        if (numMatch) questionNumber = parseInt(numMatch[0], 10);
      }

      const roleAtTurn: RelayRole =
        roleIdx >= 0 && fields[roleIdx] && ['READER', 'SOLVER', 'CHECKER', 'EXPLAINER', 'RUNNER'].includes(fields[roleIdx].toUpperCase())
          ? (fields[roleIdx].toUpperCase() as RelayRole)
          : 'RUNNER';

      parsedLogs.push({
        id,
        ts,
        phase: phaseKey,
        phaseLabel: foundPhase?.label || rawPhase,
        weekLabel: weekIdx >= 0 && fields[weekIdx] ? fields[weekIdx].trim() : foundPhase?.weekLabel,
        team,
        player,
        runnerIndex,
        roleAtTurn,
        questionNumber,
        prompt,
        chosen,
        correctAnswer,
        correct,
      });
    } else if (inSurvey) {
      // First row might be header
      if (fields[0].toLowerCase().includes('timestamp')) continue;
      parsedSurveys.push({
        id: `survey-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: fields[0] || new Date().toISOString(),
        teamName: fields[1] || 'Team 1',
        q1Rating: parseInt(fields[2], 10) || 5,
        q2Rating: parseInt(fields[3], 10) || 5,
        q3Rating: parseInt(fields[4], 10) || 5,
        comments: fields[5] || '',
      });
    }
  }

  return {
    parsedLogs,
    parsedSurveys,
    hasAuditLogsSection: inAuditLogs || parsedLogs.length > 0,
  };
}

/**
 * Re-evaluates which teams have actually completed each phase based on current logs.
 * If an activity or attempt was deleted, the team is removed from completedToday[phaseKey],
 * making the activity ACCESSIBLE AGAIN!
 */
export function recalculateCompletedToday(
  appState: AppState,
  logs: AttemptLog[]
): Record<string, number[]> {
  const newCompletedToday: Record<string, number[]> = {};

  PHASES.forEach((ph) => {
    newCompletedToday[ph.key] = [];
    appState.groups.forEach((group, gIdx) => {
      const teamLogs = logs.filter(
        (l) => l.team === group.name && l.phase === ph.key
      );
      // Team has completed this activity if they have logged all required items
      // (Pretest/Posttest = 6 items; Missions 1-4 = 5 items)
      if (teamLogs.length >= ph.itemCount) {
        newCompletedToday[ph.key].push(gIdx);
      }
    });
  });

  return newCompletedToday;
}

/**
 * Re-evaluates and synchronizes taskProgress records across all phases and teams
 * based strictly on the current logs and completedToday state.
 * If logs or activities are deleted, the taskProgress is wiped or recalculated
 * so that deleted records disappear completely from Overview and Standings!
 */
export function recalculateTaskProgress(
  groups: Array<{ name: string; members: string[] }>,
  completedToday: Record<string, number[]>,
  logs: AttemptLog[]
): Record<string, Record<string, TaskProgressRecord>> {
  const result: Record<string, Record<string, TaskProgressRecord>> = {};
  const now = new Date().toISOString();

  PHASES.forEach((ph) => {
    result[ph.key] = {};
    const doneIndices = completedToday[ph.key] || [];

    groups.forEach((g, gIdx) => {
      const isDone = doneIndices.includes(gIdx);
      const teamLogs = logs
        .filter((l) => l.team === g.name && l.phase === ph.key)
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

      if (teamLogs.length === 0 && !isDone) {
        // If there are no logs and not completed, the task record is reset
        result[ph.key][g.name] = {
          teamIndex: gIdx,
          teamName: g.name,
          phaseKey: ph.key,
          status: 'not_started',
          currentQuestionIndex: 0,
          totalQuestions: ph.itemCount,
          correctAnswers: 0,
          totalAttempts: 0,
          accuracy: 0,
          durationSeconds: undefined,
          lastActiveTs: now,
        };
        return;
      }

      const correctCount = teamLogs.filter((l) => l.correct).length;
      const totalCount = teamLogs.length;
      const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      const maxQ = teamLogs.reduce((m, l) => Math.max(m, l.questionNumber || 0), 0);
      const firstTs = teamLogs.length > 0 ? teamLogs[0].ts : now;
      const lastTs = teamLogs.length > 0 ? teamLogs[teamLogs.length - 1].ts : now;
      const durationSeconds = teamLogs.length > 1
        ? Math.max(1, Math.round((new Date(lastTs).getTime() - new Date(firstTs).getTime()) / 1000))
        : teamLogs.length === 1
        ? 15
        : undefined;

      result[ph.key][g.name] = {
        teamIndex: gIdx,
        teamName: g.name,
        phaseKey: ph.key,
        status: isDone ? 'completed' : (totalCount > 0 ? 'in_progress' : 'not_started'),
        currentQuestionIndex: isDone ? ph.itemCount : Math.min(ph.itemCount, maxQ),
        totalQuestions: ph.itemCount,
        correctAnswers: correctCount,
        totalAttempts: totalCount,
        accuracy,
        startedAt: firstTs,
        completedAt: isDone ? lastTs : undefined,
        durationSeconds: isDone ? durationSeconds : undefined,
        lastActiveTs: lastTs,
      };
    });

    // Compute completionOrder and speedRank for completed teams
    const completedList = Object.values(result[ph.key])
      .filter((r) => r.status === 'completed' && r.completedAt)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());
    completedList.forEach((r, idx) => {
      r.completionOrder = idx + 1;
    });

    const speedList = Object.values(result[ph.key])
      .filter((r) => r.status === 'completed' && typeof r.durationSeconds === 'number' && r.durationSeconds > 0)
      .sort((a, b) => (a.durationSeconds || 99999) - (b.durationSeconds || 99999));
    speedList.forEach((r, idx) => {
      r.speedRank = idx + 1;
      r.paceSecondsPerItem = +(r.durationSeconds! / r.totalQuestions).toFixed(1);
    });
  });

  return result;
}

// Download Trigger Helper
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
