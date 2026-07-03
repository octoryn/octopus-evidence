[English](CONTRIBUTING.md) | **简体中文**

# 为 Evidence 贡献

感谢你有兴趣参与贡献。本指南覆盖基础事项。

## 开发环境

```bash
npm install
npm test        # node --import tsx --test
```

需要 Node ≥ 22。

## 提 PR 之前

跑一遍完整的本地门禁 —— CI 会执行相同的检查:

```bash
npm run typecheck      # 完整 strict 下的 tsc --noEmit,必须干净
npm run format:check   # prettier
npm run lint           # eslint
npm test               # node --test
npm run build          # 产出 dist/
```

- **类型安全:** 项目开启 `strict`(含 `exactOptionalPropertyTypes`、
  `verbatimModuleSyntax`、`noUncheckedIndexedAccess`)。除非不可避免并加注释,
  不允许 `any` 逃逸。
- **零运行时依赖:** 本包只用 Node 内置能力(哈希用 `node:crypto`)。没有非常充分的
  理由,不要新增运行时依赖。
- **边界就是重点。** Evidence 是一个*原语,而非一个系统*:它绝不能长出存储、查询、
  网络或派生。创建、哈希、链接与校验这个证据单元,是它的全部;为证据排时间线、存储、
  派生或设卡 (gate) 都是其它仓库的职责。跨越这些边界的 PR,无论质量如何都会被拒绝。
- **wire 契约是冻结的。** 规范编码、证据的 `id` 与 `integrity` 哈希,以及链接哈希,
  都是落盘 / 跨仓库的契约。改变某个给定输入所哈希出的结果,是破坏性变更 —— 必须是
  有意为之、在 `CHANGELOG.md` 中记录,并做版本设卡。
- **测试:** 新行为需要测试,且必须自洽(无网络,断言中不使用真实时钟时间)。
  确定性正是全部要点 —— 断言精确的哈希与精确的校验结果。

## 项目结构

权威的架构、保证与边界见 [docs/DESIGN.md](docs/DESIGN.md)。代码依据该规范编写;
契约变化时先更新它。

## 提交 / PR

- PR 保持聚焦。说明改了什么、为什么。
- 面向用户的变更请更新 `CHANGELOG.md`。
- 改动公开 API 时,更新相关文档(`README.md`、`docs/`)。文档为双语(英文为准 +
  `*.zh-CN.md` 副本);可行时两者一并更新。

## 报告 Bug / 安全问题

普通 bug 请正常提 issue。安全漏洞请遵循 [SECURITY.md](SECURITY.md),不要提交公开
issue。
