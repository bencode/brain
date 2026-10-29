# TURN：中继的分配与转发

[NAT 与 STUN](./nat-stun.md) 的结尾是硬墙：两端皆为 address-and-port-dependent 映射（symmetric）时，双方都无法向对方通告可复用的地址，直连无解。TURN（Traversal Using Relays around NAT，[RFC 8656](https://www.rfc-editor.org/info/rfc8656)）把这个问题转化为中继：客户端在服务器上取得一个公开可达的转发地址（relay 候选），对端发往该地址的流量由服务器转交。代价是所有流量经过服务器——带宽、延迟、以及信任。

本文依据 RFC 8656 整理。规范要求、本文的解释、实现观测三者分开陈述；条款号未注明出处的一律指 RFC 8656。

## 1. 模型：allocation 与 5-tuple

TURN 的中心概念是 **allocation**：服务器上的一个数据结构，持有转发地址（relayed transport address）、权限列表与通道列表（§3）。客户端向服务器发起 Allocate 事务创建它，此后用这对地址收发应用数据。

三组地址各司其职（§3，Figure 1）：

| 地址 | 谁看到 | 说明 |
| --- | --- | --- |
| 客户端 host 地址 | 客户端本机 | 客户端发出 TURN 报文的源地址 |
| 客户端 srflx 地址 | 服务器 | NAT 改写后的来源地址 |
| relayed 地址 | 对端 | 服务器上分配的转发地址，对端向它发包 |

一个 allocation 由 **5-tuple**（客户端 host 地址、服务器地址、传输协议）唯一标识（§2）；同一 5-tuple 上的后续报文自动归属同一 allocation，报文里不需要再指明转发地址。一个 allocation 可同时服务多个对端——报文里指明目标对端即可——因此 ICE 中一个 relay 候选对全部远端候选通用。

对端在 NAT 后时，客户端必须用对端的 **srflx 地址**（而非 host 地址）指明目标（§3）。

## 2. 分配：Allocate 事务

创建流程（§3.2、§7）：

1. 客户端发 Allocate 请求，必须携带 REQUESTED-TRANSPORT（本规范恒为 UDP，指明的是**服务器到对端**的协议，§7.1）。
2. 服务器要求认证：**long-term 凭据机制**（STUN 的挑战-响应：先被 401 拒绝，携 realm/nonce 重试；§3.2、Figure 2）。这与 ICE 检查用的 short-term（[ICE：候选与选路](./ice.md) §4）不同——TURN 服务跨管理域运行，凭据是账号体系预先发放的。
3. 成功响应携带 **XOR-RELAYED-ADDRESS**（转发地址，即 relay 候选）与 **XOR-MAPPED-ADDRESS**（客户端的 srflx 地址——一次 Allocate 顺带完成了 STUN Binding 的工作，§7.3）。

**生命周期**是三组独立计时器中最长的一档：allocation 默认存活 600 s，服务器上限建议不超过 3600 s，客户端实际得到的寿命以响应为准（§7.2、§7.3）。续期用 Refresh 事务，会重置计时；建议在到期前约 1 分钟刷新；**LIFETIME=0 的 Refresh 即显式删除**（§8）。不续期则静默过期。

## 3. 权限：转发不是无条件的

服务器不会转发任意来源的流量。每个 allocation 维护一张权限表：**一条权限 = 一个对端 IP 地址 + 存活时间**，与端口无关（§3.3）。到达转发地址的报文，源 IP 命中权限才被转发，否则静默丢弃。

规范明言这个设计的动机与语义：权限**模拟 RFC 4787 的 address-dependent 过滤**——服务器在转发侧表现得像一个带过滤规则的 NAT。要点：

- 权限 5 分钟不刷新即过期；**没有显式删除**的操作（§3.3）。
- 安装/刷新走 CreatePermission（一次请求可装多条，ICE 恰好需要）或 ChannelBind（§3.3）。
- **Send/Data 指示不能装权限**：指示类报文无法认证（long-term 机制不支持），伪造的 Send 指示可以让服务器向外发包，权限是缓解手段（§3.4）。

与 ICE 的衔接由此确定（RFC 8445 §7.2.1）：从 relay 候选发出连通性检查前，必须先为远端候选的 IP 建权限；规范建议 ICE 结束前只用权限、不建通道，且权限必须保持活跃直到 ICE 完成。

## 4. 两种转发机制

### 4.1 Send 与 Data 指示

第一种机制用 STUN 指示报文：客户端→服务器是 Send 指示（XOR-PEER-ADDRESS + DATA 属性），服务器→客户端是 Data 指示（§3.4）。服务器收到 Send 指示后取出 DATA 内容，以转发地址为源地址发给对端——对端看到的来源就是这个 relay 候选。

报文本身仍是 STUN 格式（20 字节头 + 属性），对一个 IPv4 对端、n 字节负载：20 + 12（XOR-PEER-ADDRESS）+ 4 + n（DATA，值按 4 字节对齐补位）——**每包固定开销 36 字节**（§3.5 给出的数字即此构成）。

### 4.2 ChannelData

第二种机制换掉报文格式：**ChannelData 消息不是 STUN 报文**，只有 4 字节头——通道号 2 字节 + 长度 2 字节，随后直接是应用数据（§12.4）。通道号预先由 ChannelBind 请求绑定到某个对端地址（可用范围 0x4000–0x4FFF，§12.2），此后双向数据都用这 4 字节指路，每包开销从 36 降到 4。

通道规则（§3.5、§12）：

- 绑定 10 分钟不刷新即过期（比权限长）；刷新即重新绑定；同样没有显式删除。ChannelBind 同时刷新该对端的权限（§3.3）。
- 通道一旦绑定，**服务器回程一律用 ChannelData**；客户端仍可混用 Send 指示（例如要用 DONT-FRAGMENT 属性时）（§3.5）。

![[turn-relay]]

## 5. 传输形态

客户端到服务器支持四种承载，服务器到对端恒为 UDP（§3.1，Table 1）：

| 客户端 ↔ 服务器 | 服务器 ↔ 对端 |
| --- | --- |
| UDP / TCP / TLS over TCP / DTLS over UDP | UDP（UDP allocation） |

TCP 与 TLS 的存在理由（§3.1）：有的网络整段禁 UDP，TURN over TCP/TLS（实践中常走 443 端口）穿过这类防火墙；(D)TLS 另外提供服务器身份验证与控制报文机密性。规范同时指出（D)TLS 非必须——应用数据通常自带端到端加密，在 WebRTC 里正是如此：DTLS 端到端加密之后，TURN 服务器转发的只是密文。服务器到对端的 TCP 中继是另一扩展（RFC 6062），本规范不涉及。

## 6. 实现观测

- 浏览器：`RTCPeerConnection.getStats()` 的候选统计中 `candidateType === "relay"`；selected pair 走 relay 时连接报告中 local/remote 候选类型可见。
- 服务器端：coturn 是部署最广的开源 TURN 服务器（见[资源页](./resources.md)），`turnserver` 日志可核对 allocation、permission、channel 事件与用量。

## 7. 范围之外

- TCP allocations（服务器到对端走 TCP）：RFC 6062。
- 第三方授权与 OAuth：RFC 7635。
- TURN 服务器发现与 URI 细节：RFC 8656 §4、RFC 8155。

[主题入口](./README.md) · [资源页](./resources.md)
