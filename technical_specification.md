# Technical Specification: Systemair Home Assistant Integration

## Purpose
The integration provides local polling and control for Systemair ventilation units using Modbus (TCP and Serial) within Home Assistant.

## Requirements
- Compatibility with recent Home Assistant Core versions.
- Clean separation of dependencies to prevent package version conflicts.
- Stable connection handling and error recovery during Modbus communication.

## Dependency Management
- Modbus client utilizes `pymodbus` to send/receive commands.
- The version pin of `pymodbus` must align with the version bundled inside Home Assistant Core to prevent "Requirements not found" errors upon HA startup/updates.
