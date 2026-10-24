FROM ghcr.io/home-assistant/base:latest
ARG BUILD_VERSION
ARG BUILD_ARCH
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}"
RUN apk add --no-cache python3 tzdata py3-reportlab font-dejavu
WORKDIR /opt/print-pulse
COPY app.py ./app.py
COPY components.py ./components.py
COPY local_orders.py ./local_orders.py
COPY local_order_pdf.py ./local_order_pdf.py
COPY safety.py ./safety.py
COPY web ./web
COPY CHANGELOG.md ./CHANGELOG.md
ENV PP_VERSION=${BUILD_VERSION}
RUN mkdir -p /data && chmod 700 /data
# S6 requires with-contenv to load SUPERVISOR_TOKEN into the app process.
CMD ["/command/with-contenv", "python3", "-u", "/opt/print-pulse/app.py"]
