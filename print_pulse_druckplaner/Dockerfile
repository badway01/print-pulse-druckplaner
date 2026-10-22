FROM ghcr.io/home-assistant/base:latest
ARG BUILD_VERSION
ARG BUILD_ARCH
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}"
RUN apk add --no-cache python3 tzdata
WORKDIR /opt/print-pulse
COPY app.py ./app.py
COPY web ./web
RUN mkdir -p /data && chmod 700 /data
# S6 requires with-contenv to load SUPERVISOR_TOKEN into the app process.
CMD ["/command/with-contenv", "python3", "-u", "/opt/print-pulse/app.py"]
