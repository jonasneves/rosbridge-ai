/**
 * ESP32-CAM-MB — LED control via rosbridge
 *
 * Connects to WiFi, subscribes to /led/command (std_msgs/Bool) via rosbridge,
 * and toggles the onboard red LED (GPIO 33) accordingly.
 *
 * Required libraries (Tools → Manage Libraries):
 *   - WebSockets by Markus Sattler
 *   - ArduinoJson by Benoit Blanchon
 *
 * Board: AI Thinker ESP32-CAM
 * Port:  /dev/cu.usbserial-* (USB)
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

#ifndef WIFI_SSID
#define WIFI_SSID "your_wifi_ssid"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "your_wifi_password"
#endif
#ifndef ROS_IP
#define ROS_IP "192.168.1.1"  // run `make rosbridge` to see your IP
#endif

const int ROS_PORT = 9090;
const int LED_PIN  = 33;  // red LED on ESP32-CAM-MB (active low)

WebSocketsClient ws;

void onMessage(uint8_t* payload, size_t length) {
  JsonDocument doc;
  deserializeJson(doc, payload, length);

  if (strcmp(doc["op"] | "", "publish") == 0 &&
      strcmp(doc["topic"] | "", "/led/command") == 0) {
    bool on = doc["msg"]["data"].as<bool>();
    digitalWrite(LED_PIN, on ? LOW : HIGH);  // LOW = on
    Serial.println(on ? "LED on" : "LED off");
  }
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("Connected to rosbridge");
      ws.sendTXT("{\"op\":\"subscribe\",\"topic\":\"/led/command\",\"type\":\"std_msgs/Bool\"}");
      break;
    case WStype_TEXT:
      onMessage(payload, length);
      break;
    case WStype_DISCONNECTED:
      Serial.println("Disconnected — retrying...");
      break;
  }
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);  // disable brownout detector
  Serial.begin(115200);
  delay(2000);  // wait for serial monitor to connect
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);  // off by default

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());

  ws.begin(ROS_IP, ROS_PORT, "/");
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(3000);
}

void loop() {
  ws.loop();
}
