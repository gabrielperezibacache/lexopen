# Optional Kitties broker

Official contract read at commit `6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3`:

- https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/docs/API.md
- https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/internal/gateway/gateway.go
- https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/internal/kitty/kitty.go
- https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/internal/attach/attach.go

Disabled unless `ALTAZOR_COMPUTER_ENABLED=1`. Configuring a gateway also requires the Host's explicit loopback listener (`LEXOPEN_BIND` or `HOSTNAME` set to `127.0.0.1`/`::1`), a same-origin local browser session and CSRF validation. A remote browser cannot configure a service on the Host's loopback. Remote gateway/TLS support is intentionally unavailable.

The operator must provision a separate gateway and data directory for each owner/scope. This is a deployment requirement, not a tenant-isolation feature supplied by Kitties. Endpoint reservations are unique and retained; an instance with unknown kitties is rejected. The broker never reads a global artifact/skill/vault library. It cannot establish that an operator's pre-existing data directory has no historical content; a fresh dedicated directory is required. Do not reuse a gateway for another professional or case.

Model credentials are independently configured in Kitties. LexOpen connector credentials, model keys, session cookies, document stores and Codex homes are never transferred to it. A gateway bearer token is encrypted at rest with owner/workspace/scope binding and never returned by an API. Requests use fixed endpoints; there is no raw proxy, shell/exec, library or global-artifact route.

The firm's `local_only` policy blocks session creation, tasks and manual input/control. A loopback gateway address does not establish that its model is local, and the current official provider contract cannot attest its actual destination. Reading, cancellation and stopping remain available for existing sessions. The policy is checked again at action claim and immediately before sending tasks. Changing gateway credentials/provider or disabling it requires closing active or uncertain sessions first.

Kitties uses containers, not VMs. Empty `connectors` means **all** connectors; this broker must send the official `['-']` sentinel. It also requests `approvals: ask`, no backup and attended task limits. These are not a guarantee that every action inside an independently operated browser is separately approved. The professional explicitly submits each task and its selected files and can take manual control, cancel or stop the desktop.

Selected uploads are limited locally to five files/20 MiB total (5 MiB per image). Actual pinned source accepts 20 files/100 MiB, while API.md still says six/20 MiB; the stricter broker limit avoids that discrepancy. Kitties independently validates the actual files.

Sessions have a 20-minute access TTL and every route rechecks owner, assistant permission and current case ACL. Expiry blocks access; it does not claim to destroy a container or its retained files. Task seconds are bounded independently. Receipts contain owner/session-bound HMACs and bounded outcome metadata, never typed inputs, unkeyed password/OTP hashes or upload bytes. Ambiguous remote mutations are `unknown` and are not automatically retried. After an unknown message, close/check that session before starting another task.

`computer.test.ts` exercises synthetic contract fixtures, including a loopback HTTP fixture. It does not prove a real Kitties desktop, provider account or Docker/Podman runtime is operational.

## Real container check without user credentials

On a disposable Linux CI runner with Docker, check out the exact commit above. Build with `make WEB=0 VERSION=lexopen-ci build` and `make IMAGE=lexopen-kitty-ci:6aee950 image`; the latter builds the real desktop from `docker/kitty-desktop`. Its Debian, Chromium and font dependencies require network during image build. Do not use `-demo`, a mutable image tag or an existing Kitties home directory.

Run a local OpenAI-compatible HTTP fixture and provide an explicit configuration with a new temporary `data_dir` and `containers.workspace`, no pre-created kitties, no connectors, a fictitious bearer token and a provider named `fixture` pointing at that fixture. Set `containers.runtime: docker`, the locally built image, `containers.auto_update: false`, `containers.auto_off_minutes: 1`, `updates.gateway: "off"` (the quotes are required by the pinned YAML reader), and `gateway.listen: 127.0.0.1:<unused-port>`. Start `dist/kitties -config <temporary-yaml> gateway`. The gateway prints its token at startup, so do not publish raw logs, even from this credential-free fixture.

Through this broker, verify actual health/version/container availability, desktop creation, a non-empty PNG screenshot, hold/type/release, a selected fictitious upload, cancel and stop. Assert no foreign owner/case can reach any operation and no global artifact or exec endpoint is called. Stop only the gateway/container IDs created by the check and remove only its temporary directories. This proves real container and adapter behavior with a synthetic model response; it does not establish autonomous model performance or an operational personal provider account.

Primary build/config sources: [Makefile](https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/Makefile), [configuration example](https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/configs/kitties.example.yaml), [CLI entry point](https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/cmd/kitties/main.go).

The independent `altazor-computer-runtime` CI job implements this check using `scripts/altazor/computer-smoke.ts`, a PostgreSQL 16 service, an archived checkout without `.git`, a fixed Lumen build commit, a verified local image ID, a dedicated unprivileged gateway UID with outbound firewall rules, and an internal Docker network. It inspects actual mounts/namespaces/environment, copies back only the chosen synthetic upload from that container, and cancels an actual asynchronous screenshot task while its synthetic provider request is pending. Only the fictitious desktop PNG and a curated result summary are retained; raw gateway output is never an artifact. Running it locally fails at its explicit CI/opt-in guard. A successful remote job is required before calling the real-runtime smoke verified.
