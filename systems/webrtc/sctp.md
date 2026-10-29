# SCTP 与 DCEP：DataChannel 的传输层

[DTLS](./dtls.md) 就绪后，两端之间有了一条加密通道。应用要在这条通道上收发消息，还差一层传输语义：消息要有**边界**（发什么单位、收什么单位）、每条通道要有独立的**可靠性**与**有序性**、通道要能**开关**。DataChannel 的传输层由 SCTP（Stream Control Transmission Protocol，[RFC 4960](https://www.rfc-editor.org/info/rfc4960)）承担，作为 DTLS 的应用数据封装（RFC 8831、RFC 8261），通道协商由 DCEP（[RFC 8832](https://www.rfc-editor.org/info/rfc8832)）完成，SDP 侧的声明见 [RFC 8841](https://www.rfc-editor.org/info/rfc8841)。

本文依据这三份规范及 RFC 4960 整理。规范要求、本文的解释、实现观测三者分开陈述。

## 1. SCTP 带来什么

SCTP 是与 TCP 同级的传输协议，WebRTC 只用它的一个子集。三个核心概念（RFC 8831 §6.3、RFC 8832 §3）：

- **关联（association）**：两端之间的 SCTP 连接。每条 PeerConnection 一个，建在 ICE 选出、DTLS 加密的路径上（RFC 8831 §6.2）；流数量建议协商到上限（65535，§6.2）。
- **流（stream）**：关联内的**单向**逻辑信道，以流标识（0–65534）区分。有序性只在同一条流内保证——一个流的丢包重传不阻塞其他流，这是多流相对于单条字节流的核心收益。
- **消息边界**：SCTP 以用户消息为单位传输，一次发送对应一次递交。发送端**必须**每条应用消息恰好放入一条 SCTP 用户消息（RFC 8831 §6.6）。

关联级共享的还有拥塞控制（类 TCP 的速率控制作用于整个关联）与故障判定：重传次数超限时关联以非优雅方式终止（§6.2）。

规范要求的扩展子集（RFC 8831 §6.1）：流重配置（RFC 6525，关闭通道用）与部分可靠（RFC 3758 限时策略、RFC 7496 限次策略）为**必须**；消息交织（RFC 8260）为**建议**——不用交织时，一条大消息独占整个关联，因此发送端建议把消息限制在 16 KB 内（§6.6）。

## 2. DataChannel = 一对同号流

SCTP 的流是单向的，DataChannel 把**一个方向各一条、流标识相同**的两条流配成一条双向通道（RFC 8831 §6.4）。通道在两个方向上有各自的一组属性：

- 可靠或不可靠（不可靠时两个方向同等不可靠）；
- 有序或无序；
- 优先级（2 字节，按加权公平排队解释；WebRTC 建议取 128/256/512/1024 四档之一，§6.4）；
- 可选的 label 与 protocol。

注意规范明确：可靠性与有序性在 SCTP 里是**每条消息**的属性而非流的属性（§6.4）——DataChannel 只是把它们固定在通道粒度上。经 DCEP 协商的通道，两个方向属性一致（§6.4）。

## 3. DCEP：开通道的两次握手

SCTP 只认流，没有"通道"的名字与参数。DCEP 补上这一层，只有两种消息，都走**该通道自己的流**，与用户消息靠 PPID 区分（RFC 8832 §4、§6）：

```text
DATA_CHANNEL_OPEN（0x03，发起方 → 对端）
┌────────────┬──────────────┬──────────┬─────────────┬─────────┬─────────┬───────┬───────┐
│ 消息类型 1B │ 通道类型 1B   │ 优先级 2B │ 可靠性参数 4B │ label长2B│ proto长2B│ label │ proto │
└────────────┴──────────────┴──────────┴─────────────┴─────────┴─────────┴───────┴───────┘

DATA_CHANNEL_ACK（0x02，对端 → 发起方）：仅 1 字节消息类型
```

（字段布局见 RFC 8832 §5.1。）

规则（RFC 8832 §4、§5）：

- 发起方选一对未使用的流发 OPEN，对端在自己同号出流上回 ACK，通道即建立。**发起方在收到 ACK 之前就可以发用户消息**。
- 流标识按 DTLS 角色分配：DTLS client 一侧必须用**偶数**流，server 一侧必须用**奇数**流——两端同时开通道不会撞号。
- label 与 protocol 都不保证唯一：双方同时开名为 `x` 的通道，会得到两条都叫 `x` 的通道（§4 注）。
- protocol 字段若非空，取 WebSocket 子协议注册表（RFC 6455）中的名字，用于跨应用互操作。

## 4. 可靠性语义：通道类型六选一

OPEN 的通道类型字段编码六档语义（RFC 8832 §5.1），对应 API 的两个参数（`ordered` 与 `maxRetransmits`/`maxPacketLifeTime` 二选一）：

| 通道类型 | 值 | 语义 | API 形态 |
| --- | --- | --- | --- |
| RELIABLE | `0x00` | 有序、无限重传（类 TCP） | 默认 |
| RELIABLE_UNORDERED | `0x80` | 无序、无限重传 | `ordered: false` |
| PARTIAL_RELIABLE_REXMIT | `0x01` | 有序、最多重传 N 次 | `maxRetransmits: n` |
| PARTIAL_RELIABLE_REXMIT_UNORDERED | `0x81` | 无序、最多重传 N 次 | 两者并用 |
| PARTIAL_RELIABLE_TIMED | `0x02` | 有序、限时（ms，从消息交给协议栈起算） | `maxPacketLifeTime: ms` |
| PARTIAL_RELIABLE_TIMED_UNORDERED | `0x82` | 无序、限时 | 两者并用 |

两个精确含义值得注意：

- **"不可靠"是跳过而非断流**：超限的消息被放弃，后续消息照常递交。限次为 0 加无序，就是 UDP 语义——每条消息只发一次、按到达顺序递交（RFC 8831 §6.1 的原话）。
- **可靠性参数字段**（4 字节）仅在部分可靠类型时有意义：限次时是重传次数，限时时是毫秒寿命；可靠类型下发送端必须置 0、接收端必须忽略（RFC 8832 §5.1 表 1）。

**关闭**走流重置（RFC 8831 §6.7）：一端重置自己的出流，对端看到入流被重置后重置自己的出流；RFC 6525 保证重置前在途消息**送达或放弃**；重置把流序号归零，流随后可复用。 SCTP 关联本身的关闭分优雅与非优雅两种；两种情况下所有通道都会关闭（§6.2）。

## 5. PPID：消息的内容类型

每条 SCTP 用户消息带 PPID（Payload Protocol Identifier）。WebRTC 用到的注册值（RFC 8831 §8 表 1、RFC 8832 §8.1 表 2）：

| PPID | 含义 |
| --- | --- |
| 50 | DCEP 控制消息（OPEN/ACK 本身） |
| 51 / 56 | WebRTC 字符串消息 / 空字符串消息 |
| 53 / 57 | WebRTC 二进制消息 / 空二进制消息 |
| 52 / 54 | 字符串 / 二进制"部分消息"（**已废弃**，旧分片机制的兼容标记） |

两个细节：SCTP 不传零长度消息，空消息以"对应 Empty PPID + 一个零字节"表示（RFC 8831 §6.6）；收到不认识的 PPID，接收端应当关闭对应通道——用新 PPID 扩展必须先协商（§6.6）。

**消息大小**：一条应用消息 = 一条 SCTP 用户消息（大消息由 SCTP 自行分片重组，接收端无感）；单条消息的上限经 SDP 的 `max-message-size` 协商（RFC 8841 §6），不协商时发送端应自律在 16 KB 内（RFC 8831 §6.6）；发送端建议关闭 Nagle 算法以降延迟（§6.6）。

## 6. SDP 侧：一条 m 行

DataChannel 在 SDP 中的声明（RFC 8841 §4 示例）：

```text
m=application 12345 UDP/DTLS/SCTP webrtc-datachannel
a=sctp-port:5000
a=max-message-size:100000
```

`sctp-port` 是 SCTP 层的端口号（惯例 5000），与 UDP 端口无关、无路由意义；`max-message-size` 声明本端能接收的单条消息上限（0 表示不加限制）。

## 7. 实现观测

- 浏览器：`RTCPeerConnection.getStats()` 的 SCTP 与 data-channel 统计给出关联状态、在途字节与各通道收发量；`channel.readyState`（connecting/open/closing/closed）镜像 DCEP 与流重置的进度。
- webrtc-rs：`on_data_channel()` 回调对应 DCEP OPEN 的到达；channel 的 `ordered`/`max_retransmits` 等属性即 OPEN 消息解析结果。

## 8. 范围之外

- SCTP 自身协议：四路握手与状态 cookie、TSN 与 SACK、CRC32c——RFC 4960（其状态 cookie 与 DTLS 的 cookie 抗 DoS 思想同源）。
- 流重配置与调度器细节：RFC 6525、RFC 8260。
- 应用层的分片、背压与大消息实践：DataChannel 实战篇（另行成篇）。

[主题入口](./README.md) · [资源页](./resources.md)
