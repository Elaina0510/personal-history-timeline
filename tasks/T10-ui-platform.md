---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T10 UI 平台适配层

- **对应模块**: MOD-009
- **依赖**: T02（只用类型与常量）
- **可并行**: 是

## 目标
把浏览器能力集中收口：StoragePort / ClockPort 实现、种子 fetch、图片压缩、下载、剪贴板。

## 允许改动的文件
```
src/ui/platform.ts
```

## 接口
```ts
export function createStorage(): StoragePort;
export function createClock(): ClockPort;
export async function loadSeedRaw(): Promise<string | null>;
export async function compressImage(file: File):
  Promise<{ ok: true; dataUrl: string } | { ok: false; code: 'COVER_TOO_LARGE' | 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' }>;
export function downloadJson(filename: string, text: string): void;
export async function copyText(text: string): Promise<boolean>;
export function showTextareaFallback(text: string): void;
```

## 实现要点
1. `createStorage`：`read/write/remove` 全部 try/catch，`write` 失败**必须重新抛出**（store 依赖它判断容量）；`isAvailable()` 用一次试写试删判定。
2. `createClock`：`nowIso()` 必须带本地时区偏移（`+08:00` 形态），不能用 `toISOString()`（那是 UTC 的 `Z`）。
3. `loadSeedRaw`：`fetch('./data/events.json?v=' + __BUILD_ID__)`，非 2xx 或异常返回 `null`，**不得抛错**。
4. `compressImage`：`createImageBitmap` → canvas 长边缩到 ≤1280 → `toBlob('image/jpeg', q)`，q 依次取 `JPEG_QUALITIES = [0.8, 0.6]`；仍未 ≤307200 字节则返回 `COVER_TOO_LARGE`。前置校验：`file.type` 非 `image/` → `INVALID_FILE_TYPE`；`file.size > 10MiB` → `FILE_TOO_LARGE`。输出用 `FileReader` 转 `data:image/jpeg;base64,...`。
5. `downloadJson`：`Blob` + `a[download]` + `URL.revokeObjectURL`。
6. `copyText`：优先 `navigator.clipboard.writeText`，失败返回 `false`；`showTextareaFallback` 渲染只读 textarea 到 `#overlay-root` 并全选。

## 严禁
- 不做业务判断（是否超容量、能否保存由 Core 决定）。
- 不引入任何图片处理库。
- 不用 `toISOString()` 生成业务时间戳。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 上传 5MB PNG → 输出 Base64 且 ≤300KB。
- 上传 `.pdf` → `INVALID_FILE_TYPE`。
- 非 HTTPS 下点复制 → 返回 false 且降级 textarea 出现。
- 断网打开页面 → `loadSeedRaw` 返回 null，页面不崩。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T10 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-009、§5.2 Port 接口、§4.5 常量、§7.2 相关错误场景。

任务：只写 src/ui/platform.ts，导出 createStorage、createClock、loadSeedRaw、compressImage、downloadJson、copyText、showTextareaFallback 七个函数。

硬性要求：
1. StoragePort.write 失败必须重新抛出，不能吞掉——store 靠它判断容量超限。
2. ClockPort.nowIso() 必须输出带本地时区偏移的形式（如 2026-11-18T21:30:00+08:00），绝不能用 toISOString() 的 Z 结尾。
3. loadSeedRaw 用相对路径 ./data/events.json 并加 ?v= 构建号，失败一律返回 null，不许抛错。
4. compressImage：长边缩到 1280，JPEG 质量先 0.8 再 0.6，仍超 307200 字节返回 COVER_TOO_LARGE；非图片返回 INVALID_FILE_TYPE；原始文件超 10MiB 返回 FILE_TOO_LARGE。
5. 不做任何业务判断（是否允许保存由 Core 决定）。

严禁：引入图片处理库；用 toISOString 生成业务时间戳；吞掉 storage 写异常。

完成标准：按下面四条逐条给出断言。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run typecheck 无错误，并贴真实输出。
```
