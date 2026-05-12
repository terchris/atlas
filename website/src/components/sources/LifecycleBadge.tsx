import React from 'react';
import type { Lifecycle } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  lifecycle: Lifecycle;
}

const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  stable: 'Stable',
  beta: 'Beta',
  deprecated: 'Deprecated',
  broken: 'Broken',
};

const LIFECYCLE_CLASS: Record<Lifecycle, string> = {
  stable: styles.badgeStable,
  beta: styles.badgeBeta,
  deprecated: styles.badgeDeprecated,
  broken: styles.badgeBroken,
};

export default function LifecycleBadge({ lifecycle }: Props) {
  const cls = `${styles.badge} ${LIFECYCLE_CLASS[lifecycle]}`;
  return <span className={cls} title={`Lifecycle: ${LIFECYCLE_LABEL[lifecycle]}`}>{LIFECYCLE_LABEL[lifecycle]}</span>;
}
