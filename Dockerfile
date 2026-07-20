FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv
RUN rm -f /srv/Dockerfile /srv/Caddyfile /srv/netlify.toml
