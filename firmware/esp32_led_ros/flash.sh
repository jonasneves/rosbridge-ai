#!/bin/bash
set -e

SKETCH_DIR="$(cd "$(dirname "$0")" && pwd)"
FQBN="esp32:esp32:esp32cam"
PORT="/dev/cu.usbserial-A5069RR4"

echo "Compiling..."
arduino-cli compile --fqbn "$FQBN" "$SKETCH_DIR"

echo "Uploading to $PORT..."
arduino-cli upload --fqbn "$FQBN" --port "$PORT" "$SKETCH_DIR"

echo "Done. Open Serial Monitor: arduino-cli monitor --port $PORT --config baudrate=115200"
