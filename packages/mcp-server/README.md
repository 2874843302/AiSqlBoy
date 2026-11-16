# aisqlboy-mcp

[AiSqlBoy](https://github.com/2874843302/AiSqlBoy) 的 MCP（Model Context Protocol）stdio 桥接进程。

它本身不连数据库，只把 MCP 客户端的请求转发给**本机正在运行的 AiSqlBoy**。
数据库驱动、系统级加密的连接凭据、只读守卫、授权库白名单都在 AiSqlBoy 主进程里，
因此桥接进程零依赖、不接触任何密码。

## 为什么配置里没有密钥

这是设计如此，不是遗漏。

- AiSqlBoy 每次启动随机生成 32 字节 token，写到本机 `<userData>/mcp-endpoint.json`，文件权限 0600
- 桥进程启动时自己读这个文件，拿到端口与 token，再请求 `127.0.0.1` 上的 AiSqlBoy
- 因此**密钥不需要也不应该出现在客户端配置里**——那些配置文件经常被截图、同步网盘、提交到 dotfiles 仓库
- AiSqlBoy 重启后端口与 token 自动轮换，桥每次调用前都会重读端点文件，无需改配置

## 配置方式

在 AiSqlBoy 的 **设置 → MCP 服务** 里有一键复制，内容形如：

```json
{
  "mcpServers": {
    "aisqlboy": {
      "command": "C:\\Users\\you\\AppData\\Local\\Programs\\AiSqlBoy\\AiSqlBoy.exe",
      "args": ["C:\\Users\\you\\...\\resources\\mcp-server\\index.mjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

两点说明：

1. `command` 用的是 **AiSqlBoy 自身的可执行文件**，配合 `ELECTRON_RUN_AS_NODE=1` 以 Node 模式运行桥。
   这样客户端机器不需要预装 Node。桥只用 `fs` 和 `fetch`，不触碰 native 数据库驱动，在 Node 模式下完全可用。
2. 从源码开发时，`command` 会是 `node_modules/electron/dist/electron.exe`，`args` 指向仓库内的 `packages/mcp-server/index.mjs`。

写入配置后**重启 MCP 客户端**才会生效。

## 可用工具

| 工具 | 用途 |
|---|---|
| `list_connections` | 列出 AiSqlBoy 已保存的连接（不含密码） |
| `list_databases` | 列出某连接可访问的库/Schema |
| `list_tables` | 列出表名 |
| `describe_table` | 列结构 + 索引 + 注释 |
| `run_query` | 执行单条只读 SQL，自动追加行数上限 |
| `explain_query` | 查看执行计划（MySQL / PG / SQLite） |
| `redis_command` | 执行 Redis 命令，默认仅只读命令 |
| `execute_sql` | 写操作，**仅在设置中开启「允许写操作」后才会出现** |

## 安全模型

- 服务只绑定 `127.0.0.1`，并再次校验来源地址，不接受任何外部连接
- 默认全只读：`run_query` 经语句分类、多语句检测、授权库越界检测三重校验
- 写操作需在设置中显式开启，且对只读连接、无 WHERE 的 UPDATE/DELETE 一律拒绝
- 连接包（加密分享的连接）在 MCP 下保持原有的有效期与库白名单约束

## 环境变量

| 变量 | 说明 |
|---|---|
| `AISQLBOY_USER_DATA` | 手动指定 AiSqlBoy 的 userData 目录，用于非默认安装位置（默认会自动探测 `aisqlboy` / `AiSqlBoy` 两种目录名） |

## 排查

客户端连不上时先看它的 MCP 日志（桥的日志全部走 stderr）：

- `找不到 AiSqlBoy 的本地端点文件` → AiSqlBoy 没运行，或设置页未开启 MCP 服务
- `鉴权失败：token 不匹配` → AiSqlBoy 重启过但客户端缓存了旧进程，重启客户端即可
- `ECONNREFUSED` → AiSqlBoy 已退出，端点文件是残留的；重新打开 AiSqlBoy

自测命令（在仓库根目录）：

```bash
npm run test:mcp       # 协议层单测，用 HTTP 桩模拟后端，无需启动应用
npm run test:mcp:e2e   # 真实链路，需要 AiSqlBoy 正在运行且已开启 MCP 服务
```
