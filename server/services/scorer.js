/**
 * Local CV Scoring Engine — Supply Chain Edition
 *
 * Scores a resume against a job description and optional target role.
 * Returns a structured result with score (0-1), rating (1-5), strengths, and gaps.
 *
 * Ported and extended from job_hunt/backend, with a complete Supply Chain
 * role library replacing the original tech-only roles.
 */

// ─── Supply Chain Role Library ───────────────────────────────────────────────
const ROLES = {
  supply_chain_manager: {
    title: 'Supply Chain Manager',
    skills: [
      'supply chain', 'end-to-end', 's&op', 'siop', 'integrated business planning', 'ibp',
      'sap', 'oracle', 'jde', 'jd edwards', 'netsuite', 'dynamics', 'epicor', 'infor',
      'kinaxis', 'blue yonder', 'jda', 'anaplan', 'sap ibp', 'sap apo', 'e2open',
      'demand forecasting', 'inventory management', 'procurement', 'logistics', 'warehousing',
      'supplier management', 'vendor management', 'cost reduction', 'lead time',
      'lean', 'six sigma', 'kaizen', 'scor', 'continuous improvement',
      'otif', 'difot', 'inventory turns', 'service level', 'working capital',
      'cross-functional', 'stakeholder management', 'budget management', 'p&l',
    ],
    titlePatterns: ['supply chain manager', 'supply chain director', 'head of supply chain', 'vp supply chain', 'scm director'],
  },
  logistics_manager: {
    title: 'Logistics Manager',
    skills: [
      'logistics', 'transportation', 'freight', '3pl', 'third party logistics', 'last mile',
      'tms', 'transport management system', 'fleet management', 'route optimisation', 'route optimization',
      'customs', 'import', 'export', 'incoterms', 'freight forwarding', 'customs clearance',
      'cold chain', 'cross docking', 'distribution', 'network design', 'network optimisation',
      'carrier management', 'parcel', 'courier', 'last mile delivery',
      'sea freight', 'air freight', 'road freight', 'intermodal',
      'sap tm', 'oracle tms', 'mercurygate', 'manhattan',
    ],
    titlePatterns: ['logistics manager', 'transport manager', 'distribution manager', 'head of logistics', 'freight manager'],
  },
  procurement_manager: {
    title: 'Procurement Manager',
    skills: [
      'procurement', 'sourcing', 'strategic sourcing', 'category management', 'category strategy',
      'supplier development', 'vendor management', 'supplier management', 'contract management',
      'spend analysis', 'cost savings', 'cost avoidance', 'negotiation', 'rfp', 'rfi', 'rfq', 'tender',
      'ariba', 'coupa', 'jaggaer', 'ivalua', 'gep', 'oracle procurement',
      'cips', 'cpim', 'cscp', 'mcips',
      'nda', 'msa', 'purchase order', 'sla', 'contract',
      'supplier risk', 'supplier diversity', 'tail spend', 'maverick spend',
      'indirect procurement', 'direct procurement', 'capex', 'opex',
      'make vs buy', 'total cost of ownership', 'tco',
    ],
    titlePatterns: ['procurement manager', 'category manager', 'sourcing manager', 'purchasing manager', 'head of procurement', 'cpO'],
  },
  demand_planner: {
    title: 'Demand Planner',
    skills: [
      'demand planning', 'demand forecasting', 'statistical forecasting', 'forecast accuracy',
      's&op', 'siop', 'consensus forecast', 'sales forecasting',
      'mape', 'mae', 'bias', 'statistical model', 'time series',
      'sap apo', 'sap ibp', 'kinaxis', 'blue yonder', 'jda', 'anaplan', 'demand solutions', 'logility',
      'excel', 'power bi', 'tableau', 'python', 'r', 'sql',
      'new product introduction', 'npi', 'product lifecycle', 'sku rationalisation',
      'promotional planning', 'seasonality', 'sell-through',
      'safety stock', 'reorder point', 'abc analysis', 'xyz analysis', 'days of supply',
    ],
    titlePatterns: ['demand planner', 'demand analyst', 'forecasting analyst', 'demand planning manager', 'demand & supply planner'],
  },
  supply_planner: {
    title: 'Supply Planner',
    skills: [
      'supply planning', 'production planning', 'mrp', 'mps', 'master production schedule',
      'capacity planning', 'finite scheduling', 'rough cut capacity planning', 'rccp',
      'inventory planning', 'safety stock', 'reorder point', 'lot sizing', 'eoq',
      'sap', 'oracle', 'jde', 'kinaxis', 'blue yonder', 'infor',
      'manufacturing', 'shop floor', 'work in progress', 'wip', 'finished goods',
      'supplier scheduling', 'purchase requisition', 'purchase order', 'po management',
      'bom', 'bill of materials', 'routing', 'work order', 'planned order',
    ],
    titlePatterns: ['supply planner', 'production planner', 'materials planner', 'mrp planner', 'supply planning manager'],
  },
  warehouse_manager: {
    title: 'Warehouse Manager',
    skills: [
      'warehouse management', 'wms', 'warehouse management system',
      'inventory control', 'cycle counting', 'stocktaking', 'perpetual inventory',
      'picking', 'packing', 'putaway', 'receiving', 'goods in', 'goods out', 'dispatch',
      'team management', 'kpi', 'labour management', 'workforce management',
      'manhattan associates', 'sap ewm', 'oracle wms', 'highjump', 'korber', 'infor wms',
      'forklift', 'reach truck', 'pallet racking', 'very narrow aisle', 'vna',
      'health and safety', 'coshh', 'fire safety', 'risk assessment',
      'shrinkage', 'stock accuracy', 'space utilisation', 'pick accuracy',
      'lean', 'kaizen', '5s', 'continuous improvement',
    ],
    titlePatterns: ['warehouse manager', 'distribution centre manager', 'dc manager', 'fulfilment manager', 'head of warehouse'],
  },
  inventory_manager: {
    title: 'Inventory Manager',
    skills: [
      'inventory management', 'stock management', 'inventory control', 'stock control',
      'cycle counting', 'stocktaking', 'physical inventory', 'perpetual inventory',
      'abc analysis', 'xyz analysis', 'slow moving', 'dead stock', 'obsolescence',
      'reorder point', 'safety stock', 'min max', 'eoq', 'economic order quantity',
      'stock accuracy', 'inventory turns', 'days of supply', 'dos', 'inventory value',
      'shrinkage', 'write-off', 'obsolete stock', 'excess and obsolete', 'e&o',
      'sap', 'oracle', 'netsuite', 'dynamics', 'infor',
      'excel', 'vlookup', 'pivot table', 'power bi',
    ],
    titlePatterns: ['inventory manager', 'stock manager', 'inventory controller', 'inventory analyst', 'inventory planner'],
  },
  operations_manager: {
    title: 'Operations Manager',
    skills: [
      'operations management', 'operational excellence', 'continuous improvement', 'process improvement',
      'lean manufacturing', 'six sigma', 'kaizen', 'value stream mapping', 'vsm', '5s',
      'kpi', 'sla', 'performance management', 'budgeting', 'p&l', 'cost management',
      'team management', 'workforce planning', 'headcount', 'hr',
      'standard operating procedure', 'sop', 'iso', 'quality management',
      'oee', 'uptime', 'yield', 'throughput', 'cycle time',
      'health and safety', 'risk management', 'compliance',
      'multi-site', 'cross-functional', 'change management', 'transformation',
    ],
    titlePatterns: ['operations manager', 'head of operations', 'director of operations', 'vp operations', 'coo', 'general manager'],
  },
  supply_chain_analyst: {
    title: 'Supply Chain Analyst',
    skills: [
      'supply chain analytics', 'data analysis', 'reporting', 'dashboards', 'kpi reporting',
      'sql', 'excel', 'vba', 'power bi', 'tableau', 'qlik', 'python', 'r', 'alteryx',
      'erp', 'sap', 'oracle', 'netsuite',
      'kpi tracking', 'root cause analysis', 'process mapping', 'vsm', 'swim lane',
      'network optimisation', 'simulation', 'scenario planning', 'what-if analysis',
      'cost to serve', 'landed cost', 'total cost of ownership', 'tco',
      'inventory analysis', 'supplier performance', 'spend analytics',
    ],
    titlePatterns: ['supply chain analyst', 'operations analyst', 'logistics analyst', 'business analyst', 'data analyst supply chain'],
  },
  category_manager: {
    title: 'Category Manager',
    skills: [
      'category management', 'category strategy', 'strategic sourcing', 'procurement',
      'supplier management', 'supplier development', 'vendor management',
      'spend analysis', 'market analysis', 'benchmarking', 'price analysis',
      'negotiation', 'rfp', 'rfq', 'tender management', 'contract management',
      'ariba', 'coupa', 'jaggaer',
      'cips', 'mcips', 'cpim',
      'indirect', 'direct', 'raw materials', 'packaging', 'mro',
      'value engineering', 'total cost of ownership', 'should cost',
    ],
    titlePatterns: ['category manager', 'senior category manager', 'category director', 'head of category', 'strategic buyer'],
  },
};

// ─── Tech/General Roles (kept for versatility) ─────────────────────────────
const GENERAL_ROLES = {
  project_manager: {
    title: 'Project Manager',
    skills: [
      'project management', 'programme management', 'pmp', 'prince2', 'agile', 'scrum', 'waterfall',
      'stakeholder management', 'risk management', 'budget management', 'resource planning',
      'ms project', 'jira', 'confluence', 'asana', 'smartsheet',
      'change management', 'business case', 'roi', 'benefits realisation',
    ],
    titlePatterns: ['project manager', 'programme manager', 'project director', 'pmo'],
  },
};

const ALL_ROLES = { ...ROLES, ...GENERAL_ROLES };

// ─── Helpers ────────────────────────────────────────────────────────────────

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s&+#./-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

// Simple bigram + unigram keyword extractor from job description
function extractJdKeywords(jd) {
  const words = tokenize(jd);
  const common = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'are', 'will', 'have',
    'you', 'our', 'your', 'their', 'they', 'from', 'into', 'been', 'able', 'role',
    'team', 'work', 'skills', 'experience', 'required', 'must', 'ideal', 'candidate',
    'looking', 'strong', 'excellent', 'great', 'good', 'high', 'level', 'years',
    'working', 'including', 'across', 'within', 'between', 'ensure', 'manage',
  ]);

  const unigrams = words.filter(w => w.length > 3 && !common.has(w));
  // Build bigrams
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (!common.has(words[i]) && !common.has(words[i + 1])) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
  }
  return [...new Set([...bigrams, ...unigrams])].slice(0, 80);
}

function findInText(keyword, text) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

const GENERAL_SKILLS = [
  '.net', '.net core', 'agile', 'ai', 'api testing', 'appium', 'aws', 'azure',
  'azure devops', 'bash', 'bdd', 'bigquery', 'c#', 'ci/cd', 'confluence',
  'cucumber', 'cypress', 'data analysis', 'databricks', 'dbt', 'django',
  'docker', 'etl', 'excel', 'fastapi', 'flask', 'gcp', 'git', 'github',
  'github actions', 'gitlab', 'grafana', 'hibernate', 'html', 'java',
  'javascript', 'jenkins', 'jira', 'jmeter', 'junit', 'kafka', 'kubernetes',
  'linux', 'machine learning', 'microservices', 'mongodb', 'mysql', 'node.js',
  'playwright', 'postman', 'postgresql', 'power bi', 'prometheus', 'pytest',
  'python', 'qa automation', 'react', 'rest', 'robot framework', 'scrum',
  'selenium', 'snowflake', 'soap', 'spark', 'spring', 'spring boot', 'sql',
  'sql server', 'tableau', 'terraform', 'test automation', 'testng',
  'typescript', 'unit testing', 'vue',
];

const KNOWN_SKILLS = [...new Set(
  [...GENERAL_SKILLS, ...Object.values(ALL_ROLES).flatMap(role => role.skills || [])]
)].sort((a, b) => b.length - a.length);

const LOCATION_ALIASES = {
  'new york': ['nyc', 'new york city'],
  'san francisco': ['sf', 'bay area'],
  'washington': ['washington dc', 'washington d.c.', 'dc'],
  'london': ['greater london'],
  'bengaluru': ['bangalore'],
  'mumbai': ['bombay'],
  'gurugram': ['gurgaon'],
  'united states': ['usa', 'us', 'u.s.', 'u.s.a.', 'america'],
  'united kingdom': ['uk', 'u.k.', 'great britain', 'england'],
  'india': ['bharat'],
};

const KNOWN_LOCATIONS = [
  'united states', 'united kingdom', 'india', 'canada', 'australia', 'germany',
  'france', 'netherlands', 'singapore', 'uae', 'dubai', 'remote', 'hybrid',
  'onsite', 'on-site', 'new york', 'san francisco', 'los angeles', 'chicago',
  'boston', 'seattle', 'austin', 'dallas', 'atlanta', 'washington', 'london',
  'manchester', 'birmingham', 'glasgow', 'dublin', 'toronto', 'vancouver',
  'sydney', 'melbourne', 'berlin', 'munich', 'paris', 'amsterdam', 'mumbai',
  'delhi', 'new delhi', 'bengaluru', 'hyderabad', 'chennai', 'pune', 'gurugram',
  'noida', 'kolkata', 'ahmedabad',
];

function unique(values) {
  return [...new Set(values.filter(Boolean).map(v => v.trim()).filter(Boolean))];
}

function extractSkillsFromText(text) {
  const lower = (text || '').toLowerCase();
  return KNOWN_SKILLS.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9+#./-])${escaped}([^a-z0-9+#./-]|$)`, 'i');
    return re.test(lower);
  });
}

function extractRequiredJdSkills(jd) {
  const known = extractSkillsFromText(jd);
  if (known.length > 0) return unique(known).slice(0, 80);

  const extracted = extractJdKeywords(jd)
    .filter(kw => kw.length >= 3 && kw.length <= 40)
    .filter(kw => !KNOWN_LOCATIONS.includes(normalizeLocation(kw)))
    .filter(kw => !/^\d+$/.test(kw));
  return unique(extracted).slice(0, 40);
}

function scoreExperience(resumeText, jd) {
  // Look for years of experience in JD requirement
  const jdYearsMatch = jd.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/i);
  const reqYears = jdYearsMatch ? parseInt(jdYearsMatch[1]) : null;

  // Look for years of experience in resume
  const resumeYearsMatches = resumeText.match(/(\d+)\+?\s*years?/gi) || [];
  const maxYears = resumeYearsMatches.reduce((max, m) => {
    const n = parseInt(m); return n > max ? n : max;
  }, 0);

  if (!reqYears) return 0.7; // No stated requirement — neutral score
  if (maxYears >= reqYears) return 1.0;
  if (maxYears >= reqYears * 0.7) return 0.7;
  if (maxYears > 0) return 0.4;
  return 0.3;
}

function extractYearsRequirement(text) {
  const matches = [...(text || '').matchAll(/(\d{1,2})\+?\s*years?\s*(?:of\s*)?(?:relevant\s*)?(?:experience|exp)?/gi)];
  if (!matches.length) return null;
  return matches.reduce((max, m) => Math.max(max, Number(m[1]) || 0), 0) || null;
}

function extractMaxYears(text) {
  const matches = [...(text || '').matchAll(/(\d{1,2})\+?\s*years?/gi)];
  if (!matches.length) return 0;
  return matches.reduce((max, m) => Math.max(max, Number(m[1]) || 0), 0);
}

function scoreTitleMatch(resumeText, targetRole) {
  if (!targetRole || !ALL_ROLES[targetRole]) return 0.5;
  const patterns = ALL_ROLES[targetRole].titlePatterns || [];
  const text = resumeText.toLowerCase();
  const matched = patterns.filter(p => text.includes(p.toLowerCase()));
  if (matched.length === 0) return 0.3;
  if (matched.length === 1) return 0.7;
  return 1.0;
}

function normalizeLocation(value) {
  return (value || '')
    .toLowerCase()
    .replace(/\b(remote|hybrid|onsite|on-site)\b/g, ' $1 ')
    .replace(/[^a-z\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addLocationWithAliases(found, value) {
  const normalized = normalizeLocation(value);
  if (!normalized) return;
  found.add(normalized);
  for (const [canonical, aliases] of Object.entries(LOCATION_ALIASES)) {
    if (canonical === normalized || aliases.includes(normalized)) {
      found.add(canonical);
      aliases.forEach(alias => found.add(alias));
    }
  }
}

function extractLocations(text) {
  const lower = normalizeLocation(text);
  const found = new Set();

  for (const loc of KNOWN_LOCATIONS) {
    const normalized = normalizeLocation(loc);
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i').test(lower)) {
      addLocationWithAliases(found, normalized);
    }
  }

  const explicitPatterns = [
    /(?:location|located|based|base location|work location)\s*[:\-]\s*([a-zA-Z .,-]{2,80})/gi,
    /(?:based in|located in|work from|working from)\s+([a-zA-Z .,-]{2,60})/gi,
  ];
  for (const pattern of explicitPatterns) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] || '').split(/\n|\.|;|\|/)[0].split(/\s+(?:or|and)\s+/i)[0];
      addLocationWithAliases(found, value);
    }
  }

  return [...found];
}

function locationMode(text) {
  const lower = (text || '').toLowerCase();
  if (/\b(remote|work from home|wfh)\b/.test(lower)) return 'remote';
  if (/\bhybrid\b/.test(lower)) return 'hybrid';
  if (/\b(on-?site|office based|in office)\b/.test(lower)) return 'onsite';
  return '';
}

function scoreLocation(resumeText, jd) {
  const jdMode = locationMode(jd);
  const resumeMode = locationMode(resumeText);
  const jdLocations = extractLocations(jd).filter(l => !['remote', 'hybrid', 'onsite', 'on-site'].includes(l));
  const resumeLocations = extractLocations(resumeText).filter(l => !['remote', 'hybrid', 'onsite', 'on-site'].includes(l));

  if (jdMode === 'remote') {
    return { score: 1, jdLocations, resumeLocations, jdMode, resumeMode, explanation: 'JD allows remote work' };
  }

  if (!jdMode && jdLocations.length === 0) {
    return { score: 0.75, jdLocations, resumeLocations, jdMode, resumeMode, explanation: 'No clear JD location requirement' };
  }

  const matched = jdLocations.filter(loc => resumeLocations.includes(loc));
  if (matched.length > 0) {
    return { score: 1, jdLocations, resumeLocations, jdMode, resumeMode, matchedLocations: matched, explanation: `Location matched: ${matched[0]}` };
  }

  if (jdMode === 'hybrid' && resumeMode === 'hybrid') {
    return { score: 0.7, jdLocations, resumeLocations, jdMode, resumeMode, explanation: 'Both indicate hybrid work, but city was not confirmed' };
  }

  if (resumeLocations.length === 0) {
    return { score: 0.45, jdLocations, resumeLocations, jdMode, resumeMode, explanation: 'Candidate location not found in resume' };
  }

  return { score: jdMode === 'onsite' || jdMode === 'hybrid' ? 0.25 : 0.4, jdLocations, resumeLocations, jdMode, resumeMode, explanation: 'Candidate location does not match JD location' };
}

function getRatingLabel(rating) {
  const labels = { 5: 'Excellent match', 4: 'Strong match', 3: 'Good match', 2: 'Moderate match', 1: 'Weak match' };
  return labels[rating] || 'Unknown';
}

function getRecommendation(rating) {
  if (rating >= 5) return 'Highly recommended — fast-track to interview';
  if (rating >= 4) return 'Recommended — shortlist for recruiter review';
  if (rating >= 3) return 'Consider — review against other candidates';
  if (rating >= 2) return 'Below threshold — only consider if pipeline is thin';
  return 'Not recommended — significant skill gaps';
}

// ─── Main Scoring Function ───────────────────────────────────────────────────

/**
 * Score a resume against a job description.
 *
 * @param {string} resumeText   Extracted plain text from the CV
 * @param {string} jobDescription  Full job description text
 * @param {string|null} targetRole  Key from ALL_ROLES (e.g. 'supply_chain_manager')
 * @returns {object} Scoring result
 */
function scoreCandidate(resumeText, jobDescription, targetRole = null) {
  if (!resumeText || resumeText.trim().length < 20) {
    return {
      score: 0, score_pct: 0, rating: 1,
      label: 'Cannot score', recommendation: 'CV text too short or missing',
      strengths: [], gaps: ['Unable to extract CV text'],
      details: { skills: 0, experience: 0, title: 0 },
    };
  }

  const roleData = targetRole && ALL_ROLES[targetRole] ? ALL_ROLES[targetRole] : null;
  const jdSkills = extractRequiredJdSkills(jobDescription || '');
  const roleKeywords = roleData && jdSkills.length === 0 ? roleData.skills : [];

  // JD is the source of truth. Role-library skills are only a fallback for very thin JDs.
  const allKeywords = [...new Set([...jdSkills, ...roleKeywords])];

  // Skills match
  const matchedKeywords = allKeywords.filter(kw => findInText(kw, resumeText));
  const missedKeywords = allKeywords.filter(kw => !findInText(kw, resumeText));
  const skillsScore = allKeywords.length > 0 ? matchedKeywords.length / allKeywords.length : 0.5;

  // Experience match
  const expScore = scoreExperience(resumeText, jobDescription || '');

  // Location match
  const location = scoreLocation(resumeText, jobDescription || '');

  // Title match
  const titleScore = scoreTitleMatch(resumeText, targetRole);

  // Weighted final score
  const finalScore = Math.min(1, (skillsScore * 0.55) + (expScore * 0.25) + (location.score * 0.15) + (titleScore * 0.05));
  const rating = Math.max(1, Math.min(5, Math.round(finalScore * 5)));
  const scorePct = Math.round(finalScore * 100);

  // Build human-readable strengths/gaps
  const strengths = matchedKeywords
    .slice(0, 8)
    .map(kw => `Matched: ${kw}`);

  const gaps = missedKeywords
    .slice(0, 6)
    .map(kw => `Missing: ${kw}`);

  if (location.score < 0.5 && location.explanation) {
    gaps.push(location.explanation);
  }

  if (location.score >= 0.7 && location.explanation) {
    strengths.push(location.explanation);
  }

  return {
    score: Math.round(finalScore * 100) / 100,
    score_pct: scorePct,
    rating,
    label: getRatingLabel(rating),
    recommendation: getRecommendation(rating),
    strengths,
    gaps,
    details: {
      skills: Math.round(skillsScore * 100) / 100,
      experience: Math.round(expScore * 100) / 100,
      location: Math.round(location.score * 100) / 100,
      title: Math.round(titleScore * 100) / 100,
      matchedKeywords: matchedKeywords.length,
      totalKeywords: allKeywords.length,
      matchedSkills: matchedKeywords,
      missingSkills: missedKeywords,
      requiredSkills: allKeywords,
      requiredYears: extractYearsRequirement(jobDescription || ''),
      candidateYears: extractMaxYears(resumeText),
      jdLocations: location.jdLocations || [],
      candidateLocations: location.resumeLocations || [],
      jdLocationMode: location.jdMode || '',
      candidateLocationMode: location.resumeMode || '',
      locationExplanation: location.explanation || '',
    },
  };
}

/**
 * Auto-detect the most likely supply chain role from resume text.
 */
function detectRole(resumeText) {
  const text = resumeText.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const [key, role] of Object.entries(ALL_ROLES)) {
    const matched = role.skills.filter(s => text.includes(s.toLowerCase())).length;
    const titleBonus = (role.titlePatterns || []).some(p => text.includes(p)) ? 5 : 0;
    const total = matched + titleBonus;
    if (total > bestScore) { bestScore = total; best = key; }
  }
  return best;
}

module.exports = { scoreCandidate, detectRole, ALL_ROLES };
