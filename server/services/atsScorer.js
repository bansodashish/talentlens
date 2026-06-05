/**
 * Classic Keyword-Match ATS Scorer (Taleo / iCIMS style)
 *
 * Deterministic — no LLM. Given:
 *   - resumeText:    extracted plain text from CV
 *   - jobDescription full JD text
 *   - mustHave:      array of must-have keywords (optional; auto-parsed if absent)
 *   - niceToHave:    array of nice-to-have keywords (optional; auto-parsed if absent)
 *
 * Returns a result matching the existing screening shape:
 *   { name, email, phone, currentRole, yearsExperience, keySkills,
 *     supplyChainScore, procurementScore, logisticsScore, technologyScore,
 *     overallScore, recommendation, summary,
 *     // ATS-specific extras (raw):
 *     matchedMustHave, missingMustHave, matchedNiceToHave, missingNiceToHave }
 *
 * Sub-score mapping (re-uses existing DB columns):
 *   supplyChainScore → Must-have skills match %     (weight 60)
 *   procurementScore → Nice-to-have match %         (weight 20)
 *   logisticsScore   → Title / Role match %         (weight 10)
 *   technologyScore  → Years-of-experience match %  (weight 10)
 *
 * Missing must-haves apply a SOFT PENALTY: each missing must-have reduces
 * the must-have component proportionally (already implicit in matched/total)
 * AND an additional 5 pts per missing must-have are subtracted from the
 * overall score (capped so the overall never goes below 0).
 */

// ───── Helpers ──────────────────────────────────────────────────────────────

function normalize(text) {
  return (text || '').toLowerCase();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple plural/singular variants (skill → skills, manager → managers, etc.)
function variantsOf(kw) {
  const k = kw.trim();
  if (!k) return [];
  const out = new Set([k]);
  if (k.endsWith('s')) out.add(k.slice(0, -1));
  else out.add(k + 's');
  // common doubles
  if (k.endsWith('y') && k.length > 2) {
    out.add(k.slice(0, -1) + 'ies');
  }
  return [...out];
}

/**
 * True if `keyword` (case-insensitive, word-boundary aware) appears in `text`.
 * Multi-word keywords are matched as a phrase. Singular/plural normalised.
 */
function keywordPresent(keyword, normalisedText) {
  const variants = variantsOf(keyword);
  for (const v of variants) {
    // For multi-word, do a simple substring check (avoids regex word-boundary
    // issues with "&", "/", "+", "-", etc. common in tech keywords).
    if (/\s/.test(v)) {
      if (normalisedText.includes(v.toLowerCase())) return true;
    } else {
      const re = new RegExp(`\\b${escapeRegex(v.toLowerCase())}\\b`, 'i');
      if (re.test(normalisedText)) return true;
    }
  }
  return false;
}

// ───── JD section parsing ──────────────────────────────────────────────────

const MUST_HEADERS = [
  'must have', 'must-have', 'must haves',
  'required', 'requirements', 'requirement',
  'essential', 'essentials', 'essential skills',
  'mandatory', 'minimum qualifications', 'qualifications',
  'what you need', 'what you bring', 'who you are',
  'key skills', 'key requirements',
];

const NICE_HEADERS = [
  'nice to have', 'nice-to-have', 'nice to haves',
  'preferred', 'preferred qualifications', 'preferred skills',
  'bonus', 'bonus points', 'plus', 'a plus',
  'desirable', 'good to have', 'good-to-have',
  'extras', 'additional', 'optional',
];

// Stopwords removed from auto-extracted keywords
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'are', 'will', 'have', 'has',
  'you', 'our', 'your', 'their', 'they', 'from', 'into', 'been', 'role',
  'team', 'work', 'works', 'working', 'including', 'across', 'within',
  'between', 'ensure', 'manage', 'managing', 'managed',
  'required', 'must', 'ideal', 'candidate', 'looking', 'strong', 'excellent',
  'great', 'good', 'high', 'level', 'years', 'year', 'experience',
  'ability', 'able', 'understanding', 'knowledge', 'familiarity', 'familiar',
  'using', 'use', 'used', 'such', 'etc', 'also', 'who', 'what', 'when',
  'how', 'where', 'why', 'about', 'over', 'under', 'while', 'than', 'then',
  'some', 'any', 'all', 'each', 'every', 'most', 'more', 'less',
  'plus', 'bonus', 'preferred', 'optional',
]);

/**
 * Pull bullet/line items out of a block of text.
 * Recognises bullets (•, -, *, ·, ▪, ◦), numbered lists, and plain lines.
 */
function linesOf(block) {
  return block
    .split(/\n+/)
    .map(l => l.replace(/^[\s\u2022\-\*\u00b7\u25aa\u25e6•·]+/, '').trim())
    .filter(l => l.length >= 2);
}

/**
 * Extract candidate keyword phrases from a line.
 * - Strips leading "Years of …", "X+ years", etc.
 * - Splits on commas / semicolons / " and " / " or " / " / ".
 * - Keeps 1-3 word phrases, lowercase, stopwords removed.
 */
function keywordsFromLine(line) {
  let s = line.toLowerCase()
    .replace(/^\d+\+?\s*years?\s*(of\s*)?(experience\s*(in|with)?)?\s*/i, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-');
  // Split into candidate phrases on common separators
  const parts = s.split(/,|;|\sand\s|\sor\s|\s\/\s|\|/);
  const out = [];
  for (let p of parts) {
    p = p.trim().replace(/\.$/, '').trim();
    // Drop verbs/phrases longer than 4 words — likely sentences, not skills
    const words = p.split(/\s+/);
    if (!words.length || words.length > 4) continue;
    // Skip if dominated by stopwords
    const meaningful = words.filter(w => !STOPWORDS.has(w) && w.length > 1);
    if (meaningful.length === 0) continue;
    if (p.length < 2 || p.length > 60) continue;
    out.push(p);
  }
  return out;
}

/**
 * Find the text block that follows a header line until the next header or blank.
 * Returns the block text, or '' if not found.
 */
function blockAfterHeader(jd, headers) {
  const lowered = jd.toLowerCase();
  for (const h of headers) {
    // Match header at start-of-line, optionally followed by ":" / "-"
    const re = new RegExp(`(^|\\n)\\s*${escapeRegex(h)}\\s*[:\\-\\u2013\\u2014]?\\s*\\n`, 'i');
    const m = lowered.match(re);
    if (!m) continue;
    const start = m.index + m[0].length;
    // Stop at the next known header (must or nice), or 2-blank-line gap
    const after = jd.slice(start);
    const stopRe = new RegExp(
      `\\n\\s*(${[...MUST_HEADERS, ...NICE_HEADERS]
        .map(escapeRegex)
        .join('|')})\\s*[:\\-\\u2013\\u2014]?\\s*\\n`,
      'i'
    );
    const stopMatch = after.match(stopRe);
    const block = stopMatch ? after.slice(0, stopMatch.index) : after.slice(0, 1500);
    return block;
  }
  return '';
}

/**
 * Public: parse a JD into { mustHave: [], niceToHave: [] }.
 * Falls back to a frequency-based keyword pull if no clear sections exist.
 */
function parseJdSections(jd) {
  const must = new Set();
  const nice = new Set();

  const mustBlock = blockAfterHeader(jd, MUST_HEADERS);
  const niceBlock = blockAfterHeader(jd, NICE_HEADERS);

  for (const line of linesOf(mustBlock))
    for (const kw of keywordsFromLine(line)) must.add(kw);

  for (const line of linesOf(niceBlock))
    for (const kw of keywordsFromLine(line)) nice.add(kw);

  // Fallback: if we found nothing, pull capitalised / acronym-style tokens
  if (must.size === 0 && nice.size === 0) {
    const tokens = jd
      .replace(/[()[\]{}]/g, ' ')
      .split(/\n|,|;|\s\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 2 && s.length <= 40);
    for (const t of tokens) {
      const l = t.toLowerCase();
      const words = l.split(/\s+/);
      if (words.length > 3) continue;
      const meaningful = words.filter(w => !STOPWORDS.has(w) && w.length > 1);
      if (!meaningful.length) continue;
      // Looks skill-ish if has an acronym, slash, or known tech punctuation
      if (/[a-z0-9]{2,}/.test(l) && /[a-z]/.test(l)) must.add(l);
      if (must.size >= 15) break;
    }
  }

  // De-dupe across buckets — must-haves win
  for (const k of must) nice.delete(k);

  return {
    mustHave:   [...must].slice(0, 25),
    niceToHave: [...nice].slice(0, 25),
  };
}

// ───── Contact / metadata extraction (kept identical to local scorer) ──────

function extractContact(text) {
  const emailMatch = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const name = lines.find(l =>
    l.length < 60 && !/@|\d{4,}|http/i.test(l) && /[A-Za-z]/.test(l)
  ) || '';
  return {
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0].trim() : '',
    name,
  };
}

function extractYears(text) {
  const m = text.match(/(\d{1,2})\+?\s*years?(?:\s+of)?\s+experience/i);
  if (m) return Number(m[1]);
  // Fallback: scan any "X years" pattern, take the max
  const all = (text.match(/(\d{1,2})\+?\s*years?/gi) || []).map(s => parseInt(s, 10));
  return all.length ? Math.max(...all.filter(n => n <= 50)) : 0;
}

function extractCurrentRole(text) {
  // Look for explicit "Current Role:" or first job title line near the top
  const m = text.match(/(?:current role|title|position)\s*[:\-]\s*([^\n]{2,60})/i);
  if (m) return m[1].trim();
  return '';
}

function extractRequiredYears(jd) {
  const m = jd.match(/(\d{1,2})\+?\s*years?(?:\s+of)?\s+(?:relevant\s+)?(?:work\s+)?(?:experience|exp)/i);
  return m ? Number(m[1]) : null;
}

// ───── ATS scoring core ────────────────────────────────────────────────────

const WEIGHTS = {
  mustHave:    60,
  niceToHave:  20,
  title:       10,
  experience:  10,
};

const MISSING_MUST_PENALTY_PTS = 5; // additional flat penalty per missing must-have

function scoreKeywordBucket(keywords, resumeNorm) {
  if (!keywords || !keywords.length) {
    return { score: 0, matched: [], missing: [], pct: 0 };
  }
  const matched = [];
  const missing = [];
  for (const kw of keywords) {
    if (keywordPresent(kw, resumeNorm)) matched.push(kw);
    else missing.push(kw);
  }
  const pct = Math.round((matched.length / keywords.length) * 100);
  return { score: pct, matched, missing, pct };
}

function scoreTitleMatch(jd, resumeNorm) {
  // Extract the JD job title from the first 2 lines, OR after "Job Title:" header
  let title = '';
  const m1 = jd.match(/job\s*title\s*[:\-]\s*([^\n]{2,60})/i);
  if (m1) title = m1[1].trim();
  else {
    const firstLines = jd.split(/\n/).map(l => l.trim()).filter(Boolean).slice(0, 3);
    title = firstLines.find(l => l.length <= 60 && /[a-z]/i.test(l) && !/[:.,]/.test(l)) || firstLines[0] || '';
  }
  if (!title) return { score: 50, jdTitle: '', resumeMatch: false };

  const titleNorm = title.toLowerCase();
  // Pull out 1-3 word phrases from the title
  const words = titleNorm.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (!words.length) return { score: 50, jdTitle: title, resumeMatch: false };

  // Score = fraction of title words that appear in the resume (capped 0-100)
  let hits = 0;
  for (const w of words) {
    if (new RegExp(`\\b${escapeRegex(w)}s?\\b`).test(resumeNorm)) hits++;
  }
  const pct = Math.round((hits / words.length) * 100);
  return { score: pct, jdTitle: title, resumeMatch: pct >= 60 };
}

function scoreExperience(jd, resumeText) {
  const required = extractRequiredYears(jd);
  const actual   = extractYears(resumeText);
  if (required === null) return { score: 70, required: null, actual };
  if (actual >= required)         return { score: 100, required, actual };
  if (actual >= required * 0.75)  return { score: 80,  required, actual };
  if (actual >= required * 0.5)   return { score: 55,  required, actual };
  if (actual > 0)                 return { score: 30,  required, actual };
  return { score: 10, required, actual };
}

/**
 * Main entrypoint.
 */
function scoreCandidate({ resumeText, jobDescription, mustHave, niceToHave }) {
  if (!resumeText || resumeText.trim().length < 20) {
    return {
      name: '', email: '', phone: '', currentRole: '', yearsExperience: 0,
      keySkills: [],
      supplyChainScore: 0, procurementScore: 0, logisticsScore: 0, technologyScore: 0,
      overallScore: 0,
      recommendation: 'Reject',
      summary: 'Could not extract enough readable text from this CV to score it.',
      matchedMustHave: [], missingMustHave: mustHave || [],
      matchedNiceToHave: [], missingNiceToHave: niceToHave || [],
    };
  }

  // Auto-parse JD if buckets not supplied
  if (!Array.isArray(mustHave) || !mustHave.length || !Array.isArray(niceToHave)) {
    const parsed = parseJdSections(jobDescription || '');
    if (!Array.isArray(mustHave) || !mustHave.length) mustHave = parsed.mustHave;
    if (!Array.isArray(niceToHave)) niceToHave = parsed.niceToHave;
  }

  // Clean + de-dup user input
  mustHave   = [...new Set((mustHave   || []).map(s => String(s).trim().toLowerCase()).filter(Boolean))];
  niceToHave = [...new Set((niceToHave || []).map(s => String(s).trim().toLowerCase()).filter(Boolean))];
  // Remove nice-to-haves that are duplicates of must-haves
  const mustSet = new Set(mustHave);
  niceToHave = niceToHave.filter(k => !mustSet.has(k));

  const resumeNorm = normalize(resumeText);

  const mustResult = scoreKeywordBucket(mustHave,   resumeNorm);
  const niceResult = scoreKeywordBucket(niceToHave, resumeNorm);
  const titleResult = scoreTitleMatch(jobDescription || '', resumeNorm);
  const expResult   = scoreExperience(jobDescription || '', resumeText);

  // Weighted overall (0-100)
  let overall =
    (mustResult.pct  * WEIGHTS.mustHave +
     niceResult.pct  * WEIGHTS.niceToHave +
     titleResult.score * WEIGHTS.title +
     expResult.score   * WEIGHTS.experience) / 100;

  // Soft penalty: each missing must-have removes a flat number of points
  overall -= mustResult.missing.length * MISSING_MUST_PENALTY_PTS;
  overall = Math.max(0, Math.min(100, Math.round(overall)));

  // Recommendation thresholds
  let recommendation;
  if (overall >= 75)      recommendation = 'Strong Hire';
  else if (overall >= 55) recommendation = 'Consider';
  else                    recommendation = 'Reject';

  // Summary
  const summaryParts = [];
  summaryParts.push(
    `ATS keyword match: ${mustResult.matched.length}/${mustHave.length} must-have, ` +
    `${niceResult.matched.length}/${niceToHave.length} nice-to-have.`
  );
  if (titleResult.jdTitle) {
    summaryParts.push(
      titleResult.resumeMatch
        ? `Title alignment with "${titleResult.jdTitle}" is strong.`
        : `Title "${titleResult.jdTitle}" not clearly reflected in the CV.`
    );
  }
  if (expResult.required) {
    summaryParts.push(
      expResult.actual >= expResult.required
        ? `Experience: ${expResult.actual} yrs meets the ${expResult.required}+ required.`
        : `Experience: ${expResult.actual} yrs vs ${expResult.required}+ required.`
    );
  }
  if (mustResult.missing.length) {
    summaryParts.push(
      `Missing must-haves: ${mustResult.missing.slice(0, 5).join(', ')}` +
      (mustResult.missing.length > 5 ? `, +${mustResult.missing.length - 5} more.` : '.')
    );
  }

  const contact = extractContact(resumeText);

  return {
    name:            contact.name || '',
    email:           contact.email,
    phone:           contact.phone,
    currentRole:     extractCurrentRole(resumeText),
    yearsExperience: expResult.actual,
    keySkills:       mustResult.matched.slice(0, 12),
    // Map to existing DB columns
    supplyChainScore: mustResult.pct,
    procurementScore: niceResult.pct,
    logisticsScore:   titleResult.score,
    technologyScore:  expResult.score,
    overallScore:     overall,
    recommendation,
    summary: summaryParts.join(' '),
    // ATS extras
    matchedMustHave:    mustResult.matched,
    missingMustHave:    mustResult.missing,
    matchedNiceToHave:  niceResult.matched,
    missingNiceToHave:  niceResult.missing,
    jdTitle:            titleResult.jdTitle,
    requiredYears:      expResult.required,
  };
}

module.exports = {
  parseJdSections,
  scoreCandidate,
  WEIGHTS,
};
