"""Custom integration to integrate Systemair VSR with Home Assistant."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from aiohttp import web

from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView
from homeassistant.const import (
    CONF_HOST,
    CONF_IP_ADDRESS,
    CONF_PASSWORD,
    CONF_PORT,
    CONF_USERNAME,
    EVENT_HOMEASSISTANT_STARTED,
    Platform,
)
from homeassistant.core import CoreState
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.loader import async_get_loaded_integration

from .api import SystemairModbusClient, SystemairSerialClient, SystemairWebApiClient
from .const import (
    API_TYPE_HOMESOLUTION,
    API_TYPE_MODBUS_SERIAL,
    API_TYPE_MODBUS_TCP,
    API_TYPE_MODBUS_WEBAPI,
    CARD_FILENAME,
    CONF_API_TYPE,
    CONF_BAUDRATE,
    CONF_BYTESIZE,
    CONF_DEVICE_ID,
    CONF_MODEL,
    CONF_PARITY,
    CONF_SERIAL_PORT,
    CONF_SLAVE_ID,
    CONF_STOPBITS,
    CONF_UPDATE_INTERVAL,
    CONF_WEB_API_MAX_REGISTERS,
    DEFAULT_UPDATE_INTERVAL,
    DEFAULT_WEB_API_MAX_REGISTERS,
    DOMAIN,
    LOGGER,
    VERSION,
)
from .coordinator import SystemairDataUpdateCoordinator
from .data import SystemairConfigEntry, SystemairData
from .homesolution import SystemairHomeSolutionClient

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant


PLATFORMS: list[Platform] = [
    Platform.BUTTON,
    Platform.CLIMATE,
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.SWITCH,
    Platform.NUMBER,
    Platform.SELECT,
]


async def _async_register_card(hass: HomeAssistant) -> None:
    """Register the Lovelace card with a cache-busting version query string."""
    card_url = f"/api/{DOMAIN}/static/{CARD_FILENAME}?v={VERSION}"
    # Try to register as a Lovelace resource (Storage Mode)
    registered_as_resource = await _async_register_lovelace_resource(hass, card_url)
    if not registered_as_resource:
        # Fallback for YAML mode
        frontend.add_extra_js_url(hass, card_url)
        LOGGER.debug("Registered Systemair card via extra_js_url fallback: %s", card_url)
    else:
        LOGGER.debug("Registered Systemair card via Lovelace resource: %s", card_url)


async def _async_register_lovelace_resource(hass: HomeAssistant, url: str) -> bool:
    """Create or update the Lovelace resource entry for the card, cleaning up duplicates."""
    lovelace_data = hass.data.get("lovelace")
    if lovelace_data is None:
        return False

    resources = getattr(lovelace_data, "resources", None)
    if resources is None:
        return False

    if not hasattr(resources, "async_create_item") or not hasattr(resources, "async_update_item"):
        return False

    base_url = url.split("?")[0]
    existing_items = []
    try:
        for item in resources.async_items():
            existing_url = item.get("url") or ""
            existing_base = existing_url.split("?")[0]
            if existing_base == base_url:
                existing_items.append(item)
    except Exception:
        return False

    try:
        if existing_items:
            # Update the first resource
            first_item = existing_items[0]
            if first_item.get("url") != url:
                await resources.async_update_item(first_item["id"], {"res_type": "module", "url": url})
                LOGGER.info("Updated Systemair Lovelace resource: %s", url)

            # Safely delete duplicates in separate step
            if len(existing_items) > 1 and hasattr(resources, "async_delete_item"):
                for duplicate in existing_items[1:]:
                    await resources.async_delete_item(duplicate["id"])
                    LOGGER.info("Deleted duplicate Systemair Lovelace resource: %s", duplicate.get("url"))
        else:
            await resources.async_create_item({"res_type": "module", "url": url})
            LOGGER.info("Created Systemair Lovelace resource: %s", url)
    except Exception as err:
        LOGGER.warning("Failed to register Systemair Lovelace resource: %s", err)
        return False

    return True


class CardStaticView(HomeAssistantView):
    """View to serve static card files with CORS."""
    url = f"/api/{DOMAIN}/static/{{filename}}"
    name = f"api:{DOMAIN}:static"
    requires_auth = False
    cors_allowed = True

    def __init__(self, www_path: Path) -> None:
        self._www_path = www_path

    async def get(self, request, filename: str):
        """Handle GET request for static files."""
        if filename != CARD_FILENAME:
            return web.Response(status=404)

        file_path = self._www_path / filename
        if not file_path.exists():
            return web.Response(status=404)

        try:
            return web.FileResponse(
                file_path,
                headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"}
            )
        except Exception:
            return web.Response(status=500)


async def async_setup_entry(hass: HomeAssistant, entry: SystemairConfigEntry) -> bool:
    """Set up this integration using UI."""
    # Register the static HTTP view immediately (once per HA start to prevent route conflict on reload)
    hass.data.setdefault(DOMAIN, {})
    if not hass.data[DOMAIN].get("_view_registered"):
        if getattr(hass, "http", None) is not None:
            www_path = Path(__file__).parent / "www"
            hass.http.register_view(CardStaticView(www_path))
        hass.data[DOMAIN]["_view_registered"] = True

    # Defer Lovelace card database resource registration to prevent startup deadlocks
    if hass.state == CoreState.running:
        hass.async_create_task(_async_register_card(hass))
    else:
        async def _register_card_after_start(event):
            await _async_register_card(hass)
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _register_card_after_start)

    api_type = entry.data.get(CONF_API_TYPE, API_TYPE_MODBUS_TCP)

    if api_type == API_TYPE_MODBUS_WEBAPI:
        max_registers = entry.options.get(CONF_WEB_API_MAX_REGISTERS, DEFAULT_WEB_API_MAX_REGISTERS)
        client = SystemairWebApiClient(
            address=entry.data[CONF_IP_ADDRESS],
            session=async_get_clientsession(hass),
            max_registers_per_request=max_registers,
        )
    elif api_type == API_TYPE_MODBUS_SERIAL:
        client = SystemairSerialClient(
            port=entry.data[CONF_SERIAL_PORT],
            baudrate=entry.data[CONF_BAUDRATE],
            bytesize=entry.data[CONF_BYTESIZE],
            parity=entry.data[CONF_PARITY],
            stopbits=entry.data[CONF_STOPBITS],
            slave_id=entry.data[CONF_SLAVE_ID],
        )
        await client.start()
    elif api_type == API_TYPE_HOMESOLUTION:
        client = SystemairHomeSolutionClient(
            username=entry.data[CONF_USERNAME],
            password=entry.data[CONF_PASSWORD],
            device_id=entry.data[CONF_DEVICE_ID],
        )
        await client.start()
    else:
        # Default to Modbus TCP
        client = SystemairModbusClient(
            host=entry.data[CONF_HOST],
            port=entry.data[CONF_PORT],
            slave_id=entry.data[CONF_SLAVE_ID],
        )
        await client.start()

    update_interval = entry.options.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL)
    coordinator = SystemairDataUpdateCoordinator(
        hass=hass,
        client=client,
        config_entry=entry,
        update_interval_seconds=update_interval,
    )

    model = entry.options.get(CONF_MODEL, entry.data.get(CONF_MODEL, "VSR 300"))

    entry.runtime_data = SystemairData(
        client=client,
        coordinator=coordinator,
        integration=async_get_loaded_integration(hass, entry.domain),
        model=model,
        api_type=api_type,
    )

    if api_type == API_TYPE_MODBUS_WEBAPI:
        await coordinator.async_setup_webapi()
        await coordinator.async_config_entry_first_refresh()
    else:
        # For Modbus TCP, just start normal updates
        pass

    entry.async_on_unload(entry.add_update_listener(async_options_update_listener))

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_options_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Handle removal of an entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        api_type = entry.data.get(CONF_API_TYPE, API_TYPE_MODBUS_TCP)
        if api_type in (API_TYPE_MODBUS_TCP, API_TYPE_MODBUS_SERIAL, API_TYPE_HOMESOLUTION):
            client = entry.runtime_data.client
            await client.stop()

    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry."""
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)
