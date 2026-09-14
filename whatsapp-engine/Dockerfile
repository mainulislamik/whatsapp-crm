FROM node:20-alpine

WORKDIR /app

# Install git and build essentials for Baileys native/git deps
RUN apk add --no-cache git python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5001

CMD ["node", "server.js"]
