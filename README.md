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

## Nginx 完整部署流程

以下步骤以 **Ubuntu 24.04 LTS、systemd、Nginx** 为例。需要有 sudo 权限的服务器；将 `example.com` 的 DNS 指向服务器，并在云安全组及服务器防火墙允许入站 TCP 80、443。脚本需要出站 DNS 与 HTTPS。只有 IP 时可先部署 HTTP，HTTPS 步骤需要域名。

约定源码放在 `/opt/wf-syndicate`，公开文件放在 `/var/www/wf-syndicate`。仅复制网页和 JSON 到站点目录，脚本、Git 数据和测试留在源码目录。

### 1. 安装环境并获取源码

```bash
sudo apt update
sudo apt install -y nginx python3 git ca-certificates curl
python3 --version
sudo systemctl enable --now nginx

# 替换为你自己的仓库地址；提交并推送需要部署的文件后再克隆
REPO_URL='https://github.com/YOUR_NAME/wf-syndicate.git'
sudo git clone "$REPO_URL" /opt/wf-syndicate
```

也可将完整仓库上传到 `/opt/wf-syndicate`。确认 `items.json`、`scripts/`、`deploy/` 等均已包含在上传或提交中。

### 2. 创建更新用户并发布静态文件

首次部署创建专用用户；已有该用户时跳过 `useradd`。

```bash
sudo useradd --system --user-group --create-home \
  --home-dir /var/lib/wf-market --shell /usr/sbin/nologin wf-market
sudo install -d -o wf-market -g wf-market -m 755 /var/www/wf-syndicate
sudo install -m 644 /opt/wf-syndicate/index.html /opt/wf-syndicate/styles.css \
  /opt/wf-syndicate/app.js /opt/wf-syndicate/favicon.ico \
  /opt/wf-syndicate/items.json /var/www/wf-syndicate/
sudo -u wf-market test -r /opt/wf-syndicate/items.json
```

更新用户需要能读取源码，并能写入站点目录（原子替换需要目录写权限）；Nginx 只需目录遍历和文件读取权限。如果上传工具将源码设为私有权限，请为更新用户补充读取权限。

### 3. 配置并启用 HTTP 站点

```bash
sudo install -m 644 /opt/wf-syndicate/deploy/nginx.conf \
  /etc/nginx/sites-available/wf-syndicate
sudo nano /etc/nginx/sites-available/wf-syndicate
```

把 `server_name example.com;` 改为实际域名；仅使用 IP 时可写服务器 IP。模板内容如下：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    root /var/www/wf-syndicate;
    index index.html;
    autoindex off;

    access_log /var/log/nginx/wf-syndicate.access.log;
    error_log /var/log/nginx/wf-syndicate.error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json;

    location = /market-data.json {
        add_header Cache-Control "no-store" always;
        try_files $uri =404;
    }
    location / {
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri/ =404;
    }
    location ~ /\. {
        deny all;
    }
}
```

行情禁止缓存，其他文件允许缓存但使用前需要重新验证；不存在的 JSON 返回 404，不返回 HTML。静态文件路径与配置重载方式可参考 [Nginx 官方入门指南](https://nginx.org/en/docs/beginners_guide.html)。

```bash
sudo ln -s /etc/nginx/sites-available/wf-syndicate /etc/nginx/sites-enabled/wf-syndicate
sudo nginx -t
sudo systemctl reload nginx
curl -I -H 'Host: example.com' http://127.0.0.1/
```

将测试命令里的域名同样替换。链接已经存在时不必重复创建。已有其他网站时保留其配置；通过匹配的 `server_name` 区分站点。启用 UFW 的服务器还需允许 `Nginx Full`；使用 SSH 管理时保留现有 SSH 放行规则。

### 4. 安装每小时更新的 systemd 定时器

```bash
sudo install -m 644 /opt/wf-syndicate/deploy/wf-market-update.service \
  /opt/wf-syndicate/deploy/wf-market-update.timer /etc/systemd/system/
sudo systemctl daemon-reload

# 手动运行首次抓取；此命令会等待约 8–15 分钟
sudo systemctl start wf-market-update.service

# 首次抓取成功后，启用每小时运行及开机自动恢复
sudo systemctl enable --now wf-market-update.timer
sudo systemctl list-timers --all wf-market-update.timer
```

服务以 `wf-market` 用户执行脚本，明确指定源码 `items.json` 和站点目录的输出路径；超时时间为 45 分钟。定时器使用 `OnCalendar=hourly`，每小时整点触发；`Persistent=true` 在关机错过任务后补跑。服务仍在运行时不会启动另一份，详见 [systemd timer 文档](https://www.freedesktop.org/software/systemd/man/260/systemd.timer.html)。不要同时运行另一份 `--watch` 或 cron 任务。

```bash
# 查看执行结果与日志
sudo systemctl status wf-market-update.service
sudo journalctl -u wf-market-update.service -n 50 --no-pager

# 检查对外行情、缓存头和抓取完成情况
curl -I -H 'Host: example.com' http://127.0.0.1/market-data.json
curl -fsS -H 'Host: example.com' http://127.0.0.1/market-data.json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["updatedAt"], d["processed"], d["total"], d["completedAt"])'
```

首次抓取成功后，oneshot 服务可能显示 `inactive (dead)`，这是正常完成状态；应同时检查退出状态、日志和 timer 的下次运行时间。部分接口失败会标记本轮失败，但已写入的成功结果和旧数据仍可使用，下一小时继续更新。

### 5. 配置 HTTPS

确保 HTTP 站点已能通过真实域名从公网访问，域名 A/AAAA 记录正确，且 TCP 80、443 可达：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
sudo nginx -t
sudo certbot renew --dry-run
sudo systemctl list-timers --all certbot.timer
```

按提示填写邮箱并启用 HTTP 到 HTTPS 重定向。如果还要支持 `www`，先为它配置 DNS 和 `server_name`，再为 Certbot 加上 `-d www.example.com`。使用发行版安装方式时检查证书续期定时器已启用；安装方式不同请参考 [Ubuntu TLS 证书指南](https://ubuntu.com/server/docs/how-to/security/obtain-tls-certificates/)。

### 6. 更新版本与日常维护

```bash
# 避免更新物品目录与正在抓取的任务交错
sudo systemctl stop wf-market-update.timer
sudo systemctl stop wf-market-update.service
sudo git -C /opt/wf-syndicate pull --ff-only
sudo install -m 644 /opt/wf-syndicate/index.html /opt/wf-syndicate/styles.css \
  /opt/wf-syndicate/app.js /opt/wf-syndicate/favicon.ico \
  /opt/wf-syndicate/items.json /var/www/wf-syndicate/
sudo systemctl start wf-market-update.service
sudo systemctl start wf-market-update.timer
```

站点目录里的 `market-data.json` 不要用仓库旧快照覆盖。普通网页更新无需重载 Nginx；修改其配置后执行 `nginx -t` 和 reload。若更新了 systemd 模板，重新安装模板、执行 `systemctl daemon-reload`，再重启 timer。

## 故障排查

| 现象 | 检查方式 |
| --- | --- |
| 行情文件 404 | 确认脚本输出为 `/var/www/wf-syndicate/market-data.json`，首次抓取已经写入文件 |
| 页面 403 | 检查目录的遍历权限、文件读取权限和 Nginx error log |
| 打开默认欢迎页 | 检查 DNS、请求的 Host、`server_name` 与站点启用链接是否匹配 |
| `Permission denied` | 确认 `wf-market` 可读 `/opt/wf-syndicate`，可写站点目录，而不只是可写旧 JSON |
| 数据过期 | 检查 timer 是否启用、脚本日志、服务器 DNS 及到市场 API 的 HTTPS 连接 |
| API 返回 429 / 5xx | 脚本会限速及重试；确认没有同时运行 watch、cron 或第二份抓取服务 |
| 浏览器仍请求市场 API | 强制刷新，检查实际部署的 `app.js`，清理 CDN 缓存；当前版本只读取本地 JSON |
| 更新后仍显示旧行情 | 点击“重新读取行情”，检查 `updatedAt`、字段更新时间及 CDN 是否缓存了 JSON |

Nginx 日志位于 `/var/log/nginx/wf-syndicate.access.log` 和 `/var/log/nginx/wf-syndicate.error.log`。可用 `sudo nginx -T` 查看实际加载的完整配置。

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
