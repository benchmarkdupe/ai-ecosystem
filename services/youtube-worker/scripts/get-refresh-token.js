// One-time helper to obtain a YouTube OAuth refresh token for personal use.
//
// Run this on a machine with a browser (NOT the headless VPS) — it needs to
// receive the OAuth redirect on localhost. Copy the resulting
// YOUTUBE_REFRESH_TOKEN into the VPS's .env afterwards.
//
// Before running:
//   1. Create an OAuth 2.0 Client ID of type "Desktop app" in Google Cloud
//      Console (APIs & Services > Credentials), with the YouTube Data API v3
//      enabled on the project.
//   2. Add http://localhost:<OAUTH_CALLBACK_PORT>/oauth2callback as an
//      authorized redirect URI on that client (default port below: 53682).
//   3. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in this directory's
//      .env (or the environment) before running `npm run get-refresh-token`.

require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = process.env;
const PORT = Number(process.env.OAUTH_CALLBACK_PORT) || 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET (in .env or the environment) before running this.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

console.log(`\nMake sure ${REDIRECT_URI} is an authorized redirect URI on this OAuth client.\n`);
console.log('1. Open this URL in a browser and approve access:\n');
console.log(authUrl);
console.log('\n2. Waiting for the redirect back to this script...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('Missing "code" query param.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Success — you can close this tab and return to the terminal.');

    if (!tokens.refresh_token) {
      console.log(
        '\nNo refresh_token was returned (Google only issues one on first consent).' +
          '\nRevoke prior access at https://myaccount.google.com/permissions and re-run this script.\n'
      );
    } else {
      console.log('\nAdd this to the youtube-worker .env on your VPS:\n');
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    }
  } catch (err) {
    res.writeHead(500).end('Token exchange failed, see terminal.');
    console.error('Token exchange failed:', err.message);
  } finally {
    server.close();
  }
});

server.listen(PORT);
