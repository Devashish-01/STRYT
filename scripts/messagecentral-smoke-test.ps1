<#
  messagecentral-smoke-test.ps1

  Manual smoke test for the MessageCentral VerifyNow API, run BEFORE any app
  code is written. Exercises the three calls the Edge Functions will make:

    1. GET  /auth/v1/authentication/token      -> authToken (valid ~24h)
    2. POST /verification/v3/send              -> verificationId
    3. GET  /verification/v3/validateOtp       -> VERIFICATION_COMPLETED

  Nothing is stored on disk and no secret is printed. The password is typed at
  the prompt (PowerShell does not write Read-Host input to command history) and
  the derived key / authToken are only shown as redacted previews.

  Usage:
    ./scripts/messagecentral-smoke-test.ps1

  NOTE: MessageCentral's "key" parameter is a base64-ENCODED password, not an
  encrypted one. Base64 is trivially reversible, so treat the key exactly like
  the password itself: server-side only, never in a VITE_* variable, never in
  the app bundle, never committed.
#>

[CmdletBinding()]
param(
    [string] $BaseUrl    = "https://cpaas.messagecentral.com",
    [string] $CountryCode = "91",
    [int]    $OtpLength   = 6
)

$ErrorActionPreference = "Stop"

function Write-Step { param([string] $Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-Ok   { param([string] $Text) Write-Host "  [ok] $Text" -ForegroundColor Green }
function Write-Warn { param([string] $Text) Write-Host "  [!!] $Text" -ForegroundColor Yellow }

function Redact {
    param([string] $Value)
    if ([string]::IsNullOrEmpty($Value)) { return "(empty)" }
    if ($Value.Length -le 12) { return "***" }
    return $Value.Substring(0, 6) + "..." + $Value.Substring($Value.Length - 4) + " (len=$($Value.Length))"
}

# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

Write-Step "Credentials"

$customerId = Read-Host "Customer ID (e.g. IDC-XXXXXXXXXXXXXXX)"
if ([string]::IsNullOrWhiteSpace($customerId)) { throw "Customer ID is required." }

$email = Read-Host "Registered Message Central email"
if ([string]::IsNullOrWhiteSpace($email)) { throw "Registered email is required." }

# Read-Host input is not persisted to PSReadLine history.
$password = Read-Host "Message Central account password"
if ([string]::IsNullOrWhiteSpace($password)) { throw "Password is required." }

$mobile = Read-Host "Destination mobile number, 10 digits, no +91 (use YOUR own number)"
if ($mobile -notmatch '^[6-9]\d{9}$') {
    throw "That does not look like a valid Indian mobile number. Expected 10 digits starting 6-9."
}

# base64(password) -> the "key" query parameter.
$key = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($password))
$password = $null   # drop the plaintext as soon as it is encoded

Write-Ok "Derived key: $(Redact $key)"

# ---------------------------------------------------------------------------
# 1. Auth token
# ---------------------------------------------------------------------------

Write-Step "1/3  Generate authToken"

# The base64 key can contain + / = which MUST be percent-encoded in a query string.
$tokenUri = "{0}/auth/v1/authentication/token?customerId={1}&key={2}&scope=NEW&country={3}&email={4}" -f `
    $BaseUrl,
    [uri]::EscapeDataString($customerId),
    [uri]::EscapeDataString($key),
    [uri]::EscapeDataString($CountryCode),
    [uri]::EscapeDataString($email)

try {
    $tokenResp = Invoke-RestMethod -Uri $tokenUri -Method Get -Headers @{ accept = "*/*" }
} catch {
    Write-Warn "Token call failed. Most common causes: wrong password, wrong customerId, or the account is not activated yet."
    throw
}

$authToken = $tokenResp.token
if ([string]::IsNullOrWhiteSpace($authToken)) {
    Write-Warn ("Unexpected token response: " + ($tokenResp | ConvertTo-Json -Depth 6 -Compress))
    throw "No token returned."
}

Write-Ok "status = $($tokenResp.status)"
Write-Ok "authToken = $(Redact $authToken)"

# ---------------------------------------------------------------------------
# 2. Send OTP
# ---------------------------------------------------------------------------

Write-Step "2/3  Send OTP"

$sendUri = "{0}/verification/v3/send?countryCode={1}&flowType=SMS&mobileNumber={2}&otpLength={3}" -f `
    $BaseUrl,
    [uri]::EscapeDataString($CountryCode),
    [uri]::EscapeDataString($mobile),
    $OtpLength

$sentAt = Get-Date
try {
    $sendResp = Invoke-RestMethod -Uri $sendUri -Method Post -Headers @{ authToken = $authToken }
} catch {
    Write-Warn "Send call failed. Check credit balance (508/805), country code (511), or a duplicate in-flight request (506)."
    throw
}

Write-Host "  raw: $($sendResp | ConvertTo-Json -Depth 6 -Compress)"

$verificationId = $sendResp.data.verificationId
if ([string]::IsNullOrWhiteSpace($verificationId)) { throw "No verificationId returned." }

Write-Ok "responseCode   = $($sendResp.responseCode)"
Write-Ok "verificationId = $verificationId"
Write-Ok "timeout        = $($sendResp.data.timeout) seconds"
Write-Ok "transactionId  = $($sendResp.data.transactionId)"

# ---------------------------------------------------------------------------
# 3. Validate OTP
# ---------------------------------------------------------------------------

Write-Step "3/3  Validate OTP"

Write-Host "  Check the SMS on $mobile, then note these three things:" -ForegroundColor Gray
Write-Host "    - how many SECONDS it took to arrive" -ForegroundColor Gray
Write-Host "    - the SENDER ID shown (e.g. UTOMOB)" -ForegroundColor Gray
Write-Host "    - how many DIGITS the code has (we asked for $OtpLength)" -ForegroundColor Gray

$code = Read-Host "`n  Enter the OTP you received"
$elapsed = [int]((Get-Date) - $sentAt).TotalSeconds

$validateUri = "{0}/verification/v3/validateOtp?verificationId={1}&code={2}" -f `
    $BaseUrl,
    [uri]::EscapeDataString($verificationId),
    [uri]::EscapeDataString($code)

try {
    $validateResp = Invoke-RestMethod -Uri $validateUri -Method Get -Headers @{ authToken = $authToken }
} catch {
    Write-Warn "Validate call failed. 702 = wrong OTP, 705 = expired, 703 = already verified, 505 = bad verificationId."
    throw
}

Write-Host "  raw: $($validateResp | ConvertTo-Json -Depth 6 -Compress)"

$status = $validateResp.data.verificationStatus
Write-Ok "responseCode       = $($validateResp.responseCode)"
Write-Ok "verificationStatus = $status"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Step "Result"

if ($status -eq "VERIFICATION_COMPLETED") {
    Write-Ok "End-to-end OTP verification works."
} else {
    Write-Warn "Verification did not complete. Status: $status"
}

Write-Host @"

  Report these back:
    - OTP length actually received (asked for $OtpLength)
    - Sender ID shown in the SMS
    - Approx delivery time (you took ~$elapsed s including typing)
    - Provider timeout value: $($sendResp.data.timeout) s
    - Carrier tested (Jio / Airtel / Vi / BSNL)

  Do NOT paste the password, key or authToken anywhere.

  Follow-up checks worth running:
    - a WRONG code            -> expect 702
    - let a code EXPIRE        -> expect 705
    - reuse a verified code    -> expect 703
    - send twice back-to-back  -> expect 506 or a cooldown
"@ -ForegroundColor Gray
