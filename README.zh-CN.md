[English](README.md) | **简体中文**

# Evidence

[![CI](https://github.com/octoryn/octopus-evidence/actions/workflows/ci.yml/badge.svg)](https://github.com/octoryn/octopus-evidence/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/octoryn/octopus-evidence?sort=semver)](https://github.com/octoryn/octopus-evidence/releases/latest)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Zero runtime deps](https://img.shields.io/badge/runtime%20deps-0-success.svg)](package.json)

> Octopus 栈共享的 **Evidence**(证据)原语 —— 一个规范 (canonical)、可哈希、
> 防篡改的*支撑*单元,在各仓库之间流动。

> **[Octopus Core](https://github.com/octoryn) 的一部分 —— 受治理 AI 的开源基础设施栈。** 这是其它仓库共享的根原语:[Scout](https://github.com/octoryn/octopus-scout) 采集证据 · [Observe](https://github.com/octoryn/octopus-observe) 规范化它 · [Blackboard](https://github.com/octoryn/octopus-blackboard) 为它排时间线 · [Runtime](https://github.com/octoryn/octopus-runtime) 基于它审批 · [Replay](https://github.com/octoryn/octopus-replay) 重建它 · [Experience](https://github.com/octoryn/octopus-experience) 为它建图 · [Inspect](https://github.com/octoryn/octopus-inspect) 校验它。

```
Evidence  →  hash  →  chain (timeline)  →  verify
```

## 为什么

治理需要证据。合规需要证据。审计需要证据。所以 **Evidence 是根** —— 比它们都低
一层。一个 AI 系统的每一项可辩护主张(“这已被批准”“这个测试通过了”“这个决定有其
理由”)都落在一个证据单元上,而该单元是*规范的*(两个相等的事实哈希相等)、
*可归属的*(谁/什么/何时),以及*防篡改的*(任何事后编辑都可被察觉)。本包恰好拥有
这个单元以及它背后的密码学 —— **且仅此而已**:它不派生任何东西、不编排任何东西、
不执行任何东西。

它同时消除了真实的重复:`octopus-observe` 和 `octopus-replay` 各自独立地重新发明了
规范 JSON + SHA-256 + 哈希链。这些东西在这里存在一次,于是每个仓库都对“相等”和
“可验证”的含义达成一致。

## 安装

```bash
npm install octopus-evidence
```

Node ≥ 22。**零运行时依赖**(仅用 Node 内置能力)。Apache-2.0。

## Evidence 信封 (envelope)

```ts
import { createEvidence, verifyEvidence } from "octopus-evidence";

const ev = createEvidence({
  kind: "test",
  subject: [{ type: "pull_request", id: "octopus-evidence#1" }],
  actor: { type: "agent", id: "ci" },
  content: { passed: true, cases: 42 },
  provenance: { source: "ci", method: "test-run", at: "2026-07-03T00:00:00.000Z" },
});

ev.id;         // "ev_<sha256…>" —— 确定性:相同输入 → 相同 id
ev.integrity;  // 覆盖**整条证据**的哈希;可察觉任何事后编辑
verifyEvidence(ev); // true —— id 与 integrity 都从各字段重新算出
```

`createEvidence` 是**幂等的**(相同输入总是产出相同的证据),且是
**内容寻址的**(不同的 content、actor 或 provenance → 不同的 id)。若任何字段被
编辑,`verifyEvidence` 会返回 `false` —— 且它**绝不抛出**,即便面对恶意/畸形的
存储 content。

若要**防止篡改**(而不仅是察觉篡改)的完整性,用 HMAC 为它加密钥。该密钥覆盖
**整条**证据 —— content、actor、subject、kind 与 provenance —— 因此没有密钥的
攻击者也无法伪造*谁 / 何处 / 何时*,而不仅仅是 payload:

```ts
const sealed = createEvidence(input, { integritySecret: process.env.EVIDENCE_KEY });
verifyEvidence(sealed, process.env.EVIDENCE_KEY); // 用同一密钥校验
```

## Evidence 时间线(防篡改链)

把一串证据提交进一条只追加 (append-only) 的哈希链 —— 这是审计轨迹或 Blackboard
时间线所构建于其上的原语。对更早的链接做任何编辑、插入、删除或重排,都会破坏校验。

```ts
import { buildChain, verifyChain, nextLink, GENESIS_HASH } from "octopus-evidence";

const chain = buildChain(events.map((e) => e.id)); // 链接每个 evidence id
verifyChain(chain); // { ok: true }  |  { ok: false, brokenAt, reason }

// 或增量追加(纯的 —— 返回下一个链接,由你存储):
const link = nextLink(chain, nextEvidence.id);
```

向 `buildChain` / `nextLink` 传入一个 `secret`(并用 `verifyChain({ secret })`),
即可得到一条带密钥的 HMAC 链 —— 没有该密钥便无法伪造新链接。

一条裸链只证明它自身是一个自洽的**前缀** —— 因此尾部截断(回滚最新的条目)
无法自我察觉。把头哈希与长度带外记录下来并传入,即可抓到它:

```ts
import { chainHead } from "octopus-evidence";
verifyChain(chain, { expectedHead: chainHead(chain), expectedLength: chain.length });
```

## 规范哈希(共享基础)

两者之下都是同一个原语:

```ts
import { stableStringify, canonicalHash, canonicalEqual } from "octopus-evidence";

canonicalEqual({ a: 1, b: 2 }, { b: 2, a: 1 }); // true —— 键序无关
canonicalHash({ a: 1, b: 2 }) === canonicalHash({ b: 2, a: 1 }); // true
```

`stableStringify` 拒绝任何 JSON 无法忠实往返的内容(非有限数值、`undefined`、
环 (cycle)),因此一次“成功”的哈希绝不掩盖静默的数据丢失。

## 边界 (Boundaries)

Evidence 是一个**原语**,而非一个系统。它没有存储、没有查询、没有网络、没有派生。
存储证据、跨 agent 为它排时间线、派生因果图,或基于它对动作设卡 (gate),都是其它
仓库的职责 —— 它们依赖这个形状;这个形状不依赖任何东西。

## 许可证

[Apache-2.0](LICENSE) © Octoryn。
