## ADDED Requirements

### Requirement: DebugLogger Singleton
The system SHALL provide a `DebugLogger` singleton exported from `src/debug/logger.ts` that
activates only when the `debug` query parameter is present in the page URL (`location.href`).
When inactive, `log()` is a no-op and no memory is allocated for entries.

#### Scenario: debug param absent
- **GIVEN** the page URL does not contain the `debug` query parameter
- **WHEN** `debugLogger.log('any:event', {})` is called
- **THEN** no entry is stored and `debugLogger.enabled` is `false`

#### Scenario: debug param present
- **GIVEN** the page URL contains `?debug` (or `?debug=1`, etc.)
- **WHEN** the module is loaded
- **THEN** `debugLogger.enabled` is `true`

### Requirement: Ring Buffer Cap
The logger SHALL maintain a ring buffer of at most 1000 entries, silently discarding
the oldest entry when a new one is added and the buffer is full.

#### Scenario: buffer not yet full
- **GIVEN** the logger is enabled and fewer than 1000 entries have been logged
- **WHEN** `debugLogger.log('t', {})` is called
- **THEN** the entry is appended and `debugLogger.size` increases by 1

#### Scenario: buffer overflow
- **GIVEN** the logger is enabled and exactly 1000 entries exist
- **WHEN** `debugLogger.log('t', {})` is called
- **THEN** the oldest entry is discarded, `debugLogger.size` remains 1000, and the new entry is the most recent

### Requirement: Entry Structure
Each log entry SHALL carry a monotonic sequence number (`seq`), a `performance.now()`
timestamp (`t`), a dot-namespaced `type` string, and an arbitrary `payload` value.
Entry shape: `{ seq: number; t: number; type: string; payload: unknown }`.

#### Scenario: entry structure
- **GIVEN** the logger is enabled
- **WHEN** `debugLogger.log('camera:init-result', { ok: true })` is called
- **THEN** the stored entry has shape `{ seq: number, t: number, type: 'camera:init-result', payload: { ok: true } }` where `seq` is strictly greater than the previous entry's `seq` and `t` is a finite non-negative number

### Requirement: JSON Export
`debugLogger.export()` SHALL return a JSON string representing an object
`{ meta: { exportedAt, userAgent, url, sessionMs }, events: [...] }` where
`events` contains all buffered entries serialised in insertion order (oldest first,
lowest `seq` first). When the logger is disabled, it SHALL return
`'{"meta":{},"events":[]}'`.

#### Scenario: entries present
- **GIVEN** the logger is enabled and N entries have been logged
- **WHEN** `debugLogger.export()` is called
- **THEN** the returned string parses as an object whose `events` array contains N objects each conforming to the entry structure, ordered by ascending `seq`, and whose `meta` object includes `exportedAt`, `userAgent`, `url`, and `sessionMs`

#### Scenario: enabled, no entries
- **GIVEN** the logger is enabled and no entries have been logged
- **WHEN** `debugLogger.export()` is called
- **THEN** the returned object has `events` equal to `[]` and `meta` with valid fields

#### Scenario: logger disabled
- **GIVEN** the logger is disabled
- **WHEN** `debugLogger.export()` is called
- **THEN** the returned string is `'{"meta":{},"events":[]}'`

### Requirement: Clear Buffer
`debugLogger.clear()` SHALL discard all buffered entries and reset `size` to zero.

#### Scenario: clear resets buffer
- **GIVEN** the logger is enabled and one or more entries have been logged
- **WHEN** `debugLogger.clear()` is called
- **THEN** `debugLogger.size` is `0` and `debugLogger.export()` returns an envelope with `events: []`
