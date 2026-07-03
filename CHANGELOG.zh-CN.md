[English](CHANGELOG.md) | **简体中文**

# 更新日志

Evidence 的所有重要变更均记录于此。格式遵循
[Keep a Changelog](https://keepachangelog.com/)，并且项目计划在达到 1.0 后遵循
语义化版本（semantic versioning）。

## [0.2.0] - 2026-07-03

新增**零依赖 CLI**,审计员无需写代码即可在命令行验证证据/链导出 ——
"无需信任存储即可验证";并加固 `verifyChain`,使其与原语其余部分一致地
**永不因恶意数据抛异常**。纯增量;未改动任何证据/链的哈希、id 或 API。

### 新增

- **`octopus-evidence verify <file>` CLI。** 读取 JSON 导出(单个 `Evidence`、
  `Evidence` 数组、裸 `ChainLink[]`、单个链节点,或 `{ evidence?, chain? }`
  包装对象 —— 自动识别形状),独立重算每一个 id、完整性哈希与链节点。
  `--secret <s>` 用于带密钥 (HMAC) 的数据,`--format pretty|json`、`--help`、
  `--version`。退出码:`0` 全部有效,`1` 有任一无效,`2` 用法/IO/解析错误。
  仅用 Node 内置模块。

### 修复

- **`verifyChain` 对恶意链节点永不抛异常。** 非对象的链节点(例如混入已解码
  JSON 导出中的 `null`)现在会被报告为首个断点,而非直接解引用 —— 与
  `verifyEvidence` 既有的"即使面对恶意存储数据也永不抛异常"保证一致。所有
  错误*取值*的情形此前已被捕获;这修补了唯一的崩溃路径(`null`/原始值节点),
  由新的 CLI 暴露。

## [0.1.0] - 2026-07-03

首个公开发布。Octopus 栈共享的 **Evidence**（证据）原语 —— 一个规范 (canonical)、
可哈希、防篡改的*支撑*单元，在各仓库之间流动。**零运行时依赖**（仅用 Node 内置能力）。

### Added

- **Evidence 信封 (envelope)。** `createEvidence` 盖一个规范、可哈希的 `Evidence`，
  带一个确定性 `id` 以及一个 `integrity` 哈希 —— **二者都覆盖整条证据**（`kind`、
  `subject`、`actor?`、`content`、`provenance`）。它是**幂等的**（相同输入 → 相同
  证据）且是**内容寻址的**（不同的 content、actor 或 provenance → 不同的 id）。若
  **任何**字段被编辑，`verifyEvidence` 返回 `false`，且它**绝不抛出** —— 对无法规范化
  的/恶意的存储 content 它返回 `false`，因此可以安全地在遍历不受信数据的批处理循环中
  调用。传入 `integritySecret` 可得到一个带密钥的 HMAC，从而*防止*篡改，而不仅是
  *察觉*篡改；由于该 HMAC 覆盖整条证据，没有密钥的攻击者无法伪造或改动*任何*字段 ——
  包括归属与来源（谁/何处/何时），而不仅是 payload。完整性在内部计算;公开 API 中没有
  独立的完整性函数。
- **防篡改哈希链**（“证据时间线”原语）：`buildChain` 从一个有序的内容哈希列表构建一条
  只追加 (append-only) 的链，`nextLink` 纯地计算下一个链接（返回它而不改动链），
  `verifyChain(chain, options?)` 校验连续的序号、正确的链接关系,以及每个重新计算的
  链接哈希 —— 返回第一处断裂（`{ ok: false, brokenAt, reason }`）。`GENESIS_HASH` 是
  第一个链接的 `previousHash`；`computeLinkHash`、`chainHead`（最新链接的哈希，空链时
  为 `GENESIS_HASH`）以及 `VerifyChainOptions` 类型亦被导出。对*更早的*链接做任何
  编辑、插入、删除或重排，都会破坏校验。向 `verifyChain` 传入 `{ secret }`（并向
  `buildChain` / `nextLink` 传入 `secret`），即可得到一条带密钥的 HMAC 链 —— 没有该
  密钥便无法伪造新链接。**尾部截断警示：** 一条裸链只证明它自身是一个自洽的*前缀*,
  因此回滚最新链接无法自我察觉 —— HMAC 密钥能阻止伪造新链接,但阻止不了截断。向
  `verifyChain` 传入 `expectedHead` / `expectedLength`（把 `chainHead(chain)` 与长度
  带外锚定）即可抓到它。
- **规范哈希**（共享基础）：`stableStringify` 产出每一层键都排序的确定性 JSON,把稀疏
  数组的空洞序列化为 `null`，并**拒绝** JSON 无法忠实往返的内容（非有限数值、
  `undefined`、函数、环 (cycle)），以 `TypeError` 抛出，因此一次“成功”的哈希绝不掩盖
  静默的数据丢失。`canonicalHash` 是该编码的 SHA-256；`canonicalHmac` 是其带密钥的
  变体；`canonicalEqual` 是经由同一编码的深度相等；`cloneJson` 是一次深克隆，同时断言
  该值为可规范化的 JSON。
- **核心契约：** `Evidence`、`Ref`、`Provenance`、`EvidenceKind`、`ChainLink`、
  `ChainVerification` 与 `JsonValue` 类型 —— 栈其余部分传递的冻结形状。
- **开源发布打包（open-source release packaging）**，对齐生态标准：完整的
  `package.json` 元数据（author、repository、homepage、bugs、keywords）、双语文档
  （英文为准 + 带语言切换器的 `*.zh-CN.md` 副本）覆盖 README、CHANGELOG 与设计文档、
  README 徽章，以及 `SECURITY.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md`。
