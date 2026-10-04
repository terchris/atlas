/**
 * file: ingest/src/sources/activity-facts.ts
 * description: R10 - what each activity's own text says about cost, age, schedule, how to join,
 *              target group, language and place, each with the sentence that says it.
 * output: data/_activity-facts/activity-facts.csv  (+ a per-organisation summary on stdout)
 *
 * Keyword rules, deliberately not a model (as nks-activities.ts): transparent, reproducible,
 * reviewable. A rule only FINDS the sentence; the sentence is the evidence and is kept
 * verbatim, so a reader can see what the organisation actually wrote. A fact that no sentence
 * states is absent, never guessed.
 *
 * Quotes may name a person or carry a phone number (`contains_contact`): the file is research
 * evidence on disk, not something to paste or publish.
 *
 *   npm run facts
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';
import { DATA_DIR, readCollection } from '../lib/io';
import { carriesContact } from '../lib/description';
import type { ActivityDefinition } from '../lib/types';

const DAYS = '(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:er)?|hverdager|ukedager|annenhver|hver uke|ukentlig|daglig|døgnet rundt|døgnåpent';
const RULES: Record<string, RegExp> = {
  cost: /\bgratis\b|kostnadsfri|egenandel|\bkoster\b|\d+\s?(?:kr|kroner)\b|\bkr\.?\s?\d|\bpris(?:en|er)?\b|rimelig|billettpris|abonn/i,
  age: /\b\d{1,2}\s?[–-]\s?\d{1,2}\s?år\b|\b(?:fra|over|under)\s\d{1,2}\s?år\b|\bi alderen\b|\baldersgruppe/i,
  schedule: new RegExp(`\\b(?:${DAYS})\\b[^.]*?(?:\\bkl\\.?\\s?\\d|\\b\\d{1,2}[.:]\\d{2}\\b)|\\b(?:kl\\.?\\s?\\d|\\d{1,2}[.:]\\d{2})[^.]*?\\b(?:${DAYS})\\b|åpningstid`, 'i'),
  how_to_join: /påmelding|meld(?:e)? deg|ingen påmelding|drop-?in|uten (?:henvisning|timeavtale|avtale)|henvisning|søk(?:e|er)? (?:om )?plass|ta (?:gjerne )?kontakt|bare (?:møt|kom) (?:opp|innom)|kom innom|book tid|bestill|registrer/i,
  target_group: /\bmålgruppe|\b(?:for|til) (?:alle|deg som|dere som|barn|ungdom|unge|eldre|seniorer|kvinner|jenter|menn|gutter|familier|barnefamilier|foreldre|pårørende|innvandrere|flyktninger|migranter|personer|mennesker|voksne|studenter)\b/i,
  language: /\b(?:engelsk|arabisk|somali(?:sk)?|ukrainsk|polsk|tigrinja|dari|persisk|farsi|urdu|spansk|fransk|russisk|tyrkisk|kurdisk|romani|litauisk|rumensk)\b|flere språk|\btolk\b|på ditt språk/i,
  place: /\b[A-ZÆØÅ][\wæøå]*(?:gata|gaten|gate|veien|vei|vegen|plass|torg|allé)\s\d+\b|(?<![\d.])\b\d{4}\s[A-ZÆØÅ][a-zæøå]+\b/,   // postcode + town, not the year of a date
};

/** Sentences, keeping line structure: a line is never joined to the next. */
const sentences = (text: string): string[] => text.split('\n')
  .flatMap((line) => line.split(/(?<!\b(?:kl|ca|tlf|nr|bl\.a|f\.eks|evt|osv|jf|mob)\.)(?<=[.!?])\s+(?=[A-ZÆØÅ0-9«"])/i))
  .map((s) => s.trim()).filter((s) => s.length > 2);

const csvCell = (v: string | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function main(): void {
  const rows: string[][] = [];
  const summary: string[] = [];
  for (const org of fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('_')).sort()) {
    const file = path.join(DATA_DIR, org, 'activities.json');
    const items = (fs.existsSync(file) ? readCollection<ActivityDefinition>(file)?.items : []) ?? [];
    const withText = items.filter((a) => a.description);
    const hits: Record<string, Set<string>> = Object.fromEntries(Object.keys(RULES).map((k) => [k, new Set<string>()]));
    for (const a of withText) {
      for (const s of sentences(a.description!)) {
        for (const [kind, rule] of Object.entries(RULES)) {
          if (!rule.test(s)) continue;
          hits[kind].add(a.id);
          rows.push([a.id, org, kind, s, a.descriptionSourceUrl ?? '', carriesContact(s) ? 'true' : 'false']);
        }
      }
    }
    // The texts a chapter wrote about its own provision (Røde Kors's branches, LHL's activity pages).
    const chFile = path.join(DATA_DIR, org, 'chapters.json');
    let local = 0;
    for (const c of (fs.existsSync(chFile) ? readCollection<{ id: string; activities?: { name: string; description?: string; sourceUrl?: string }[] }>(chFile)?.items : []) ?? []) {
      for (const a of c.activities ?? []) {
        if (!a.description) continue;
        local += 1;
        const key = `${c.id}#${a.name}`;
        for (const s of sentences(a.description)) {
          for (const [kind, rule] of Object.entries(RULES)) {
            if (!rule.test(s)) continue;
            hits[kind].add(key);
            rows.push([key, org, kind, s, a.sourceUrl ?? '', carriesContact(s) ? 'true' : 'false']);
          }
        }
      }
    }
    const pct = (k: string) => `${k} ${hits[k].size}`;
    summary.push(`${org.padEnd(20)} ${withText.length}/${items.length} definitions + ${local} chapter texts · ${Object.keys(RULES).map(pct).join(' · ')}`);
  }
  const out = path.join(DATA_DIR, '_activity-facts', 'activity-facts.csv');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, [['activity_id', 'ngo', 'kind', 'quote', 'source_url', 'contains_contact'],
    ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  Logger.info(`${rows.length} fact sentences -> ${path.relative(process.cwd(), out)}`);
  Logger.info('activities with at least one sentence of each kind:');
  for (const s of summary) Logger.info(`  ${s}`);
}

main();
