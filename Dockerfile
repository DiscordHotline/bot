FROM node:alpine

ARG SCRIPT=dev
ARG ENVIRONMENT=dev

ENV SCRIPT=$SCRIPT
ENV NODE_ENV=$ENIRONMENT

CMD $(node installPlugins.js) && npm run $SCRIPT
WORKDIR /app

COPY package.json package-lock.json /app/
RUN if [[ "$ENVIRONMENT" = "prod" ]]; then npm install ; fi

COPY . /app/
RUN if [[ "$ENVIRONMENT" = "prod" ]]; then npm run build; fi
