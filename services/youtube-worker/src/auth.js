// Shared-secret auth for external callers (e.g. an Opportunity OS frontend).
// A no-op in local/dev use when API_KEY isn't set.
function apiKeyMiddleware(req, res, next) {
  const requiredKey = process.env.API_KEY;
  if (!requiredKey) return next();

  const providedKey = req.get('x-api-key');
  if (providedKey !== requiredKey) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  next();
}

module.exports = { apiKeyMiddleware };
