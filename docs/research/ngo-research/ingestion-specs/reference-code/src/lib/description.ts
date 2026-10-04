/**
 * file: ingest/src/lib/description.ts
 * description: An organisation's own text, VERBATIM, from a page - with a DOM parser.
 *
 * Why a DOM parser here and not regexes like the older extractors: the 542 malformed N.K.S.
 * contact names came from a regex capture that started inside a tag. Text extraction is the
 * same risk at larger scale, so it uses Cheerio - Atlas's parser (scraping-practice.md §1).
 *
 * The text keeps the page's structure: one block per heading, paragraph or list item,
 * separated by a blank line; `<br>` stays a line break; list items start with "- ". Nothing
 * is summarised, reordered or translated. Two things are removed, both navigation rather than
 * text: a paragraph that is nothing but one link ("Les mer om …"), and whatever the caller
 * excludes (a site's own sub-page listings, contact cards).
 */

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,dt,dd';
const NOISE = 'script,style,svg,noscript,form,button,nav,iframe,template,img,picture,figure';

export interface Block { tag: string; text: string; }

/** The text blocks under `root`, in document order, innermost only (an <li> holding a <p> yields the <p>). */
export function blocks($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>, exclude: string[] = []): Block[] {
  const scope = root.clone();
  scope.find([NOISE, ...exclude].join(',')).remove();
  scope.find('br').replaceWith('\n');
  const out: Block[] = [];
  scope.find(BLOCKS).each((_, el) => {
    const node = $(el);
    if (node.find(BLOCKS).length) return;                       // take the innermost block only
    const only = node.children();
    if (only.length === 1 && only.is('a') && only.text().trim() === node.text().trim()) return;  // a bare link
    const text = node.text()
      .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n')
      .normalize('NFC');
    if (!text) return;
    const tag = (el as { tagName?: string }).tagName ?? 'p';
    out.push({ tag, text: tag === 'li' ? `- ${text}` : text });
  });
  return out;
}

export const joinBlocks = (bs: Block[]): string => bs.map((b) => b.text).join('\n\n');

export const isHeading = (b: Block): boolean => /^h[1-6]$/.test(b.tag);

/**
 * The blocks after the heading whose text is `name`, up to the next heading of the same or a
 * higher level - one section of a page that describes several activities.
 */
export function section(bs: Block[], name: string): Block[] | undefined {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const at = bs.findIndex((b) => isHeading(b) && norm(b.text) === norm(name));
  if (at < 0) return undefined;
  const level = Number(bs[at].tag[1]);
  const out: Block[] = [];
  for (const b of bs.slice(at + 1)) {
    if (isHeading(b) && Number(b.tag[1]) <= level) break;
    out.push(b);
  }
  return out;
}

/** og:description, cut back to whole sentences when the CMS truncated it with an ellipsis. */
export function ogSummary($: cheerio.CheerioAPI): string | undefined {
  let text = $('meta[property="og:description"]').attr('content')?.trim();
  if (!text) return undefined;
  if (/(…|\.\.\.)$/.test(text)) {
    const cut = text.replace(/\s*(…|\.\.\.)$/, '');
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    text = end > 0 ? cut.slice(0, end + 1) : undefined;
  }
  return text?.normalize('NFC') || undefined;
}

/**
 * Does the text carry a way to reach a person - a phone number or an e-mail address?
 * Descriptions often end "contact our conductor <name> on <number>"; the record is then
 * flagged containsPersonalData (owner decision 2026-10-03: stored as published, flagged,
 * never in the public repo).
 */
export function carriesContact(text: string): boolean {
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const phone = /(?:\+47[\s ]?)?(?<!\d)(?:\d[\s ]?){7}\d(?!\d)/;
  return email.test(text) || phone.test(text);
}

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
