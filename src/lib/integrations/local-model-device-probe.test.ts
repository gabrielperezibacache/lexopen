import assert from "node:assert/strict";
import test from "node:test";
import { collectLocalDevices, parseLinuxAvailableMemory, parseMacDisplays, parseMacMemoryPressure, parseNvidiaMemory, parseWindowsDisplays, type DeviceProbeIO, WINDOWS_GPU_QUERY } from "./local-model-device-probe";

const GIB = 1024 ** 3;
const unavailable: DeviceProbeIO = { run: async () => { throw Error("not installed"); }, read: async () => { throw Error("not visible"); }, list: async () => [] };

test("macOS distinguishes shared, dedicated and unified memory without leaking display identifiers", () => {
  const devices = parseMacDisplays(JSON.stringify({ SPDisplaysDataType: [
    { sppci_model: "Apple M4 Max", serial_number: "do-not-return", spdisplays_ndrvs: [{ serial: "private" }] },
    { sppci_model: "AMD Radeon Pro", spdisplays_vram: "8 GB" },
    { sppci_model: "Intel Iris", spdisplays_vram_shared: "1536 MB" }, {},
  ] }));
  assert.equal(devices.length, 3);
  assert.equal(devices[0].memoryKind, "unified");
  assert.equal(devices[0].totalMemoryBytes, null, "the RAM pool is assigned once by normalization");
  assert.equal(devices[1].totalMemoryBytes, 8 * GIB);
  assert.equal(devices[2].memoryKind, "shared");
  assert.equal(devices[2].totalMemoryBytes, 1536 * 1024 ** 2);
  assert.doesNotMatch(JSON.stringify(devices), /private|do-not-return|serial/);
  assert.deepEqual(parseMacDisplays("invalid"), []);
});

test("NVIDIA CSV preserves each adapter, including zero free VRAM and names containing commas", () => {
  const devices = parseNvidiaMemory("NVIDIA RTX, Test, 24576, 22528\nNVIDIA second, 16384, 0\nNVIDIA invalid, 1024, 2048\nNVIDIA unknown, N/A, N/A");
  assert.equal(devices.length, 2);
  assert.equal(devices[0].name, "NVIDIA RTX, Test");
  assert.equal(devices[0].totalMemoryBytes, 24 * GIB);
  assert.equal(devices[0].availableMemoryBytes, 22 * GIB);
  assert.equal(devices[1].availableMemoryBytes, 0);
  assert.deepEqual(parseNvidiaMemory("NVIDIA, -1, 10"), []);
});

test("Windows uses 64-bit DXGI memory rather than truncated WMI AdapterRAM", () => {
  const devices = parseWindowsDisplays(JSON.stringify([
    { Name: "AMD Radeon 64GB", DedicatedVideoMemory: 64 * GIB, SharedSystemMemory: 32 * GIB },
    { Name: "Intel shared", DedicatedVideoMemory: 128 * 1024 ** 2, SharedSystemMemory: 8 * GIB },
    { Name: "Microsoft Basic Render Driver", DedicatedVideoMemory: 128 * GIB, Software: true },
  ]));
  assert.equal(devices.length, 2);
  assert.equal(devices[0].totalMemoryBytes, 64 * GIB);
  assert.equal(devices[0].availableMemoryBytes, null);
  assert.equal(devices[1].memoryKind, "shared");
  assert.equal(parseWindowsDisplays(JSON.stringify({ Name: "Tesla T4", VendorId: 0x10de, DedicatedVideoMemory: 16 * GIB }))[0].vendor, "nvidia");
  const fallback = parseWindowsDisplays('{"Name":"AMD fallback","AdapterRAM":4294967295}', "windows-cim");
  assert.equal(fallback[0].totalMemoryBytes, null);
  assert.equal(fallback[0].memoryKind, "unknown");
  assert.deepEqual(parseWindowsDisplays("{}"), []);
  assert.match(WINDOWS_GPU_QUERY, /UIntPtr DedicatedVideoMemory/);
  assert.doesNotMatch(WINDOWS_GPU_QUERY, /OutputAssembly|Invoke-WebRequest|Start-Process|Install-|Download|Set-Item|Remove-Item/);
});

test("native availability handles reclaimable memory and rejects invalid percentages", () => {
  assert.equal(parseLinuxAvailableMemory("MemFree: 100 kB\nMemAvailable: 10485760 kB\n"), 10 * GIB);
  assert.equal(parseLinuxAvailableMemory("MemAvailable: 0 kB\n"), 0);
  assert.equal(parseLinuxAvailableMemory("MemAvailable: -1 kB\n"), undefined);
  assert.equal(parseMacMemoryPressure("System-wide memory free percentage: 50%", 36 * GIB), 18 * GIB);
  assert.equal(parseMacMemoryPressure("System-wide memory free percentage: 0%", 36 * GIB), 0);
  assert.equal(parseMacMemoryPressure("System-wide memory free percentage: 101%", 36 * GIB), undefined);
});

test("macOS collector only queries system tools with read-only fixed arguments", async () => {
  const calls: [string, readonly string[]][] = [];
  const io: DeviceProbeIO = { ...unavailable, run: async (file, args) => {
    calls.push([file, args]);
    if (file === "/usr/sbin/system_profiler") return '{"SPDisplaysDataType":[{"sppci_model":"Apple M4 Max"}]}';
    assert.equal(file, "/usr/bin/memory_pressure");
    return "System-wide memory free percentage: 50%";
  } };
  const observation = await collectLocalDevices("darwin", 36 * GIB, undefined, io);
  assert.equal(observation.systemAvailableMemoryBytes, 18 * GIB);
  assert.equal(observation.gpus[0].memoryKind, "unified");
  assert.deepEqual(calls, [["/usr/sbin/system_profiler", ["-json", "SPDisplaysDataType"]], ["/usr/bin/memory_pressure", ["-Q"]]]);
});

test("Linux collector reads AMD VRAM and MemAvailable, ignoring connector names and unsafe paths", async () => {
  const files: Record<string, string> = { "/proc/meminfo": "MemAvailable: 16777216 kB\n", "/sys/class/drm/card0/device/vendor": "0x1002\n", "/sys/class/drm/card0/device/product_name": "AMD Test\n", "/sys/class/drm/card0/device/mem_info_vram_total": String(24 * GIB), "/sys/class/drm/card0/device/mem_info_vram_used": String(2 * GIB) };
  const io: DeviceProbeIO = { ...unavailable, list: async directory => { assert.equal(directory, "/sys/class/drm"); return ["card0", "card0-HDMI-A-1", "../../private"]; }, read: async file => { assert.ok(file in files, file); return files[file]; } };
  const result = await collectLocalDevices("linux", 32 * GIB, undefined, io);
  assert.equal(result.systemAvailableMemoryBytes, 16 * GIB);
  assert.equal(result.gpus.length, 1);
  assert.equal(result.gpus[0].totalMemoryBytes, 24 * GIB);
  assert.equal(result.gpus[0].availableMemoryBytes, 22 * GIB);
});

test("Windows merges DXGI and NVIDIA without duplicating the same vendor's adapters", async () => {
  const io: DeviceProbeIO = { ...unavailable, run: async (file, args) => {
    if (file.endsWith("nvidia-smi.exe")) {
      assert.deepEqual(args, ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"]);
      return "NVIDIA Test, 24576, 23552";
    }
    assert.ok(file.endsWith("powershell.exe"));
    assert.deepEqual(args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]);
    assert.equal(args[3], WINDOWS_GPU_QUERY);
    return JSON.stringify([{ Name: "NVIDIA Test", DedicatedVideoMemory: 24 * GIB }, { Name: "Intel shared", SharedSystemMemory: 16 * GIB }]);
  } };
  const result = await collectLocalDevices("win32", 32 * GIB, undefined, io);
  assert.equal(result.gpus.length, 2);
  assert.equal(result.gpus[0].availableMemoryBytes, 23 * GIB);
  assert.equal(result.gpus[1].memoryKind, "shared");
});

test("unavailable commands, unsupported OS and cancellation never trigger installation or network access", async () => {
  for (const platform of ["darwin", "linux", "win32", "unknown"]) assert.deepEqual((await collectLocalDevices(platform, 8 * GIB, undefined, unavailable)).gpus, []);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(collectLocalDevices("darwin", 8 * GIB, controller.signal, { ...unavailable, run: async () => { assert.fail("must not execute when aborted"); } }), { name: "AbortError" });
});
