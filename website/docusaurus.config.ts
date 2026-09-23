import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

import { ATLAS_SITE_BASE_URL, ATLAS_API_BASE_URL } from './hosts.mjs';

const GITHUB_ORG = process.env.GITHUB_ORG || 'terchris';
const GITHUB_REPO = process.env.GITHUB_REPO || 'atlas';

const config: Config = {
  title: 'Atlas',
  tagline: "An open atlas of Norway's civil-society sector — humanitarian needs and the NGOs that respond.",
  favicon: 'img/favicon.svg',

  // Hostnames live in website/hosts.mjs — see there for why they are not here.
  url: ATLAS_SITE_BASE_URL,
  baseUrl: '/',

  customFields: {
    // So a component can render the deployed API name without a literal.
    atlasApiBaseUrl: ATLAS_API_BASE_URL,
  },

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
          // Fleet agent messages are not written in this repo at all.
          //
          // TALK v2.2 keys message location on repo VISIBILITY: `terchris/atlas`
          // is PUBLIC, so its handoffs live in `terchris/home` instead. This
          // pattern only stops a stray file being *rendered* as a page.
          //
          // ⚠️ It is NOT a safety control, and an earlier version of this comment
          // wrongly implied it was. A markdown file in this repo is world-readable
          // on github.com whether Docusaurus renders it or not, so an exclude
          // protects the site build — never the contents.
          //
          // `plans/talk/**` covers unrelated legacy research transcripts.
          exclude: ['**/plans/talk/**', '**/ai-developer/talk/**'],
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
          // `npm run api:snapshot` (in website/) AFTER EVERY DEPLOY that changes
          // the api_v1 surface OR its descriptions — not only when relations
          // are added. The spec carries info.description and every column
          // COMMENT, so a docs-only release changes it.
          //
          // 🔴 THE CORS REASON THIS COMMENT USED TO GIVE IS NO LONGER TRUE.
          // It said: "we can't fetch live from the API in the browser because
          // PostgREST 14 sends Access-Control-Allow-Origin only on OPTIONS
          // preflight, not on GET responses … Try it out requests won't work
          // either, regardless of how we load the spec."
          //
          // Measured 2026-09-23 with a browser Origin header, against the live
          // public API — GET responses carry the header, on the spec endpoint
          // and on data endpoints, JSON and CSV alike:
          //
          //   GET /                      access-control-allow-origin: *
          //   GET /dim_kommune?limit=2   access-control-allow-origin: *
          //   ...with Accept: text/csv   access-control-allow-origin: *
          //
          // ✅ So "Try it out" DOES work now, and a live fetch would too.
          //
          // ⚠️ THE SNAPSHOT IS STILL REQUIRED, FOR A DIFFERENT REASON. It
          // rewrites `host` and `schemes` from hosts.mjs, because PostgREST
          // advertises a bind-all placeholder and http — openapi-server-proxy-uri
          // is not set on the container, and Atlas cannot set it: the UIS
          // postgrest config block accepts only `schemas` and `url_prefix`.
          // Point Scalar straight at the live spec today and every Try-it
          // button targets an address no visitor can reach.
          //
          // 🔵 SO THE ROUTE TO DELETING THIS FILE IS NOT A BETTER CHECK, IT IS
          // ONE UIS CHANGE. Once the container sets openapi-server-proxy-uri,
          // `url` can point at the live API, the snapshot goes away, and the
          // whole drift class it belongs to disappears with it (urb-agents
          // #1409). A copy you no longer keep cannot go stale.
          // 🔵 LIVE, NOT A SNAPSHOT — as of 2026-09-23. Both reasons the
          // same-origin copy existed are now gone:
          //   CORS   GET responses carry access-control-allow-origin: *,
          //          measured from a browser Origin (see above).
          //   host   UIS 1.6.143 set openapi-server-proxy-uri, so the live
          //          document names api-atlas.urbalurba.com:443 / https
          //          instead of a bind-all placeholder. The derived URL
          //          answers 200, checked — a correct-looking field is not
          //          a working one (urb-agents #1414).
          //
          // 🔴 THIS IS WHY THE PAGE CANNOT GO STALE AGAIN. static/openapi.json
          // was a generated copy of live state committed to the repo, and it
          // drifted three times in one evening — on a deploy, on a config
          // default that outlived its reason, and on a transform. A copy you
          // no longer keep cannot go stale. Reading live removes the class,
          // not the instance, and it retires the liveness gate that was
          // designed to police it.
          //
          // ⚠️ static/openapi.json and scripts/snapshot-openapi.mjs are kept
          // for ONE deploy so this is a one-line revert if Scalar cannot load
          // the live document from a browser. Nothing has rendered it in
          // Scalar yet, and a page that fails to fetch its own spec is a
          // worse front door than a stale one. Delete them once the published
          // page is seen working.
          //
          // 🔵 `:443` in the host is PostgREST splitting the URI and keeping
          // the explicit port. Swagger 2.0 allows it and the URL resolves;
          // Scalar will display it. Not worth reintroducing a rewrite — and a
          // rewrite is exactly what we are removing — for six characters.
          url: 'https://api-atlas.urbalurba.com/',
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
