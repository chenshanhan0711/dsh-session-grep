# dsh-session-grep · 对话正文搜索

在工作区所有对话正文里做**真正的子串搜索**：输入 `搜索输出` 能命中「…只能搜索输出」这句话，输入 `插件` 能命中「插件市场」这类词中间的字。

## 为什么需要它

DSH 内置的会话搜索（侧栏 `Ctrl+K`）走的是 SQLite FTS5 索引，分词器是 `unicode61`。它匹配的是**整 token 和短语**，不是任意子串：

- 中文没有空格，一整句是一个 token。`搜索输出` 只是 token `只能搜索输出` 的中间片段，所以一条都搜不到；
- 上游文档写得很清楚：*"`unicode61` tokenizer matches tokens and phrases rather than arbitrary substrings"*（`@deepseek-ai/dsh-session-query-sqlite` README 第 63 行）。

本插件不用那套索引：它直接读会话日志、解压、做大小写不敏感的 `indexOf`，所以任何片段都能命中，中文也不例外。

## 使用

- 对话页头部（会话标题左侧）有一个 **搜索** 胶囊按钮。
- 点开输入关键词，每条命中的消息一行：角色、会话标题、会话尾号、命中的片段（高亮）。
- 结果按会话轮转排列：同一个超长对话不会占满整个列表，每个对话都能看到。
- `↑` `↓` 选择，`Enter` 打开，`Esc` 关闭。
- 选中一行会切到那个会话，并把命中的文字**闪一下高亮**约 2.6 秒。
- 命中就在当前对话里时不会做多余的跳转，只滚动并高亮。
- 打开「工具输出」开关，可把工具调用、工具结果和推理内容也纳入搜索。
- 结果只覆盖当前工作区，最多 40 条。

## 安装

从 npm：

```
dsh plugin --profile <profile> add dsh-session-grep
```

从仓库：

```
git clone https://github.com/chenshanhan0711/dsh-session-grep
dsh plugin --profile <profile> add ./dsh-session-grep
```

或在应用内 **插件 → 添加插件** 选择该目录。bundle 只加一个 Host 服务和一个客户端插槽，重启后搜索胶囊出现。

卸载：与其他插件相同，不会改动 DSH 安装目录。

## 实现

**Host（`index.js`）**

- 日志位置：`$DSH_HOME/sessions/<cwd-key>/<session-id>/session.v4.jsonl.zstd`。
- 文件是多个 zstd frame 顺序拼接、无长度前缀：按 zstd magic 切分，逐段解压；解压失败说明切点落在压缩数据内部，把该段并入下一段重试（不会丢事件）。
- 解析 JSONL，按事件类型取文本（`user/message`、`assistant/message`，可选 `tool/call`、`tool/result`、reasoning），并按 `mtime + size` 缓存解析结果（上限 64 个会话）。
- 每个事件只贡献一条命中，附「共 N 处」计数；每个会话先各自收集（上限 `max(10, limit/2)`），再按「会话内最新命中时间」轮转合并 —— 长对话无法挤掉其他对话。
- 在 `/dsh-session-grep/api` 下暴露三个只读接口：`search`、`sessions`、`health`。
- 扫描一个 900 事件 / 3 MB 的会话约 20 ms，单次查询个位数毫秒。

**Client（`client.js`）**

- 注册到 `conversation.header.leading` 插槽。
- 200 ms 防抖，同一时刻只有一个请求在飞（新的会中止旧的）。
- 结果面板用输入框的矩形做 `position: fixed` 定位，不会被头部裁掉。
- 点击结果调用 `uiWorkspace.openSession(...)`；如果是子会话（`Side:` 线程），先用 `ctx.sessions.retain()` 拿到快照里的 `subagent.address` 再按地址打开。打开后 1 秒仍未切换就重试一次，仍失败才提示。
- 命中文字在已渲染文本节点里被包进 `<mark>` 并滚动到可见；消息还没渲染就重试约 9 秒，最后给出提示。
- 选中用 `mousedown` 而不是 `click`，避免输入框失焦先把面板关掉。

## 限制

- 搜的是**文本**，不是渲染后的 Markdown：命中跨在 `**粗体**` 两侧时，扫描能命中，但屏幕上可能高亮不到。
- 工具输出、推理和 JSON 需要手动打开开关。
- 只扫描当前工作区目录下的会话。
- 会话文件变化会重新解析；暂未做增量 tail。
- 每次查询全量扫描、不落盘索引，所以结果上限 40 条。
- 改了 **Host 半边** 的代码需要重启应用；只改 `client.js` 刷新页面即可（Host 会热载客户端 bundle）。
- 会话列表里被归档的对话仍能被搜到，点开时会被拒绝打开。

## 隐私

**零网络请求**。Host 只读本地会话文件并响应自己的 loopback 路由，客户端只调这个路由；无遥测、无外部端点、无硬编码密钥。

## 许可证

MIT
