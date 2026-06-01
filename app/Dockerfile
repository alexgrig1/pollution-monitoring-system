FROM node:20-bookworm

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --build-from-source

COPY . .

EXPOSE 3000

CMD ["npm", "start"]