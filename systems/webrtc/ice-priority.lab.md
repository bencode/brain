# ICE 优先级计算

两个公式取自 [RFC 8445](https://www.rfc-editor.org/info/rfc8445)：候选优先级（§5.1.2.1）与候选对优先级（§6.1.2.3）。改动参数，验证你能预测排序。上下文见 [[ice|ICE：候选与选路]] 的第 3 节。

## 候选优先级

```python run id=candidate-priority
def priority(type_pref, local_pref, component_id):
    return (1 << 24) * type_pref + (1 << 8) * local_pref + (256 - component_id)

# §5.1.2.2 建议的 type pref；单地址 local pref 建议取 65535；WebRTC 复用在 component 1。
recommended = {"host": 126, "prflx": 110, "srflx": 100, "relay": 0}
{t: priority(p, 65535, 1) for t, p in recommended.items()}
```

十六进制视图更直观——高字节就是 type pref：

```python run id=candidate-priority-hex
{f"{t} ({p})": hex(priority(p, 65535, 1)) for t, p in recommended.items()}
```

## 候选对优先级

```python run id=pair-priority
def pair_priority(G, D):
    lo, hi = min(G, D), max(G, D)
    return (1 << 32) * lo + 2 * hi + (1 if G > D else 0)

G = priority(126, 65535, 1)   # controlling 端：host
D = priority(100, 65535, 1)   # controlled 端：srflx
pair_priority(G, D)
```

同一对地址，两端各自计算的差别只在 tie-break 项，排序因此一致：

```python run id=symmetric-view
pair_priority(G, D), pair_priority(D, G)
```

min 占最高位意味着排序由较弱的一端主导：一端是 relay 时，另一端多强都排不到前面——

```python run id=weak-side-dominates
relay = priority(0, 65535, 1)
srflx = priority(100, 65535, 1)
host = priority(126, 65535, 1)
pair_priority(host, relay) < pair_priority(srflx, srflx)
```
