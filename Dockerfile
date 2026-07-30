FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv
RUN rm -rf /srv/Dockerfile /srv/Caddyfile /srv/netlify.toml /srv/package.json /srv/package-lock.json /srv/scripts /srv/node_modules /srv/.gitignore
