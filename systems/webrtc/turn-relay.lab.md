# TURN 转发的开销与计时

两个可计算的机制来自 [RFC 8656](https://www.rfc-editor.org/info/rfc8656)：两种转发机制的每包开销（§3.4、§3.5、§12.4），与三组独立的生命周期计时器（§3.2、§3.3、§3.5）。上下文见 [[turn|TURN：中继的分配与转发]] 第 2、4 节。

## 每包开销：Send 指示 vs ChannelData

按规范逐项拼出两种报文的字节数（IPv4 对端、n 字节负载，DATA 值 4 字节对齐补位至多 3 字节）：

```python run id=overhead
def send_indication_size(n: int) -> int:
    return 20 + 12 + 4 + n + (-n) % 4   # STUN 头 + XOR-PEER-ADDRESS + DATA 头 + 值 + 补位

def channel_data_size(n: int) -> int:
    return 4 + n                        # 通道号 2B + 长度 2B + 数据

for n in (60, 300, 1200):
    print(n, "字节负载：Send", send_indication_size(n), "B，ChannelData", channel_data_size(n), "B")
```

固定开销差即规范在 §3.5 给出的动机（36 字节 → 4 字节）；换成带宽占比更直观：

```python run id=overhead-ratio
for n in (60, 300, 1200):
    ratio = (send_indication_size(n) - channel_data_size(n)) / channel_data_size(n)
    print(f"负载 {n:4d} B：ChannelData 比 Send 指示省 {ratio:.0%}")
```

## 三组独立计时器

allocation 600 s（§3.2 默认值）、permission 300 s（§3.3）、通道绑定 600 s（§3.5），各自独立刷新。设一个常见疏漏：客户端只按期 Refresh allocation，却不再发 CreatePermission——

```python run id=timers
allocation, permission, channel = 600, 300, 600
refresh_interval = 240  # 客户端每 4 分钟 Refresh 一次 allocation

t = 0
events = []
while t <= 900:
    if t and t % refresh_interval == 0:
        events.append((t, "Refresh → allocation 寿命重置"))
    if t == permission:
        events.append((t, "permission 过期：对端来的报文开始被静默丢弃"))
    if t == channel:
        events.append((t, "通道绑定过期：ChannelData 不可用，回退 Send 指示"))
    t += 60
for t, e in events:
    print(f"t={t:>4d}s  {e}")
```

allocation 仍活着、连接却"半死"——这个场景里最先失效的是 permission（300 s < 首个 600 s 到期点），且失效是静默的：只有对端方向的流量被丢弃。RFC 8445 §7.2.1 要求 ICE 期间保持权限活跃，正是针对这类时序。
