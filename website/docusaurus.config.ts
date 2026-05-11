import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const GITHUB_ORG = process.env.GITHUB_ORG || 'terchris';
const GITHUB_REPO = process.env.GITHUB_REPO || 'atlas';

const config: Config = {
  title: 'Atlas',
  tagline: 'Open semantic layer over Norwegian public data',

  url: 'https://atlas.sovereignsky.no',
  baseUrl: '/',

  organizationName: GITHUB_ORG,
  projectName: GITHUB_REPO,
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/tree/main/website/`,
          exclude: ['**/plans/talk/**'],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  plugins: [
    'docusaurus-plugin-image-zoom',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        docsRouteBasePath: '/',
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Atlas',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}`,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'About Atlas', to: '/about/what-is-atlas' },
            { label: 'Getting started', to: '/getting-started/reading-a-row' },
            { label: 'Contributors', to: '/contributors' },
          ],
        },
        {
          title: 'Resources',
          items: [
            { label: 'GitHub', href: `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}` },
            { label: 'helpers.no', href: 'https://helpers.no' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Atlas contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'typescript', 'python', 'sql'],
    },
    zoom: {
      selector: '.markdown img',
      background: {
        light: 'rgb(255, 255, 255)',
        dark: 'rgb(50, 50, 50)',
      },
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
