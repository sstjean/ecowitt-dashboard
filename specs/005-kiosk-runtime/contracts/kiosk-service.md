# Contract: `kiosk.service` (systemd unit)

Canonical target: `/etc/systemd/system/kiosk.service` (0644 root). Captured
verbatim at `/tmp/kiosk-capture/kiosk.service`; vendored at
`deploy/kiosk/systemd/kiosk.service`.

## Exact unit (as shipped)

```ini
[Unit]
Description=Weather wall kiosk (cage + Google Chrome)
After=systemd-user-sessions.service plymouth-quit-wait.service getty@tty1.service
Conflicts=getty@tty1.service

[Service]
Type=simple
User=kiosk
Group=kiosk
PAMName=login
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
StandardInput=tty-fail
StandardOutput=journal
StandardError=journal
UtmpIdentifier=tty1
UtmpMode=user
Environment=XDG_SESSION_TYPE=wayland
ExecStart=/usr/bin/cage -- /usr/local/bin/kiosk-weather
Restart=always
RestartSec=2

[Install]
WantedBy=graphical.target
```

## Guarantees

- **Boot**: enabled into `graphical.target.wants`; starts unattended on a
  cold boot (FR-007).
- **Seat**: `PAMName=login` makes logind grant a seat without a display
  manager; `Conflicts=getty@tty1` keeps a login prompt off tty1 (FR-008).
- **Self-heal (session)**: `Restart=always`, `RestartSec=2` restart the whole
  cage session within ~2 s of failure (FR-013, SC-003).
- **Wayland**: `Environment=XDG_SESSION_TYPE=wayland`; `ExecStart` hands the
  launcher to `cage`.

## Observability

`journalctl -u kiosk.service` shows session lifecycle + the launcher's
relaunch lines on stderr.

## State

enabled+active after provisioning; disabled+inactive after rollback.
`provision.sh` runs `daemon-reload` after install and `systemctl enable
kiosk.service`.
