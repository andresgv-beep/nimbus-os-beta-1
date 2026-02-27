# ☁️ NimbusOS

**A modern, open-source NAS operating system** with a desktop-like web interface.

Transform any Ubuntu Server into a powerful NAS with Docker container management, media streaming, file sharing, and more — all from a beautiful browser-based desktop.

---

## ✨ Features

- 🖥️ **Desktop UI** — Glass-effect windowed interface with taskbar, dock, and app launcher
- 🐳 **Docker Management** — Install, configure, and manage containers from the App Store
- 📁 **File Manager** — Browse, upload, download files with drag-and-drop
- 💾 **Storage Manager** — RAID configuration, disk health monitoring (SMART)
- 🌐 **Network Manager** — Firewall rules, port scanning, UPnP router forwarding, DDNS
- 📊 **System Monitor** — CPU, RAM, GPU, temperatures in real-time
- 🎵 **Media Player** — Built-in audio/video player
- 📝 **Text Editor** — Edit configuration files from the browser
- 🔐 **Multi-user** — Admin and standard accounts with role-based access
- 🎨 **Themes** — Dark, Midnight, and Light (warm cream) themes
- 🖥️ **GPU Support** — NVIDIA/AMD driver management from the UI

## 📋 Requirements

- **OS**: Ubuntu Server 22.04+ or Debian 12+
- **CPU**: x86_64 or ARM64 (aarch64)
- **RAM**: 1GB minimum, 2GB+ recommended
- **Disk**: 2GB free for NimbusOS + storage for your data
- **Network**: Ethernet connection

## 🚀 Quick Install

One command on a fresh Ubuntu Server:

```bash
curl -fsSL https://raw.githubusercontent.com/nimbusos-project/nimbusos/main/install.sh | sudo bash
```

This installs:
- Node.js 20
- Docker CE
- Samba (SMB file sharing)
- UFW firewall (preconfigured)
- Avahi (mDNS — access via `hostname.local`)
- NimbusOS as a systemd service

### Manual Install

```bash
git clone https://github.com/nimbusos-project/nimbusos.git /opt/nimbusos
cd /opt/nimbusos
npm install --production
sudo node server/index.cjs
```

## 🔧 Management

```bash
# Service control
sudo systemctl status nimbusos
sudo systemctl restart nimbusos
sudo journalctl -u nimbusos -f

# Update to latest
sudo /opt/nimbusos/scripts/update.sh

# Uninstall
sudo /opt/nimbusos/scripts/uninstall.sh
```

## 📁 Directory Structure

```
/opt/nimbusos/          # Application code
/etc/nimbusos/          # Configuration
/var/lib/nimbusos/      # User data, app data, shares
/var/log/nimbusos/      # Logs
```

## 🌐 Default Ports

| Port | Service | Description |
|------|---------|-------------|
| 5000 | NimbusOS | Web UI |
| 22   | SSH | Terminal access |
| 445  | Samba | Windows file sharing |
| 5353 | Avahi | mDNS discovery |

## 🔒 Security

NimbusOS includes:
- UFW firewall with sensible defaults
- Session-based authentication with Argon2id password hashing
- CSRF protection
- Admin role separation
- Firewall management UI with protected ports (SSH, NimbusOS)
- UPnP port forwarding (opt-in per port)

For remote access, we recommend:
1. **SSH Tunnel** (simplest, most secure)
2. **WireGuard VPN**
3. **Reverse Proxy + Let's Encrypt** (via DDNS)

## 🏗️ Architecture

```
Browser ──→ Vite (dev) / Static (prod) ──→ Node.js Backend
                                              ├── System APIs (/proc, /sys, lm-sensors)
                                              ├── Docker API (unix socket)
                                              ├── Storage (mdadm, smartctl)
                                              ├── Network (ufw, ss, UPnP)
                                              └── File System (SMB, NFS)
```

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss major changes.

## 📄 License

MIT License — see [LICENSE](LICENSE)

---

Built with ❤️ for the self-hosting community.
