# WebRTC 数据面：全景

本篇是 WebRTC 主题的入口：给出数据面（DataChannel 路径）的完整地图——协议族由哪些组件构成、它们如何装配成一条连接、每个机制深入到哪里去读。细节由五篇正文承担，本篇只负责把它们串起来。

骨架取自 [RFC 8825](https://www.rfc-editor.org/info/rfc8825)（WebRTC 协议族总览：定义功能组并指向各组件规范）、[RFC 8835](https://www.rfc-editor.org/info/rfc8835)（传输装配决策）与 [RFC 8827](https://www.rfc-editor.org/info/rfc8827)（安全架构）。规范要求、本文的解释、实现观测三者分开陈述。

## 1. 官方地图：功能组与组件规范

RFC 8825 把浏览器实时通信的协议族分成若干功能组。本主题聚焦数据面，各组与本系列的对应：

| 功能组（RFC 8825） | 组件规范 | 本系列 |
| --- | --- | --- |
| Data Transport（§4）：地址选择、NAT 穿透、中继 | RFC 8445（ICE）、RFC 8489/4787（STUN/NAT 行为）、RFC 8656（TURN） | [ICE](./ice.md) · [NAT 与 STUN](./nat-stun.md) · [TURN](./turn.md) |
| Data Framing and Securing（§5）：数据面部分 | RFC 9147/6347（DTLS）、RFC 8122（证书指纹） | [DTLS](./dtls.md) |
| ——数据通道 | RFC 8831/8832/8841（SCTP over DTLS、DCEP、SDP 声明） | [SCTP 与 DCEP](./sctp.md) |
| Connection Management（§7）：协商 | RFC 3264（offer/answer）、RFC 8829（JSEP）、RFC 8843（BUNDLE）、RFC 8838（Trickle ICE） | 缺，另行成篇 |
| 媒体面（§5–6）：RTP/SRTP、编解码 | RFC 3550/3711/8834 | 不在本主题（见 §5 边界） |

浏览器之外的一端（服务器、native 应用）遵循同一套线上协议；W3C 的 WebRTC 1.0 规范只约束浏览器 API，不影响线上行为。

## 2. 装配：一条连接的分层

数据面的封装自下而上是固定的（RFC 8835 §3.5）：

```text
应用消息（一条一条，带边界）
  ↕ DCEP 协商出的通道属性（有序性、可靠性）
SCTP（关联、流、消息边界、拥塞控制）
  ↕
DTLS（加密、完整性、身份锚定于证书指纹）
  ↕
ICE selected pair（唯一确定的 UDP 地址对；必要时经 TURN 中继）
  ↕
UDP
```

三条装配规则（RFC 8835 §3.5，均为 MUST）：

1. 数据通道**必须**支持 SCTP over DTLS over ICE 的封装（细节规范是 RFC 8261）。
2. 同一 component 的全部 ICE 候选对属于**同一个 DTLS 关联**——即使检查出多个有效对，DTLS 握手也只发生一次（RFC 8842 §6 的交互规则）。
3. DTLS 与（如使用的）RTP 复用同一对端口，按首字节分流（RFC 5764 §5.1.2，经 RFC 7983 更新）——数据路径上，这条 DTLS 连接里的应用层载荷全部是 SCTP 包。

## 3. 建立连接：完整时序

两端从零到一条可用的数据通道，经过五步。每步的机制深读对应正文：

```text
① 协商        offer/answer 经信令通道互换：媒体/数据描述、ICE 凭据与候选、
              证书指纹（a=fingerprint）、角色（a=setup）
              ——机制：RFC 3264 / 8829（JSEP），另行成篇
                    │
② 选路        候选两两配对、STUN 检查测通、controlling 端提名
              ——机制：[ICE：候选与选路](./ice.md)；地址从哪来：
                [NAT 与 STUN](./nat-stun.md)；穿不过去时：
                [TURN 中继](./turn.md)
                    │  selected pair 确定
③ 加密握手    双方交换自签证书，与信令传来的指纹比对；密钥导出
              ——机制：[DTLS：加密建立与身份锚定](./dtls.md)
                    │  DTLS 关联就绪
④ 传输层建立  SCTP 关联在 DTLS 之上完成（流数量协商到上限）
              ——机制：[SCTP 与 DCEP](./sctp.md)
                    │
⑤ 通道与数据  DCEP OPEN/ACK 开通道（每通道一对流 + 可靠性六档语义），
              应用消息按消息边界流动
              ——机制：[SCTP 与 DCEP](./sctp.md) §3–5
```

两条贯穿性的设计线索：

- **信任的传导**：数据面的安全强度上限是信令通道的完整性——指纹经信令锚定身份（[DTLS](./dtls.md) §2.2），凭据经信令预共享（[ICE](./ice.md) §4）。信令协议本身不在规范内，是应用的责任。
- **不预测、全试**：NAT 行为无法预知，ICE 用真实流量逐对检查代替分类预测（[NAT 与 STUN](./nat-stun.md) §2.1）；中继是直连失败后的兜底而非首选（[TURN](./turn.md)）。

## 4. 会话中的持续机制

连接建立后仍在运行的机制：NAT 映射靠保活维持（ICE keepalive，Tr 建议 15 s，[ICE](./ice.md) §5）；TURN 侧的 allocation/permission/channel 三组计时器需各自续期（[TURN](./turn.md) §2–4）；SCTP 关联以重传监测可达性，超限非优雅终止（[SCTP](./sctp.md) §1）。会话中还需持续验证对端仍在接收（consent freshness，RFC 7675，同样以 STUN Binding 承载），防止向失效对端持续发送。

## 5. 边界

- **媒体面不在本主题**：RTP/SRTP、编解码、音视频轨道的规范（RFC 3550、3711、8834）自成一族；数据面主题不依赖其细节，仅共享 ICE/DTLS 两层（见 §2 规则 3 的复用）。
- **协商层另行成篇**：SDP 语法（RFC 8866）、offer/answer 状态机（RFC 3264）、JSEP 的具体程序（RFC 8829）。
- **浏览器 API**（W3C WebRTC 1.0）与各实现的行为差异：属实现层，各正文以"实现观测"节标注。

[主题入口](./README.md) · [资源页](./resources.md)
