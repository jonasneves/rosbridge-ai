# MQTT AI Dashboard

Browser dashboard for controlling physical robots with AI. The AI chat calls Claude directly from the browser — no backend, no MCP server, no Python.

## Architecture

The browser runs everything: MQTT.js connects to a Mosquitto broker over WebSocket. Claude is called directly from the browser with MQTT tool definitions, and when Claude responds with a tool call, the dashboard publishes to the broker. The ESP32 subscribes to the same broker over TCP.

```
Browser
  ├── MQTT.js (WebSocket → port 9001)  ←→  Mosquitto (Docker)  ←→  ESP32-CAM (TCP 1883)
  └── Claude API (direct)
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) — for Mosquitto
- [Homebrew](https://brew.sh/) — to install host dependencies
- Anthropic API key — for the AI chat

## Quickstart

**1. Install host dependencies** (once per machine)
```bash
make setup
```
After install, macOS will prompt you to allow the CP210x driver in **System Preferences > Privacy & Security**. Do that before flashing.

**2. Configure credentials** (first time only)
```bash
cp config.mk.example config.mk
```
Edit `config.mk` with your WiFi SSID and password.

**3. Start MQTT broker**
```bash
make mqtt
```
Note the IP it prints — that's your `MQTT_IP` (auto-detected from `en0`).

**4. Flash firmware** (first time, via USB)
```bash
make flash
```
After boot, the ESP32 prints its IP. Add it to `config.mk` as `ESP32_IP` to enable OTA.

**5. Open the dashboard**
```bash
make preview
```
Go to [http://localhost:8080](http://localhost:8080) and connect to `ws://localhost:9001`.

Or use the hosted version at [neevs.io/ros](https://neevs.io/ros).

**6. Control your robot**

Browse topics and publish manually, or open the AI chat panel, enter your Anthropic API key, and describe what you want the robot to do.

## OTA updates

After the first USB flash, subsequent firmware updates can go over WiFi:

```bash
make ota
```

Requires `ESP32_IP` set in `config.mk` (printed by the ESP32 on boot).

## Repo structure

```
dashboard/   Static web app — AI chat (Claude API) + MQTT topic browser
docker/      Mosquitto MQTT broker config (MQTT: 1883, WebSocket: 9001)
firmware/    ESP32 Arduino sketch — LED control via MQTT, OTA support
Makefile     make setup    — install host dependencies (once per machine)
             make mqtt     — start Mosquitto broker
             make preview  — serve dashboard at http://localhost:8080
             make flash    — compile and upload firmware over USB (first time)
             make ota      — upload firmware over WiFi (requires ESP32_IP)
             make monitor  — open serial console
```

## Notes

The dashboard also registers MQTT tools via the [W3C WebMCP spec](https://github.com/webmachinelearning/webmcp) (`navigator.modelContext`), which exposes them to native browser AI agents. This requires Chrome 146+ Canary with `chrome://flags/#webmcp-for-testing`. The AI chat works without this — it's an optional enhancement.
