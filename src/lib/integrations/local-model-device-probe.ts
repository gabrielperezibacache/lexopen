import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const GIB = 1024 ** 3;
const MAX_OUTPUT = 256 * 1024;
const MAX_MEMORY = 1024 ** 4;

export type LocalGpu = {
  name: string;
  vendor: "apple" | "nvidia" | "amd" | "intel" | "unknown";
  memoryKind: "dedicated" | "shared" | "unified" | "unknown";
  totalMemoryBytes: number | null;
  availableMemoryBytes: number | null;
  source: "system-profiler" | "nvidia-smi" | "linux-sysfs" | "dxgi" | "windows-cim";
};

export type LocalDeviceObservation = {
  gpus: LocalGpu[];
  systemAvailableMemoryBytes?: number;
  availableMemorySource?: "memory-pressure" | "meminfo";
};

export type DeviceProbeIO = {
  run: (file: string, args: readonly string[], signal?: AbortSignal) => Promise<string>;
  read: (file: string) => Promise<string>;
  list: (directory: string) => Promise<string[]>;
};

function memory(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_MEMORY ? value : null;
}

function label(value: unknown, fallback: string) {
  return typeof value === "string" ? value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").trim().slice(0, 120) || fallback : fallback;
}

function vendor(name: string): LocalGpu["vendor"] {
  return /apple/i.test(name) ? "apple" : /nvidia/i.test(name) ? "nvidia" : /amd|radeon/i.test(name) ? "amd" : /intel/i.test(name) ? "intel" : "unknown";
}

function records(text: string): Record<string, unknown>[] {
  if (text.length > MAX_OUTPUT) return [];
  try {
    const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
    return (Array.isArray(value) ? value : [value]).slice(0, 16).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  } catch { return []; }
}

function formattedMemory(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(Ti?B|Gi?B|Mi?B|Ki?B)\b/i);
  if (!match) return null;
  const exponent = { k: 1, m: 2, g: 3, t: 4 }[match[2][0].toLowerCase()];
  return memory(Math.round(Number(match[1].replace(",", ".")) * 1024 ** exponent!));
}

export function parseMacDisplays(text: string): LocalGpu[] {
  const root = records(text)[0];
  if (!Array.isArray(root?.SPDisplaysDataType)) return [];
  return root.SPDisplaysDataType.slice(0, 16).flatMap((value: unknown): LocalGpu[] => {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    if (typeof record.sppci_model !== "string" && typeof record._name !== "string") return [];
    const name = label(record.sppci_model ?? record._name, "GPU de macOS");
    const brand = vendor(name);
    const unified = brand === "apple" && /^Apple\s/i.test(name);
    const dedicated = formattedMemory(record.spdisplays_vram);
    const shared = formattedMemory(record.spdisplays_vram_shared);
    return [{ name, vendor: brand, memoryKind: unified ? "unified" : shared ? "shared" : dedicated ? "dedicated" : "unknown", totalMemoryBytes: unified ? null : dedicated ?? shared, availableMemoryBytes: null, source: "system-profiler" }];
  });
}

export function parseNvidiaMemory(text: string): LocalGpu[] {
  if (text.length > MAX_OUTPUT) return [];
  return text.trim().split(/\r?\n/).slice(0, 16).flatMap(line => {
    // The last two CSV fields are numeric MiB; a comma in the adapter name is harmless.
    const match = line.match(/^(.+),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match) return [];
    const total = memory(Math.round(Number(match[2]) * 1024 ** 2));
    const available = Math.round(Number(match[3]) * 1024 ** 2);
    if (!total || !Number.isSafeInteger(available) || available < 0 || available > total) return [];
    return [{ name: label(match[1], "GPU NVIDIA"), vendor: "nvidia" as const, memoryKind: "dedicated" as const, totalMemoryBytes: total, availableMemoryBytes: available, source: "nvidia-smi" as const }];
  });
}

export function parseWindowsDisplays(text: string, source: "dxgi" | "windows-cim" = "dxgi"): LocalGpu[] {
  return records(text).filter(record => typeof record.Name === "string" && record.Name.trim() && record.Software !== true && !/Microsoft Basic Render|Remote Display/i.test(record.Name)).map(record => {
    const name = label(record.Name, "GPU de Windows");
    // Win32_VideoController.AdapterRAM is uint32: never use it to size modern adapters.
    const dedicated = source === "dxgi" ? memory(record.DedicatedVideoMemory) : null;
    const shared = source === "dxgi" ? memory(record.SharedSystemMemory) : null;
    const brand: LocalGpu["vendor"] = record.VendorId === 0x10de ? "nvidia" : record.VendorId === 0x1002 ? "amd" : record.VendorId === 0x8086 ? "intel" : vendor(name);
    return { name, vendor: brand, memoryKind: dedicated && dedicated >= GIB / 2 ? "dedicated" : shared ? "shared" : "unknown", totalMemoryBytes: dedicated && dedicated >= GIB / 2 ? dedicated : shared, availableMemoryBytes: null, source };
  });
}

export function parseLinuxAvailableMemory(text: string): number | undefined {
  const match = text.match(/^MemAvailable:\s*(\d+)\s+kB\s*$/m);
  return match ? memory(Number(match[1]) * 1024) ?? (Number(match[1]) === 0 ? 0 : undefined) : undefined;
}

export function parseMacMemoryPressure(text: string, total: number): number | undefined {
  const match = text.match(/System-wide memory free percentage:\s*(\d+(?:\.\d+)?)%/);
  if (!match || !memory(total)) return undefined;
  const percentage = Number(match[1]);
  return percentage >= 0 && percentage <= 100 ? Math.floor(total * percentage / 100) : undefined;
}

/** Windows' built-in PowerShell calls DXGI read-only, with SIZE_T (not uint32) memory fields.
 * Add-Type loads the interop into this process only; no assembly, helper or driver is installed.
 */
export const WINDOWS_GPU_QUERY = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class LexOpenDxgi {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct Desc {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Description;
    public uint VendorId, DeviceId, SubSysId, Revision;
    public UIntPtr DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory;
    public uint LuidLow; public int LuidHigh;
  }
  public class Gpu { public string Name; public uint VendorId; public ulong DedicatedVideoMemory, SharedSystemMemory; public bool Software; }
  [DllImport("dxgi.dll")] static extern int CreateDXGIFactory(ref Guid id, out IntPtr factory);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Enumerate(IntPtr self, uint index, out IntPtr adapter);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Describe(IntPtr self, out Desc desc);
  public static Gpu[] Read() {
    var id=new Guid("7b7166ec-21c7-44ae-b21a-c9ae321ae369"); IntPtr factory;
    if(CreateDXGIFactory(ref id, out factory)<0) return new Gpu[0];
    var result=new List<Gpu>();
    try {
      var table=Marshal.ReadIntPtr(factory);
      var enumerate=(Enumerate)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(table,7*IntPtr.Size),typeof(Enumerate));
      for(uint index=0;index<16;index++) {
        IntPtr adapter; if(enumerate(factory,index,out adapter)<0) break;
        try {
          var describe=(Describe)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(adapter),8*IntPtr.Size),typeof(Describe));
          Desc desc; if(describe(adapter,out desc)>=0) result.Add(new Gpu {Name=desc.Description,VendorId=desc.VendorId,DedicatedVideoMemory=desc.DedicatedVideoMemory.ToUInt64(),SharedSystemMemory=desc.SharedSystemMemory.ToUInt64(),Software=desc.VendorId==0x1414&&desc.DeviceId==0x8c});
        } finally {Marshal.Release(adapter);}
      }
    } finally {Marshal.Release(factory);}
    return result.ToArray();
  }
}
'@
ConvertTo-Json -InputObject @([LexOpenDxgi]::Read()) -Compress
`;

const defaultIO: DeviceProbeIO = {
  run: (file, args, signal) => new Promise((resolve, reject) => {
    execFile(file, [...args], { encoding: "utf8", timeout: 3500, maxBuffer: MAX_OUTPUT, windowsHide: true, signal, env: { ...process.env, LC_ALL: "C", LANG: "C" } }, (error, stdout) => error ? reject(error) : resolve(stdout));
  }),
  read: file => readFile(file, "utf8"),
  list: directory => readdir(directory),
};

async function attempt<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try { return await read(); } catch { return fallback; }
}

async function linuxGpus(io: DeviceProbeIO): Promise<LocalGpu[]> {
  const cards = (await attempt(() => io.list("/sys/class/drm"), [])).filter(name => /^card\d{1,3}$/.test(name)).slice(0, 16);
  const devices = await Promise.all(cards.map(async (card: string): Promise<LocalGpu | null> => {
    const root = `/sys/class/drm/${card}/device`;
    const [brand, product, totalText, usedText] = await Promise.all(["vendor", "product_name", "mem_info_vram_total", "mem_info_vram_used"].map(file => attempt(() => io.read(`${root}/${file}`), "")));
    if (brand.trim() !== "0x1002") return null;
    const total = /^\d+\s*$/.test(totalText) ? memory(Number(totalText.trim())) : null;
    if (!total) return null;
    const used = /^\d+\s*$/.test(usedText) ? Number(usedText.trim()) : null;
    const available = used !== null && Number.isSafeInteger(used) && used >= 0 && used <= total ? total - used : null;
    return { name: label(product, "GPU AMD"), vendor: "amd", memoryKind: "dedicated", totalMemoryBytes: total, availableMemoryBytes: available, source: "linux-sysfs" };
  }));
  return devices.filter((device): device is LocalGpu => Boolean(device));
}

/** Fixed local queries only. This function has no fetch, package manager or model-runtime calls. */
export async function collectLocalDevices(platform: string, totalMemory: number, signal?: AbortSignal, io: DeviceProbeIO = defaultIO): Promise<LocalDeviceObservation> {
  signal?.throwIfAborted();
  if (platform === "darwin") {
    const [displays, pressure] = await Promise.all([
      attempt(() => io.run("/usr/sbin/system_profiler", ["-json", "SPDisplaysDataType"], signal), ""),
      attempt(() => io.run("/usr/bin/memory_pressure", ["-Q"], signal), ""),
    ]);
    signal?.throwIfAborted();
    return { gpus: parseMacDisplays(displays), systemAvailableMemoryBytes: parseMacMemoryPressure(pressure, totalMemory), availableMemorySource: "memory-pressure" };
  }
  if (platform === "linux" || platform === "win32") {
    const nvidiaFile = platform === "win32" ? path.win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "nvidia-smi.exe") : "/usr/bin/nvidia-smi";
    const nvidia = (async () => {
      const alternate = platform === "linux" ? "/usr/lib/wsl/lib/nvidia-smi" : path.win32.join(process.env.ProgramW6432 || process.env.ProgramFiles || "C:\\Program Files", "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe");
      for (const file of [nvidiaFile, alternate]) {
        signal?.throwIfAborted();
        const devices = await attempt(async () => parseNvidiaMemory(await io.run(file, ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"], signal)), []);
        if (devices.length) return devices;
      }
      return [];
    })();
    if (platform === "linux") {
      const [nvidiaGpus, otherGpus, meminfo] = await Promise.all([nvidia, linuxGpus(io), attempt(() => io.read("/proc/meminfo"), "")]);
      signal?.throwIfAborted();
      return { gpus: [...nvidiaGpus, ...otherGpus].slice(0, 16), systemAvailableMemoryBytes: parseLinuxAvailableMemory(meminfo), availableMemorySource: "meminfo" };
    }
    const powershell = path.win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const [nvidiaGpus, windowsGpus] = await Promise.all([nvidia, attempt(async () => parseWindowsDisplays(await io.run(powershell, ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_GPU_QUERY], signal)), [])]);
    signal?.throwIfAborted();
    let others = windowsGpus;
    if (!others.length && !nvidiaGpus.length) others = await attempt(async () => parseWindowsDisplays(await io.run(powershell, ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false); Get-CimInstance Win32_VideoController | Select-Object Name | ConvertTo-Json -Compress"], signal), "windows-cim"), []);
    signal?.throwIfAborted();
    return { gpus: [...nvidiaGpus, ...others.filter(gpu => !nvidiaGpus.length || gpu.vendor !== "nvidia")].slice(0, 16) };
  }
  return { gpus: [] };
}
