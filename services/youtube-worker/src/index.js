require('dotenv').config();
const { createApp } = require('./app');

const PORT = process.env.PORT || 3002;
const app = createApp();

app.listen(PORT, () => {
  console.log(`youtube-worker listening on port ${PORT}`);
});
