import React from 'react';
import CodeBlock from '@theme/CodeBlock';
import { usePostgrestBaseUrl, rewriteToBase } from '../../utils/postgrest';

interface Props {
  /** The production PostgREST URL as stored in the registry. */
  url: string;
  language?: string;
}

/**
 * Renders a PostgREST URL as a Docusaurus code block (with copy button)
 * and host-swaps to the local UIS API when the visitor is on a localhost
 * origin. See src/utils/postgrest.ts for the swap logic.
 */
export default function SampleQueryUrl({ url, language = 'text' }: Props) {
  const base = usePostgrestBaseUrl();
  const live = rewriteToBase(url, base);
  return <CodeBlock language={language}>{live}</CodeBlock>;
}
