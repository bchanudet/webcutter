# @webcutter/shared

Types, DTOs, enums and constants shared between the `backend` (NestJS) and `frontend` (Angular)
apps: the single source of truth wherever the same shape or value would otherwise have to be kept
in sync by hand across both codebases (e.g. WebSocket payloads, entity/DTO field shapes, GRBL
status types). Framework-agnostic — no NestJS, Angular, TypeORM or `serialport` dependency, so it
can be imported from either app without pulling in the other's runtime.
