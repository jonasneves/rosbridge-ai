.DEFAULT_GOAL := help

-include config.mk

FQBN ?= esp32:esp32:esp32cam
PORT ?= /dev/cu.usbserial-XXXXXXXX

.PHONY: help rosbridge flash

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  rosbridge   Start rosbridge WebSocket server (port 9090)"
	@echo "  flash       Compile and upload ESP32 firmware"
	@echo ""
	@echo "Configure WiFi and IP in config.mk (copy from config.mk.example)"

rosbridge:
	@echo "Rosbridge: ws://localhost:9090"
	@echo "Your IP:   $$(ipconfig getifaddr en0)"
	@echo ""
	docker compose -f docker/docker-compose.yml up --build rosbridge

flash:
	arduino-cli compile \
		--fqbn "$(FQBN)" \
		--build-property 'build.extra_flags=-DWIFI_SSID="$(WIFI_SSID)" -DWIFI_PASS="$(WIFI_PASS)" -DROS_IP="$(ROS_IP)"' \
		firmware/esp32_led_ros
	arduino-cli upload \
		--fqbn "$(FQBN)" \
		--port "$(PORT)" \
		firmware/esp32_led_ros
