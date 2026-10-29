# NAT 与 STUN：地址的发现

[ICE：候选与选路](./ice.md) 留下三个悬念：srflx 候选是谁回答的，prflx 候选为什么存在，什么时候只剩中继一条路。答案都在同一处：NAT 让内网端点不知道自己的公网映射，且映射规则不统一——[RFC 4787](https://www.rfc-editor.org/info/rfc4787) 给出行为分类，[RFC 8489](https://www.rfc-editor.org/info/rfc8489) 的 STUN 是发现地址的工具。

本文依据这两份规范整理。规范要求、本文的解释、实现观测三者分开陈述。

## 1. 问题：映射不统一，且端点不自知

NAT 让多台内网主机共享一个公网地址。对端到端通信，它带来两个事实：

1. 内网端点发出的包经过 NAT 后，源地址被改写成某个公网 `(IP, 端口)`——**端点自己不知道被改写成了什么**；
2. 改写成什么、哪些外来的包能进来，**取决于该 NAT 的实现**，且彼此差异很大。

ICE 对此的态度是不预测、全试：两轴分类解释了候选类型的行为差异，STUN 提供观测手段。

## 2. NAT 行为：两个独立的轴

RFC 4787 把 NAT 行为拆成两个互相独立的维度（§4.1、§5）。

**映射行为**（mapping）：同一内网端点 `X:x` 向不同目标发包时，公网映射是否复用。

| 行为 | 定义（§4.1） |
| --- | --- |
| Endpoint-Independent Mapping（EIM） | 发往**任意**目标都复用同一映射 |
| Address-Dependent Mapping（ADM） | 只有目标 IP 相同才复用 |
| Address and Port-Dependent Mapping（APDM） | 只有目标 `(IP, 端口)` 相同才复用 |

**过滤行为**（filtering）：哪些外部来源的包被放行进内网。

| 行为 | 定义（§5） |
| --- | --- |
| Endpoint-Independent Filtering（EIF） | 发包到任意外部地址后，**任何**外部主机都可回包进来 |
| Address-Dependent Filtering（ADF） | 只有曾发往其 IP 的主机可回包（不限端口） |
| Address and Port-Dependent Filtering（APDF） | 只有曾发往其 `(IP, 端口)` 的端点可回包 |

RFC 4787 特别指出（§4.1）：映射行为与安全性无关，安全性完全由过滤行为决定——这是两轴必须分开看的原因。BCP 要求 NAT 实现应为 EIM（REQ-1），但移动网络与运营商级 NAT（CGNAT）实践中经常不满足。

**旧词汇的对照**。传统"四型 NAT"（full cone / restricted cone / port-restricted cone / symmetric）来自 RFC 3489 时代，把两个轴搅在一起：cone 系指 EIM 映射配不同严格度的过滤，symmetric 指 ADM/APDM 映射。工程口语仍常用这些词，但分析问题时拆成两轴才准确。

### 2.1 对 ICE 的意义

- **映射行为决定 srflx 的价值**。EIM 下，向 STUN 服务器问到的映射对任何目标都有效，srflx 候选可用。ADM/APDM（symmetric）下，向 STUN 问到的映射只对 STUN 有效——SDP 里通告的 srflx 地址，对端朝它发包会被当作无关流量丢弃，srflx 全部作废。
- **prflx 正是对策**。本端向对端发检查时，symmetric NAT 为这个目标新建真实映射；对端收到检查报文，从这个报文的实际源地址学到真实可用的映射，登记为 prflx 候选（RFC 8445 §7.3.1.3）。这就是 ICE 不需要预先探测 NAT 类型也能工作的原因：它用真实流量问路，而不是分类后预测。
- **过滤行为一般不构成障碍**。ICE 检查是双向主动发起的"应邀"流量：要收对端的检查，先向对端发过检查即可。ADF 在此自然满足；APDF 也因两端互发而打通。
- **硬墙是双端皆 symmetric**。两端都无法向对方通告可复用的地址，prflx 也无从建立——只能中继（TURN，另行成篇）。RFC 4787 §5 的论述与此一致：APDF 下"连通将需要 UDP 中继"。

两个实践观察：同 NAT 内两端用公网映射互访（hairpin，§6）常失败，但 ICE 的 host 候选直接内网互通，不受影响；CGNAT 大量见于移动网络，行为常接近 symmetric。

## 3. STUN：一个极简的请求-响应协议

STUN（Session Traversal Utilities for NAT）只做一件事：**你问我，"在你眼里我是什么地址"**。报文为 20 字节定长头 + TLV 属性（RFC 8489 §5）：

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|0 0|     Message Type          |         Message Length        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Magic Cookie 0x2112A442                   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Transaction ID（96 bit，随机）              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|              Attributes（TLV：type 2B, length 2B, value）      |
```

三个字段同时是**解复用信号**：Type 首两位必须为 0、Length 以 4 字节对齐（低两位恒 0）、Cookie 固定值——STUN 与 DTLS/SCTP 等共用端口时，凭这些特征区分流量（首字节分类规则见 RFC 7983，STUN 落在 0–3 区间）。

**Type 的位交织编码**（§5，Figure 3）：16 位的 Type 里，12 位方法号（method）与 2 位类别号（class）按 `M|M|M|M|M|C1|M|M|M|C0|M|M|M|M` 交织排列。类别 `00`/`01`/`10`/`11` 分别是请求、指示、成功响应、错误响应。唯一的方法 Binding（0x001）因此有四个 Type 值：请求 `0x0001`、成功 `0x0101`、指示 `0x0011`、错误 `0x0111`。规范自己承认这是历史包袱——位是按 RFC 3489 的老分配硬凑的。

**Transaction ID**（96 bit，密码学随机）：请求与响应靠它配对，重发复用同一 ID，响应必须回显（§5）。**Length** 不含 20 字节头。属性 TLV 以 4 字节对齐，类型 `0x0000–0x7FFF` 为必须理解、`0x8000–0xFFFF` 为可忽略（§14）。

### 3.1 XOR-MAPPED-ADDRESS：答案的编码

Binding 响应里，"你的公网映射"放在 XOR-MAPPED-ADDRESS 属性（§14.2）：端口异或 Cookie 高 16 位，IPv4 地址异或整个 Cookie，IPv6 地址异或 `Cookie ‖ Transaction ID`。

为什么要异或，而不是明文？规范记录了部署教训：某些 NAT 的应用层网关（ALG）会"好心"地改写报文中出现的自家公网 IP 明文，这恰好破坏 STUN 的语义与完整性校验。异或编码让地址不再以明文出现，绕开了这类改写。

一次最小事务的十六进制（属性值由 [stun-xor](./stun-xor.lab.md) 中的算法算出，可自行复验）：

```text
请求（20 字节）：
00 01 00 00  21 12 a4 42  <Transaction ID 12 字节>
└Type┘└Len┘

响应（32 字节）：
01 01 00 0c  21 12 a4 42  <同一 Transaction ID>
00 20 00 08  01 e9 30 ea 12 d5 45
└Type┘└Len┘ └XOR-MAPPED-ADDRESS: family=IPv4, X-Port, X-Address
```

![[stun-xor]]

## 4. STUN 在 ICE 里的两份工作

同一个报文格式，两种用法：

1. **收集阶段——问服务器**。向配置的 STUN 服务器发 Binding 请求，从响应的 XOR-MAPPED-ADDRESS 读出映射地址，登记为 srflx 候选（RFC 8445 §5.1.1.2）。此时不需要认证。
2. **检查阶段——问对端**。候选对之间互发 Binding，用 short-term 凭据（RFC 8489 §9.1）：凭据经带外通道预先约定——在 ICE 里就是 SDP 中的 `ice-ufrag`/`ice-pwd`，会话期间有效；请求带 USERNAME 与 MESSAGE-INTEGRITY（HMAC，密钥即密码），密码本身从不出现在报文里。此时 Binding 只是"带认证的 UDP 探测"，顺带发现的未知来源地址即 prflx 候选。

另有可选的 FINGERPRINT 属性（§7、§14.7，CRC-32），为解复用再加一道校验。

## 5. 实现观测

- 抓包看 Binding：Wireshark 对 STUN 明文可完整解析（端口、transaction、属性），是核对 srflx/prflx 行为最直接的手段。
- 浏览器侧：[trickle-ice 示例页](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) 直接收集并展示候选；`chrome://webrtc-internals` 记录候选与检查时间线。

## 6. 范围之外

- TURN：中继地址的分配、permission 与 channel——RFC 8656，另行成篇。
- NAT 行为的主动探测（映射/过滤行为测试）：RFC 5780。
- 选路完成后的加密建立（DTLS）：RFC 8445 之上的下一层。

[主题入口](./README.md) · [资源页](./resources.md)
