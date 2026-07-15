/**
 * Best-effort extraction of the job title/position being hired for from a
 * free-text job description — shown as "Role" in the History tab (what a
 * batch was screened for), as opposed to a candidate's own current_role
 * from their CV.
 *
 * This is used as a fallback/backfill heuristic only. The primary source of
 * truth is the recruiter-entered "Job Title" field on the Screen page
 * (sent as `job_title` in the /api/screen/resume request) — this function
 * should never override an explicitly provided title.
 */

const ROLE_NOUNS = [
  'Engineer', 'Manager', 'Developer', 'Analyst', 'Specialist', 'Director',
  'Lead', 'Architect', 'Designer', 'Coordinator', 'Officer', 'Consultant',
  'Executive', 'Administrator', 'Representative', 'Scientist', 'Recruiter',
  'Planner', 'Technician', 'Strategist', 'Associate', 'Supervisor',
];
const ROLE_NOUN_PATTERN = ROLE_NOUNS.join('|');

function extractJobTitle(jobDescription) {
  if (!jobDescription) return '';

  // Strip markdown heading markers and collapse leading blank lines so a
  // JD like "# Backend Engineer\n\nAbout the role…" is handled the same as
  // a plain-text one.
  const text = jobDescription
    .replace(/^\s*#{1,6}\s*/gm, '')
    .trim();

  // Explicit "Job Title:" / "Position:" / "Role:" / "Vacancy:" label
  // anywhere in the JD.
  const labelMatch = text.match(
    /(?:job\s*title|position(?:\s*title)?|role(?:\s*title)?|vacancy|job\s*role)\s*[:\-]\s*([^\n]{2,80})/i
  );
  if (labelMatch) return labelMatch[1].trim();

  // "hiring a/an X", "seeking a/an X to join", "looking for a/an X",
  // "join us as a/an X", "now hiring a/an X", "for the position of X".
  const hiringMatch = text.match(
    /(?:hiring|seeking|looking for|now hiring|join us as|for the position of)\s+(?:an?\s+)?([A-Z][A-Za-z0-9/&,\-\s]{2,60}?)(?:\s+to\s+join|\s+who|[.,\n])/i
  );
  if (hiringMatch) return hiringMatch[1].trim();

  // Fall back to the first non-empty line if it reads like a title (short,
  // no trailing sentence punctuation).
  const firstLine = text.split('\n').map(l => l.trim()).find(Boolean) || '';
  if (firstLine && firstLine.length <= 80 && !/[.!?]$/.test(firstLine)) {
    return firstLine.replace(/^(job title|position|role)\s*[:\-]\s*/i, '').trim();
  }

  // Last resort: JDs pasted as one unbroken paragraph (no line breaks
  // preserved, common when copied from a job board) won't match the first-
  // line check above. Scan the first ~300 chars for a short Title-Case
  // phrase (2-6 words) ending in a common role noun.
  const head = text.slice(0, 300);
  const nounScan = head.match(
    new RegExp(`([A-Z][A-Za-z]+(?:\\s+(?:of|and|&)?\\s*[A-Za-z]+){0,5}\\s+(?:${ROLE_NOUN_PATTERN}))\\b`)
  );
  if (nounScan) return nounScan[1].trim();

  return '';
}

module.exports = { extractJobTitle };
