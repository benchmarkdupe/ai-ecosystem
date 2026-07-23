const fs = require('fs');
const { google } = require('googleapis');

class YoutubeClientError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'YoutubeClientError';
    this.status = status;
    this.details = details;
  }
}

function getOAuthClient() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new YoutubeClientError(
      'YouTube is not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN ' +
        '(run `npm run get-refresh-token` to obtain a refresh token).',
      500
    );
  }
  const client = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
  return client;
}

async function publishVideo({ filePath, title, description, privacyStatus }) {
  const auth = getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  let response;
  try {
    response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title, description },
        // Defaults to private so nothing goes public without an explicit choice.
        status: { privacyStatus: privacyStatus || process.env.YOUTUBE_DEFAULT_PRIVACY || 'private' },
      },
      media: { body: fs.createReadStream(filePath) },
    });
  } catch (err) {
    throw new YoutubeClientError('YouTube upload failed', err.code || 502, err.errors || err.message);
  }

  const videoId = response.data.id;
  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

async function getVideoStats(videoId) {
  const auth = getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  let response;
  try {
    response = await youtube.videos.list({ part: ['statistics'], id: [videoId] });
  } catch (err) {
    throw new YoutubeClientError('YouTube stats fetch failed', err.code || 502, err.errors || err.message);
  }

  const item = response.data.items?.[0];
  if (!item) throw new YoutubeClientError('Video not found on YouTube', 404);

  return {
    viewCount: Number(item.statistics.viewCount) || 0,
    likeCount: Number(item.statistics.likeCount) || 0,
    commentCount: Number(item.statistics.commentCount) || 0,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { publishVideo, getVideoStats, YoutubeClientError };
