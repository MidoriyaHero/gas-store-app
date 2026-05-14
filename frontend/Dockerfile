# Static SPA + nginx reverse proxy to the API service.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Vite bakes ``import.meta.env`` at build time — set qua ``docker compose build`` (args) hoặc ``docker build --build-arg``.
ARG VITE_API_BASE=
ARG VITE_MAP_DEFAULT_LAT=
ARG VITE_MAP_DEFAULT_LNG=
ARG VITE_DEFAULT_STORE_CONTACT=
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_MAP_DEFAULT_LAT=$VITE_MAP_DEFAULT_LAT \
    VITE_MAP_DEFAULT_LNG=$VITE_MAP_DEFAULT_LNG \
    VITE_DEFAULT_STORE_CONTACT=$VITE_DEFAULT_STORE_CONTACT

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
