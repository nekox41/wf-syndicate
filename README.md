# Warframe Syndicate

一个面向 Warframe 玩家的简体中文集团声望工具，包含声望计算、集团运营策略及可交易物品行情。网页使用原生 HTML、CSS、JavaScript，无构建步骤、无前端依赖；Python 仅负责离线生成行情 JSON，Nginx 负责提供静态文件。

## 功能

- **声望计算器**：选择集团、段位和声望额度，查看自身、同盟、对立、敌对集团的声望变化与每日上限；支持勋章兑换估算。
- **运营策略**：展示集团关系矩阵、两种运营轴、阶段建议及每日收益示例。
- **集团好物**：手动选择集团，仅渲染当前集团的紧凑文字卡片，不创建物品图片节点或下载图片。卡片显示物品名称、兑换所需声望、销量及首位卖单价格，名称链接到 Warframe Market。
- **周期切换**：默认按所选集团的 48 小时销量降序排列，也可切换 90 天；未知销量排在已知销量后。
- **数据状态**：显示行情更新时间、后台抓取进度、缺失数据及超过两小时未更新提示；可手动重新读取行情，页面打开期间也会每小时读取一次。

## 架构与目录

```text
浏览器 ──同源读取──> Nginx / 静态服务器
                        ├── index.html、styles.css、app.js
                        ├── items.json（集团兑换目录）
                        └── market-data.json（行情快照）
                                  ↑ 原子替换
                         Python 定时更新脚本
                                  ↓ 限速请求
                          Warframe Market API
```

| 文件 / 目录 | 作用 |
| --- | --- |
| `index.html` | 三个页面的标记和控件 |
| `styles.css` | 黑白红界面、响应式布局及紧凑卡片 |
| `app.js` | 声望计算、页面切换、集团筛选、行情排序与读取 |
| `items.json` | 按集团组织的可交易物品、兑换条件及市场标识 |
| `market-data.json` | 按物品 slug 去重的行情及更新时间 |
| `scripts/update_market.py` | 行情抓取、失败重试、定时循环及文件写入 |
| `deploy/` | Nginx 配置及 systemd 服务、定时器模板 |
| `tests/` | Python 标准库 unittest 测试 |

浏览器不直接调用市场 API，因此不需要 CORS 代理、后端 Web 服务或浏览器扩展，也不再读取旧版本的 `localStorage` 行情缓存。

## 本地使用

需要现代浏览器；更新行情需要 **Python 3.10+** 和可访问 `api.warframe.market` 的网络。均无需安装第三方 Python 包。

```bash
# 在仓库目录中执行，已有行情文件时可跳过首次抓取
python3 scripts/update_market.py

# 启动静态服务器；也可使用 VSCode Live Server
python3 -m http.server 8000
```

打开 <http://localhost:8000>。请通过 HTTP 服务访问，而不是双击文件；网页需要读取同目录的 JSON。

## 行情数据与更新

### 数据含义

- `items.json` 保存集团元信息与 `favours` 列表；物品包含 `storeItem`、`standingCost`、`requiredLevel` 及来自市场目录的 `i18n`、`slug`、`id`、`gameRef`。
- 行情采用 **PC 市场**，每种 slug 仅请求一组接口，同一物品在不同集团间共享数据。
- 销量取 `/v1/items/{slug}/statistics` 的 `statistics_closed`，分别累加 `48hours`、`90days` 的 `volume`，包含不同等级的记录；不统计 `statistics_live`。
- 价格取 `/v2/orders/item/{slug}/top` 的 `data.sell[0].platinum`，单位为白金 `P`。这只是首条卖单报价，不保证实际成交；无卖单显示“暂无卖单”。

### 运行方式

```bash
# 抓取一轮后退出
python3 scripts/update_market.py

# 立即抓取，随后每小时开始一轮（终端进程需保持运行）
python3 scripts/update_market.py --watch

# 自定义周期、输入和输出
python3 scripts/update_market.py --watch --interval 1800 \
  --items /path/to/items.json --output /path/to/market-data.json
```

默认输入输出相对于仓库位置，不依赖当前工作目录。`--interval` 单位是秒，默认 3600；一轮超过间隔时结束后开始下一轮，不并行运行两轮。按 Ctrl+C 停止。部署时推荐下文的 systemd 定时器，与 `--watch` 二选一。

所有工作线程与重试共享限速器，请求开始至少间隔 510 毫秒，每秒最多两次。限流或临时网络错误最多尝试三次。当前约 441 种物品需访问两个接口，一轮通常约 8–15 分钟，网络异常时可能更久。

每处理 20 种物品及整轮结束时，使用临时文件和原子替换保存结果，网页不会读到未写完的 JSON。单个接口失败保留旧值、旧时间并记录错误；没有旧值则显示数据缺失，不伪装成零销量。一次性模式出现失败时退出码为 1，循环模式记录后继续下一轮。

### 快照结构

```json
{
  "schemaVersion": 1,
  "platform": "pc",
  "startedAt": "2026-10-20T06:00:00+00:00",
  "updatedAt": "2026-10-20T06:08:00+00:00",
  "completedAt": "2026-10-20T06:08:00+00:00",
  "total": 1,
  "processed": 1,
  "items": {
    "example_slug": {
      "statistics": { "48hours": 45, "90days": 1531 },
      "orders": 30,
      "statisticsUpdatedAt": "2026-10-20T06:07:59+00:00",
      "ordersUpdatedAt": "2026-10-20T06:08:00+00:00"
    }
  }
}
```

这是结构示例。`orders: null` 表示无卖单；抓取失败会附带 `statisticsError` 或 `ordersError`。`completedAt: null` 表示本轮尚未完成，`updatedAt` 是最近一次文件保存时间，各字段的更新时间反映其实际新鲜程度。

## Nginx 部署：升级现有 syndicate 站点

本流程按你现有的服务器布局设计，操作用户为 `ubuntu`，Nginx 和 Let's Encrypt 证书已经配置好。保留域名、HTTPS 和其他站点，不需要重新申请证书或新建第二个站点配置。

| 项目 | 路径 / 配置 |
| --- | --- |
| 域名 | `https://syndicate.aameow.com` |
| Nginx 配置 | `/etc/nginx/sites-available/syndicate` |
| 公开站点目录 | `/var/www/syndicate` |
| 现有证书 | `/etc/letsencrypt/live/syndicate.aameow.com/` |
| 新增源码目录 | `/home/ubuntu/wf-syndicate`，不对外提供 |
| 行情输出 | `/var/www/syndicate/market-data.json` |
| 定时任务用户 | `ubuntu` |

原站点只有内联 CSS、JavaScript 的 `index.html` 和 `favicon.ico`。新版还需要 `styles.css`、`app.js`、`items.json`、`market-data.json`；不能只替换 HTML。最终公开目录应包含：

```text
/var/www/syndicate/
├── index.html
├── styles.css
├── app.js
├── favicon.ico
├── items.json
└── market-data.json
```

源码、脚本和 Git 数据留在 `/home/ubuntu/wf-syndicate`，不要把整个仓库放进公开目录。

### 1. 备份原站点与 Nginx 配置

以下命令在服务器上以 `ubuntu` 用户执行：

```bash
SYNDICATE_BACKUP_DIR="/home/ubuntu/syndicate-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SYNDICATE_BACKUP_DIR"
sudo cp -a /etc/nginx/sites-available/syndicate "$SYNDICATE_BACKUP_DIR/nginx.conf"
sudo cp -a /var/www/syndicate "$SYNDICATE_BACKUP_DIR/site"
printf '备份位置：%s\n' "$SYNDICATE_BACKUP_DIR"
```

记下打印的目录供回滚使用。此步骤不改动正在提供服务的文件。

### 2. 获取新版源码与准备权限

已有 Nginx，无需重新安装。确认 Python 版本至少为 3.10：

```bash
sudo apt update
sudo apt install -y python3 git ca-certificates curl
python3 --version

# 替换为实际仓库地址；使用 ubuntu 用户克隆，不使用 sudo git clone
REPO_URL='https://github.com/YOUR_NAME/wf-syndicate.git'
git clone "$REPO_URL" /home/ubuntu/wf-syndicate
```

如果已经上传或克隆到该目录，跳过 `git clone`，在目录中更新源码即可。部署前确认 `items.json`、`scripts/`、`deploy/` 均已提交推送或上传。

你的 `/var/www/syndicate` 目录目前归 `root:root` 所有，虽然已有文件归 `ubuntu`，更新脚本仍无法在目录中创建临时文件并原子替换 JSON。因此只调整这个站点目录的所有者：

```bash
sudo chown ubuntu:ubuntu /var/www/syndicate
sudo chmod 755 /var/www/syndicate
test -w /var/www/syndicate
test -r /home/ubuntu/wf-syndicate/items.json
```

不需要修改 `/var/www` 或其他站点的所有权，也不需要 `chmod 777`。Nginx 通过目录的 755 和文件的 644 权限读取内容；更新脚本输出文件也会设为 644。

### 3. 安装行情服务，生成首份线上数据

仓库提供的 service 已按上述用户和路径配置：

```ini
[Unit]
Description=Update Warframe Syndicate market snapshot
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/wf-syndicate
ExecStart=/usr/bin/python3 /home/ubuntu/wf-syndicate/scripts/update_market.py --items /home/ubuntu/wf-syndicate/items.json --output /var/www/syndicate/market-data.json
TimeoutStartSec=45min
UMask=0022
```

安装服务并先抓取一轮，此时旧 HTML 仍可正常访问：

```bash
sudo install -m 644 /home/ubuntu/wf-syndicate/deploy/wf-market-update.service \
  /home/ubuntu/wf-syndicate/deploy/wf-market-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start wf-market-update.service
```

最后一条命令会等待整轮抓取，通常约 8–15 分钟。可以在另一个终端查看进度：

```bash
sudo journalctl -u wf-market-update.service -f
```

在日志终端按 Ctrl+C 仅停止跟随日志，不停止服务。抓取结束后检查：

```bash
sudo systemctl show wf-market-update.service -p Result -p ExecMainStatus
python3 -c 'import json; d=json.load(open("/var/www/syndicate/market-data.json")); print(d["updatedAt"], d["processed"], d["total"], d["completedAt"])'
```

`Result=success`、`ExecMainStatus=0` 表示整轮无错误；`processed` 应等于 `total` 且 `completedAt` 非空。首次失败可查日志后重新执行 `systemctl start`；不要另开 `--watch` 或第二份抓取程序。部分失败仍会保留成功数据和旧值。

### 4. 替换现有 Nginx 配置

原有配置对 CSS、JS 缓存七天。新版资源文件名没有内容哈希，更新后可能继续加载旧脚本，因此将 CSS、JS 改为使用前重新验证，图片和图标继续缓存七天；行情文件禁止缓存。

将 `/etc/nginx/sites-available/syndicate` 替换为下列完整内容（仓库 `deploy/nginx.conf` 与此一致）：

```nginx
# Install as /etc/nginx/sites-available/syndicate.
server {
    listen 80;
    listen [::]:80;
    server_name syndicate.aameow.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name syndicate.aameow.com;

    ssl_certificate /etc/letsencrypt/live/syndicate.aameow.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/syndicate.aameow.com/privkey.pem;

    root /var/www/syndicate;
    index index.html;
    autoindex off;

    access_log /var/log/nginx/syndicate.access.log;
    error_log /var/log/nginx/syndicate.error.log;

    location = /market-data.json {
        add_header Cache-Control "no-store" always;
        try_files $uri =404;
    }

    location / {
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri/ =404;
    }

    location ~* \.(png|jpg|jpeg|gif|svg|webp|woff2?|ico)$ {
        expires 7d;
        try_files $uri =404;
    }

    location ~ /\. {
        deny all;
    }

    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

证书路径及 HTTP 到 HTTPS 的跳转沿用你的现有配置。可直接复制模板后验证、平滑重载：

```bash
sudo install -m 644 /home/ubuntu/wf-syndicate/deploy/nginx.conf \
  /etc/nginx/sites-available/syndicate
ls -l /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

已有站点通常已经启用。确认 `sites-enabled` 中有一个指向该配置的链接即可，链接名称不必相同；只有完全没有启用链接时，才执行：

```bash
sudo ln -s /etc/nginx/sites-available/syndicate /etc/nginx/sites-enabled/syndicate
sudo nginx -t
sudo systemctl reload nginx
```

若 `nginx -t` 失败，先修正错误，不执行 reload。不修改其他站点或重新运行 Certbot 申请证书。缓存规则与重载方式参考 [Nginx 响应头文档](https://nginx.org/en/docs/http/ngx_http_headers_module.html) 和 [官方入门指南](https://nginx.org/en/docs/beginners_guide.html)。

### 5. 发布新版网页

先放置新版依赖，最后替换入口 HTML，避免新页面引用尚未上传的资源：

```bash
sudo install -m 644 /home/ubuntu/wf-syndicate/styles.css \
  /home/ubuntu/wf-syndicate/app.js /home/ubuntu/wf-syndicate/favicon.ico \
  /home/ubuntu/wf-syndicate/items.json /var/www/syndicate/
sudo install -m 644 /home/ubuntu/wf-syndicate/index.html /var/www/syndicate/
```

不要把仓库里的历史 `market-data.json` 覆盖到线上，使用第 3 步生成的文件。静态文件更新不需要重启 Nginx。

检查域名访问、跳转、资源和缓存头：

```bash
curl -I http://syndicate.aameow.com/
curl -I https://syndicate.aameow.com/
curl -I https://syndicate.aameow.com/styles.css
curl -I https://syndicate.aameow.com/app.js
curl -I https://syndicate.aameow.com/items.json
curl -I https://syndicate.aameow.com/market-data.json
```

HTTP 应返回 301，HTTPS 页面及资源应返回 200。CSS、JS 应有 `Cache-Control: no-cache`，行情应有 `Cache-Control: no-store`。如需绕过外部 DNS/CDN 验证服务器自身，可使用：

```bash
curl --resolve syndicate.aameow.com:443:127.0.0.1 \
  -I https://syndicate.aameow.com/market-data.json
```

浏览器打开 <https://syndicate.aameow.com>，强制刷新后检查计算器、策略、集团切换和销量周期切换。已经按旧规则缓存七天的 CSS、JS 不会因为服务器改规则而立即失效；曾访问过拆分版本的用户首次需强制刷新，有 CDN 时同步清理其资源缓存。

### 6. 启用每小时自动更新

首轮数据确认正常后启用定时器：

```bash
sudo systemctl enable --now wf-market-update.timer
sudo systemctl list-timers --all wf-market-update.timer
```

定时器使用 `OnCalendar=hourly` 在每小时整点运行，`Persistent=true` 会在停机错过任务后补跑；同一 service 还在运行时不会启动另一份。具体行为参考 [systemd timer 文档](https://www.freedesktop.org/software/systemd/man/260/systemd.timer.html)。不要再同时配置 cron 或 `--watch`。

```bash
# 查看最近执行结果和日志
sudo systemctl status wf-market-update.timer
sudo systemctl show wf-market-update.service -p Result -p ExecMainStatus
sudo journalctl -u wf-market-update.service -n 50 --no-pager

# 需要时手动触发同一服务，不启动另一份进程
sudo systemctl start wf-market-update.service
```

oneshot 服务完成后显示 `inactive (dead)` 属于正常状态，应结合退出状态和 timer 的下次运行时间判断。数据生成后无需 reload Nginx；网页可点击“重新读取行情”，打开期间也会每小时读取文件。

### 7. 沿用现有 HTTPS 续期

你已经有有效证书，此次升级无需重新申请。保留现有续期机制，可检查：

```bash
sudo certbot certificates
sudo certbot renew --dry-run
sudo systemctl list-timers --all | grep -i certbot
```

若使用 snap 或 cron，续期任务名称和位置可能不同，沿用原本安装方式。完整替换配置时如原文件还包含自定义 TLS 参数或 Certbot 相关 include，请一并保留。HTTPS 证书操作参考 [Ubuntu TLS 指南](https://ubuntu.com/server/docs/how-to/security/obtain-tls-certificates/)。

### 8. 后续更新与回滚

后续更新先停止定时器和正在运行的抓取任务，再更新源码：

```bash
sudo systemctl stop wf-market-update.timer
sudo systemctl stop wf-market-update.service
git -C /home/ubuntu/wf-syndicate pull --ff-only
sudo install -m 644 /home/ubuntu/wf-syndicate/styles.css \
  /home/ubuntu/wf-syndicate/app.js /home/ubuntu/wf-syndicate/favicon.ico \
  /home/ubuntu/wf-syndicate/items.json /var/www/syndicate/
sudo install -m 644 /home/ubuntu/wf-syndicate/index.html /var/www/syndicate/
sudo systemctl start wf-market-update.service
sudo systemctl start wf-market-update.timer
```

如果 `deploy/` 中的 service 或 timer 有修改，先重新安装这两个文件、执行 `sudo systemctl daemon-reload`，再启动服务和定时器。Nginx 配置仅在有意更新时复制，保留服务器后来添加的 TLS 设置，并先执行 `nginx -t` 再 reload。

回滚到最初单文件页面时，将下方路径改为第 1 步记录的真实备份目录：

```bash
SYNDICATE_BACKUP_DIR='/home/ubuntu/syndicate-backups/实际备份时间'
sudo systemctl stop wf-market-update.timer
sudo systemctl stop wf-market-update.service
sudo cp -a "$SYNDICATE_BACKUP_DIR/site/." /var/www/syndicate/
sudo cp -a "$SYNDICATE_BACKUP_DIR/nginx.conf" /etc/nginx/sites-available/syndicate
sudo nginx -t
sudo systemctl reload nginx
```

该步骤恢复旧入口和旧配置，新版附加文件可以保留；原内联页面不会引用它们。若决定长期停用行情更新，再执行 `sudo systemctl disable wf-market-update.timer`。

## 故障排查

| 现象 | 检查方式 |
| --- | --- |
| 页面没有样式或交互 | `/var/www/syndicate` 是否包含 `styles.css`、`app.js`，访问资源是否为 200 |
| 行情文件 404 | 服务是否输出到 `/var/www/syndicate/market-data.json`，首次抓取是否已写入文件 |
| 页面 403 | 检查目录 755、文件 644，以及 Nginx error log |
| `Permission denied` | 目录原来为 `root:root`；确认 `ubuntu` 可写站点目录，可读源码和输入 JSON |
| 打开旧页面 | 确认更新的是 `/var/www/syndicate`，检查启用的配置、浏览器和 CDN 缓存 |
| CSS、JS 仍旧缓存七天 | 删除原缓存正则中的 `css|js`；用 `nginx -T` 和 `curl -I` 检查实际生效规则 |
| 行情过期 | 检查 timer 是否启用、执行日志、服务器 DNS 及到市场 API 的 HTTPS 连接 |
| API 返回 429 / 5xx | 脚本会限速重试；检查是否另有 watch、cron 或重复抓取进程 |
| 浏览器仍请求市场 API | 强制刷新并检查线上 `app.js`；当前版本只读取本地 JSON |
| 证书错误 | 检查原证书路径、有效期和既有续期机制，确认 DNS 指向正确服务器 |

模板日志位于 `/var/log/nginx/syndicate.access.log` 和 `/var/log/nginx/syndicate.error.log`。可用 `sudo nginx -T` 查看完整配置，用 `sudo journalctl -u wf-market-update.service` 查看抓取日志。

## 开发与验证

```bash
node --check app.js
node tests/market.test.cjs
python3 -m unittest discover -s tests
git diff --check
```

Node.js 仅用于可选的 JavaScript 语法检查，运行网站不需要 Node.js。修改界面后检查桌面及手机宽度、集团切换、空集团、48 小时 / 90 天排序、行情读取失败，以及两个原有页面。

## 许可

本项目采用 [MIT License](LICENSE)。Warframe、集团名称及相关游戏数据归各自权利人所有；行情来源为 Warframe Market，本项目不是官方服务。
