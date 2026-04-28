// Aspire TypeScript AppHost for optional devngn notification backends.
// Run `pnpm --filter @devngn/comms-apphost restore` before starting so Aspire generates `.modules/`.

import { createBuilder } from "./.modules/aspire.js";

const builder = await createBuilder();

builder
  .addDockerfile("mqtt-sms-gateway", "./containers/mqtt-sms-gateway", {
    dockerfilePath: "Dockerfile",
  })
  .withEndpoint({
    targetPort: 1883,
    scheme: "tcp",
    name: "mqtt",
    env: "MQTT_PORT",
    isExternal: false,
  });

builder
  .addDockerfile("playsms", "./containers/playsms", {
    dockerfilePath: "Dockerfile",
  })
  .withHttpEndpoint({
    targetPort: 80,
    name: "http",
  });

await builder.build().run();
