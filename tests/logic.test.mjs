import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeDisc, ageFromDate } from '../assets/js/disc-engine.js';
import {
  TEMPLATE_URL,
  DEFAULT_MASTER_REVISION,
  REHOLZ_TEMPLATE_URL,
  REHOLZ_MASTER_REVISION
} from '../assets/js/config.js';

test('config defines distinct Mitra and ReHolz print masters', () => {
  assert.equal(TEMPLATE_URL, './templates/application-master.html');
  assert.equal(REHOLZ_TEMPLATE_URL, './templates/application-master-reholz.html');
  assert.ok(DEFAULT_MASTER_REVISION.includes('mbm'));
  assert.ok(REHOLZ_MASTER_REVISION.includes('reholz'));
});

test('Mitra and ReHolz application masters maintain 100% form field parity', () => {
  const mitraHtml = fs.readFileSync('templates/application-master.html', 'utf8');
  const reholzHtml = fs.readFileSync('templates/application-master-reholz.html', 'utf8');

  const extractNames = (html) => {
    const formMatch = html.match(/<form[^>]*id="applicationForm"[\s\S]*?<\/form>/i);
    assert.ok(formMatch, 'applicationForm must exist');
    return new Set([...formMatch[0].matchAll(/\bname="([^"]+)"/g)].map(m => m[1]));
  };

  const mitraNames = extractNames(mitraHtml);
  const reholzNames = extractNames(reholzHtml);

  assert.equal(mitraNames.size, reholzNames.size);
  assert.deepEqual([...mitraNames].filter(n => !reholzNames.has(n)), []);
  assert.deepEqual([...reholzNames].filter(n => !mitraNames.has(n)), []);
  assert.ok(mitraNames.has('saudara4_nama'));
  assert.ok(mitraNames.has('nama_terang'));
  assert.ok(mitraNames.has('setuju'));
});

test('computeDisc computes g1, g2, g3, pola, and dominant factor from 24 answers', () => {
  const answers = Array.from({ length: 24 }, (_, idx) => ({
    most: idx % 4,
    least: (idx + 2) % 4
  }));
  const result = computeDisc(answers);
  assert.equal(result.g1.length, 4);
  assert.equal(result.g2.length, 4);
  assert.equal(result.g3.length, 4);
  assert.equal(result.pola.length, 3);
  assert.ok(['D', 'I', 'S', 'C'].includes(result.hurufDominan));
  assert.ok(result.detail?.judul);
});

test('computeDisc rejects malformed or incomplete answers', () => {
  assert.throws(() => computeDisc([]), /24 jawaban/);
  assert.throws(() => computeDisc(Array.from({ length: 24 }, () => ({ most: 1, least: 1 }))), /tidak valid/);
});

test('ageFromDate handles valid and invalid dates safely', () => {
  assert.equal(ageFromDate(''), '');
  assert.equal(ageFromDate('not-a-date'), '');
  const age = ageFromDate('1996-08-15');
  assert.ok(typeof age === 'number' && age >= 25 && age < 60);
});

test('Mitra and ReHolz masters isolate mobile query to screen and support robust print sizing', () => {
  const mitraHtml = fs.readFileSync('templates/application-master.html', 'utf8');
  const reholzHtml = fs.readFileSync('templates/application-master-reholz.html', 'utf8');
  const printJs = fs.readFileSync('assets/js/print.js', 'utf8');

  assert.match(mitraHtml, new RegExp(`name="form-master-revision"\\s+content="${DEFAULT_MASTER_REVISION}"`));
  assert.match(reholzHtml, new RegExp(`name="form-master-revision"\\s+content="${REHOLZ_MASTER_REVISION}"`));

  for (const [label, html] of [['Mitra', mitraHtml], ['ReHolz', reholzHtml]]) {
    assert.ok(!/@media\s*\(max-width:\s*760px\)/.test(html), `${label} must scope 760px query to @media screen`);
    assert.ok(/@media\s+screen\s+and\s+\(max-width:\s*760px\)/.test(html), `${label} must have @media screen and (max-width: 760px)`);
    assert.ok(html.includes('body.print-measuring'), `${label} must define body.print-measuring`);
    assert.ok(html.includes('print-color-adjust: exact !important'), `${label} must enforce exact print colors`);
    assert.ok(html.includes('var(--print-h'), `${label} must consume --print-h in print CSS`);
    assert.ok(html.includes('min-height: 99.4vh !important'), `${label} .sheet must use 99.4vh min-height in print`);
    assert.ok(html.includes('overflow: visible !important'), `${label} .sheet must allow overflow onto extra pages when essays expand`);
    assert.ok(!html.includes('--print-fs'), `${label} must expand fields rather than shrinking font sizes`);
    assert.ok(html.includes('computePrintMetrics'), `${label} must compute print metrics`);
  }

  assert.ok(printJs.includes('print-measuring'), 'print.js must use print-measuring');
  assert.ok(printJs.includes('--print-h'), 'print.js must set --print-h');
  assert.ok(!printJs.includes('--print-fs'), 'print.js must not shrink font sizes with --print-fs');
  assert.ok(printJs.includes('print-color-adjust:exact!important'), 'print.js DISC CSS must enforce exact print colors');
  assert.ok(printJs.includes('99.6vh!important'), 'print.js .aux-sheet must use 99.6vh in print');
});

import {
  calculateContractDates,
  buildDuplicateCandidatePayload,
  buildDuplicatedDiscPayload,
  buildDuplicatedInterviewPayloads,
  buildDuplicatedInvitePayload,
  deriveCandidateProgress,
  resolveLeadUnifiedStatus,
  buildInvitedCandidatesViewRows,
  aggregateCvScreeningBySource,
  buildUnifiedTrackingRows,
  buildRecruitmentConclusionSummary,
  resolveSharedDiscForApplicant,
  resolveSharedInterviewsForApplicant,
  parseEmployeeSpreadsheetRows,
  formatEmployeeExportRow,
  verifyPinRevealPassword,
  normalizeLoginIdentifier,
  validateLoginIdentifier,
  validatePin,
  findDefaultInterviewer,
  isRootAdminAccount,
  buildEmployeeUserOptionLabel,
  EMPLOYEE_TABLE_HEADERS,
  FINAL_INTERVIEW_DECISIONS,
  normalizeInterviewDecision
} from '../assets/js/workspace-logic.js';

test('calculateContractDates computes exact inclusive end date matching 17 March 2026 - 16 March 2027', () => {
  const oneYear = calculateContractDates('2026-03-17', 12);
  assert.deepEqual(oneYear, {
    startIso: '2026-03-17',
    endIso: '2027-03-16',
    months: 12,
    displayRange: '17 March 2026 - 16 March 2027'
  });
  const sixMonths = calculateContractDates('2026-07-13', 6);
  assert.equal(sixMonths.endIso, '2027-01-12');
  const threeMonths = calculateContractDates('2026-01-31', 3);
  assert.equal(threeMonths.endIso, '2026-04-29');
  assert.equal(calculateContractDates('2026-03-17', 2), null);
  assert.equal(calculateContractDates('invalid', 12), null);
});

test('NIK login normalization and PIN reveal password check enforce rules', () => {
  assert.equal(normalizeLoginIdentifier(' ST 130116 '), 'st130116');
  assert.equal(validateLoginIdentifier('ST 130116'), true);
  assert.equal(validateLoginIdentifier('ab'), false);
  assert.equal(validatePin('123456'), true);
  assert.equal(validatePin('12ab'), false);
  assert.equal(verifyPinRevealPassword('8karakterH!'), true);
  assert.equal(verifyPinRevealPassword('wrong'), false);
});

test('buildDuplicateCandidatePayload preserves progress, clones DISC/interviews/invites, and enforces position change', () => {
  const answers = Array.from({ length: 24 }, (_, idx) => ({ most: idx % 4, least: (idx + 1) % 4 }));
  const source = {
    id: 'app-1',
    full_name: 'Budi Santoso',
    nik: '3514122006840004',
    position: 'CNC',
    stage: 'disc_completed',
    cv_path: 'candidate-cv/uuid/cv.pdf',
    ktp_path: 'candidate-identity/uuid/ktp.jpg',
    disc_submissions: [{ id: 'd1', answers, completed_at: '2026-03-01T10:00:00Z' }],
    application_data: { nama: 'Budi Santoso', posisi: 'CNC', ktp_foto: 'data:image/jpeg;base64,HUGE' }
  };
  assert.throws(() => buildDuplicateCandidatePayload(source, 'CNC'), /different/);
  const dup = buildDuplicateCandidatePayload(source, 'Maintenance');
  assert.equal(dup.position, 'Maintenance');
  assert.equal(dup.application_data.posisi, 'Maintenance');
  assert.equal(dup.application_data.ktp_foto, undefined);
  assert.equal(dup.duplicated_from, 'app-1');
  assert.equal(dup.stage, 'disc_completed');

  const hiredSource = { ...source, stage: 'hired' };
  assert.equal(buildDuplicateCandidatePayload(hiredSource, 'Supervisor').stage, 'stage4_pending');

  const discClone = buildDuplicatedDiscPayload(source.disc_submissions[0], 'app-2');
  assert.equal(discClone.applicant_id, 'app-2');
  assert.equal(discClone.answers.length, 24);

  const intClone = buildDuplicatedInterviewPayloads([
    {
      interview_stage: 'HR 1',
      interview_date: '2026-03-02',
      pic_name: 'Samsul Hariyadi',
      decision: 'Direkomendasikan',
      notes: 'Good attitude'
    }
  ], { id: 'app-2', full_name: 'Budi Santoso', nik: source.nik, position: 'Maintenance' }, 'user-admin');
  assert.equal(intClone.length, 1);
  assert.equal(intClone[0].applicant_id, 'app-2');
  assert.equal(intClone[0].applied_position, 'Maintenance');
  assert.equal(intClone[0].interview_date, '2026-03-02');
  assert.equal(intClone[0].decision, 'Recommended');

  const invClone = buildDuplicatedInvitePayload(
    { invite_date: '2026-02-28', source: 'Jobstreet', notes: 'Initial invite' },
    { id: 'app-2', full_name: 'Budi Santoso', position: 'Maintenance' },
    'user-admin'
  );
  assert.equal(invClone.linked_applicant_id, 'app-2');
  assert.equal(invClone.applied_position, 'Maintenance');
  assert.equal(invClone.status, 'Responded');
});

test('deriveCandidateProgress and resolveLeadUnifiedStatus keep Candidate List and Lead Register continuously synced', () => {
  const base = { id: 'a1', stage: 'application_submitted', disc_submissions: [] };
  assert.equal(deriveCandidateProgress(base, [], null).label, 'Form Submitted');
  assert.equal(
    deriveCandidateProgress({ ...base, stage: 'disc_completed' }, [{ interview_stage: 'HR 1', decision: 'Direkomendasikan', created_at: '2026-03-01T00:00:00Z' }], null).label,
    'HR 1 Interview · Recommended'
  );
  assert.equal(
    deriveCandidateProgress(base, [{ interview_stage: 'Final Interview', decision: 'Kirim Ke OS', created_at: '2026-03-05T00:00:00Z' }], null).label,
    'Final Interview · Sent to OS'
  );
  assert.equal(
    deriveCandidateProgress(base, [{ interview_stage: 'Final Interview', decision: 'Ditolak', created_at: '2026-03-05T00:00:00Z' }], null).label,
    'Final Interview · Rejected'
  );
  assert.equal(
    deriveCandidateProgress(base, [], { id: 'emp-1' }).label,
    'Hired · Employee'
  );

  const lead = { id: 'l1', full_name: 'Rina', whatsapp: '081234567890', position: 'Staff Admin', recommendation: 'Recommended' };
  const app = { id: 'a9', full_name: 'Rina', position: 'Staff Admin', stage: 'disc_completed', application_data: { telepon: '+62 812-3456-7890' } };
  const resolved = resolveLeadUnifiedStatus(lead, { applicants: [app], interviews: [], employees: [], invitedCandidates: [] });
  assert.equal(resolved.label, 'DISC Completed');
  assert.equal(resolved.linkedApplicant?.id, 'a9');

  const unlinked = resolveLeadUnifiedStatus({ id: 'l2', full_name: 'Andi', recommendation: 'Direkomendasikan' }, {});
  assert.equal(unlinked.label, 'Lead Register · Recommended');
});

test('buildInvitedCandidatesViewRows prevents duplicates on link and reflects candidate duplication twice', () => {
  const applicants = [
    { id: 'app-1', full_name: 'Dewi Lestari', position: 'CNC', stage: 'application_submitted', created_at: '2026-03-10T08:00:00Z' },
    { id: 'app-2', full_name: 'Dewi Lestari', position: 'QA', stage: 'disc_completed', duplicated_from: 'app-1', created_at: '2026-03-11T08:00:00Z' },
    { id: 'app-3', full_name: 'Auto Only Applicant', position: 'Sales', stage: 'application_submitted', created_at: '2026-03-12T08:00:00Z' }
  ];
  const manualInvites = [
    { id: 'inv-1', invite_date: '2026-03-09', candidate_name: 'No Resp Person', applied_position: 'Operator', source: 'Glints', status: 'No Response', linked_applicant_id: null },
    { id: 'inv-2', invite_date: '2026-03-10', candidate_name: 'Dewi Lestari', applied_position: 'CNC', source: 'Jobstreet', status: 'Responded', linked_applicant_id: 'app-1' },
    { id: 'inv-3', invite_date: '2026-03-10', candidate_name: 'Dewi Lestari', applied_position: 'QA', source: 'Jobstreet', status: 'Responded', linked_applicant_id: 'app-2' }
  ];
  const viewRows = buildInvitedCandidatesViewRows({ manualInvites, applicants });
  // Zero duplicate for app-1 (merged into inv-2), app-2 preserved for duplicated candidate, app-3 auto-included, inv-1 kept No Response
  assert.equal(viewRows.length, 4);
  assert.equal(viewRows.filter(r => r.linkedApplicantId === 'app-1').length, 1);
  assert.equal(viewRows.filter(r => r.candidateName === 'Dewi Lestari').length, 2);
  assert.equal(viewRows.find(r => r.manualId === 'inv-1')?.status, 'No Response');
  assert.equal(viewRows.find(r => r.linkedApplicantId === 'app-3')?.status, 'Responded');
});

test('aggregateCvScreeningBySource aggregates screening counts cleanly', () => {
  const agg = aggregateCvScreeningBySource([
    { id: '1', source: 'Jobstreet', screening_count: 14 },
    { id: '2', source: 'Glints', screening_count: 9 },
    { id: '3', source: 'Jobstreet', screening_count: 6 }
  ]);
  assert.equal(agg.totalCount, 29);
  assert.equal(agg.items.length, 2);
  assert.equal(agg.items[0].source, 'Jobstreet');
  assert.equal(agg.items[0].screeningCount, 20);
});

test('buildUnifiedTrackingRows produces full 12-column tracking structure', () => {
  const tracking = buildUnifiedTrackingRows({
    applicants: [
      {
        id: 'app-1',
        full_name: 'Bima Pratama',
        nik: '3515000000000001',
        position: 'Production Lead',
        stage: 'rejected',
        created_at: '2026-03-02T00:00:00Z',
        disc_submissions: [{ completed_at: '2026-03-03T00:00:00Z' }]
      }
    ],
    interviews: [
      {
        applicant_id: 'app-1',
        interview_stage: 'HR 1',
        interview_date: '2026-03-04',
        decision: 'Direkomendasikan',
        pic_name: 'Samsul Hariyadi'
      },
      {
        applicant_id: 'app-1',
        interview_stage: 'Final Interview',
        interview_date: '2026-03-06',
        decision: 'Rejected',
        rejection_reason_category: 'Salary',
        rejection_reason_detail: 'Above budget',
        work_start_date: null
      }
    ],
    invitedCandidates: [
      { invite_date: '2026-03-01', linked_applicant_id: 'app-1', source: 'LinkedIn', status: 'Responded' }
    ]
  });
  assert.equal(tracking.length, 1);
  assert.equal(tracking[0].inviteDate, '2026-03-01');
  assert.equal(tracking[0].formSubmittedDate, '2026-03-02');
  assert.equal(tracking[0].hrTestDate, '2026-03-03');
  assert.equal(tracking[0].hr1.decision, 'Recommended');
  assert.equal(tracking[0].hr1.date, '2026-03-04');
  assert.equal(tracking[0].finalInt.decision, 'Rejected');
  assert.equal(tracking[0].decision, 'Rejected');
  assert.equal(tracking[0].rejectionReason, 'Salary · Above budget');
  assert.equal(tracking[0].decisionDate, '2026-03-06');
});

test('Employee Directory spreadsheet parser and formatter align with 16-column format', () => {
  assert.equal(EMPLOYEE_TABLE_HEADERS.length, 16);
  const { rows, errors } = parseEmployeeSpreadsheetRows([
    {
      Nama: 'ABD. KHAMID',
      Nik: 'ST 130116',
      Departement: 'PURCHASING',
      'Tgl Masuk': '05-11-2004',
      Jabatan: 'MMD',
      'Mulai Kontrak': '-',
      'Kontrak Berakhir': '-',
      Alamat: 'Subontoro Rt 16/07',
      Nik2: '3516112304830004',
      'Tempat Lahir': 'Mojokerto',
      'Tanggal Lahir': '31-12-1983',
      'No. Telp': '82230164498',
      Status: 'TETAP',
      Pendidikan: 'SMP',
      'Jenis Kelamin': 'Laki-laki',
      Agama: 'Islam'
    }
  ]);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employee_no, 'ST 130116');
  assert.equal(rows[0].join_date, '2004-11-05');
  assert.equal(rows[0].contract_start_date, null);
  assert.equal(rows[0].birth_date, '1983-12-31');
  const exported = formatEmployeeExportRow(rows[0]);
  assert.deepEqual(Object.keys(exported), EMPLOYEE_TABLE_HEADERS);
  assert.equal(exported['Tgl Masuk'], '05-11-2004');
  assert.equal(exported['Mulai Kontrak'], '-');
});

test('findDefaultInterviewer matches Samsul Hariyadi for HR 1 and Diana Anita Sari for HR 2 strictly from Employee Directory', () => {
  const list = [
    { id: 'e1', employee_no: 'ST 1001', full_name: 'Samsul Hariyadi' },
    { id: 'e2', employee_no: 'ST 1002', full_name: 'Diana Anita Sari' }
  ];
  assert.equal(findDefaultInterviewer('HR 1', list).employeeId, 'e1');
  assert.equal(findDefaultInterviewer('HR 2', list).employeeId, 'e2');
  assert.equal(findDefaultInterviewer('HR 1', []), null);
  assert.equal(findDefaultInterviewer('User 1', list), null);
});

test('isRootAdminAccount and buildEmployeeUserOptionLabel identify root Admin and format options cleanly', () => {
  assert.equal(isRootAdminAccount({ username: 'admin' }), true);
  assert.equal(isRootAdminAccount({ employeeNik: 'ADMIN' }), true);
  assert.equal(isRootAdminAccount({ displayName: 'Administrator' }), true);
  assert.equal(isRootAdminAccount({ username: 'st130116', displayName: 'ABD. KHAMID' }), false);
  assert.equal(
    buildEmployeeUserOptionLabel({ employee_no: 'ST 130116', full_name: 'ABD. KHAMID', position: 'MMD' }),
    'ST 130116 — ABD. KHAMID (MMD)'
  );
});

test('Lead Register source auto-syncs to Invited Candidates as Responded and Tracking without duplicates', () => {
  const stage1Leads = [
    { id: 'lead-1', full_name: 'Sari Indah', position: 'Admin Gudang', source: 'Glints', whatsapp: '0811111222', created_at: '2026-03-14T09:00:00Z' },
    { id: 'lead-2', full_name: 'Tanpa Source', position: 'CNC', source: '', whatsapp: '0899999888', created_at: '2026-03-15T09:00:00Z' },
    { id: 'lead-3', full_name: 'Bima Pratama', position: 'Production Lead', source: 'Indeed', whatsapp: '0822222333', created_at: '2026-03-01T09:00:00Z' }
  ];
  const applicants = [
    {
      id: 'app-1',
      full_name: 'Bima Pratama',
      position: 'Production Lead',
      stage: 'disc_completed',
      created_at: '2026-03-02T00:00:00Z',
      application_data: { telepon: '0822222333' },
      disc_submissions: [{ completed_at: '2026-03-03T00:00:00Z' }]
    }
  ];

  const invitedRows = buildInvitedCandidatesViewRows({ manualInvites: [], applicants, stage1Leads });
  // lead-3 matched app-1 -> merged once carrying Indeed; lead-1 & lead-2 both auto-pulled from Lead Register as Responded
  assert.equal(invitedRows.length, 3);
  const bimaInvite = invitedRows.find(r => r.linkedApplicantId === 'app-1');
  const sariInvite = invitedRows.find(r => r.linkedStage1Id === 'lead-1');
  const tanpaSourceInvite = invitedRows.find(r => r.linkedStage1Id === 'lead-2');
  assert.equal(bimaInvite?.source, 'Indeed');
  assert.equal(bimaInvite?.status, 'Responded');
  assert.equal(sariInvite?.source, 'Glints');
  assert.equal(sariInvite?.status, 'Responded');
  assert.equal(tanpaSourceInvite?.source, 'Lead Register');
  assert.equal(tanpaSourceInvite?.status, 'Responded');
  assert.equal(tanpaSourceInvite?.appliedPosition, 'CNC');

  const tracking = buildUnifiedTrackingRows({ applicants, stage1Leads, interviews: [], employees: [], invitedCandidates: [] });
  assert.equal(tracking.length, 3);
  assert.equal(tracking.find(r => r.id === 'app:app-1')?.inviteSource, 'Indeed');
  assert.equal(tracking.find(r => r.id === 'stage1:lead-1')?.inviteSource, 'Glints');
  assert.equal(tracking.find(r => r.id === 'stage1:lead-1')?.inviteStatus, 'Responded');
  assert.equal(tracking.find(r => r.id === 'stage1:lead-2')?.inviteSource, 'Lead Register');
});

test('aggregateCvScreeningBySource groups screening counts cleanly by Position and Source', () => {
  const agg = aggregateCvScreeningBySource([
    { id: '1', position: 'CNC', source: 'Jobstreet', screening_count: 10 },
    { id: '2', position: 'CNC', source: 'Glints', screening_count: 5 },
    { id: '3', position: 'QA', source: 'Jobstreet', screening_count: 8 }
  ]);
  assert.equal(agg.totalCount, 23);
  assert.equal(agg.items.length, 3);
  assert.equal(agg.items[0].position, 'CNC');
  assert.equal(agg.items[0].source, 'Jobstreet');
  assert.equal(agg.items[0].screeningCount, 10);
});

test('buildRecruitmentConclusionSummary deduplicates HR 1+2 and User 1+2 interviews per candidate per position', () => {
  const applicants = [
    { id: 'a1', full_name: 'Kandidat Satu', position: 'CNC', stage: 'hired', disc_submissions: [{ completed_at: '2026-03-03' }] },
    { id: 'a2', full_name: 'Kandidat Dua', position: 'CNC', stage: 'disc_completed', disc_submissions: [{ completed_at: '2026-03-04' }] },
    { id: 'a3', full_name: 'Kandidat Tiga', position: 'QA', stage: 'application_submitted', disc_submissions: [] }
  ];
  const interviews = [
    // Kandidat Satu attended BOTH HR 1 & HR 2 + BOTH User 1 & User 2 + Final -> counts as 1 HR, 1 User, 1 Final
    { applicant_id: 'a1', applied_position: 'CNC', interview_stage: 'HR 1', decision: 'Recommended' },
    { applicant_id: 'a1', applied_position: 'CNC', interview_stage: 'HR 2', decision: 'Recommended' },
    { applicant_id: 'a1', applied_position: 'CNC', interview_stage: 'User 1', decision: 'Recommended' },
    { applicant_id: 'a1', applied_position: 'CNC', interview_stage: 'User 2', decision: 'Recommended' },
    { applicant_id: 'a1', applied_position: 'CNC', interview_stage: 'Final Interview', decision: 'Accepted', contract_number: '045/PKWT/2026' },
    // Kandidat Dua attended HR 1 only -> HR interview count for CNC becomes 2
    { applicant_id: 'a2', applied_position: 'CNC', interview_stage: 'HR 1', decision: 'Not Recommended' },
    // Kandidat Tiga attended User 2 only in QA -> QA User interview = 1
    { applicant_id: 'a3', applied_position: 'QA', interview_stage: 'User 2', decision: 'Recommended' }
  ];
  const cvScreenings = [
    { id: 's1', position: 'CNC', source: 'Jobstreet', screening_count: 15 },
    { id: 's2', position: 'CNC', source: 'Glints', screening_count: 5 }
  ];
  const summary = buildRecruitmentConclusionSummary({
    positions: ['CNC', 'QA'],
    cvScreenings,
    invitedCandidates: [],
    stage1Leads: [],
    applicants,
    interviews,
    employees: []
  });

  const cnc = summary.rows.find(r => r.position === 'CNC');
  const qa = summary.rows.find(r => r.position === 'QA');
  assert.equal(cnc.cvScreeningCount, 20);
  assert.equal(cnc.invitedCount, 2);
  assert.equal(cnc.hrTestCount, 2);
  assert.equal(cnc.hrInterviewCount, 2);
  assert.equal(cnc.userInterviewCount, 1);
  assert.equal(cnc.finalInterviewCount, 1);
  assert.equal(cnc.acceptedCount, 1);

  assert.equal(qa.invitedCount, 1);
  assert.equal(qa.hrTestCount, 0);
  assert.equal(qa.userInterviewCount, 1);

  assert.equal(summary.totals.cvScreeningCount, 20);
  assert.equal(summary.totals.hrInterviewCount, 2);
  assert.equal(summary.totals.userInterviewCount, 2);
  assert.equal(summary.totals.acceptedCount, 1);

  const dupInts = buildDuplicatedInterviewPayloads([interviews[4]], { id: 'a4', full_name: 'Kandidat Satu', nik: '123', position: 'QA' }, 'admin');
  assert.equal(dupInts[0].contract_number, '045/PKWT/2026');
});

test('auto-pulled Candidate List rows default source to Jobstreet unless overridden manually', () => {
  const applicants = [
    { id: 'c1', full_name: 'Rudi Hartono', position: 'CNC', stage: 'application_submitted', created_at: '2026-03-10T00:00:00Z' },
    { id: 'c2', full_name: 'Rudi Hartono', position: 'QA', stage: 'disc_completed', duplicated_from: 'c1', created_at: '2026-03-11T00:00:00Z' },
    { id: 'c3', full_name: 'Siti Aminah', position: 'Operator', stage: 'application_submitted', created_at: '2026-03-12T00:00:00Z' }
  ];
  const manualInvites = [
    { id: 'm1', linked_applicant_id: 'c3', candidate_name: 'Siti Aminah', applied_position: 'Operator', source: 'Referensi Internal', status: 'Responded', invite_date: '2026-03-12' }
  ];
  const invited = buildInvitedCandidatesViewRows({ manualInvites, applicants, stage1Leads: [] });
  assert.equal(invited.length, 3);
  assert.equal(invited.find(r => r.linkedApplicantId === 'c1')?.source, 'Jobstreet');
  assert.equal(invited.find(r => r.linkedApplicantId === 'c2')?.source, 'Jobstreet');
  assert.equal(invited.find(r => r.linkedApplicantId === 'c3')?.source, 'Referensi Internal');

  const tracking = buildUnifiedTrackingRows({ applicants, invitedCandidates: manualInvites, interviews: [], employees: [], stage1Leads: [] });
  assert.equal(tracking.find(r => r.id === 'app:c1')?.inviteSource, 'Jobstreet');
  assert.equal(tracking.find(r => r.id === 'app:c2')?.inviteSource, 'Jobstreet');
  assert.equal(tracking.find(r => r.id === 'app:c3')?.inviteSource, 'Referensi Internal');
});

test('same 16-digit NIK shares DISC and prior interviews across different positions without duplicate re-testing', () => {
  const answers = Array.from({ length: 24 }, (_, idx) => ({ most: idx % 4, least: (idx + 2) % 4 }));
  const sharedNik = '3516112304830004';
  const app1 = {
    id: 'pos-a',
    full_name: 'Bayu Aditya',
    nik: sharedNik,
    position: 'CNC',
    stage: 'disc_completed',
    created_at: '2026-03-01T00:00:00Z',
    disc_submissions: [{ id: 'disc-1', answers, completed_at: '2026-03-02T08:00:00Z' }]
  };
  const app2 = {
    id: 'pos-b',
    full_name: 'Bayu Aditya',
    nik: sharedNik,
    position: 'QA',
    stage: 'application_submitted',
    created_at: '2026-03-05T00:00:00Z',
    disc_submissions: []
  };
  const allApplicants = [app1, app2];

  const resolvedDisc = resolveSharedDiscForApplicant(app2, allApplicants);
  assert.equal(resolvedDisc?.id, 'disc-1');
  assert.equal(resolvedDisc?.answers?.length, 24);

  const interviews = [
    { id: 'int-1', applicant_id: 'pos-a', candidate_nik: sharedNik, interview_stage: 'HR 1', interview_date: '2026-03-03', decision: 'Recommended', pic_name: 'Samsul Hariyadi' },
    { id: 'int-2', applicant_id: 'pos-a', candidate_nik: sharedNik, interview_stage: 'User 1', interview_date: '2026-03-04', decision: 'Recommended', pic_name: 'User Pic' }
  ];
  const sharedInts = resolveSharedInterviewsForApplicant(app2, allApplicants, interviews);
  assert.equal(sharedInts.length, 2);

  const progress = deriveCandidateProgress(app2, sharedInts, null, null, { applicants: allApplicants });
  assert.equal(progress.label, 'User 1 Interview · Recommended');

  const tracking = buildUnifiedTrackingRows({ applicants: allApplicants, interviews, employees: [], stage1Leads: [], invitedCandidates: [] });
  const posBRow = tracking.find(r => r.id === 'app:pos-b');
  assert.equal(posBRow?.hrTestDone, true);
  assert.equal(posBRow?.hrTestDate, '2026-03-02');
  assert.equal(posBRow?.hr1?.decision, 'Recommended');
  assert.equal(posBRow?.user1?.decision, 'Recommended');

  const summary = buildRecruitmentConclusionSummary({
    positions: ['CNC', 'QA'],
    cvScreenings: [],
    invitedCandidates: [],
    stage1Leads: [],
    applicants: allApplicants,
    interviews,
    employees: []
  });
  const qa = summary.rows.find(r => r.position === 'QA');
  assert.equal(qa?.hrTestCount, 1);
  assert.equal(qa?.hrInterviewCount, 1);
  assert.equal(qa?.userInterviewCount, 1);
});

test('Final Interview supports Holded option and normalizes hold variations cleanly', () => {
  assert.ok(FINAL_INTERVIEW_DECISIONS.includes('Accepted'));
  assert.ok(FINAL_INTERVIEW_DECISIONS.includes('Rejected'));
  assert.ok(FINAL_INTERVIEW_DECISIONS.includes('Holded'));
  assert.equal(normalizeInterviewDecision('holded'), 'Holded');
  assert.equal(normalizeInterviewDecision('Ditunda'), 'Holded');

  const progress = deriveCandidateProgress(
    { id: 'a-hold', stage: 'stage4_pending', disc_submissions: [] },
    [{ interview_stage: 'Final Interview', decision: 'Holded', created_at: '2026-03-07T00:00:00Z' }],
    null
  );
  assert.equal(progress.label, 'Final Interview · Holded');
  assert.equal(progress.tone, 'gold');
});

test('Tracking Decision defaults active stages to In Progress except terminal/hold/non-response outcomes', () => {
  const tracking = buildUnifiedTrackingRows({
    applicants: [
      { id: 'app-form', full_name: 'Form Only', position: 'CNC', stage: 'application_submitted', created_at: '2026-03-01T00:00:00Z', disc_submissions: [] },
      { id: 'app-disc', full_name: 'Disc Done', position: 'QA', stage: 'disc_completed', created_at: '2026-03-01T00:00:00Z', disc_submissions: [{ completed_at: '2026-03-02T00:00:00Z' }] },
      { id: 'app-hr1-rec', full_name: 'HR1 Rec', position: 'Staff', stage: 'stage4_pending', created_at: '2026-03-01T00:00:00Z', disc_submissions: [] },
      { id: 'app-not-rec', full_name: 'HR2 Not Rec', position: 'Staff', stage: 'stage4_pending', created_at: '2026-03-01T00:00:00Z', disc_submissions: [] },
      { id: 'app-hold', full_name: 'Final Holded', position: 'Operator', stage: 'stage4_pending', created_at: '2026-03-01T00:00:00Z', disc_submissions: [] },
      { id: 'app-acc', full_name: 'Final Accepted', position: 'Operator', stage: 'hired', created_at: '2026-03-01T00:00:00Z', disc_submissions: [] },
      { id: 'app-rej', full_name: 'Final Rejected', position: 'Operator', stage: 'rejected', created_at: '2026-03-01T00:00:00Z', disc_submissions: [] }
    ],
    interviews: [
      { applicant_id: 'app-hr1-rec', interview_stage: 'HR 1', interview_date: '2026-03-03', decision: 'Recommended' },
      { applicant_id: 'app-not-rec', interview_stage: 'HR 1', interview_date: '2026-03-03', decision: 'Recommended' },
      { applicant_id: 'app-not-rec', interview_stage: 'HR 2', interview_date: '2026-03-04', decision: 'Not Recommended' },
      { applicant_id: 'app-hold', interview_stage: 'Final Interview', interview_date: '2026-03-05', decision: 'Holded' },
      { applicant_id: 'app-acc', interview_stage: 'Final Interview', interview_date: '2026-03-06', decision: 'Accepted' },
      { applicant_id: 'app-rej', interview_stage: 'Final Interview', interview_date: '2026-03-06', decision: 'Rejected' }
    ],
    stage1Leads: [
      { id: 'lead-pending', full_name: 'Lead Pending', position: 'Driver', recommendation: 'Pending', source: 'Glints', created_at: '2026-03-02T00:00:00Z' },
      { id: 'lead-rec', full_name: 'Lead Recommended', position: 'Driver', recommendation: 'Recommended', source: 'Glints', created_at: '2026-03-02T00:00:00Z' },
      { id: 'lead-not-rec', full_name: 'Lead Not Rec', position: 'Driver', recommendation: 'Not Recommended', source: 'Glints', created_at: '2026-03-02T00:00:00Z' }
    ],
    invitedCandidates: [
      { id: 'inv-noresp', candidate_name: 'Invite No Resp', applied_position: 'Admin', source: 'Jobstreet', status: 'No Response', invite_date: '2026-03-01' },
      { id: 'inv-resp', candidate_name: 'Invite Resp', applied_position: 'Admin', source: 'Jobstreet', status: 'Responded', invite_date: '2026-03-01' }
    ],
    employees: []
  });

  const byId = Object.fromEntries(tracking.map(r => [r.id, r]));
  assert.equal(byId['app:app-form'].decision, 'In Progress');
  assert.equal(byId['app:app-disc'].decision, 'In Progress');
  assert.equal(byId['app:app-hr1-rec'].decision, 'In Progress');
  assert.equal(byId['app:app-not-rec'].decision, 'Not Recommended');
  assert.equal(byId['app:app-not-rec'].decisionDate, '2026-03-04');
  assert.equal(byId['app:app-hold'].decision, 'Holded');
  assert.equal(byId['app:app-hold'].decisionTone, 'gold');
  assert.equal(byId['app:app-acc'].decision, 'Accepted');
  assert.equal(byId['app:app-rej'].decision, 'Rejected');
  assert.equal(byId['stage1:lead-pending'].decision, 'In Progress');
  assert.equal(byId['stage1:lead-rec'].decision, 'In Progress');
  assert.equal(byId['stage1:lead-not-rec'].decision, 'Not Recommended');
  assert.equal(byId['inv:inv-noresp'].decision, 'No Response');
  assert.equal(byId['inv:inv-resp'].decision, 'In Progress');
});

test('Tracking print markup uses Letter Landscape without redundant guide and Recruitment menu follows exact order', () => {
  const printJs = fs.readFileSync('assets/js/print.js', 'utf8');
  assert.ok(printJs.includes('size: letter landscape;'), 'print report must use letter landscape @page size');
  assert.ok(!printJs.includes('Deduplication Policy'), 'redundant Deduplication Policy guide must be removed');
  assert.ok(!printJs.includes('Page 1 ·'), 'Page 1 subtitle guide must be removed');
  assert.ok(!printJs.includes('Page 2 ·'), 'Page 2 subtitle guide must be removed');

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const groupMatch = indexHtml.match(/<div id="group-recruitment"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(groupMatch, 'Recruitment sidebar group must exist');
  const labels = [...groupMatch[0].matchAll(/<\/span>\s*([^<\n][^<\n]*?)\s*<\/(?:button|a)>/g)].map(m => m[1].replace(/&amp;/g, '&').trim());
  assert.deepEqual(labels, [
    'Invited',
    'Lead Register',
    'Candidate List',
    'DISC Assessment',
    'SPM Assessment',
    'Interview',
    'Tracking & Report',
    'Application Print',
    'Settings'
  ]);
});

import {
  CONTRACT_DOCUMENTS,
  DEFAULT_CONTRACT_SETTINGS,
  getExpiringContractWindow,
  isContractEmployee,
  classifyExpiringContract,
  determineRequiredContractDocuments,
  extractDocSequence,
  inferDurationMonths,
  buildContractWorkspaceQueue,
  buildAgreementPayload,
  buildDashboardAttentionItems,
  renderAgreementHtml
} from '../assets/js/contract-logic.js';

test('getExpiringContractWindow and classifyExpiringContract detect current and next month contracts only', () => {
  const ref = '2026-11-15';
  const win = getExpiringContractWindow(ref);
  assert.equal(win.currentMonthKey, '2026-11');
  assert.equal(win.nextMonthKey, '2026-12');
  assert.equal(win.currentMonthStart, '2026-11-01');
  assert.equal(win.nextMonthEnd, '2026-12-31');

  const thisMonth = classifyExpiringContract({ employment_status: 'KONTRAK', contract_end_date: '2026-11-28' }, ref);
  assert.equal(thisMonth.expiring, true);
  assert.equal(thisMonth.bucket, 'current_month');
  assert.equal(thisMonth.daysRemaining, 13);

  const expiredEarlierThisMonth = classifyExpiringContract({ employment_status: 'PKWT', contract_end_date: '2026-11-05' }, ref);
  assert.equal(expiredEarlierThisMonth.expiring, true);
  assert.equal(expiredEarlierThisMonth.urgencyLabel, 'Expired This Month');

  const nextMonth = classifyExpiringContract({ employment_status: 'KONTRAK', contract_end_date: '2026-12-18' }, ref);
  assert.equal(nextMonth.expiring, true);
  assert.equal(nextMonth.bucket, 'next_month');

  const farFuture = classifyExpiringContract({ employment_status: 'KONTRAK', contract_end_date: '2027-01-15' }, ref);
  assert.equal(farFuture.expiring, false);

  const permanent = classifyExpiringContract({ employment_status: 'TETAP', contract_end_date: '2026-11-25' }, ref);
  assert.equal(permanent.expiring, false);
  assert.equal(isContractEmployee({ employment_status: 'TETAP', contract_end_date: '2026-11-25' }), false);
});

test('buildContractWorkspaceQueue places expiring 2-month contracts before Final Interview accepted candidates', () => {
  const queue = buildContractWorkspaceQueue({
    referenceDate: '2026-11-15',
    employees: [
      { id: 'e-far', full_name: 'Far Out', employee_no: 'KT 003', employment_status: 'KONTRAK', contract_end_date: '2027-03-01', salary: 5300000 },
      { id: 'e-next', full_name: 'Next Month', employee_no: 'KT 002', employment_status: 'KONTRAK', contract_end_date: '2026-12-10', salary: 5200000 },
      { id: 'e-cur', full_name: 'Current Month', employee_no: 'KT 001', employment_status: 'KONTRAK', contract_end_date: '2026-11-25', salary: 4500000 },
      { id: 'e-tetap', full_name: 'Permanent Staff', employee_no: 'ST 001', employment_status: 'TETAP', contract_end_date: '2026-11-22' }
    ],
    interviews: [
      { id: 'int-acc-1', applicant_id: 'app-1', candidate_name: 'Final Pass One', interview_stage: 'Final Interview', decision: 'Accepted', official_position: 'CNC Operator', salary: 5400000, work_start_date: '2026-12-01', contract_duration_months: 12 },
      { id: 'int-rej', applicant_id: 'app-2', candidate_name: 'Final Rejected', interview_stage: 'Final Interview', decision: 'Rejected' }
    ],
    applicants: [
      { id: 'app-1', full_name: 'Final Pass One', nik: '3514000000000001', position: 'CNC', application_data: { domisili: 'Gempol, Pasuruan' } }
    ]
  });

  assert.equal(queue.expiringCount, 2);
  assert.equal(queue.finalInterviewCount, 1);
  assert.equal(queue.rows.length, 3);
  assert.equal(queue.rows[0].employeeId, 'e-cur');
  assert.equal(queue.rows[0].priorityGroup, 1);
  assert.equal(queue.rows[1].employeeId, 'e-next');
  assert.equal(queue.rows[1].priorityGroup, 1);
  assert.equal(queue.rows[2].interviewId, 'int-acc-1');
  assert.equal(queue.rows[2].priorityGroup, 2);
  assert.equal(queue.rows[2].address, 'Gempol, Pasuruan');
});

test('determineRequiredContractDocuments enforces 1 PKWT doc >= UMK and all 5 docs < UMK', () => {
  const umk = DEFAULT_CONTRACT_SETTINGS.currUmkAmount; // 5187681
  const exactUmk = determineRequiredContractDocuments(umk, umk);
  assert.equal(exactUmk.meetsUmk, true);
  assert.equal(exactUmk.requiredCount, 1);
  assert.equal(exactUmk.shortfall, 0);
  assert.deepEqual(exactUmk.documents.map(d => d.key), ['01-pkwt']);

  const aboveUmk = determineRequiredContractDocuments(5500000, umk);
  assert.equal(aboveUmk.meetsUmk, true);
  assert.equal(aboveUmk.requiredCount, 1);

  const belowUmk = determineRequiredContractDocuments(4400000, umk);
  assert.equal(belowUmk.meetsUmk, false);
  assert.equal(belowUmk.requiredCount, 5);
  assert.equal(belowUmk.shortfall, umk - 4400000);
  assert.deepEqual(belowUmk.documents.map(d => d.key), CONTRACT_DOCUMENTS.map(d => d.key));
});

test('buildAgreementPayload omits unchecked optional fields and renderAgreementHtml formats real templates accurately', () => {
  const masters = JSON.parse(fs.readFileSync('assets/contracts/company-masters.json', 'utf8'));
  const mbmMaster = masters.find(m => m.id === 'comp-mbm');
  const pkwtTpl = fs.readFileSync('assets/contracts/01-pkwt.html', 'utf8');
  const pbWageTpl = fs.readFileSync('assets/contracts/02-pb-pembayaran-upah.html', 'utf8');

  // Optional fields unchecked -> MUST NOT be inserted even when populated in config
  const uncheckedPayload = buildAgreementPayload({
    docSequence: '088',
    signingDate: '2026-11-22',
    durationMonths: 12,
    signingCity: 'Pandaan',
    hrName: 'Budi HR',
    employeeName: 'Agus Nur Wahid',
    employeePosition: 'Operator Mesin',
    employeeAddress: 'Desa Randupitu RT 01 RW 02, Gempol',
    includeKtp: false,
    employeeKtp: '3514122006840004',
    includeNik: false,
    employeeNik: 'KT 260199',
    includeDepartment: false,
    employeeDepartment: 'Produksi',
    includeCustomNote: false,
    customNote: 'Ketentuan khusus test',
    cashWageAmount: 4400000,
    currUmkAmount: 5187681,
    prevUmkAmount: 4866890,
    governorDecreeNo: '188/889/KPTS/013/2026'
  }, mbmMaster);

  assert.equal(uncheckedPayload.employeeKtp, '');
  assert.equal(uncheckedPayload.employeeNik, '');
  assert.equal(uncheckedPayload.employeeDepartment, '');
  assert.equal(uncheckedPayload.customNote, '');

  const pkwtUnchecked = renderAgreementHtml(pkwtTpl, uncheckedPayload, mbmMaster);
  assert.ok(!pkwtUnchecked.includes('3514122006840004'), 'KTP must not appear when unchecked');
  assert.ok(!pkwtUnchecked.includes('KT 260199'), 'NIK must not appear when unchecked');
  assert.ok(!pkwtUnchecked.includes('Departemen'), 'Department row must not appear when unchecked');
  assert.ok(!pkwtUnchecked.includes('Ketentuan khusus test'), 'Custom note must not appear when unchecked');
  assert.ok(pkwtUnchecked.includes('1 (satu) Tahun'), '12 months must render as 1 (satu) Tahun');
  assert.ok(pkwtUnchecked.includes('Pandaan'), 'Custom signingCity must override company master');
  assert.ok(pkwtUnchecked.includes('Budi HR'), 'Custom hrName must override company master');

  // Optional fields checked -> MUST render in template
  const checkedPayload = buildAgreementPayload({
    docSequence: '088',
    signingDate: '2026-11-22',
    durationMonths: 12,
    employeeName: 'Agus Nur Wahid',
    employeePosition: 'Operator Mesin',
    employeeAddress: 'Desa Randupitu RT 01 RW 02, Gempol',
    includeKtp: true,
    employeeKtp: '3514122006840004',
    includeNik: true,
    employeeNik: 'KT 260199',
    includeDepartment: true,
    employeeDepartment: 'Produksi',
    includeCustomNote: true,
    customNote: 'Ketentuan khusus test',
    cashWageAmount: 4400000,
    currUmkAmount: 5187681,
    prevUmkAmount: 4866890,
    governorDecreeNo: '188/889/KPTS/013/2026'
  }, mbmMaster);

  const pkwtChecked = renderAgreementHtml(pkwtTpl, checkedPayload, mbmMaster);
  assert.ok(pkwtChecked.includes('3514122006840004'));
  assert.ok(pkwtChecked.includes('KT 260199'));
  assert.ok(pkwtChecked.includes('Produksi'));
  assert.ok(pkwtChecked.includes('Ketentuan khusus test'));

  const pbHtml = renderAgreementHtml(pbWageTpl, checkedPayload, mbmMaster);
  assert.ok(pbHtml.includes('787.681'), 'Shortfall 787.681 must appear in PB Wage template');

  assert.equal(extractDocSequence('184/PKWT/XI/2026'), '184');
  assert.equal(inferDurationMonths('2026-11-22', '2027-11-21', 6), 12);
});

test('buildDashboardAttentionItems routes PKWT items to contracts and non-PKWT items to their menus, and Contracts sits under Employee Directory', () => {
  const attention = buildDashboardAttentionItems({
    referenceDate: '2026-11-15',
    employees: [
      { id: 'emp-1', full_name: 'Siti', employment_status: 'KONTRAK', contract_end_date: '2026-11-28', address: 'Gempol' }
    ],
    interviews: [
      { id: 'int-1', applicant_id: 'app-pass', candidate_name: 'Budi', interview_stage: 'Final Interview', decision: 'Accepted' }
    ],
    applicants: [
      { id: 'app-pass', full_name: 'Budi', stage: 'hired' },
      { id: 'app-disc', full_name: 'Rina', stage: 'application_submitted' },
      { id: 'app-wait-int', full_name: 'Joko', stage: 'disc_completed' }
    ],
    stage1Leads: [
      { id: 'lead-1', full_name: 'Andi', recommendation: 'Recommended' }
    ],
    invitedCandidates: []
  });

  const byId = Object.fromEntries(attention.map(a => [a.id, a]));
  assert.equal(byId['pkwt-expiring']?.targetView, 'contracts');
  assert.equal(byId['pkwt-final-interview']?.targetView, 'contracts');
  assert.equal(byId['leads-recommended']?.targetView, 'stage1');
  assert.equal(byId['candidates-awaiting-disc']?.targetView, 'stage2');
  assert.equal(byId['candidates-awaiting-interview']?.targetView, 'interview');

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const empPos = indexHtml.indexOf('data-view="employees"');
  const contractsPos = indexHtml.indexOf('data-view="contracts"');
  assert.ok(empPos > 0 && contractsPos > empPos, 'Contracts nav item must be placed below Employee Directory');
});

import {
  formatContractCode,
  computeNextDocSequence,
  buildContractUpdateRequestPayload,
  applyContractCancellationRollback,
  resolveDefaultContractStartDate,
  addDaysIso
} from '../assets/js/contract-logic.js';
import {
  LEAD_IMPORT_HEADERS,
  LEAD_IMPORT_SAMPLE_ROW,
  parseLeadImportRows,
  CANDIDATE_IMPORT_HEADERS,
  CANDIDATE_IMPORT_SAMPLE_ROW,
  parseCandidateImportRows
} from '../assets/js/workspace-logic.js';

test('Signature block renders ALL CAPS {{nama_hrd_ttd}} only in signatures while body retains {{nama_hrd}} normal case', () => {
  const masters = JSON.parse(fs.readFileSync('assets/contracts/company-masters.json', 'utf8'));
  const mbmMaster = masters.find(m => m.id === 'comp-mbm');

  const payload = buildAgreementPayload({
    docSequence: '202',
    signingDate: '2026-11-22',
    durationMonths: 12,
    hrName: 'Diana Anita Sari',
    hrSignatureTitle: 'Manager HR GA',
    employeeName: 'Budi Santoso',
    employeePosition: 'Operator CNC',
    employeeAddress: 'Pasuruan',
    cashWageAmount: 4400000
  }, mbmMaster);

  for (const file of ['01-pkwt.html', '02-pb-pembayaran-upah.html', '03-pb-pembayaran-upah-lembur.html', '04-pb-penyelesaian-upah.html', '05-pb-penyelesaian-lembur.html']) {
    const tpl = fs.readFileSync(`assets/contracts/${file}`, 'utf8');
    assert.ok(tpl.includes('{{nama_hrd_ttd}}'), `${file} must use {{nama_hrd_ttd}} in signature block`);
    assert.ok(tpl.includes('{{nama_hrd}}'), `${file} must keep {{nama_hrd}} in party description`);
    const rendered = renderAgreementHtml(tpl, payload, mbmMaster);
    assert.ok(rendered.includes('Diana Anita Sari'), `${file} must render normal-case Diana Anita Sari in party body`);
    assert.ok(rendered.includes('DIANA ANITA SARI'), `${file} must render uppercase DIANA ANITA SARI in signature`);
    assert.ok(rendered.includes('Manager HR GA'), `${file} must render Manager HR GA signature title`);
  }
});

test('computeNextDocSequence auto-increments continuously across interviews, requests, history, and saved sequence', () => {
  assert.equal(computeNextDocSequence({}), '001');
  assert.equal(computeNextDocSequence({
    interviews: [{ contract_number: '184/PKWT/XI/2026' }, { contract_number: '201/PKWT/XI/2026' }],
    contractRequests: [{ docSequence: '202', status: 'pending' }],
    contractHistory: [{ docSequence: '205', status: 'cancelled' }, { docSequence: '203', status: 'applied' }],
    lastDocSequence: 204
  }), '205');
});

test('buildContractUpdateRequestPayload and applyContractCancellationRollback cleanly restore previous employee & interview data', () => {
  const emp = {
    id: 'emp-1',
    employee_no: 'ST 250112',
    position: 'Operator CNC',
    department: 'Produksi',
    address: 'Pandaan',
    employment_status: 'KONTRAK',
    contract_start_date: '2025-11-28',
    contract_end_date: '2026-11-27',
    salary: 4400000
  };
  const intv = {
    id: 'int-1',
    contract_number: '088/PKWT/XI/2025',
    contract_start_date: '2025-11-28',
    contract_end_date: '2026-11-27',
    contract_duration_months: 12,
    salary: 4400000,
    official_position: 'Operator CNC'
  };

  const req = buildContractUpdateRequestPayload({
    record: { employeeId: 'emp-1', interviewId: 'int-1' },
    config: { docSequence: '202', signingDate: '2026-11-28', durationMonths: 12, cashWageAmount: 5500000, employeeName: 'Hendra Wijaya', employeePosition: 'Senior CNC', employeeAddress: 'Gempol' },
    payload: { docSequence: '202', signingDate: '2026-11-28', durationMonths: 12, endDate: '2027-11-27' },
    currentEmployee: emp,
    currentInterview: intv,
    requestedBy: 'Diana Anita Sari'
  });

  assert.equal(req.status, 'pending');
  assert.equal(req.contractNumber, formatContractCode('202', '2026-11-28', 'PKWT'));
  assert.equal(req.previousSnapshot.employee.contract_end_date, '2026-11-27');
  assert.equal(req.previousSnapshot.employee.salary, 4400000);

  const modifiedEmp = { ...emp, position: 'Senior CNC', contract_start_date: '2026-11-28', contract_end_date: '2027-11-27', salary: 5500000 };
  const modifiedIntv = { ...intv, contract_number: '202/PKWT/XI/2026', contract_end_date: '2027-11-27', salary: 5500000 };
  const historyEntry = {
    id: 'hist-1',
    status: 'applied',
    employeeId: 'emp-1',
    interviewId: 'int-1',
    previousSnapshot: req.previousSnapshot
  };

  const rollback = applyContractCancellationRollback(historyEntry, { employees: [modifiedEmp], interviews: [modifiedIntv] });
  assert.equal(rollback.updatedEmployees[0].position, 'Operator CNC');
  assert.equal(rollback.updatedEmployees[0].contract_end_date, '2026-11-27');
  assert.equal(rollback.updatedEmployees[0].salary, 4400000);
  assert.equal(rollback.updatedInterviews[0].contract_number, '088/PKWT/XI/2025');
  assert.throws(() => applyContractCancellationRollback({ ...historyEntry, status: 'cancelled' }), /already been cancelled/);
});

test('parseLeadImportRows and parseCandidateImportRows validate templates and parse spreadsheet payloads accurately', () => {
  assert.equal(LEAD_IMPORT_HEADERS.length, 5);
  const leadParsed = parseLeadImportRows([
    LEAD_IMPORT_SAMPLE_ROW,
    { 'Applicant Name': '', Position: 'CNC' }
  ]);
  assert.equal(leadParsed.rows.length, 1);
  assert.equal(leadParsed.errors.length, 1);
  assert.equal(leadParsed.rows[0].full_name, 'Rizky Pratama');
  assert.equal(leadParsed.rows[0].recommendation, 'Recommended');

  assert.equal(CANDIDATE_IMPORT_HEADERS.length, 14);
  const candParsed = parseCandidateImportRows([
    CANDIDATE_IMPORT_SAMPLE_ROW,
    { 'Full Name': 'Invalid NIK', 'NIK (16 Digits)': '1234', Position: 'QC' }
  ]);
  assert.equal(candParsed.rows.length, 1);
  assert.equal(candParsed.errors.length, 1);
  assert.equal(candParsed.rows[0].nik, '3514122006840004');
  assert.equal(candParsed.rows[0].application_data.gender, 'L');
  assert.equal(candParsed.rows[0].application_data.tanggal_lahir, '1994-06-20');
});

test('UI & CSS enforce removed KPIs/Remarks/guides, Root Admin submenus, and 1st-column-only sticky freeze', () => {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const adminJs = fs.readFileSync('assets/js/admin.js', 'utf8');
  const contractModalJs = fs.readFileSync('assets/js/contract-modal.js', 'utf8');
  const appCss = fs.readFileSync('assets/css/app.css', 'utf8');

  assert.ok(indexHtml.includes('data-view="contractSettings"'), 'Contract Settings submenu must exist');
  assert.ok(indexHtml.includes('data-view="systemImport"'), 'Data Import submenu must exist');

  assert.ok(!adminJs.includes('<th>REMARKS</th>'), 'Lead Register Remarks column must be removed');
  assert.ok(!adminJs.includes('data-stage1-rec'), 'Lead Register remarks select must be removed');
  assert.ok(!adminJs.includes('invited-kpis'), 'Invited KPI cards must be removed');
  assert.ok(!adminJs.includes('contracts-kpi-strip'), 'Contracts KPI cards must be removed');
  assert.ok(!adminJs.includes('attention-head-sub'), 'Needs Attention explanatory subtitle must be removed');
  assert.ok(!adminJs.includes('window.confirm'), 'Native window.confirm must not be used');

  assert.ok(!contractModalJs.includes('pkwt-umk-banner'), 'Contract modal UMK guide banner must be removed');
  assert.ok(!contractModalJs.includes('Wage &amp; UMK Compliance Rule'), 'Contract modal Section 3 must be removed');
  assert.ok(!contractModalJs.includes('name="hrName"'), 'Contract modal HR Signer Name input must be removed');
  assert.ok(!contractModalJs.includes('name="endDate"'), 'Contract modal Contract End Date input must be removed');
  assert.ok(!contractModalJs.includes('pkwt-print-frame'), 'Hidden iframe print must be replaced by DOM print stage');
  assert.ok(contractModalJs.includes('pkwt-print-stage'), 'In-page DOM print stage must exist');

  assert.match(appCss, /\.data-table th:first-child,\s*\.data-table td:first-child/, 'Global first-column freeze rule must exist');
  assert.doesNotMatch(appCss, /\.data-table[^\n]*nth-child\(2\)/, 'No .data-table second column must be frozen');
  assert.doesNotMatch(appCss, /nth-child\(2\)[^{]*\{[^}]*(position\s*:\s*sticky|left\s*:)/, 'Second column must NOT have sticky/left freeze');
});

test('PKWT print is print-only with inline Sync to Employee Directory button and zero approval queue', async () => {
  const { buildPkwtPrintPackageHtml, buildDirectContractSyncPayloads } = await import('../assets/js/contract-logic.js');
  const doc1 = '<html><head><style>@page{size:letter portrait;} .pkwt-page{width:8.5in;}</style></head><body><div class="pkwt-page">DOC 1 PKWT</div></body></html>';
  const doc2 = '<html><head><style>@page{size:letter portrait;} .pkwt-page{width:8.5in;}</style></head><body><div class="pkwt-page">DOC 2 PB</div></body></html>';
  const pkgHtml = buildPkwtPrintPackageHtml([doc1, doc2], { title: 'Hendra Wijaya — 2 Contract Documents' });

  assert.ok(pkgHtml.includes('Print / Save PDF'), 'PKWT print tab must include Print / Save PDF toolbar button');
  assert.ok(pkgHtml.includes('DOC 1 PKWT') && pkgHtml.includes('DOC 2 PB'), 'Package HTML must include all rendered documents');
  assert.equal((pkgHtml.match(/class="pkwt-print-sheet"/g) || []).length, 2, 'Package HTML must wrap each sheet separately');
  assert.ok(pkgHtml.includes('window.print()'), 'Package HTML must run foreground window.print() inside the opened tab');

  const printJs = fs.readFileSync('assets/js/print.js', 'utf8');
  assert.ok(!printJs.includes('tab.print()'), 'print.js must not invoke cross-window tab.print() from backgrounded opener');
  assert.ok(printJs.includes('print-app-toolbar'), 'Application Print tab must include explicit Print / Save PDF toolbar');

  const contractModalJs = fs.readFileSync('assets/js/contract-modal.js', 'utf8');
  assert.ok(contractModalJs.includes('buildPkwtPrintPackageHtml'), 'contract-modal.js must build print package for dedicated tab');
  assert.ok(contractModalJs.includes("window.open('', '_blank')"), 'contract-modal.js must open dedicated print tab synchronously');

  const adminJs = fs.readFileSync('assets/js/admin.js', 'utf8');
  assert.ok(!adminJs.includes('openPostPrintEmployeeUpdateModal'), 'Post-print modal must be removed');
  assert.ok(!adminJs.includes('data-approve-creq'), 'Approval panel buttons must be removed');
  assert.ok(adminJs.includes('data-sync-employee'), 'Contracts table must render inline Sync to Employee Directory button');
  assert.ok(adminJs.includes('Sync to Employee Directory'), 'Contracts table must label sync button clearly');

  const sync = buildDirectContractSyncPayloads({
    record: { queueKey: 'emp:e1', employeeId: 'e1', fullName: 'Hendra Wijaya', ktpNik: '3514122006840004' },
    config: { docSequence: '205', signingDate: '2026-11-22', durationMonths: 12, employeeNo: 'KT 205', cashWageAmount: 5500000, employeePosition: 'Senior CNC', employeeAddress: 'Pandaan' },
    payload: { docSequence: '205', signingDate: '2026-11-22', durationMonths: 12 },
    currentEmployee: { id: 'e1', employee_no: 'KT 205', full_name: 'Hendra Wijaya', position: 'CNC' },
    appliedBy: 'Diana Anita Sari'
  });
  assert.equal(sync.employeePayload.ktp_nik, '3514122006840004');
  assert.equal('employee_nik' in sync.employeePayload, false, 'employeePayload must use ktp_nik column, not employee_nik');
  assert.equal(sync.historyEntry.contractNumber, '205/PKWT/XI/2026');
  assert.equal(sync.historyEntry.status, 'applied');

  const pkwtTpl = fs.readFileSync('assets/contracts/01-pkwt.html', 'utf8');
  assert.match(pkwtTpl, /8\.27in\s+12\.6in/, '01-pkwt.html must configure 8.27in x 12.6in paper size');
  assert.ok(pkwtTpl.includes('Halaman 1 dari 3 halaman'), '01-pkwt.html must include Page 1 footer');
  assert.ok(pkwtTpl.includes('Halaman 2 dari 3 halaman'), '01-pkwt.html must include Page 2 footer');
  assert.ok(pkwtTpl.includes('Halaman 3 dari 3 halaman'), '01-pkwt.html must include Page 3 footer');
  assert.equal((pkwtTpl.match(/Paraf_______/g) || []).length, 3, '01-pkwt.html must render Paraf footer on all 3 pages');

  const masters = JSON.parse(fs.readFileSync('assets/contracts/company-masters.json', 'utf8'));
  const mbmMaster = masters.find(m => m.id === 'comp-mbm');
  const rmlMaster = masters.find(m => m.id === 'comp-rml');

  const mbmPkwt = renderAgreementHtml(pkwtTpl, buildAgreementPayload({
    docSequence: '184',
    signingDate: '2026-11-02',
    durationMonths: 6,
    employeeName: 'Agus Nur Wahid',
    employeePosition: 'Foreman Packing',
    employeeAddress: 'Dusun III Sukajai',
    cashWageAmount: 5500000
  }, mbmMaster), mbmMaster);
  assert.ok(mbmPkwt.includes('PT. MITRA BINAMANDIRI MAKMUR'));
  assert.ok(mbmPkwt.includes('mitra@mitrabina.com'));
  assert.ok(mbmPkwt.includes('industri mebel'));
  assert.ok(!mbmPkwt.includes('MORE THAN WOOD'));
  // Mitra page splits: 1.c is on Page 2, Pasal 8 is on Page 3
  const mbmPages = mbmPkwt.split('HALAMAN ');
  assert.ok(mbmPages[1].includes('1. HAK PIHAK KEDUA') && !mbmPages[1].includes('Ketentuan Undang – undang Ketenagakerjaan yang berlaku'));
  assert.ok(mbmPages[2].includes('start="3"') && mbmPages[2].includes('PASAL 7') && !mbmPages[2].includes('PASAL 8'));
  assert.ok(mbmPages[3].includes('PASAL 8') && mbmPages[3].includes('PASAL 9') && mbmPages[3].includes('PASAL 10'));

  const rmlPkwt = renderAgreementHtml(pkwtTpl, buildAgreementPayload({
    docSequence: '183',
    signingDate: '2026-11-22',
    durationMonths: 6,
    employeeName: 'Ergi Syahrial Putra',
    employeePosition: 'Site Supervisor',
    employeeAddress: 'Pekayon Rt 09 Rw 08',
    cashWageAmount: 5500000
  }, rmlMaster), rmlMaster);
  assert.ok(fs.existsSync('assets/img/logo-reholz-green.png'), 'Original ReHolz green logo asset must exist');
  assert.ok(!pkwtTpl.includes('<svg'), '01-pkwt.html must use original ReHolz PNG asset instead of rewritten SVG');
  assert.ok(rmlPkwt.includes('PT. RADIN MITRA LESTARI'));
  assert.ok(rmlPkwt.includes('logo-reholz-green.png'));
  assert.ok(rmlPkwt.includes('Jl. Raya Gununggangsir - Pandaan No. 25 RT.02 RW.05, Randupitu'));
  assert.ok(rmlPkwt.includes('(0343) 632 266'));
  assert.ok(rmlPkwt.includes('konstruksi'));
  // ReHolz page splits: 1.c on Page 1, Pasal 8 on Page 2, Pasal 9 starts Page 3
  const rmlPages = rmlPkwt.split('HALAMAN ');
  assert.ok(rmlPages[1].includes('Ketentuan Undang – undang Ketenagakerjaan yang berlaku'));
  assert.ok(rmlPages[2].includes('PASAL 7') && rmlPages[2].includes('PASAL 8'));
  assert.ok(rmlPages[3].includes('PASAL 9') && !rmlPages[3].includes('PASAL 8'));

  assert.equal(addDaysIso('2026-11-30', 1), '2026-12-01');
  assert.equal(
    resolveDefaultContractStartDate({ sourceType: 'expiring_contract', contractStartDate: '2025-12-01', contractEndDate: '2026-11-30' }),
    '2026-12-01',
    'Expiring employee default start date must be contractEndDate + 1 day'
  );
  assert.equal(
    resolveDefaultContractStartDate({ sourceType: 'final_interview', contractStartDate: '2026-12-05', workStartDate: '2026-12-05', contractEndDate: '2027-12-04' }),
    '2026-12-05',
    'Final Interview default start date must use workStartDate / contractStartDate'
  );
  assert.ok(contractModalJs.includes('bindSafeModalClose'), 'PKWT modal must guard against closing on text drag-selection');

  for (const tpl of [
    'assets/contracts/02-pb-pembayaran-upah.html',
    'assets/contracts/03-pb-pembayaran-upah-lembur.html',
    'assets/contracts/04-pb-penyelesaian-upah.html',
    'assets/contracts/05-pb-penyelesaian-lembur.html'
  ]) {
    const html = fs.readFileSync(tpl, 'utf8');
    assert.ok(!/Paraf/i.test(html), `${tpl} must not contain Paraf footer`);
    assert.ok(/letter/i.test(html), `${tpl} must configure US Letter page size`);
  }
});

test('parseDiscImportRows, Tracking XLSX export formatters, Recruitment Settings & clean /apply UI are valid', async () => {
  const {
    DISC_IMPORT_HEADERS,
    DISC_IMPORT_SAMPLE_ROW,
    parseDiscImportRows,
    buildUnifiedTrackingRows,
    buildRecruitmentConclusionSummary,
    buildTrackingExportRows,
    buildConclusionExportRows
  } = await import('../assets/js/workspace-logic.js');
  const {
    DISTRICTS_BY_CITY,
    DEFAULT_VACANCIES,
    calculateCandidateScore,
    buildStage1WhatsAppUrl,
    buildShareUrl
  } = await import('../assets/js/vacancy-logic.js');
  const {
    DEFAULT_APPLY_SCHEMA,
    DEFAULT_STAGE2_SCHEMA,
    normalizeApplySchema,
    normalizeStage2Schema
  } = await import('../assets/js/form-schema.js');

  assert.equal(DISC_IMPORT_HEADERS.length, 50);
  const discParsed = parseDiscImportRows([
    DISC_IMPORT_SAMPLE_ROW,
    { 'NIK (16 Digits)': '1234', 'Full Name': 'Invalid NIK' }
  ]);
  assert.equal(discParsed.rows.length, 1);
  assert.equal(discParsed.errors.length, 1);
  assert.equal(discParsed.rows[0].nik, '3514122006840004');
  assert.equal(discParsed.rows[0].answers.length, 24);
  assert.ok(['D', 'I', 'S', 'C'].includes(discParsed.rows[0].result.hurufDominan));

  const tRows = buildUnifiedTrackingRows({
    applicants: [{ id: 'a1', full_name: 'Faisal', nik: '3514122006840004', position: 'Spray', stage: 'disc_completed', created_at: '2026-11-20T01:00:00Z', disc_submissions: [{ completed_at: '2026-11-20T02:00:00Z' }] }],
    stage1Leads: [{ id: 's1', full_name: 'Faisal', position: 'Spray', source: 'Instagram', created_at: '2026-11-19T01:00:00Z' }],
    interviews: [],
    employees: [],
    invitedCandidates: []
  });
  const exportedTracking = buildTrackingExportRows(tRows);
  assert.equal(exportedTracking.length, 1);
  assert.equal(exportedTracking[0]['Candidate Name'], 'Faisal');
  assert.equal(exportedTracking[0].Position, 'Spray');

  const summary = buildRecruitmentConclusionSummary({
    positions: ['Spray'],
    cvScreenings: [{ position: 'Spray', screening_count: 5 }],
    invitedCandidates: [],
    stage1Leads: [],
    applicants: [{ id: 'a1', full_name: 'Faisal', nik: '3514122006840004', position: 'Spray', stage: 'disc_completed', disc_submissions: [{ completed_at: '2026-11-20T02:00:00Z' }] }],
    interviews: [],
    employees: []
  });
  const exportedSummary = buildConclusionExportRows(summary);
  assert.ok(exportedSummary.length >= 2);
  assert.equal(exportedSummary[0].Position, 'Spray');
  assert.equal(exportedSummary[0]['CV Screening'], 5);
  assert.equal(exportedSummary[exportedSummary.length - 1].No, 'TOTAL');

  assert.ok(Object.keys(DISTRICTS_BY_CITY).includes('Pasuruan'));
  const spray = DEFAULT_VACANCIES.find(v => v.name === 'Spray');
  const scored = calculateCandidateScore(spray, 'Pasuruan', 'Bangil', {});
  assert.ok(scored.locationScore >= 0);
  assert.ok(scored.totalScore >= 0);

  const waUrl = buildStage1WhatsAppUrl({
    name: 'Fasial',
    position: 'Spray',
    city: 'Pasuruan',
    district: 'Bangil',
    experience: {
      'Pernah nyepray apa?': 'Kayu',
      'Pengalamannya di mana?': 'pirknr'
    }
  }, null, null, '29df58ea-cd3e-4b7a-86fa-dfcc81f5a127', '6281234567890');
  const waText = decodeURIComponent(waUrl.split('text=')[1] || '');
  assert.ok(waText.includes('Yth. HRD\nPT. MITRA BINAMANDIRI MAKMUR'));
  assert.ok(waText.includes('Nama kandidat: Fasial'));
  assert.ok(waText.includes('PENGALAMAN KERJA\n* Pernah nyepray apa?: Kayu'));
  assert.ok(waText.includes('Referensi: 29df58ea-cd3e-4b7a-86fa-dfcc81f5a127\n\nTerimakasih'));

  assert.ok(buildShareUrl('https://example.com/apply/', 'Spray', 'Instagram').includes('posisi=Spray'));
  assert.equal(normalizeApplySchema(DEFAULT_APPLY_SCHEMA).fields.length, 5);
  assert.ok(normalizeStage2Schema(DEFAULT_STAGE2_SCHEMA).positions.length >= 5);

  const applyHtml = fs.readFileSync('apply/index.html', 'utf8');
  assert.ok(applyHtml.includes('Lamaran Berhasil Terkirim'));
  assert.ok(applyHtml.includes('WAJIB KONFIRMASI WA'));
  assert.ok(applyHtml.includes('Konfirmasi WhatsApp HR'));
  assert.ok(!applyHtml.includes('#016172') && !applyHtml.includes('#FBF9EA'));

  const adminJs = fs.readFileSync('assets/js/admin.js', 'utf8');
  assert.ok(!adminJs.includes('emsifa.com'), 'Desktop admin must never call emsifa.com');
  assert.ok(adminJs.includes('renderRecruitmentSettings'), 'Desktop admin must include Recruitment Settings');

  const applicantJs = fs.readFileSync('assets/js/applicant.js', 'utf8');
  assert.ok(applicantJs.includes('MAX_REGION_CACHE_ENTRIES'), 'Mobile /form/ must enforce bounded region cache');

  assert.equal(fs.existsSync('karir-main'), false, 'Legacy /karir-main directory must be removed');
  assert.equal(fs.existsSync('HRIS-MBM-HTML-Kit (1)'), false, 'Legacy HRIS kit folder must be removed');
  if (fs.existsSync('public')) {
    assert.ok(fs.existsSync('public/assets/aistudio'), 'Public folder may only exist when holding system-managed attachments');
  }
});


