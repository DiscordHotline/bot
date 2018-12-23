FROM node:alpine

ARG SCRIPT=dev
ARG ENVIRONMENT=dev

ENV SCRIPT=$SCRIPT
ENV NODE_ENV=$ENIRONMENT

CMD npm run $SCRIPT
WORKDIR /app

COPY . /app/

RUN if [[ "$ENVIRONMENT" = "prod" ]]; then npm i && npm run build; fi
