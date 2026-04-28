FROM alpine:3.20

LABEL org.opencontainers.image.title="devngn MQTT SMS Gateway"
LABEL org.opencontainers.image.description="Scaffold for DIY SMS Gateway with MQTT and Zanzito-compatible topics."

RUN apk add --no-cache bash ca-certificates curl jq mosquitto-clients

ENV MQTT_BROKER_URL="mqtt://host.docker.internal:1883"
ENV MQTT_SMS_TOPIC="devngn/notifications/sms"
ENV ZANZITO_TOPIC="zanzito/sms"

EXPOSE 1883

CMD ["sh", "-c", "echo \"devngn MQTT SMS gateway scaffold listening for ${MQTT_SMS_TOPIC}\" && tail -f /dev/null"]
