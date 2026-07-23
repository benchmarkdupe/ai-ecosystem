FROM node:22-alpine

WORKDIR /app

# python3/make/g++: build better-sqlite3's native module on alpine (musl).
# ffmpeg/espeak-ng: local video rendering (TTS + clip assembly), no external API needed.
# ttf-dejavu: font used for on-screen scene text.
RUN apk add --no-cache python3 make g++ ffmpeg espeak-ng ttf-dejavu

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY src ./src
COPY scripts ./scripts

VOLUME ["/app/data"]
EXPOSE 3002

CMD ["npm", "start"]
