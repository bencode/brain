# STUN 报文编码

按 [RFC 8489](https://www.rfc-editor.org/info/rfc8489) 编码与解码 STUN 的两处二进制细节：Type 的位交织（§5）、XOR-MAPPED-ADDRESS（§14.2）。上下文见 [[nat-stun|NAT 与 STUN]] 的第 3 节。改动数值，验证你能预测每个字节。

## Type：方法与类别的位交织

```python run id=type-bits
def message_type(method: int, msg_class: int) -> int:
    # §5 Figure 3：M0-3 在 bit 0-3，C0 在 bit 4，M4-6 在 bit 5-7，C1 在 bit 8，M7-11 在 bit 9-13
    return ((method & 0x000F) | ((method & 0x0070) << 1) | ((method & 0xF80) << 2)
            | ((msg_class & 1) << 4) | ((msg_class & 2) << 7))

binding = 0b000000000001
classes = {"请求": 0b00, "指示": 0b01, "成功响应": 0b10, "错误响应": 0b11}
{f"Binding {name}": hex(message_type(binding, c)) for name, c in classes.items()}
```

method 与 class 都取最大值时，Type 仍不超过 14 位——首两位恒为 0，这正是与其他协议共用端口时的解复用判据之一：

```python run id=type-bits-check
message_type(0xFFF, 0b11) == 0x3FFF
```

## XOR-MAPPED-ADDRESS

编码规则（§14.2）：端口异或 Cookie 高 16 位；IPv4 地址异或整个 Cookie。

```python run id=xor-codec
COOKIE = 0x2112A442

def encode_xor_mapped(ip: str, port: int) -> bytes:
    addr = int.from_bytes(bytes(map(int, ip.split("."))), "big")
    family = 0x01  # IPv4
    x_port = port ^ (COOKIE >> 16)
    x_addr = addr ^ COOKIE
    return bytes([0, family]) + x_port.to_bytes(2, "big") + x_addr.to_bytes(4, "big")

def decode_xor_mapped(value: bytes) -> tuple[str, int]:
    assert value[1] == 0x01
    x_port = int.from_bytes(value[2:4], "big")
    x_addr = int.from_bytes(value[4:8], "big")
    addr = x_addr ^ COOKIE
    ip = ".".join(str(b) for b in addr.to_bytes(4, "big"))
    return ip, x_port ^ (COOKIE >> 16)

encoded = encode_xor_mapped("203.0.113.7", 51234)
encoded.hex(" ")
```

解码回去，往返一致：

```python run id=xor-roundtrip
decode_xor_mapped(encoded)
```

与正文十六进制示例逐字节对照（`01 e9 30 ea 12 d5 45`）：

```python run id=xor-article
b"\x01" + encoded[2:] == bytes.fromhex("01 e9 30 ea 12 d5 45")
```
