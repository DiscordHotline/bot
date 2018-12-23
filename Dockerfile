FROM node:alpine

ARG SCRIPT=dev
ARG ENVIRONMENT=dev

CMD ["npm", "run", "$SCRIPT"]
WORKDIR /app

COPY . /app/

RUN if [[ "$ENVIRONMENT" = "prod" ]]; then npm i && npm run build; fi
