export interface ScoreResult {
  newScore: number;
  delta: number;
  reasons: string[];
}

const FACTUAL_PATTERNS = [
  /\b\d{1,3}([.,]\d+)?%/g,           // percentages
  /\b\d{4}-\d{2}-\d{2}\b/g,          // ISO dates
  /\$\s?\d{1,3}(?:[.,]\d+)?[KMB]?/g, // currency
  /"[^"]{6,}"/g,                     // quoted phrases
  /\b(?:on|in|at)\s+\d{1,2}(?:st|nd|rd|th)?\s+\w+/gi, // date prepositions
];

const RED_FLAGS = [
  { pattern: /[A-Z\s!?]{20,}/, weight: -15, label: 'shouting/all-caps' },
  { pattern: /!{3,}/, weight: -10, label: 'excessive exclamation' },
  { pattern: /\bobviously\b|\beveryone knows\b/gi, weight: -8, label: 'unsupported assertion' },
  { pattern: /\b(?:fake|hoax|lie|liar)\b/gi, weight: -5, label: 'inflammatory language' },
];

/**
 * Deterministic heuristic scoring. Stand-in for a real LLM — same call shape
 * so swapping in `await callAnthropic(...)` is a single-line change.
 */
export function scoreContent(content: string, currentScore: number): ScoreResult {
  const reasons: string[] = [];
  let delta = 0;

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { newScore: Math.max(0, currentScore - 30), delta: -30, reasons: ['empty post'] };
  }

  // Length band: 50-2000 chars suggests deliberate writing.
  if (trimmed.length >= 50 && trimmed.length <= 2000) {
    delta += 10;
    reasons.push('substantive length (+10)');
  } else if (trimmed.length < 50) {
    delta -= 5;
    reasons.push('very short post (-5)');
  }

  // Factual markers: dates, numbers, quotes.
  let factualHits = 0;
  for (const pattern of FACTUAL_PATTERNS) {
    const matches = trimmed.match(pattern);
    if (matches) factualHits += matches.length;
  }
  if (factualHits > 0) {
    const factualBonus = Math.min(20, factualHits * 5);
    delta += factualBonus;
    reasons.push(`${factualHits} factual marker(s) (+${factualBonus})`);
  }

  // Red flags.
  for (const flag of RED_FLAGS) {
    if (flag.pattern.test(trimmed)) {
      delta += flag.weight;
      reasons.push(`${flag.label} (${flag.weight})`);
    }
  }

  const newScore = clamp(currentScore + delta, 0, 100);
  return { newScore, delta, reasons };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
