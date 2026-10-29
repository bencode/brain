# Brain

公开知识文档仓库，使用 [Gamma Reader](https://github.com/bencode/gamma-reader) 阅读。

在线阅读：<https://brain.qijun.io>。

## 内容

- [WebRTC](./systems/webrtc/README.md)：数据面主题入口。
  - [ICE：候选与选路](./systems/webrtc/ice.md)：候选与收集、优先级公式、连通性检查、提名与 selected pair。
  - [资源](./systems/webrtc/resources.md)：标准与协议、实现库、验证与观测工具、应用案例入口。

## 文件约定

- 文档采用 Markdown，仓库内文档之间使用相对链接。
- 每个主题的资源页命名为 `resources.md`，记录来源、发布或维护方、用途与边界。
- 本仓库保存公开文档；讨论、调研和原始笔记保留在私有仓库 `brain2`。

## 本地预览

需要 Node.js 24+ 和 Git。在仓库工作目录运行：

```sh
npm start
```

默认地址为 <http://127.0.0.1:3306>，可通过 `PORT` 修改端口。

阅读器读取当前工作目录，包括未提交的文档。修改文件后刷新页面即可预览；页面保持打开时，每分钟自动同步一次。

在阅读器中编辑时，文档上的 **Save** 保存到浏览器，文件列表上方的 **Save** 写回本地文件。写回不会自动提交或推送。

## 本地配置

启动时加载工作目录中的 `.env`。Git worktree 可通过符号链接共享同一份本地配置；修改配置后需要重启。

| 环境变量 | 用途 |
| --- | --- |
| `GAMMA_READER_DIR` | 可选，本地 Gamma Reader 仓库的绝对路径；先在该仓库运行 `pnpm build` |
| `GLM_API_KEY` | GLM 服务端凭据 |
| `QWEN_TOKEN_PLAN_CN_API_KEY` | 阿里云 Token Plan 服务端凭据 |
| `TAVILY_API_KEY` | 联网搜索与网页提取 |
| `GAMMA_DAILY_TOKENS` | 每个网络的每日 Token 额度 |
| `GAMMA_TOTAL_DAILY_TOKENS` | 本地实例的每日总 Token 额度 |

设置 `GAMMA_READER_DIR` 时使用本地构建，否则通过 `npx` 运行 `gamma-reader@latest`。启用的模型列表由所运行的 Gamma Reader 版本决定，预览文档不需要 API key。

本地运行数据默认保存在 `.gamma-reader/`。该目录和 `.env` 均已加入 Git 忽略规则；本地与生产分别记录用量。
