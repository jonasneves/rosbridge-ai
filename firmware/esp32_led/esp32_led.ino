/**
 * ESP32-CAM-MB — LED control via MQTT, with OTA updates
 *
 * Connects to WiFi and subscribes to a MAC-based MQTT topic:
 *   devices/<mac>/led/command
 *
 * Payload: "true" or "1" → LED on, "false" or "0" → LED off
 *
 * Publishes a retained device announcement on connect so the
 * dashboard auto-discovers the topic.
 *
 * After first USB flash, use `make ota` for subsequent updates.
 *
 * Required libraries (Tools → Manage Libraries):
 *   - PubSubClient by Nick O'Leary
 *
 * Board: AI Thinker ESP32-CAM
 * Port:  /dev/cu.usbserial-* (USB)
 */

#include <WiFi.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

#ifndef WIFI_SSID
#define WIFI_SSID "your_wifi_ssid"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "your_wifi_password"
#endif
#ifndef MQTT_IP
#define MQTT_IP "broker.hivemq.com"
#endif

const int MQTT_PORT = 1883;
const int LED_PIN   = 33;  // red LED on ESP32-CAM-MB (active low)
const unsigned long RECONNECT_INTERVAL_MS = 5000;
const char* TOPIC_PREFIX = "devices/";

String commandTopic;    // devices/<mac>/led/command
String announceTopic;   // devices/<mac>
String clientId;        // esp32-<mac>
String announcement;    // JSON payload for device discovery

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// e.g. MAC "D4:E9:F4:A2:A0:44" -> prefix "devices/d4e9f4a2a044"
void buildTopicsFromMAC() {
  String mac = WiFi.macAddress();
  mac.toLowerCase();
  mac.replace(":", "");

  announceTopic = String(TOPIC_PREFIX) + mac;
  commandTopic  = announceTopic + "/led/command";
  clientId      = "esp32-" + mac;
  announcement  = "{\"topics\":[\"" + commandTopic + "\"]}";

  Serial.println("Topic: " + commandTopic);
}

bool payloadEquals(byte* payload, unsigned int length, const char* expected) {
  return length == strlen(expected)
      && memcmp(payload, expected, length) == 0;
}

void onMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, commandTopic.c_str()) != 0) return;

  bool ledOn = payloadEquals(payload, length, "true")
            || payloadEquals(payload, length, "1");

  digitalWrite(LED_PIN, ledOn ? LOW : HIGH);  // LOW = on (active low)
  Serial.println(ledOn ? "LED on" : "LED off");
}

void setupOTA() {
  ArduinoOTA.setHostname("esp32-led");
  ArduinoOTA.onStart([]() {
    mqttClient.disconnect();  // free WiFi bandwidth for OTA
    Serial.println("OTA start");
  });
  ArduinoOTA.onEnd([]()   { Serial.println("OTA done"); });
  ArduinoOTA.onError([](ota_error_t e) { Serial.printf("OTA error [%u]\n", e); });
  ArduinoOTA.begin();
  Serial.println("OTA ready — `make ota ESP32_IP=" + WiFi.localIP().toString() + "`");
}

void mqttReconnect() {
  static unsigned long lastAttemptMs = 0;
  unsigned long now = millis();

  if (now - lastAttemptMs < RECONNECT_INTERVAL_MS) return;
  lastAttemptMs = now;

  Serial.print("Connecting to MQTT...");

  if (!mqttClient.connect(clientId.c_str())) {
    Serial.print(" failed, rc=");
    Serial.println(mqttClient.state());
    return;
  }

  Serial.println(" connected (" + String(MQTT_IP) + ")");
  mqttClient.publish(announceTopic.c_str(), announcement.c_str(), true);
  mqttClient.subscribe(commandTopic.c_str());
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);  // disable brownout detector
  Serial.begin(115200);
  delay(2000);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);  // off by default

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);  // reduce after begin, not before
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());

  buildTopicsFromMAC();
  setupOTA();

  mqttClient.setServer(MQTT_IP, MQTT_PORT);
  mqttClient.setCallback(onMessage);
}

void loop() {
  ArduinoOTA.handle();

  if (mqttClient.connected()) {
    mqttClient.loop();
  } else {
    mqttReconnect();
  }
}
