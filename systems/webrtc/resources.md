# WebRTC：资源

本页保留用于查阅规范、检查实现和验证浏览器行为的核心入口。具体协议的资料随实际研究需要补充。

来源核对日期：2026-10-29。

| 资源 | 发布或维护方 | 用途与边界 |
| --- | --- | --- |
| [WebRTC: Real-Time Communication in Browsers](https://www.w3.org/TR/webrtc/) | W3C WebRTC 工作组 | 浏览器 API 的正式规范，查阅接口契约、状态定义和操作算法。编辑草案与已发布规范须区分。 |
| [RFC 8825：WebRTC 协议总览](https://www.rfc-editor.org/info/rfc8825/) | IETF / RFC Editor | 协议族的总览与规范引用入口。深入某一机制时，从这里定位具体 RFC，再核对更新关系与勘误。 |
| [WebRTC 源码仓库（libwebrtc）](https://webrtc.googlesource.com/src/) | WebRTC 项目 | 查阅原生实现及仓库内文档。实现事实须注明提交版本，不能直接视为所有浏览器的共同契约。 |
| [WebRTC Code Samples](https://github.com/webrtc/samples) | WebRTC 项目 | 官方 JavaScript 示例及可运行的实验起点。示例中的应用选择不等同于协议要求。 |
| [Web Platform Tests：WebRTC](https://github.com/web-platform-tests/wpt/tree/master/webrtc) | Web Platform Tests 项目 | 查阅跨浏览器测试，核对 API 的预期可观察行为。具体测试须结合对应规范条款理解。 |
| [MDN：WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) | MDN Web Docs | 可信的 API 参考、使用说明与兼容性入口；规范性判断回到 W3C 或 IETF 原文。 |

## 引用约定

- 论证协议或 API 的约束时，引用具体规范及条款；引用 RFC 时核对其更新、替代关系和勘误。
- 论证某个实现的行为时，记录仓库、提交版本和具体代码位置；可变的分支入口只用于查找。
- 只有具体问题确实需要时，才增加更细的资料；阅读讨论、实验记录和未经核验的判断保留在私有工作区。

[返回 Brain](../../README.md)。
