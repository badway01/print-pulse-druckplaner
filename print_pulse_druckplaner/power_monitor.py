"""Shelly power snapshot and opt-in ntfy alerts for the Print & Pulse add-on.

Observational monitoring only. It is NOT a protective relay, circuit breaker
or proof that a wall socket / extension / cable is safe for the observed load.
"""
import json
import math
import re
import time
import urllib.error
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

DEVICES = ('H2D', 'P1S Old', 'P1S New', 'Snapmaker U1', 'X2D', 'A1', 'A1 mini', 'Kühlschrank')
PRINTER_COUNT = 7
DEFAULT_WARNING = 2500
DEFAULT_CRITICAL = 3200
TOPIC_RE = re.compile(r'^[A-Za-z0-9_-]{5,128}$')
CONF_KEY = 'power_monitor_config'
ALERT_KEY = 'power_monitor_alert_state'


def defaults():
    return {'bindings': {}, 'warning_w': DEFAULT_WARNING,
            'critical_w': DEFAULT_CRITICAL, 'ntfy_topic': ''}


def config(db, cfg):
    value = cfg(db, CONF_KEY, '')
    try:
        raw = json.loads(value) if value else {}
    except (TypeError, ValueError):
        raw = {}
    result = defaults()
    if isinstance(raw, dict):
        result.update({k: raw[k] for k in result if k in raw})
    if not isinstance(result['bindings'], dict):
        result['bindings'] = {}
    return result


def watts(state):
    if not isinstance(state, dict):
        return None
    attrs = state.get('attributes') or {}
    unit = str(attrs.get('unit_of_measurement') or '').strip().lower()
    if unit not in ('w', 'kw'):
        return None
    try:
        value = float(state.get('state'))
    except (ValueError, TypeError, OverflowError):
        return None
    if not math.isfinite(value) or value < 0 or value > 30000:
        return None
    return round(value * (1000 if unit == 'kw' else 1), 1)


def sensor_choices(states):
    result = []
    for key, state in states.items():
        if key.startswith('sensor.') and (watts(state) is not None or
            str((state.get('attributes') or {}).get('device_class', '')).lower() == 'power'):
            # Keep unavailable sensors selectable so transient offline states
            # do not erase a previously configured mapping.
            unit = str((state.get('attributes') or {}).get('unit_of_measurement', '')).lower()
            if unit not in ('w', 'kw'):
                continue
            result.append({'id': key,
                           'name': str((state.get('attributes') or {}).get('friendly_name') or key)[:120]})
    return sorted(result, key=lambda item: item['name'].casefold())


def snapshot(states, settings):
    bindings = settings['bindings']
    devices = []
    total = 0.0
    measured = 0
    configured = 0
    for name in DEVICES:
        entity = bindings.get(name) or ''
        if entity:
            configured += 1
        value = watts(states.get(entity)) if entity else None
        if value is not None:
            total += value
            measured += 1
        devices.append({'name': name, 'entity': entity, 'watts': value})
    actual = round(total, 1) if measured else None
    warning = settings['warning_w']
    critical = settings['critical_w']
    level = ('unknown' if actual is None else
             'critical' if actual >= critical else
             'warning' if actual >= warning else 'normal')
    return {'watts': actual,
            'amps': round(total / 230, 2) if measured else None,
            'reference_percent_16a': round(total / 3680 * 100) if measured else None,
            'measured': measured, 'configured': configured,
            'printers_configured': sum(bool(bindings.get(n)) for n in DEVICES[:PRINTER_COUNT]),
            'printers_measured': sum(x['watts'] is not None for x in devices[:PRINTER_COUNT]),
            'devices': devices, 'level': level,
            'warning_w': warning, 'critical_w': critical,
            'ntfy_enabled': bool(settings['ntfy_topic']),
            'complete': all(x['watts'] is not None for x in devices[:PRINTER_COUNT]),
            'note': 'Nur zugeordnete Shelly-Sensoren. Kühlschrank optional. Die 16-A-Referenz ist KEINE gemessene Stromkreis-Auslastung.'}


def read_settings(db, cfg, states):
    result = config(db, cfg)
    result['devices'] = list(DEVICES)
    result['sensors'] = sensor_choices(states)
    return result


def save_settings(db, cfg, put_cfg, data, states):
    if not isinstance(data, dict):
        raise ValueError('Ungültige Einstellungen.')
    bindings = data.get('bindings')
    if not isinstance(bindings, dict) or set(bindings) - set(DEVICES):
        raise ValueError('Ungültige Messpunkt-Zuordnung.')
    cleaned = {}
    for name in DEVICES:
        entity = bindings.get(name, '')
        if not isinstance(entity, str):
            raise ValueError('Ungültige Sensor-ID.')
        if entity:
            if not entity.startswith('sensor.') or entity not in states:
                raise ValueError('Bitte einen vorhandenen Home-Assistant-Leistungssensor wählen.')
            a = (states[entity].get('attributes') or {})
            if str(a.get('unit_of_measurement', '')).strip().lower() not in ('w','kw'):
                raise ValueError('Nur Leistungs-Sensoren in W oder kW sind erlaubt.')
            cleaned[name] = entity
    if len(set(cleaned.values())) != len(cleaned):
        raise ValueError('Ein Sensor darf nur einem Gerät zugeordnet sein.')
    try:
        warning = int(data.get('warning_w', DEFAULT_WARNING))
        critical = int(data.get('critical_w', DEFAULT_CRITICAL))
    except (TypeError, ValueError):
        raise ValueError('Warnschwellen müssen ganze Wattwerte sein.')
    if not (300 <= warning <= 9000 and warning + 100 <= critical <= 10000):
        raise ValueError('Grenzen: Warnung ab 300 W; Alarm mindestens 100 W darüber, maximal 10.000 W.')
    topic = str(data.get('ntfy_topic') or '').strip()
    if topic and not TOPIC_RE.fullmatch(topic):
        raise ValueError('ntfy-Topic: 5–128 Zeichen, nur Buchstaben, Zahlen, - oder _.')
    result = {'bindings': cleaned, 'warning_w': warning,
              'critical_w': critical, 'ntfy_topic': topic}
    put_cfg(db, CONF_KEY, json.dumps(result, ensure_ascii=False))
    # Changing sensors / limits should not keep an old alert episode active.
    put_cfg(db, ALERT_KEY, '{}')
    return result


def send_ntfy(topic, title, message, priority='4'):
    if not TOPIC_RE.fullmatch(topic or ''):
        raise ValueError('ntfy-Topic nicht eingerichtet.')
    request = urllib.request.Request(
        'https://ntfy.sh/' + topic,
        data=message.encode('utf-8'), method='POST',
        headers={'Title': title, 'Priority': priority,
                 'Tags': 'warning,printer', 'Content-Type': 'text/plain; charset=utf-8'})
    with urllib.request.urlopen(request, timeout=8) as response:
        if response.status >= 300:
            raise RuntimeError('ntfy hat die Nachricht nicht angenommen.')


def test_notification(db, cfg):
    setting = config(db, cfg)
    topic = setting['ntfy_topic']
    if not topic:
        raise ValueError('Bitte zuerst ntfy-Topic speichern.')
    try:
        send_ntfy(topic, 'Print & Pulse: Stromtest',
                  'Test der Stromüberwachung. Die Warnungen überwachen nur konfigurierte Leistungssensoren.')
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError('ntfy nicht erreichbar. Topic und Internetzugriff des Add-ons prüfen.') from exc
    return {'ok': True}


def poll_alert(db, cfg, put_cfg, states, now=None):
    """Run every ~15 s. Alert only after sustained load; rearm after 2 min.

    Missing/offline measurements never count as zero and cannot rearm.
    State is in SQLite to avoid repeated notifications after add-on restarts.
    """
    now = int(time.time() if now is None else now)
    setting = config(db, cfg)
    if not setting['ntfy_topic'] or not setting['bindings']:
        return
    result = snapshot(states, setting)
    if result['watts'] is None:
        return
    try:
        previous = json.loads(cfg(db, ALERT_KEY, '{}'))
    except (ValueError, TypeError):
        previous = {}
    if not isinstance(previous, dict):
        previous = {}
    level = result['level']
    if level not in ('warning', 'critical'):
        # A missing configured sensor could conceal a high load. Never use
        # incomplete measurements as proof that the alarm has cleared.
        if result['measured'] < result['configured']:
            return
        below = int(previous.get('below_since') or now)
        if now - below >= 120:
            previous = {}
        else:
            previous['below_since'] = below
        put_cfg(db, ALERT_KEY, json.dumps(previous))
        return
    if previous.get('candidate') != level:
        previous['candidate'] = level
        previous['since'] = now
    previous.pop('below_since', None)
    sent = previous.get('sent', '')
    if now - int(previous.get('since') or now) < 30 or sent == level:
        put_cfg(db, ALERT_KEY, json.dumps(previous))
        return
    # No silent flood on network errors. Retry after at least 60 seconds.
    if now - int(previous.get('attempt') or 0) < 60:
        return
    previous['attempt'] = now
    put_cfg(db, ALERT_KEY, json.dumps(previous))
    # Explicitly avoid calling ntfy while a DB transaction is held upstream:
    # the caller commits this state first, then sends via the returned message.
    clock = datetime.fromtimestamp(now, ZoneInfo('Europe/Berlin')).strftime('%H:%M')
    headline = 'Hohe Leistung' if level == 'warning' else 'Kritische Leistung'
    message = (f'{clock} Uhr: {result["watts"]:.0f} W / ca. {result["amps"]:.1f} A '
               f'gemessene Gesamtleistung ({result["printers_measured"]}/{PRINTER_COUNT} Drucker erfasst). '
               'Bitte Farm und Stromversorgung kontrollieren. '
               'Die tatsächliche Stromkreislast kann abweichen; kein automatischer Überlastungsschutz.')
    return {'level': level, 'message': message, 'title': 'Print & Pulse: ' + headline,
            'topic': setting['ntfy_topic'], 'priority': '5' if level == 'critical' else '4',
            'since': previous['since']}


def mark_sent(db, cfg, put_cfg, message):
    try:
        previous = json.loads(cfg(db, ALERT_KEY, '{}'))
    except (TypeError, ValueError):
        return
    if previous.get('candidate') == message['level'] and previous.get('since') == message['since']:
        previous['sent'] = message['level']
        put_cfg(db, ALERT_KEY, json.dumps(previous))
