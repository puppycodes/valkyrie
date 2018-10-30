FROM node:10.9.0-alpine

WORKDIR /

RUN mkdir hubot

WORKDIR /hubot

COPY package-lock.json package.json ./

RUN npm install

RUN mkdir bin scripts lib
COPY external-scripts.json .
COPY bin ./bin
COPY scripts ./scripts
COPY lib ./lib
COPY BUILD ./BUILD

ENV PATH="node_modules/.bin:node_modules/hubot/node_modules/.bin:$PATH"

ENTRYPOINT ["bin/hubot", "--name", "heimdall", "--adapter", "flowdock"]
