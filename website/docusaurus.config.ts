import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const GITHUB_ORG = process.env.GITHUB_ORG || 'terchris';
const GITHUB_REPO = process.env.GITHUB_REPO || 'atlas';

const config: Config = {
  title: 'Atlas',
  tagline: "An open atlas of Norway's civil-society sector — humanitarian needs and the NGOs that respond.",

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
    [
      '@scalar/docusaurus',
      {
        label: 'API',
        route: '/api',
        showNavLink: true,
        configuration: {
          // Same-origin snapshot of the PostgREST OpenAPI spec. Refresh with
          // `npm run api:snapshot` (in website/) when the api_v1 surface changes.
          //
          // We can't fetch live from api-atlas.helpers.no in the browser
          // because PostgREST 14 sends Access-Control-Allow-Origin only on
          // OPTIONS preflight, not on GET responses — see INVESTIGATE-
          // deployment-pipeline.md Q21. Until UIS fixes that, "Try it out"
          // requests won't work either, regardless of how we load the spec.
          url: '/openapi.json',
        },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Atlas',
      logo: {
        alt: 'Atlas logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          to: '/datasets',
          label: 'Datasets',
          position: 'left',
          activeBasePath: '/datasets',
        },
        {
          to: '/topics',
          label: 'Topics',
          position: 'left',
          activeBasePath: '/topics',
        },
        {
          to: '/publishers',
          label: 'Publishers',
          position: 'left',
          activeBasePath: '/publishers',
        },
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          // `pathname://` escape hatch: Docusaurus's `trailingSlash: false`
          // would otherwise rewrite /lineage/ → /lineage (no slash), which
          // misses the static dbt-docs HTML at static/lineage/index.html
          // and shows the Docusaurus 404. The pathname:// protocol tells
          // Docusaurus not to normalize, not to client-side route.
          href: 'pathname:///lineage/',
          label: 'Lineage',
          position: 'left',
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
