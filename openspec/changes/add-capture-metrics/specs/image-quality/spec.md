## ADDED Requirements

### Requirement: Zero-Allocation Blur Scoring
The system SHALL compute a blur score for each captured frame on a 320×240 downscaled image
using a Laplacian accumulation algorithm that does not allocate intermediate arrays, producing
a dimensionless variance score compared against `THRESHOLDS.blurry`.

#### Scenario: Sharp frame passes blur gate
- **WHEN** a captured frame has a Laplacian variance score ≥ `THRESHOLDS.blurry`
- **THEN** `qualityChecks.blurry` is `false`

#### Scenario: Blurry frame fails blur gate
- **WHEN** a captured frame has a Laplacian variance score < `THRESHOLDS.blurry`
- **THEN** `qualityChecks.blurry` is `true`

### Requirement: Calibrated Exposure Scoring
The system SHALL flag captured frames for exposure issues using the following thresholds:
overexposed when > 5% of pixels have luma > 240; underexposed when > 5% of pixels have
luma < 15; globally dark when mean luma across all pixels < 50.

#### Scenario: Near-blown frame flagged overexposed
- **WHEN** more than 5% of pixels have luma value > 240
- **THEN** `qualityChecks.overexposed` is `true`

#### Scenario: Crushed-shadow frame flagged underexposed
- **WHEN** more than 5% of pixels have luma value < 15
- **THEN** `qualityChecks.underexposed` is `true`

#### Scenario: Dim room flagged globally dark
- **WHEN** mean luma across all pixels is < 50
- **THEN** `qualityChecks.dark` is `true`

#### Scenario: Normal exposure passes all flags
- **WHEN** exposure is within normal range (no clip above 240, no crush below 15, mean luma ≥ 50)
- **THEN** `qualityChecks.overexposed`, `qualityChecks.underexposed`, and `qualityChecks.dark` are all `false`
