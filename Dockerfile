FROM node:alpine

ARG SCRIPT=dev
ARG ENVIRONMENT=dev

ENV SCRIPT=$SCRIPT
ENV NODE_ENV=$ENIRONMENT

RUN apk add --update git

CMD npm run $SCRIPT
WORKDIR /app

COPY package.json yarn.lock /app/
RUN if [[ "$ENVIRONMENT" = "prod" ]]; then yarn ; fi

COPY . /app/
RUN if [[ "$ENVIRONMENT" = "prod" ]]; then yarn build; fi
