FROM debian:bookworm-slim

LABEL org.opencontainers.image.title="devngn playSMS Portal"
LABEL org.opencontainers.image.description="Scaffold container for playSMS-style notification gateway experiments."

RUN apt-get update \
  && apt-get install -y --no-install-recommends apache2 ca-certificates curl libapache2-mod-php mariadb-client php php-cli php-curl php-mbstring php-mysql php-xml unzip \
  && rm -rf /var/lib/apt/lists/*

RUN printf '%s\n' \
  '<!doctype html>' \
  '<html><head><title>devngn playSMS scaffold</title></head>' \
  '<body><h1>devngn playSMS scaffold</h1><p>Wire a playSMS install or hosted SMS backend here for long-running AI loop notifications.</p></body></html>' \
  > /var/www/html/index.html

EXPOSE 80

CMD ["apache2ctl", "-D", "FOREGROUND"]
