# Deploy-Setup für trainingsplan

Schritt-für-Schritt — Ubuntu 24.04 auf demselben Hetzner-Server, auf dem schon `elle-eats` läuft. Domain: `trainingsplan.karateabfahrt.de`.

Alle Befehle laufen als `root`, sofern nicht anders vermerkt.

> Wenn elle-eats bereits auf diesem Server läuft, sind die Schritte 1–4 (System-Pakete, Node, Caddy, ufw) schon erledigt — überspringen. Trainingsplan hat keine nativen Dependencies, `build-essential`/`python3` werden hier nicht zwingend gebraucht.

## 1. System updaten + Tools installieren (falls Server frisch)

```bash
apt update && apt upgrade -y
apt install -y curl ca-certificates gnupg ufw
```

## 2. Node.js 20 via NodeSource (falls noch nicht da)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # sollte v20.x ausgeben
```

## 3. Caddy installieren (falls noch nicht da)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  > /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

## 4. Firewall (falls noch nicht eingerichtet)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

## 5. Service-User anlegen

```bash
useradd --system --create-home --home-dir /srv/trainingsplan --shell /usr/sbin/nologin trainingsplan
```

## 6. Repo klonen + Dependencies

```bash
sudo -u trainingsplan git clone https://github.com/Jarek2k/trainingsplan.git /srv/trainingsplan/app
cd /srv/trainingsplan/app/server
sudo -u trainingsplan npm ci --omit=dev
```

## 7. `.env` schreiben

```bash
sudo -u trainingsplan cp /srv/trainingsplan/app/server/.env.example /srv/trainingsplan/app/server/.env
sudo -u trainingsplan nano /srv/trainingsplan/app/server/.env
```

Werte setzen:

| Variable | Wert |
|---|---|
| `PORT` | `3001` |
| `ALLOWED_EMAILS` | `jarekgster@googlemail.com` (deine Mail, ggf. mehrere komma-separiert) |
| `GOOGLE_CLIENT_ID` | aus Google Cloud Console (Projekt: Trainingsplan) |
| `GOOGLE_CLIENT_SECRET` | aus Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://trainingsplan.karateabfahrt.de/auth/google/callback` |
| `SESSION_SECRET` | frisch generieren: `openssl rand -hex 32` |

`COOKIE_SECURE` weglassen (oder auf `true` setzen) → Cookies nur über HTTPS.

Permissions absichern:

```bash
chmod 600 /srv/trainingsplan/app/server/.env
chown trainingsplan:trainingsplan /srv/trainingsplan/app/server/.env
```

## 8. Google OAuth Redirect URI ergänzen

In der Google Cloud Console (Projekt **Trainingsplan**) → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs hinzufügen:

```
https://trainingsplan.karateabfahrt.de/auth/google/callback
```

Den lokalen URI (`http://localhost:5173/auth/google/callback`) drin lassen — beide funktionieren parallel.

## 9. systemd-Unit installieren

```bash
cp /srv/trainingsplan/app/deploy/trainingsplan.service /etc/systemd/system/trainingsplan.service
systemctl daemon-reload
systemctl enable --now trainingsplan
systemctl status trainingsplan
```

Logs:

```bash
journalctl -u trainingsplan -f
```

Test direkt am Server (ohne Caddy):

```bash
curl -I http://localhost:3001/
# 302 Found, Location: /auth/google  ← korrekt, App bouncet zum Login
```

## 10. Caddy-Site hinzufügen

Wir hängen die Site an die bestehende Caddyfile an (in der `elle-eats` schon konfiguriert ist).

```bash
cat /srv/trainingsplan/app/deploy/Caddyfile >> /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

`caddy validate` muss „Valid configuration" zurückgeben.

## 11. DNS setzen

Beim Domain-Provider von `karateabfahrt.de`:

| Typ | Name | Wert |
|---|---|---|
| A | `trainingsplan` | `<Hetzner-IP>` |

(Falls IPv6 vorhanden, zusätzlich AAAA.) Nach DNS-Propagation zieht Caddy automatisch ein Let's-Encrypt-Zert. Logs:

```bash
journalctl -u caddy -f
```

## 12. Smoke-Test

```bash
curl -I https://trainingsplan.karateabfahrt.de/
# 302 → Location: /auth/google
```

Im Browser: `https://trainingsplan.karateabfahrt.de` → Google-Login → mit erlaubter Mail anmelden → Builder erscheint.

## Updates ausrollen

```bash
ssh root@<server>
sudo -u trainingsplan git -C /srv/trainingsplan/app pull
sudo -u trainingsplan npm --prefix /srv/trainingsplan/app/server ci --omit=dev   # nur falls package.json sich geändert hat
systemctl restart trainingsplan
```

Wenn sich `trainingsplan.service` ändert: zusätzlich neu nach `/etc/systemd/system/` kopieren und `systemctl daemon-reload` davor.

Wenn sich die Caddyfile ändert: den Block in `/etc/caddy/Caddyfile` manuell anpassen, dann `systemctl reload caddy`.

## Backups

Live-Daten liegen unter `/srv/trainingsplan/app/server/data/users/<hash>.json` — eine Datei pro eingeloggtem Nutzer. `data/template.json` ist das (read-only) Seed für neue Accounts. Backup einfach das ganze `data/`-Verzeichnis:

```bash
sudo -u trainingsplan tar -czf /tmp/trainingsplan-$(date +%F).tgz \
  -C /srv/trainingsplan/app/server data
```

Auf Hetzner Storage Box rüberkopieren ist ein guter nächster Schritt — nicht teil dieses Setups.

## TL;DR

Wenn der Server (elle-eats-Setup) schon steht, sind die effektiven Schritte:

1. **Service-User + Repo + npm ci** (Schritte 5, 6)
2. **`.env` füllen, chmod 600** (Schritt 7)
3. **Google-OAuth Redirect-URI eintragen** (Schritt 8)
4. **systemd-Unit installieren + starten** (Schritt 9)
5. **Caddy-Block anhängen + reload** (Schritt 10)
6. **DNS-A-Record setzen** (Schritt 11)
7. **Im Browser testen** (Schritt 12)
