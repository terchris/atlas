import React from 'react';
import Link from '@docusaurus/Link';
import { getAllCategories } from '../../utils/sources';
import styles from './styles.module.css';

export default function SourceCategoryGrid() {
  const categories = getAllCategories();
  return (
    <div className={styles.categoryGrid}>
      {categories.map((cat) => (
        <Link key={cat.id} to={`/sources/category/${cat.id}`} className={styles.categoryCard}>
          <div className={styles.categoryEmoji}>{cat.emoji}</div>
          <h3 className={styles.categoryName}>{cat.name}</h3>
          <p className={styles.categoryDescription}>{cat.description}</p>
          <div className={styles.categoryCount}>
            {cat.source_count} {cat.source_count === 1 ? 'source' : 'sources'}
          </div>
        </Link>
      ))}
    </div>
  );
}
