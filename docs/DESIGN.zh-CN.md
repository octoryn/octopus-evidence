[English](DESIGN.md) | **简体中文**

# Evidence —— 架构与契约

状态:**v0.1** · Owner:Evidence · 最后更新:2026-07-03

这是权威的设计文档。代码是*依照*该规范编写的。当二者不一致时,以本文档为准 ——
本文档在被更新前视为“错的”:先在这里改,再改代码。

---

## 1. Evidence 是什么

**Evidence 是根范畴 (root category)。** 治理需要证据。合规需要证据。审计需要证据。
这些系统中的每一个,都是*基于*某种底层支撑去决定、去证实或去辩护 —— 所以支撑本身
比它们全都低*一层*。本包恰好拥有这一层:一个规范 (canonical)、可哈希、可归属、
防篡改的、对某项主张的*支撑*单元 —— 一次提交、一个测试结果、一次评审、一条观测、
一份转录、一处引用 —— 以及让它可信的那套密码学。

```
Evidence  →  hash  →  chain (timeline)  →  verify
```

一个 AI 系统的每一项可辩护主张 —— “这已被批准”“这个测试通过了”“这个决定有其
理由” —— 最终都落在一个证据单元上。如果这个单元不规范(两个相等的事实可能哈希不同)、
不可归属(没有谁/什么/何时)或不防篡改(事后的编辑无人察觉),那么建于其上的每一个
治理、合规与审计结论都会继承这个弱点。因此,让这个*单元*可信,是最具杠杆的立足点,
而这也是本包唯一做的事。

### 1.1 一个原语,而非一个系统

最重要的一句框定:**Evidence 是一个形状加三条保证,而非一个服务。** 它没有存储、
没有查询、没有网络、没有派生、没有编排。`createEvidence` 是纯函数;`verifyEvidence`、
`buildChain`、`verifyChain` 是纯函数;各哈希辅助函数是纯函数。这里没有任何东西会
触及数据库、套接字或时钟。

如果 Evidence 长出存储,它就会与那些*职责*是存储的仓库相争。如果它长出查询 API,
它就会与 Blackboard 相争。如果它派生因果图,它就会与 Experience 相争。它刻意什么都
不做,于是每个仓库都能依赖同一个单元,而不必依赖彼此的机械装置。形状不依赖任何东西;
系统依赖形状。

### 1.2 为什么这消除了栈内的重复

`octopus-observe` 和 `octopus-replay` 各自*独立地重新发明了同样的三样东西*:规范
JSON 序列化、SHA-256 内容哈希,以及一条防篡改哈希链。两份“*相等*是什么意思”的副本,
就多了一份 —— 一旦它们漂移,Observe 认为与另一条相同的观测,在 Replay 里可能哈希不同,
一个仓库里“可验证”的记录,在另一个仓库里就无法被验证。

把规范 JSON + SHA-256 + 哈希链*放在这里,只一份*,意味着整个栈里“相等”只有一个定义、
“可验证”只有一个定义。每个需要对事实做哈希、比较两个事实,或把一串事实提交进防篡改
日志的仓库,现在都共享同一份实现、同一份冻结的 wire 契约 —— 而不是 N 份微妙不同的。

### 1.3 独立性

不依赖任何其它 Octopus 包 —— 且**完全零运行时依赖**。本包在没有任何其它东西存在时
也能构建、测试与运行;哈希用 Node 内置的 `node:crypto`。边界是 `Evidence` /
`ChainLink` 形状与规范编码,而非任何运行时 SDK。

---

## 2. 三条保证

本包里的一切都是为了兑现恰好三条保证。它们相互叠加:规范是基础,id 建于其上,
完整性与链建于二者之上。

### 2.1 规范 (Canonical) —— 共享的“相等”概念

两个值是同一份证据内容,当且仅当它们的**规范编码**逐字节相同。对象键序、空白与
数字格式绝不影响这一点。`stableStringify(value)` 产出每一层键都排序的确定性 JSON,
因此逻辑相等的值总是产出相同文本;`canonicalHash` 取其 SHA-256。两个值哈希相等,
当且仅当它们是语义上相同的 JSON。

这是承重的基础:没有规范形态,“同一个事实”可能因序列化的偶然而哈希出十几种结果,
其上的所有保证都不成立。`canonicalEqual(a, b)` 是经由同一编码的深度相等,
`cloneJson` 是一次深克隆,同时断言该值可规范化 —— 因此“相等”“同一哈希”与“安全存储”
是同一个谓词,由同一个编码器计算。任何地方都不存在第二种相等概念。

`stableStringify` 对任何 JSON 无法忠实往返的内容 —— 非有限数值、`undefined`、函数、
环 (cycle) —— 会以 `TypeError` **拒绝**。因此一次“成功”的哈希绝不掩盖静默的数据丢失;
一个恶意或畸形的输入会在编码器处大声失败,而非产出一个损坏值的哈希。

### 2.2 内容寻址、幂等的 id

`createEvidence` 盖一个确定性 `id`:前缀 `ID_PREFIX`(`"ev_"`)加上对证据**整个元组**
的 `canonicalHash` —— `kind`、`subject`、`actor`(缺省时为 null)、`content` 与
`provenance`。两个结论直接随之而来:

- **幂等。** 相同输入总是产出相同的证据。把“同一份”证据创建两次 —— 在两个进程、
  两台机器、相隔一年 —— 会产出相同的 id,于是消费者无需协调、仅凭 id 即可去重。
- **内容寻址。** 不同的 content、provenance、actor、subject 或 kind → 不同的 id。
  id *就是*整个元组的指纹;你无法改变证据所主张的内容或它的来源而保持相同的 id。

`content` 是元组的一部分,因此仅在 payload 上不同的两条观测是不同的证据。`id` 与
`integrity` 哈希(§2.3)提交到*同一个*完整元组 —— id 公开地为它寻址,integrity
(可选地在密钥之下)对它作证。

### 2.3 防篡改的完整性 + 链(HMAC 达到防止篡改)

每条 `Evidence` 还带一个覆盖其**整个元组**的 `integrity` 哈希 —— `kind`、`subject`、
`actor`、`content` 与 `provenance` —— 规范 SHA-256,或在提供 `integritySecret` 时是
带密钥的 HMAC。`verifyEvidence` 仅在**两者**都成立时返回 `true`:完整性哈希能从存储
的字段重新算出,*且* id 能从同一批字段重新算出。于是对*任何*字段的事后编辑都会被
抓到 —— 包括被替换的 `actor`、`subject`、`kind` 或 `provenance`,而不仅是 `content`。
`verifyEvidence` **绝不抛出**:若存储的 content 无法规范化(环、非有限值、`undefined`
—— 恶意或损坏的数据),它返回 `false`,因此可以安全地在遍历不受信记录的批处理循环中
调用。

由于带密钥的完整性覆盖整个元组,一个 HMAC 密钥堵住了归属伪造的漏洞:没有密钥的攻击者
无法伪造或改动*谁 / 何处 / 何时*(`actor` / `subject` / `provenance`),而不仅仅是
payload。

**哈希链**把防篡改从单个单元扩展到一个*有序流*。`buildChain` 把一个内容哈希列表
(通常是证据 id)链成一条只追加 (append-only) 的链,每个链接提交它的 `sequence`、
上一个链接的 `hash`,以及它的 `contentHash`。`verifyChain` 校验连续的 0 基序号、
正确的链接关系,以及每个重新计算的链接哈希,并返回第一处断裂。由于每个链接都绑定其
前驱的哈希,对*更早的*链接做**任何**编辑、插入、删除或重排,都会从那一点起破坏校验。
一条裸链只证明它自身是一个自洽的*前缀*,因此**尾部截断 / 回滚最新链接无法自我察觉**
—— 见 §6。`chainHead(chain)` 返回最新链接的哈希(空链时返回 `GENESIS_HASH`);把它连
同长度带外记录下来,并向 `verifyChain` 传入 `expectedHead` / `expectedLength` 即可
抓到截断。这就是审计轨迹或 Blackboard 时间线所构建于其上的原语。

**察觉 vs 防止。** 不加密钥时,以上一切都是可*察觉*篡改,而非可*防止*篡改:哈希是
公开的,因此拥有写权限的攻击者可以编辑数据并重新算出一致的哈希。提供
`integritySecret`(证据)或 `secret`(链,经由 `verifyChain(chain, { secret })`)会把
哈希切换为带密钥的 **HMAC-SHA-256** —— 此时没有密钥,攻击者便无法伪造出能通过校验的
哈希(不过在链上,HMAC 仍不能阻止*截断*;§6)。密钥管理的后果(保护密钥、轮换它、
用同一密钥校验)见 `SECURITY.md`。

---

## 3. 核心契约(`src/types.ts`)

这些形状是栈其余部分传递的冻结 wire 契约。

- **`Evidence`** —— `{ id, kind, subject, actor?, content, provenance, integrity }`。
  规范、可哈希的单元。`id` 与 `integrity` 都对整个元组做哈希(§2.2、§2.3)——
  `id` 是确定性内容地址,`integrity` 是(可选带密钥的)作证;`subject` 是它*关于*
  什么(可能为空);`actor` 是谁/什么产生了它或被它归属。
- **`Ref`** —— `{ type, id }`,用于 `subject[]` 与 `actor` 的带标签引用。
- **`Provenance`** —— `{ source, method?, at }`:产生它的系统、它是如何产生的,以及
  一个 RFC 3339 的产生时间戳。
- **`EvidenceKind`** —— 一个*开放*的 `string` 词表,而非固定枚举。常见 kind:
  `observation`、`commit`、`test`、`benchmark`、`review`、`attestation`、
  `decision`、`transcript`、`citation`。
- **`ChainLink`** —— `{ sequence, previousHash, contentHash, hash }`:防篡改链中的
  一个链接。
- **`ChainVerification`** —— `{ ok: true }` 或 `{ ok: false, brokenAt, reason }`。
- **`JsonValue`** —— 可规范化的 JSON 值类型;`content` 必须是其一。

带 `actor` 构建的证据会携带它;省略它则该字段在对象中缺失(经由
`exactOptionalPropertyTypes`),但 id 把缺失的 actor 视为 `null`,因此一个显式为
`undefined` 的 actor 与一个缺失的 actor 产出*相同*的 id。

---

## 4. 模块结构(`src/`）

| 模块           | 职责 |
| -------------- | ---- |
| `canonical.ts` | 相等/哈希的基础:`stableStringify`、`canonicalHash`、`canonicalHmac`、`canonicalEqual`、`cloneJson`,以及 `JsonValue` 类型。 |
| `types.ts`     | 核心契约:`Evidence`、`Ref`、`Provenance`、`EvidenceKind`、`ChainLink`、`ChainVerification`。 |
| `evidence.ts`  | 信封:`createEvidence`、`verifyEvidence`,以及 `EvidenceInput` / `CreateEvidenceOptions` 输入。完整性在内部计算 —— 没有独立的完整性函数。 |
| `chain.ts`     | 防篡改时间线:`GENESIS_HASH`、`computeLinkHash`、`nextLink`、`buildChain`、`verifyChain`、`chainHead`,以及 `VerifyChainOptions` 类型。 |
| `index.ts`     | 公开界面 —— 对上述内容的再导出。 |

一切都是纯的、无副作用的。`canonical.ts` 是依赖图的根;`evidence.ts` 与 `chain.ts`
都构建于它之上,别无其它依赖。

---

## 5. 栈内每个仓库与 Evidence 的关系

Evidence 是共享的单元;每个仓库恰好用它做一件事,且没有一个重新实现这个单元。这正是
整个生态论点:一个形状,多个工作。

- **Scout —— 采集。** 把外部来源转成会成为证据的原始素材。支撑在这里起源。
- **Observe —— 规范化。** 把原始事件规范化为规范观测 —— Evidence 所拥有的规范 JSON +
  完整性保证,恰是 Observe 所需,而非一份私有副本。
- **Blackboard —— 排时间线。** 把跨 agent 的证据排成一条共享的、防篡改的时间线 ——
  构建于这里的哈希链原语之上。
- **Runtime —— 基于其审批。** 基于证据对动作设卡:一次审批*就是*一个引用其支撑证据的
  决定。
- **Replay —— 重建。** 逐字节复现一次事故;它的转录哈希就是同一个规范哈希原语,而它的
  “黄金录制”是关于发生了什么的证据。
- **Experience —— 建图。** 在证据*之上*派生因果/关系结构;派生逻辑住在 Experience,
  它所关联的单元住在这里。
- **Inspect —— 校验。** 检查证据与链是否符合策略/治理规范 —— 它读取形状并校验保证,
  它不重新定义它们。

依赖的方向是一致的:**系统依赖 Evidence;Evidence 不依赖任何东西。** 存储证据、
为它排时间线、在其上派生,或基于它设卡,都是它们的职责 —— 它们依赖这个形状;
这个形状不依赖任何东西。

---

## 6. 刻意的局限

- **一个原语,而非一个系统。** 无存储、查询、网络或派生 —— 按设计如此(§1.1)。若你
  需要持久化、传输、建索引或在证据之上推理,那是消费它的仓库的职责。
- **除非加密钥,否则是防篡改可察觉,而非可防止。** 不加密钥的哈希与链能察觉篡改,但
  抵挡不了有写能力的攻击者;要抵抗伪造请提供 HMAC 密钥并相应地管理它(§2.3、
  `SECURITY.md`)。带密钥的证据完整性覆盖整个元组,因此归属与来源也受保护,而不仅是
  payload。
- **一条裸链证明的是前缀,而非完整性。** 尾部截断 / 回滚最新链接无法自我察觉 ——
  有效链的一个有效前缀本身也是一条有效链,而 HMAC 密钥并不改变这一点(它阻止伪造新
  链接,而非阻止丢弃末尾链接)。中间的编辑、删除、插入与重排*会*被抓到。请把头哈希与
  长度带外锚定,并向 `verifyChain` 传入 `expectedHead` / `expectedLength`(或比对
  `chainHead`)以抓住它(§2.3、`SECURITY.md`)。
- **仅限 JSON 内容。** `content`(以及一切被哈希的东西)必须是可规范化的 JSON。
  非有限数值、`undefined`、函数与环会在编码器处被拒绝,按设计如此(§2.1)。
- **wire 契约是冻结的。** 规范编码、`id` / `integrity` 哈希,以及链接哈希,都是
  跨仓库、落盘的契约。改变某个给定输入所哈希出的结果,是破坏性变更 —— 须有意为之、
  在 `CHANGELOG.md` 中记录,并做版本设卡。
- **校验需要原始密钥。** 用某个密钥创建的证据与链,必须用*同一个*密钥校验;本包没有
  密钥库、也没有轮换机制 —— 那是运维方的职责。
