# WebRTC

围绕数据面（DataChannel 路径）整理 WebRTC：信令与 SDP、ICE、STUN/TURN、DTLS、SCTP。媒体面（RTP/音视频）不在当前内容中。

主题按三个层面组织：

| 层面 | 回答的问题 | 当前内容 |
| --- | --- | --- |
| 标准与协议 | 机制如何定义，为什么这样工作，有哪些约束？ | [ICE：候选与选路](./ice.md) · [NAT 与 STUN：地址的发现](./nat-stun.md) |
| 实现库与示例 | 如何用 Rust 库实现，如何验证？ | — |
| 应用实践 | 在具体产品中解决什么问题？ | — |

- [ICE：候选与选路](./ice.md)：候选类型与收集、两个优先级公式、连通性检查、提名与 selected pair。配套计算 Lab：[ice-priority](./ice-priority.lab.md)。
- [NAT 与 STUN：地址的发现](./nat-stun.md)：NAT 行为的两轴分类、STUN 报文格式与 XOR 编码、STUN 在 ICE 里的两份工作。配套编码 Lab：[stun-xor](./stun-xor.lab.md)。
- [资源](./resources.md)：标准与协议、实现库、验证与观测工具、应用案例的入口。

[返回 Brain](../../README.md)。
