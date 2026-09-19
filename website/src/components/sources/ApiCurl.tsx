import React from 'react';
import CodeBlock from '@theme/CodeBlock';
import { usePostgrestBaseUrl } from '../../utils/postgrest';

interface Props {
  /** Everything after the base URL, e.g. `indicator_summary?limit=5`. */
  query: string;
}

/**
 * A copy-pasteable `curl` against the published API, with the host supplied by
 * configuration rather than typed into the page.
 *
 * 🔴 EXISTS BECAUSE A HAND-WRITTEN PAGE HAD NOWHERE ELSE TO PUT A URL.
 * `docs/datasets/for/grant-officers.mdx` carried a literal
 * `https://api-atlas.sovereignsky.no/...` in a fenced bash block — a command a
 * reader would copy, paste, and get `Could not resolve host` from, because that
 * name has been NXDOMAIN since the catalogue was built (urb-agents #1245).
 *
 * Generated pages got their host from the generator, so fixing the generator
 * left this one behind. ⚠️ A fenced code block cannot interpolate, so the only
 * way to keep a literal out of hand-written prose is to stop using a fenced
 * block for it.
 *
 * 🔵 It also inherits the localhost swap from usePostgrestBaseUrl, so a local
 * visitor gets a command that works against their own cluster — which the
 * fenced version never did.
 */
export default function ApiCurl({ query }: Props) {
  const base = usePostgrestBaseUrl();
  return <CodeBlock language="bash">{`curl -sS '${base}/${query}'`}</CodeBlock>;
}
