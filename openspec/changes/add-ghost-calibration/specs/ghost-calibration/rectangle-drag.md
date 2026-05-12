## ADDED Requirements

### Requirement: Off-Screen Rectangle Drag Behavior
During REPOSITIONING the user SHALL be able to drag the calibration rectangle freely
across the viewport, including to positions partially or fully outside the visible
area, with no clamping applied to the final position.

#### Scenario: Drag is a no-op outside REPOSITIONING
- **WHEN** `mousedown` or `touchstart` fires on the rectangle while the phase is IDLE,
  RECORDING, or CAPTURED
- **THEN** `startDrag` returns immediately without storing a drag-start reference

#### Scenario: Drag starts on mousedown / touchstart
- **WHEN** `mousedown` (or `touchstart`) fires on the rectangle during REPOSITIONING
- **THEN** the pointer coordinates are stored as `dragStartTouch` and the rectangle's
  current `left`/`top` pixel values are stored as `dragStartRect`

#### Scenario: Rectangle follows pointer with no position constraints
- **WHEN** `mousemove` (or `touchmove`) fires on the document during an active drag
- **THEN** the rectangle's `left` is set to `dragStartRect.left + (clientX − startClientX)`
  and `top` to `dragStartRect.top + (clientY − startClientY)`, rounded to the nearest
  integer pixel; no viewport boundary check is applied

#### Scenario: Drag stops on mouseup / touchend
- **WHEN** `mouseup` (or `touchend`) fires on the document
- **THEN** `dragStartTouch` is set to `null`; subsequent `mousemove` / `touchmove`
  events are ignored until a new drag is started

#### Scenario: moveDrag is a no-op without an active drag
- **WHEN** `mousemove` fires but `dragStartTouch` is `null`
- **THEN** the rectangle position is unchanged

#### Scenario: Next Cycle persists confirmed rectangle position as next start
- **WHEN** the user taps "Next Cycle" from CAPTURED
- **THEN** the rectangle's `left` and `top` at the moment of confirmation are saved as
  `rectInitLeft` / `rectInitTop` so that the next cycle begins with the rectangle at
  the user's corrected position rather than the original center
