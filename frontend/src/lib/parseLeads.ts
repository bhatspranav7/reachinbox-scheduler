const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface ParsedLeads {
  emails: string[];
  duplicates: number;
}

/**
 * Extracts email addresses from a CSV or plain-text file. Works regardless of
 * column order/headers: any cell or line containing an address counts.
 */
export function parseLeads(text: string): ParsedLeads {
  const found = (text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase().replace(/\.+$/, ""));
  const unique = [...new Set(found)];
  return { emails: unique, duplicates: found.length - unique.length };
}
