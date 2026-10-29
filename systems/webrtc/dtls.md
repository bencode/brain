# DTLS：加密建立与身份锚定

[ICE](./ice.md) 结束时选定了一对地址，[TURN](./turn.md) 之后可能还隔着中继——无论哪条路，它都是**裸 UDP**：中间网络可以读取、改写、注入任何字节。下一步是在这条路上建立加密与身份认证，这就是 DTLS（Datagram Transport Layer Security）的工作：[RFC 6347](https://www.rfc-editor.org/info/rfc6347) 定义 1.2，[RFC 9147](https://www.rfc-editor.org/info/rfc9147) 定义 1.3。

本文依据 RFC 9147（DTLS 1.3）、RFC 8122（证书指纹）、RFC 8829/8827 及相关规范整理。规范要求、本文的解释、实现观测三者分开陈述。

## 1. 为什么不能直接用 TLS

TLS 的设计处处假设底层是可靠有序的字节流：握手报文丢了等重传、按序处理、证书消息不拆分。UDP 都不保证。DTLS 复用 TLS 的握手消息、密码套件与密钥导出，只针对数据报环境做适配（RFC 9147 §5）：

| UDP 的问题 | DTLS 的适配 |
| --- | --- |
| 握手报文会丢 | 重传定时器；1.3 新增 ACK 内容类型确认握手消息（§5） |
| 握手报文乱序/重复 | 每条握手消息带显式序号（`message_seq`，§5.2） |
| 单条消息可能超过 MTU | 握手消息分片重组（`fragment_offset`/`fragment_length`，§5.2） |
| 记录层乱序/重放 | 每条记录带 epoch 与序号，滑动窗口过滤重放（§4.2、§4.5.1） |
| 伪造源的握手洪泛 | 无状态 cookie 验证回程可达（§5.1） |

cookie 机制值得一句展开：攻击者可以伪造源地址发起握手，让服务器付出生成大响应（如证书）的代价、或让服务器变成对受害者的放大器（§5.1 列举了这两类攻击）。服务器先回一个含无状态 cookie 的 HelloRetryRequest，客户端必须在新的 ClientHello 里带回 cookie——收到 cookie 才证明源地址真实可达。DTLS 1.2 用独立的 HelloVerifyRequest 消息携带 cookie，1.3 改用 TLS 1.3 的 HelloRetryRequest 加扩展完成同一件事（§5.1）。

## 2. 身份锚定：自签证书 + 指纹

TLS 的常规身份体系是 CA 证书链。WebRTC 两端是浏览器或应用直连，事先没有共同信任的 CA——于是采用另一条锚定路径：**证书自签，身份由信令通道传递的指纹锚定**。

### 2.1 指纹：a=fingerprint

证书指纹是证书 DER 编码的单向哈希，在 SDP 中以 `a=fingerprint` 属性传递（RFC 8122 §5）：

```text
a=fingerprint:sha-256 19:E2:1C:3B:4B:9F:81:14:1F:...(每字节两位大写十六进制，冒号分隔)
```

规范要点（RFC 8122 §5）：哈希函数名与值成对出现；SHA-256 为首选，MD5/MD2 禁止使用；一个会话可带多枚指纹（多证书、多哈希，§5.1）。按 JSEP，offer/answer 中每个期望的摘要算法带一行或多行 `a=fingerprint`（RFC 8829 §5.2.1、§5.3.1）。

### 2.2 为什么自签是安全的

规范原文给出了精确条件（RFC 8122 §6.1）：**若 SDP 经完整性保护的机制传输，证书可以使用任何语法合法的身份**——自签证书由此获得规范依据；反之，若 SDP 无完整性保护，证书必须证明连接地址或 SDP 创建者的身份（那就回到了传统 PKI 路径）。

完整的信任链：

```text
信令通道提供完整性（如 TLS/HTTPS）
  ⇒ SDP 中的 a=fingerprint 未被篡改
    ⇒ 握手时对端出示的证书与指纹匹配
      ⇒ RFC 8122 §5 的结论：SDP 的作者就是连接的发起者
        ⇒ 握手导出的密钥属于对端，此后通道机密且完整
```

安全架构文档的表述相同：这一层安全"仅仅由指纹随消息传递、且消息从信令服务器安全送达来提供"（RFC 8827 §4）。密钥对可以是**每次连接临时生成**的——RFC 8827 §4 的叙述：该密钥"可以仅为本次呼叫临时生成"；WebRTC 的常见实现即为每条 PeerConnection 生成新的自签证书。

对应的失效场景也唯一：信令通道被中间人改写 ⇒ 攻击者把指纹换成自己的 ⇒ 双方各自与攻击者完成 DTLS 握手 ⇒ 经典 MITM。**数据面的安全强度，上限就是信令通道的完整性。**

### 2.3 双向验证与一个时序细节

握手时**双方都要验证对方**（RFC 8122 §6.2）：`setup:passive` 一方（TLS server 角色）必须出示证书，与指纹不符则以 bad_certificate 终止；offer/answer 模型下 `setup:active` 一方（client 角色）同样必须出示证书，server 端主动请求之。

时序细节（RFC 8122 §6.2）：DTLS 连接可能**抢在 answer 之前**到达 offerer——ICE 检查完成后客户端一侧即可开始握手。规范要求 offerer 可以先监听、先完成握手，但在收到 answer 中的指纹并核对之前，**不得信任通道上传输的任何数据**。

## 3. 角色协商：a=setup

谁当 DTLS client、谁当 server，由 SDP 的 `a=setup` 属性协商（RFC 4145 §4：值 active / passive / actpass / holdconn）。JSEP 的规则（RFC 8829 §5.2.1、§5.3.1）：offer 必须（MUST）写 `actpass`；answer 必须（MUST）回 `active` 或 `passive`，且建议（SHOULD）用 `active`。`a=setup:active` 的一方发起 DTLS 握手。

通常 offerer（ICE controlling）同时是 DTLS 的被连接方（answer 回 active 时角色互换），但这两个角色分配**彼此独立**——ICE 的 controlling/controlled 与 DTLS 的 client/server 没有规范上的绑定。

## 4. 与相邻层的接口

- **同端口解复用**。DTLS 与 STUN 检查、（媒体面的）RTP 共用 selected pair 的地址与端口，按首字节分流：0–3 为 STUN、20–63 为 DTLS、64–79 为 TURN ChannelData、128–191 为 RTP/RTCP，未匹配任何区间的包必须丢弃（完整规则见 RFC 7983，它更新了 RFC 5764 §5.1.2 的三区间划分，加入 TURN 区间并把 STUN 区间放宽到 0–3）。
- **上层的 SCTP**。DataChannel 的 SCTP 作为 DTLS 的应用数据承载（SCTP over DTLS，RFC 8831、RFC 8261）——握手完成后，中间网络与 TURN 服务器看到的只是 DTLS 密文。
- **媒体面一句带过**。若使用音视频，SRTP 的密钥在 DTLS 握手中经 `use_srtp` 扩展协商派生（RFC 5764 §4.1）；本文聚焦数据面，不展开。

## 5. 实现观测

- 浏览器：`getStats()` 的 transport 统计给出 DTLS 状态与所选密码套件；`chrome://webrtc-internals` 记录握手的版本、套件与两端指纹。
- webrtc-rs：`RTCPeerConnection` 的 certificate 可在配置时注入或自动生成，指纹经 SDP 交换。
- 抓包：Wireshark 对 DTLS 能解析记录层与 ClientHello/ServerHello 明文部分；应用数据需密钥才能解密。

## 6. 范围之外

- DTLS 1.2 与 1.3 的协商与差异细节：RFC 6347、RFC 9147。
- 连接迁移与连接 ID（CID）：RFC 9146。
- 基于身份提供者（IdP）的可验证身份断言：RFC 8827。
- SCTP 关联与流（DataChannel 的下一层）：[SCTP 与 DCEP：DataChannel 的传输层](./sctp.md)。

[主题入口](./README.md) · [资源页](./resources.md)
