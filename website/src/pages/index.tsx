import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import SourceCategoryGrid from '../components/sources/SourceCategoryGrid';
import PublisherStrip from '../components/sources/PublisherStrip';

import styles from './index.module.css';

function AtlasMark() {
  // Lightweight inline mark — concentric kommune dots radiating from a centre,
  // evoking "data about Norway" without claiming to be the Atlas brand.
  // Replace with a real logo when one ships.
  return (
    <svg viewBox="0 0 240 240" className={styles.heroMark} aria-hidden="true">
      <defs>
        <radialGradient id="atlasGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9ad6c2" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0c6e50" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="100" fill="url(#atlasGrad)" />
      {[
        [120, 120, 12, '#ffffff'],
        [60, 90, 7, '#9ad6c2'],
        [180, 80, 6, '#9ad6c2'],
        [50, 160, 6, '#9ad6c2'],
        [185, 170, 7, '#9ad6c2'],
        [100, 60, 5, '#cfdcef'],
        [150, 175, 5, '#cfdcef'],
        [205, 130, 5, '#cfdcef'],
        [40, 120, 5, '#cfdcef'],
        [130, 50, 4, '#cfdcef'],
        [80, 200, 4, '#cfdcef'],
        [200, 100, 4, '#cfdcef'],
        [70, 60, 3, '#cfdcef'],
        [165, 215, 3, '#cfdcef'],
      ].map(([cx, cy, r, fill], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={fill as string} opacity={0.85} />
      ))}
      <g stroke="#9ad6c2" strokeWidth="1" opacity="0.4" fill="none">
        <line x1="120" y1="120" x2="60" y2="90" />
        <line x1="120" y1="120" x2="180" y2="80" />
        <line x1="120" y1="120" x2="50" y2="160" />
        <line x1="120" y1="120" x2="185" y2="170" />
      </g>
    </svg>
  );
}

function Hero() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className={clsx('container', styles.heroContainer)}>
        <div className={styles.heroIllustration}>
          <AtlasMark />
        </div>
        <div className={styles.heroContent}>
          <h1 className={clsx('hero__title', styles.heroTitle)}>{siteConfig.title}</h1>
          <p className={clsx('hero__subtitle', styles.heroSubtitle)}>
            An open atlas of Norway's civil-society sector.
            <br />
            <span className={styles.heroLead}>The humanitarian needs that shape it, and the NGOs that respond.</span>
          </p>
          <div className={styles.buttons}>
            <Link className={clsx('button button--lg button--primary', styles.heroButton)} to="/datasets">
              Browse datasets
            </Link>
            <Link className={clsx('button button--lg button--secondary', styles.heroButton, styles.heroButtonOutline)} to="/about/what-is-atlas">
              What is Atlas?
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Atlas — open semantic layer over Norwegian public data"
      description={siteConfig.tagline}
    >
      <Hero />
      <main>
        <div className={clsx('container', styles.section)}>
          <h2 className={styles.sectionTitle}>Browse by topic</h2>
          <SourceCategoryGrid />
        </div>

        <div className={clsx('container', styles.section)}>
          <h2 className={styles.sectionTitle}>Browse by publisher</h2>
          <PublisherStrip />
        </div>
      </main>
    </Layout>
  );
}
