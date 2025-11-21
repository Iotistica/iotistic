const mqtt = require("mqtt");

module.exports = function (RED) {
  // Shared MQTT client instance
  let sharedMqttClient = null;
  let clientRefCount = 0;

  async function fetchDeviceName(deviceUuid) {
    try {
      const iotisticURL = RED.settings.iotisticURL || 'http://api:3002';
      const axios = require('axios');
      const response = await axios.get(`${iotisticURL}/devices/${deviceUuid}`);
      return response.data.name || deviceUuid.substring(0, 8);
    } catch (err) {
      return deviceUuid.substring(0, 8);
    }
  }

  function getSharedMqttClient() {
    if (!sharedMqttClient || !sharedMqttClient.connected) {
      const mqttBroker = RED.settings.mqttBroker || 'mqtt://mosquitto:1883';
      const mqttUsername = RED.settings.mqttUsername;
      const mqttPassword = RED.settings.mqttPassword;

      const connectOptions = {
        clientId: `nodered-remote-subflow-shared`,
        clean: true,
        reconnectPeriod: 5000
      };

      if (mqttUsername && mqttPassword) {
        connectOptions.username = mqttUsername;
        connectOptions.password = mqttPassword;
      }

      sharedMqttClient = mqtt.connect(mqttBroker, connectOptions);
      
      sharedMqttClient.on('error', (err) => {
        RED.log.error(`Shared MQTT client error: ${err.message}`);
      });
    }
    clientRefCount++;
    return sharedMqttClient;
  }

  function releaseSharedMqttClient() {
    clientRefCount--;
    if (clientRefCount <= 0 && sharedMqttClient) {
      sharedMqttClient.end();
      sharedMqttClient = null;
      clientRefCount = 0;
    }
  }

  function DeviceFlowNode(config) {

    RED.nodes.createNode(this, config);
    const node = this;
    node.timeoutRefs = {};
    node.devicesStatus = {};

    node.deviceUuid = config.deviceUuid || "";
    node.deviceName = config.deviceName || node.deviceUuid.substring(0, 8);
    node.subflowId = config.subflowId;
    
    // Fetch device name if not in config (for backward compatibility)
    if (!config.deviceName && node.deviceUuid) {
      fetchDeviceName(node.deviceUuid).then(name => {
        node.deviceName = name;
        node.log(`Fetched device name: ${node.deviceName}`);
        node.status({ fill: "green", shape: "dot", text: `running on ${node.deviceName}` });
      });
    }
    
    node.log(`Remote subflow initialized - Device: ${node.deviceName} (${node.deviceUuid})`);

    // Only connect if deviceUuid is provided
    if (node.deviceUuid) {
      const mqttClient = getSharedMqttClient();

      // Handle MQTT connection
      mqttClient.on('connect', () => {
        mqttClient.on('message', handleMessage.bind(node));
        node.log("remote flow connecting to broker");
        node.status({ fill: "green", shape: "dot", text: `running on ${node.deviceName}` });
        node.log(`${mqttClient.options.clientId} connected to broker`);
      });

      // Handle incoming messages
      function handleMessage(topic, message) {
        try {
          let msg = { payload: message.toString() };
           
          const subflowMatch = topic.match(/device\/([^\/]+)\/sublow\/([^\/]+)/);
          const subflowId = subflowMatch ? subflowMatch[2] : "unknown";

          const deviceMatch = topic.match(/device\/([^\/]+)/);
          const deviceId = deviceMatch ? deviceMatch[1] : "unknown"; 

          // Add the device ID to the message
          msg.deviceId = deviceId;
          msg.subflowId = subflowId;
          msg.topic = topic;

          // Extract the output number from the topic (e.g., "out/1" → 1)
          let match = topic.match(/out\/(\d+)/);
          if (match) {
            let outputIndex = parseInt(match[1], 10) - 1; // Convert "1" → 0-based index

            // Create an array of nulls and set the correct index
            let outputs = [null, null]; 
            outputs[outputIndex] = msg;

            node.send(outputs);

            // Clear timeout for this device
            if (node.timeoutRefs && node.timeoutRefs[deviceId] && node.timeoutRefs[deviceId].id) {
              clearTimeout(node.timeoutRefs[deviceId].id);
            }

            node.status({
              fill: "green",
              shape: "dot",
              text: `running on ${node.deviceName}`,
            });
          }

        } catch (err) {
          node.error("Failed to parse incoming broker message: " + err);
          node.status({
            fill: "red",
            shape: "ring",
            text: "error",
          });
        }
      }

      // Handle input messages
      node.on("input", (msg) => {
        const timeoutMs = 10000;
        const deviceId = node.deviceUuid;

        const topic_input = `iot/device/${deviceId}/sublow/${node.subflowId}/in`;
        const topic_output = `iot/device/${deviceId}/sublow/${node.subflowId}/out/+`

        // Convert the payload to JSON string
        const payload = JSON.stringify(msg.payload);

        // Publish the message to the broker for the device
        mqttClient.publish(topic_input, payload, { qos: 2 }, (err) => {
          if (err) {
            node.error(`${mqttClient.options.clientId} failed to publish message to broker for device ${deviceId}`, err);
            node.status({
              fill: "red",
              shape: "ring",
              text: "broker error",
            });
          } else {
            node.log(`${mqttClient.options.clientId} published to device ${deviceId} at topic ${topic_input}`);

            mqttClient.subscribe(topic_output, { qos: 0 }, (err) => {
              if (err) {
                node.status({ fill: "red", shape: "ring", text: "broker error" });
                node.error(`${mqttClient.options.clientId} failed to subscribe to ${topic_output}: ` + err);
              } else {
                node.status({ fill: "green", shape: "dot", text: `waiting on ${node.deviceName}` });
                node.log(`${mqttClient.options.clientId} subscribed to output: ${topic_output}`);
              }
            });

            // Set timeout for response
            if (!node.timeoutRefs) {
              node.timeoutRefs = {};
            }

            const timeout = setTimeout(() => {
              node.log(`No messages received within ${timeoutMs / 1000} seconds, unsubscribing...`);
              mqttClient.unsubscribe(topic_output, (err) => {
                if (!err) {
                  node.log(`Unsubscribed from ${topic_output}`);
                }
              });

              node.status({
                fill: "red",
                shape: "dot",
                text: "timeout",
              });
            }, timeoutMs);

            node.timeoutRefs[deviceId] = { id: timeout };

            node.status({
              fill: "green",
              shape: "dot",
              text: `sent to ${node.deviceName}`,
            });
          }
        });
      });

      // Handle node close
      node.on("close", (done) => {
        node.log(`Closing remote subflow node for device ${node.deviceUuid}`);
        
        // Unsubscribe from this device's topics
        const topic_output = `iot/device/${node.deviceUuid}/sublow/${node.subflowId}/out/+`;
        mqttClient.unsubscribe(topic_output, () => {
          releaseSharedMqttClient();
          done();
        });
      });
    } else {
      node.warn("No device UUID provided. MQTT client will not connect.");
    }
  }

  RED.nodes.registerType("remote subflow", DeviceFlowNode);

};
