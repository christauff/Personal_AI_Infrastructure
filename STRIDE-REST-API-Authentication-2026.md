# STRIDE Threat Model: REST API Authentication (2026)

## Executive Summary

This threat model analyzes REST API authentication security through the STRIDE framework, incorporating 2026 threat intelligence including critical CVEs, emerging attack vectors, and current industry statistics showing 99% of enterprises experiencing API security incidents.

---

## STRIDE Analysis

### S - Spoofing (Identity Verification Threats)

| Threat | Technical Details | Likelihood | Impact | Mitigation |
|--------|------------------|------------|--------|------------|
| **JWT "none" Algorithm Attack** | Attacker sets JWT header `"alg": "none"` to bypass signature verification. Vulnerable implementations accept unsigned tokens as valid. Exploited in CVE-2026-23993 (HarbourJwt). | High | Critical | - Explicitly reject "none" algorithm in JWT validation libraries<br>- Whitelist allowed algorithms (e.g., RS256, ES256 only)<br>- Use libraries with secure defaults (jose, nimbus-jose-jwt v9.31+)<br>- Implement signature verification checks before parsing claims |
| **Algorithm Confusion (RS256→HS256)** | Attacker obtains RSA public key, changes JWT header from `"alg": "RS256"` to `"alg": "HS256"`, signs token with public key as HMAC secret. Server validates with same public key. | High | Critical | - Enforce algorithm consistency checks<br>- Store expected algorithm per key ID<br>- Separate key stores for symmetric vs asymmetric keys<br>- Use algorithm-specific validation functions |
| **OAuth Redirect URI Manipulation** | Attacker modifies `redirect_uri` parameter to capture authorization codes:<br>- Open redirects: `redirect_uri=https://victim.com/oauth?next=evil.com`<br>- Subdomain takeover: `redirect_uri=https://abandoned.victim.com`<br>- Path traversal: `redirect_uri=https://victim.com/../evil.com` | High | High | - Exact string matching for redirect URIs (no wildcards)<br>- Pre-register all redirect URIs in OAuth server<br>- Validate URI scheme, host, and path separately<br>- Implement PKCE (RFC 7636) for all OAuth flows<br>- Use state parameter with CSRF token binding |
| **Credential Stuffing with AI Bots** | AI-enhanced bots bypass CAPTCHA and rate limiting with 40% success rate. Bots use leaked credentials from data breaches, rotating IPs, and behavioral mimicry. | High | High | - Implement device fingerprinting and behavioral analysis<br>- Deploy CAPTCHA v3 with risk scoring<br>- Enforce credential breach detection (HaveIBeenPwned API)<br>- Require MFA for high-risk authentications<br>- Rate limit per user account (not just IP) |
| **Certificate Pinning Bypass** | Attackers use Frida/mitmproxy to hook SSL/TLS validation functions in mobile apps, intercepting API credentials during authentication. | Medium | High | - Implement multi-layer pinning (leaf cert + intermediate + public key)<br>- Add runtime integrity checks (root/jailbreak detection)<br>- Use obfuscation for pinning logic<br>- Implement certificate transparency monitoring<br>- Add app attestation (SafetyNet, DeviceCheck) |

---

### T - Tampering (Data Integrity Threats)

| Threat | Technical Details | Likelihood | Impact | Mitigation |
|--------|------------------|------------|--------|------------|
| **JWT Claims Manipulation** | Attacker modifies JWT payload claims before signature verification:<br>- Privilege escalation: `"role": "user"` → `"role": "admin"`<br>- Expiration bypass: `"exp": 1704067200` → `"exp": 2051222400`<br>- User impersonation: `"sub": "user123"` → `"sub": "admin"` | High | Critical | - Always verify signature BEFORE parsing/using claims<br>- Validate all claims (iss, aud, exp, nbf, sub)<br>- Implement claim schema validation with strict types<br>- Use short-lived access tokens (5-15 minutes)<br>- Log claim mismatches for anomaly detection |
| **OAuth State Parameter Bypass** | Attacker initiates OAuth flow without state parameter or replays state tokens to bypass CSRF protection, enabling session fixation attacks. | Medium | High | - Make state parameter mandatory (reject requests without it)<br>- Generate cryptographically random state (32+ bytes)<br>- Bind state to user session with server-side storage<br>- Implement state expiration (5-minute TTL)<br>- Validate state before exchanging authorization code |
| **PKCE Code Verifier Manipulation** | In public OAuth clients, attacker intercepts authorization code and attempts to exchange it without proper code_verifier matching code_challenge. | Medium | High | - Enforce PKCE for all OAuth clients (public and confidential)<br>- Use S256 challenge method only (reject "plain")<br>- Validate code_verifier length (43-128 characters)<br>- Bind authorization code to code_challenge in storage<br>- Implement single-use authorization codes with short TTL |
| **API Request Replay Attacks** | Attacker captures valid authenticated API requests and replays them to perform unauthorized actions, bypassing authentication. | Medium | Medium | - Implement request signing with nonce/timestamp (AWS Signature v4 pattern)<br>- Add DPoP (RFC 9449) token binding to TLS channel<br>- Use short-lived tokens with refresh rotation<br>- Implement idempotency keys for state-changing operations<br>- Monitor for duplicate request patterns |
| **Token Substitution Attacks** | Attacker intercepts token intended for API A and uses it to authenticate to API B due to missing audience validation. | Medium | High | - Enforce strict audience (`aud`) claim validation<br>- Use API-specific tokens (separate tokens per resource server)<br>- Implement token introspection with audience checks<br>- Validate issuer (`iss`) claim against trusted list<br>- Use mTLS for sensitive API endpoints |

---

### R - Repudiation (Logging and Audit Threats)

| Threat | Technical Details | Likelihood | Impact | Mitigation |
|--------|------------------|------------|--------|------------|
| **Authentication Event Tampering** | Attacker gains access to log storage and modifies/deletes authentication logs to hide unauthorized access attempts or successful breaches. | Medium | High | - Implement write-once log storage (WORM, S3 Object Lock)<br>- Use cryptographic log signing (merkle trees, blockchain)<br>- Forward logs to tamper-proof SIEM in real-time<br>- Implement log integrity monitoring with checksums<br>- Separate log infrastructure from application layer |
| **Missing Authentication Audit Trail** | System fails to log critical authentication events (failed attempts, token issuance, refresh, revocation), preventing forensic investigation. | High | Medium | - Log all authentication events with RFC 5424 severity:<br>  * Successful/failed logins<br>  * Token generation, refresh, revocation<br>  * Password changes, MFA enrollment<br>  * OAuth consent grants<br>- Include: timestamp, user ID, IP, user-agent, geolocation<br>- Retain logs per compliance requirements (90+ days) |
| **Insufficient Token Revocation Logging** | When tokens are revoked (logout, compromise), system doesn't log the reason, scope, or revocation timestamp, hiding security incidents. | Medium | Medium | - Log token revocation events with context:<br>  * Revocation reason (user logout, admin action, compromise)<br>  * Token ID (jti claim)<br>  * Scope of revocation (single token, all user tokens, all sessions)<br>- Implement revocation list (JTI blacklist) with TTL<br>- Send revocation events to security monitoring |
| **Anonymous Token Usage** | JWT tokens lack unique identifiers (`jti` claim) or user correlation, preventing tracking of which token was used for each API call. | High | Low | - Include mandatory `jti` (JWT ID) claim in all tokens<br>- Log `jti` with every authenticated API request<br>- Implement token usage analytics dashboard<br>- Correlate token usage patterns for anomaly detection<br>- Add session ID binding for multi-token sessions |
| **Clock Skew Exploitation** | Attacker exploits timestamp validation leniency to deny token issuance/expiration times, making forensic timeline reconstruction impossible. | Low | Low | - Enforce strict clock synchronization (NTP)<br>- Allow minimal clock skew tolerance (30-60 seconds)<br>- Log server-side timestamp with every token operation<br>- Implement timestamp validation monitoring<br>- Use server-side time for all validation decisions |

---

### I - Information Disclosure (Confidentiality Threats)

| Threat | Technical Details | Likelihood | Impact | Mitigation |
|--------|------------------|------------|--------|------------|
| **Token Leakage via Logging** | Access tokens, refresh tokens, or API keys logged in application logs, error messages, or monitoring systems, exposing credentials to unauthorized personnel. | High | High | - Implement automated secret redaction in logs (regex patterns)<br>- Use structured logging with field-level filtering<br>- Sanitize Authorization headers in access logs<br>- Encrypt sensitive log data at rest<br>- Restrict log access with RBAC<br>- Scan logs for exposed secrets (git-secrets, truffleHog) |
| **JWT Information Disclosure** | JWTs contain sensitive data in payload (email, PII, permissions) that is base64-encoded but not encrypted, exposing data to anyone with token access. | High | Medium | - Use opaque tokens (random strings) for access tokens<br>- Store claims server-side with token introspection<br>- If JWTs required, use JWE (RFC 7516) encryption<br>- Minimize claims in JWT payload (only user ID, exp)<br>- Implement token encryption for sensitive scopes |
| **OAuth Token Theft via Referrer** | Authorization codes or access tokens included in URL query parameters leak via HTTP Referer header when user clicks external links. | Medium | Medium | - Use POST requests for token exchange (not GET)<br>- Implement authorization code in request body<br>- Set Referrer-Policy: no-referrer header<br>- Use fragment-based OAuth flows for SPAs<br>- Implement DPoP (RFC 9449) token binding |
| **Timing Attack on Token Validation** | Attacker measures token validation response times to infer token structure, valid vs invalid signatures, or algorithm details. | Low | Low | - Implement constant-time comparison for signatures<br>- Add random delays to validation failures<br>- Use constant-time string comparison libraries<br>- Avoid early-return on validation failures<br>- Rate limit validation attempts |
| **API Key Exposure in Client Code** | API keys or OAuth client secrets hardcoded in mobile apps or JavaScript bundles, extracted via decompilation or source inspection. | High | High | - Never embed secrets in client-side code<br>- Use backend-for-frontend (BFF) pattern<br>- Implement OAuth PKCE for public clients (no client secret)<br>- Use runtime secret injection for mobile apps<br>- Implement app attestation and integrity checks |

---

### D - Denial of Service (Availability Threats)

| Threat | Technical Details | Likelihood | Impact | Mitigation |
|--------|------------------|------------|--------|------------|
| **Token Validation DoS** | Attacker floods API with requests containing complex JWTs with nested claims, long signatures, or invalid algorithms, exhausting CPU during validation. | Medium | High | - Implement token size limits (8KB max)<br>- Set validation timeout (100ms max)<br>- Use async validation with circuit breakers<br>- Cache validated token signatures (by hash)<br>- Rate limit per client ID and IP<br>- Implement token complexity scoring |
| **OAuth Authorization Flow DoS** | Attacker initiates thousands of OAuth authorization flows without completing them, exhausting state storage and session capacity. | Medium | Medium | - Set aggressive state/session expiration (5 minutes)<br>- Implement per-IP rate limiting on /authorize endpoint<br>- Use distributed rate limiting (Redis)<br>- Limit concurrent authorization sessions per user<br>- Implement CAPTCHA on repeated authorization attempts |
| **Credential Brute Force DoS** | Attacker attempts login with thousands of username/password combinations, exhausting authentication service capacity and locking out legitimate users. | High | Medium | - Implement progressive rate limiting:<br>  * 5 attempts/5 min per user<br>  * 10 attempts/5 min per IP<br>  * 100 attempts/5 min globally<br>- Use account lockout with exponential backoff<br>- Implement CAPTCHA after 3 failed attempts<br>- Deploy WAF with bot detection |
| **Token Revocation List Flooding** | Attacker forces mass token revocation by triggering logout operations, causing revocation list to grow unbounded and slow validation. | Low | Medium | - Implement TTL-based revocation list with automatic cleanup<br>- Use bloom filters for revocation checks<br>- Cache revocation list in memory with periodic refresh<br>- Set maximum revocation list size with LRU eviction<br>- Use short-lived tokens to minimize revocation scope |
| **MFA Enumeration DoS** | Attacker triggers MFA code generation for thousands of users, exhausting SMS/email sending capacity and budget. | Medium | Medium | - Rate limit MFA code requests (3 codes/15 min per user)<br>- Implement per-IP rate limiting on MFA endpoints<br>- Add CAPTCHA before MFA code generation<br>- Use push notifications over SMS when possible<br>- Implement cost monitoring and circuit breakers |

---

### E - Elevation of Privilege (Authorization Threats)

| Threat | Technical Details | Likelihood | Impact | Mitigation |
|--------|------------------|------------|--------|------------|
| **BOLA - Broken Object Level Authorization** | 40% of API incidents. Attacker modifies object IDs in API requests to access resources belonging to other users:<br>- `GET /api/users/123/orders/456` → `GET /api/users/123/orders/999`<br>- Missing authorization checks per object. | Critical | Critical | - Implement object-level authorization checks on every request:<br>  * Verify authenticated user owns requested resource<br>  * Use database queries with user ID filtering<br>- Avoid exposing sequential IDs (use UUIDs)<br>- Implement attribute-based access control (ABAC)<br>- Add authorization audit logging<br>- Test with OWASP API Security Top 10 scanners |
| **JWT Role Claim Injection** | Attacker with valid token modifies `role` or `permissions` claims to escalate privileges from user to admin. Exploitable when signature validation fails. | High | Critical | - Always validate JWT signature before reading claims<br>- Fetch user roles from authoritative database (not JWT)<br>- Use short-lived tokens with server-side role checks<br>- Implement role validation middleware on every endpoint<br>- Log role mismatches between token and database |
| **OAuth Scope Escalation** | Attacker requests OAuth token with limited scope (`read:profile`), then modifies token to add privileged scopes (`write:admin`) before API call. | Medium | High | - Validate OAuth scope on every API request<br>- Store granted scopes server-side during authorization<br>- Use scope validation middleware with whitelist per endpoint<br>- Implement least-privilege scope design<br>- Audit scope usage in tokens vs actual grants |
| **Refresh Token Privilege Escalation** | Attacker steals refresh token, uses it to generate new access tokens with elevated privileges by manipulating refresh token exchange request. Exploited in CVE-2025-13915 (IBM API Connect, 9.8 severity). | High | Critical | - Bind refresh tokens to original granted scopes/roles<br>- Validate user privileges during each token refresh<br>- Implement refresh token rotation (new refresh token on each use)<br>- Revoke all tokens on privilege change<br>- Use DPoP (RFC 9449) to bind refresh tokens to client<br>- Monitor refresh token usage for anomalies |
| **Subdomain Takeover for OAuth** | Attacker takes over abandoned subdomain registered as OAuth redirect URI, captures authorization codes and exchanges them for access tokens. | Medium | High | - Audit all registered OAuth redirect URIs quarterly<br>- Implement subdomain monitoring and DNS validation<br>- Remove unused redirect URIs from OAuth configuration<br>- Use redirect URI expiration policies<br>- Implement Certificate Transparency monitoring<br>- Add manual review for new redirect URI registrations |

---

## Risk Summary Matrix

| STRIDE Category | High-Risk Threats | Critical Mitigations |
|----------------|-------------------|---------------------|
| **Spoofing** | JWT "none" attack, Algorithm confusion, AI bot credential stuffing | Algorithm whitelisting, PKCE enforcement, MFA implementation |
| **Tampering** | JWT claims manipulation, State bypass | Signature-before-parsing, DPoP token binding |
| **Repudiation** | Missing audit logs, Log tampering | Write-once logs, comprehensive event logging |
| **Information Disclosure** | Token leakage in logs, JWT payload exposure | Secret redaction, opaque tokens, JWE encryption |
| **Denial of Service** | Token validation DoS, Brute force attacks | Rate limiting, progressive lockouts, validation timeouts |
| **Elevation of Privilege** | BOLA (40% of incidents), Refresh token escalation | Object-level authorization, refresh token rotation, scope validation |

---

## 2026 Threat Landscape Context

### Recent CVEs
- **CVE-2025-13915** (IBM API Connect): CVSS 9.8 - Authentication bypass allowing complete system compromise
- **CVE-2026-23993** (HarbourJwt): Unknown algorithm bypass enabling signature validation bypass

### Industry Statistics
- **99%** of enterprises experienced API security incident in 2026
- **30%** of incidents involve broken authentication mechanisms
- **40%+** of breaches involve authentication/authorization flaws
- **40%** BOLA (Broken Object Level Authorization) incident rate
- **40%** AI bot CAPTCHA bypass success rate

### Emerging Defenses
- **DPoP (RFC 9449)**: Demonstrating Proof-of-Possession - binds tokens to TLS client certificates to prevent token theft
- **Token Binding**: Cryptographically binds tokens to specific TLS connections
- **App Attestation**: SafetyNet, DeviceCheck for mobile client integrity verification

---

## Implementation Priorities

### Immediate (Week 1)
1. Implement JWT algorithm whitelisting and "none" rejection
2. Add object-level authorization checks (BOLA mitigation)
3. Enable comprehensive authentication event logging
4. Implement secret redaction in all logs

### Short-term (Month 1)
1. Deploy DPoP (RFC 9449) token binding
2. Implement PKCE for all OAuth flows
3. Add refresh token rotation
4. Deploy progressive rate limiting and account lockout
5. Implement MFA for high-risk authentications

### Medium-term (Quarter 1)
1. Migrate to opaque access tokens with server-side introspection
2. Implement behavioral analysis for bot detection
3. Deploy certificate pinning with integrity checks
4. Add token complexity and validation monitoring
5. Implement ABAC for fine-grained authorization

### Long-term (Year 1)
1. Implement cryptographic log signing and WORM storage
2. Deploy full app attestation for mobile clients
3. Implement zero-trust architecture with per-request authorization
4. Add AI-powered anomaly detection for authentication patterns
5. Implement continuous token risk scoring

---

## Testing Recommendations

### Security Testing
- OWASP API Security Top 10 automated scanning
- JWT security testing (jwt_tool, JWT_Attacker)
- OAuth flow security testing (OAuth.tools)
- Fuzzing authentication endpoints (Burp Suite, OWASP ZAP)
- Penetration testing focused on authentication bypass

### Monitoring
- Real-time alerting on failed authentication attempts
- Token validation failure rate tracking
- BOLA attempt detection and alerting
- Refresh token usage anomaly detection
- Log integrity monitoring with automated validation

---

## References

- OWASP API Security Top 10 2023/2026
- RFC 7519 (JWT), RFC 7636 (PKCE), RFC 9449 (DPoP)
- STRIDE Threat Modeling Methodology (Microsoft)
- CVE-2025-13915, CVE-2026-23993
- NIST SP 800-63B Digital Identity Guidelines

---

**Document Version**: 1.0
**Last Updated**: 2026-02-04
**Next Review**: 2026-05-04
