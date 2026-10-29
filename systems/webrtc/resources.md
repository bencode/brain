# WebRTC：资源

本页按四个层面保留核心入口：标准与协议、实现库、验证与观测工具、应用案例。具体条目随实际研究需要补充。

来源核对日期：2026-10-29。

## 标准与协议

| 资源 | 发布或维护方 | 用途与边界 |
| --- | --- | --- |
| [WebRTC: Real-Time Communication in Browsers](https://www.w3.org/TR/webrtc/) | W3C WebRTC 工作组 | 浏览器 API 的正式规范，查阅接口契约、状态定义和操作算法。编辑草案与已发布规范须区分。 |
| [RFC 8825：WebRTC 协议总览](https://www.rfc-editor.org/info/rfc8825/) | IETF / RFC Editor | 协议族的总览与规范引用入口。深入某一机制时，从这里定位具体 RFC，再核对更新关系与勘误。 |
| [MDN：WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) | MDN Web Docs | 可信的 API 参考、使用说明与兼容性入口；规范性判断回到 W3C 或 IETF 原文。 |

## 实现库

| 资源 | 发布或维护方 | 用途与边界 |
| --- | --- | --- |
| [webrtc-rs](https://github.com/webrtc-rs/webrtc) | webrtc-rs 项目（Pion 的 Rust 移植） | 本主题示例采用的 Rust 实现。查阅源码、测试与示例以核对具体行为；实现事实须注明 crate 版本。 |
| [webrtc-rs API 文档](https://docs.rs/webrtc/) | docs.rs（随发布更新） | Rust API 参考。版本随发布变化，结论须对照所用版本。 |
| [WebRTC 源码仓库（libwebrtc）](https://webrtc.googlesource.com/src/) | WebRTC 项目 | 浏览器与原生生态的参考实现。实现事实须注明提交版本，不能直接视为所有浏览器的共同契约。 |

## 验证与观测

| 资源 | 发布或维护方 | 用途与边界 |
| --- | --- | --- |
| [Web Platform Tests：WebRTC](https://github.com/web-platform-tests/wpt/tree/master/webrtc) | Web Platform Tests 项目 | 查阅跨浏览器测试，核对 API 的预期可观察行为。具体测试须结合对应规范条款理解。 |
| [WebRTC Code Samples](https://github.com/webrtc/samples) | WebRTC 项目 | 官方 JavaScript 示例及可运行的实验起点。示例中的应用选择不等同于协议要求。 |
| `chrome://webrtc-internals` | Chromium 内置 | 浏览器端连接建立过程与 ICE/getStats 统计的实时观测与导出；只覆盖本端视角，非协议行为本身。 |
| [Wireshark](https://www.wireshark.org/docs/) | Wireshark Foundation | 报文级分析 STUN/ICE/DTLS/SCTP。STUN 层明文可读；DTLS 之后的内层需要密钥才能解读。 |

## 应用案例

| 资源 | 发布或维护方 | 用途与边界 |
| --- | --- | --- |
| [Isbell](https://github.com/bencode/Isbell) | 本库作者 | 浏览器直连多台机器上 AI agent 的产品，WebRTC DataChannel 的真实应用。其中结论注明场景与版本，不作为协议行为的依据。 |

## 引用约定

- 论证协议或 API 的约束时，引用具体规范及条款；引用 RFC 时核对其更新、替代关系和勘误。
- 论证某个实现的行为时，记录仓库、提交版本和具体代码位置；可变的分支入口只用于查找。
- 只有具体问题确实需要时，才增加更细的资料；阅读讨论、实验记录和未经核验的判断保留在私有工作区。

[返回 Brain](../../README.md)。
