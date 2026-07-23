FROM node:22-alpine

WORKDIR /app

# python3/make/g++ are needed to build the better-sqlite3 native module on alpine (musl).
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY src ./src

VOLUME ["/app/data"]
EXPOSE 3001

CMD ["npm", "start"]
