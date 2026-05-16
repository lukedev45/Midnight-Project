import { createServer } from './server.js';

const PORT = Number(process.env.PORT ?? '4000');
const ROSTER_SIZE = Number(process.env.ROSTER_SIZE ?? '15');

const SEED_POSTS: Array<{ credentialIndex: number; content: string }> = [
  {
    credentialIndex: 0,
    content:
      'On 2026-03-14, the finance team allocated $42,000 to a vendor not listed in the approved vendor registry. The invoice referenced PO-2024-883.',
  },
  {
    credentialIndex: 1,
    content:
      'Asked HR about the 12% pay gap and was told the data is "private". The 2024 salary survey was never published as scheduled.',
  },
  {
    credentialIndex: 2,
    content: 'i think everyone knows the deal is BAD!!!! obviously',
  },
  {
    credentialIndex: 3,
    content:
      'During the quarterly review on 2026-04-02, our team flagged that 23% of escalations were routed away from compliance. Documented in slack #compliance-eng.',
  },
  {
    credentialIndex: 4,
    content:
      'A second-year student noticed that the dining hall posted a 7% surcharge that wasn\'t in the published price list. Emailed the bursar on 2026-05-01, no response.',
  },
];

const { app, state } = createServer({ rosterSize: ROSTER_SIZE, seedPosts: SEED_POSTS });

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`whistleblower scorer listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`  roster size:   ${state.credentials.length}`);
  // eslint-disable-next-line no-console
  console.log(`  endpoints:     GET /api/credentials, /api/state, /api/feed, /api/stream`);
  // eslint-disable-next-line no-console
  console.log(`                 POST /api/enroll, /api/post, /api/hash-content`);
});
