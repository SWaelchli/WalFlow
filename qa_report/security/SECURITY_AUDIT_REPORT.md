# WalFlow Backend Security Audit Report

**Target Version**: 0.1.3  
**Audit Scope**: Backend Authentication, Session Management, API Endpoints, WebSocket Protocol, and Input Validation  
**Date**: 2026-08-03  
**Auditor**: Worker Subagent (`worker_m5` / R4 Security QA)  

---

## Executive Summary

A comprehensive security audit of the WalFlow hydraulic simulator backend (`backend/auth.py`, `backend/main.py`, `backend/routers/*.py`, `backend/db/`) was conducted to assess session management, authentication mechanisms, input validation, injection vulnerability risks, and data leakage. 

While the application demonstrates robust resilience against traditional injection vulnerabilities (e.g., SQL injection, path traversal, OS command execution) due to standard SQLAlchemy ORM usage and Pydantic schema validation, **critical and high-severity security risks** were identified in token management, default authentication configuration, password policies, and error handling.

### Risk Overview Matrix

| Risk ID | Vulnerability / Issue | Location | Risk Severity | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Hardcoded Fallback JWT Secret Key | `backend/auth.py:13-18` | **HIGH** | Open |
| **SEC-02** | Implicit WebSocket Auth Bypass in Dev Mode | `backend/main.py:98-103` | **HIGH** | Open |
| **SEC-03** | Excessive JWT Lifespan (7 Days) & Lack of Revocation | `backend/auth.py:20`, `backend/routers/auth.py:147` | **MEDIUM** | Open |
| **SEC-04** | Weak Minimum Password Strength (4 Characters) | `backend/routers/auth.py:46, 69` | **MEDIUM** | Open |
| **SEC-05** | First-User Admin Escalation & Race Condition | `backend/routers/auth.py:76-80` | **MEDIUM** | Open |
| **SEC-06** | Exception Stack Trace & System Detail Data Leakage | `backend/main.py:134, 180`, `routers/simulation.py:140` | **LOW** | Open |
| **SEC-07** | SQL Injection Resilience | `backend/routers/*.py`, `backend/db/` | **PASS (SAFE)** | Verified |
| **SEC-08** | Path Traversal Resilience | `backend/routers/diagrams.py` | **PASS (SAFE)** | Verified |
| **SEC-09** | Command Execution Resilience | Backend Codebase | **PASS (SAFE)** | Verified |

---

## 1. JWT & Session Management Audit

### 1.1 Hardcoded Fallback Secret Key (`SEC-01`)
* **File Reference**: `backend/auth.py` (Lines 13-18)
* **Code Snippet**:
  ```python
  SECRET_KEY = os.getenv("WALFLOW_SECRET_KEY")
  if not SECRET_KEY:
      import logging
      logger = logging.getLogger("uvicorn")
      logger.warning("WARNING: WALFLOW_SECRET_KEY environment variable is not set. Falling back to default insecure key for development.")
      SECRET_KEY = "walflow_dev_secret_key_change_in_production_39a48f2b"
  ```
* **Risk Assessment**: **HIGH**. If an administrator deploys WalFlow without explicitly setting the `WALFLOW_SECRET_KEY` environment variable, the backend silently falls back to a publicly known static key. Any attacker can inspect the open-source repository, forge arbitrary JWT tokens with `sub: <user_id>` or `role: "admin"`, and instantly achieve unauthorized administrative access to the system.

### 1.2 Default WebSocket Authentication Bypass (`SEC-02`)
* **File Reference**: `backend/main.py` (Lines 98-103)
* **Code Snippet**:
  ```python
  secret_key_configured = os.getenv("WALFLOW_SECRET_KEY") is not None
  default_require_auth = "true" if secret_key_configured else "false"
  require_auth = os.getenv("WALFLOW_REQUIRE_WS_AUTH", default_require_auth).lower() in ("true", "1")
  ```
* **Risk Assessment**: **HIGH**. When `WALFLOW_SECRET_KEY` is not set, `require_auth` defaults to `false`. Under this configuration, unauthenticated guest clients can connect to `/ws/simulate` via WebSocket and send arbitrary graph computation commands (`action: "run_simulation"` or `"update_graph"`). This exposes the backend to Denial of Service (DoS) attacks, as unauthenticated attackers can consume significant CPU/RAM by triggering intensive matrix solving operations.

### 1.3 Excessive JWT Expiration Window & Lack of Token Revocation (`SEC-03`)
* **File Reference**: `backend/auth.py` (Line 20), `backend/routers/auth.py` (Lines 115-133, 147-150)
* **Code Analysis**:
  - `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7` grants tokens a 7-day (10,080-minute) validity.
  - The `/api/auth/logout` endpoint only instructs the browser to clear the `walflow_auth_token` cookie:
    ```python
    @router.post("/logout")
    def logout_user(response: Response):
        response.delete_cookie("walflow_auth_token")
        return {"status": "success", "message": "Logged out successfully."}
    ```
  - The JWT decoding mechanism (`decode_access_token` in `auth.py:45-50`) is strictly stateless and does not check a token blocklist or revocation database.
* **Risk Assessment**: **MEDIUM**. If a valid JWT token is intercepted or exfiltrated (e.g., via browser storage or network packet capture), the token remains valid for up to 7 full days. Logging out does not invalidate the token server-side, enabling session replay and session hijacking over an extended time window.

### 1.4 Password Strength Policy (`SEC-04`)
* **File Reference**: `backend/routers/auth.py` (Lines 46-47, 69-70)
* **Code Snippet**:
  ```python
  if len(payload.password) < 4:
      raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")
  ```
* **Risk Assessment**: **MEDIUM**. Standard authentication schemas enforce a minimal password length of 4 characters with no requirements for complexity (uppercase, numbers, special characters). PBKDF2-HMAC-SHA256 with 100,000 iterations provides hash stretching, but 4-character passwords remain vulnerable to dictionary attacks and offline brute-force cracking if database hashes are compromised.

### 1.5 First-User Admin Escalation & Concurrent Race Condition (`SEC-05`)
* **File Reference**: `backend/routers/auth.py` (Lines 76-80)
* **Code Snippet**:
  ```python
  admin_exists = db.query(User).filter(User.role == "admin").first() is not None
  initial_role = "admin" if not admin_exists else "user"
  initial_status = "approved" if not admin_exists else "pending_approval"
  ```
* **Risk Assessment**: **MEDIUM**. On a fresh database installation, the very first user registration automatically inherits `admin` role and `approved` status. If an application is deployed publicly before an administrator sets up their account, an external attacker could register first and gain full administrative privileges. Furthermore, concurrent setup requests on a new database could result in a race condition where multiple accounts obtain admin status if non-atomic checks occur.

---

## 2. Input Validation & Endpoint Security Audit

### 2.1 SQL Injection Analysis (`SEC-07`)
* **Audit Scope**: `backend/routers/auth.py`, `backend/routers/diagrams.py`, `backend/routers/admin.py`, `backend/db/database.py`
* **Findings**:
  - All database interactions use SQLAlchemy ORM methods (`db.query(User).filter(...)`, `db.query(Diagram).filter(...)`), which bind parameters securely using parameterized SQL queries.
  - In `backend/db/database.py` (Lines 46-48), lightweight table schema migrations use `text("ALTER TABLE users ADD COLUMN...")` with fixed string constants without user input interpolation.
* **Verdict**: **PASS (SAFE)**. No SQL injection vulnerabilities exist in current endpoints.

### 2.2 Schema Validation & Path Traversal Analysis (`SEC-08`)
* **Audit Scope**: `backend/routers/diagrams.py`, `backend/simulation/schemas.py`
* **Findings**:
  - Pydantic models (`DiagramCreateSchema`, `DiagramUpdateSchema`, `ReactFlowGraph`, `OperatingCase`) enforce strong type checking on incoming HTTP bodies and WebSocket payloads.
  - Diagram data is stored inside database text fields (`Diagram.diagram_data`), rather than written to the local filesystem.
  - No file paths are accepted from user parameters for `open()`, `os.path.join()`, or file removal operations.
* **Verdict**: **PASS (SAFE)**. The API is immune to path traversal attacks.

### 2.3 Command Execution Analysis (`SEC-09`)
* **Audit Scope**: Backend codebase (`backend/`)
* **Findings**:
  - A project-wide code search confirmed zero usage of risky Python execution functions such as `eval()`, `exec()`, `os.system()`, `subprocess.Popen()`, or `shlex`.
  - Hydraulic simulation parameters are validated as float/int numbers and fed directly into SciPy algebraic solvers (`scipy.optimize.root`).
* **Verdict**: **PASS (SAFE)**. No command execution risks present.

### 2.4 Error Response Data Leakage (`SEC-06`)
* **File Reference**: `backend/main.py` (Lines 134, 180), `backend/routers/simulation.py` (Line 140)
* **Code Snippet**:
  ```python
  # main.py
  except Exception as e:
      print(f"Graph Parse Error: {e}")
      traceback.print_exc()
      await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
  
  # routers/simulation.py
  except Exception as e:
      traceback.print_exc()
      results.append(BatchCaseResult(
          ...
          status="error",
          error_message=str(e)
      ))
  ```
* **Risk Assessment**: **LOW**. In several exception handlers, raw exception messages (`str(e)`) and stack traces are logged and sent directly back in JSON response payloads to the client. Detailed error strings can leak underlying file paths, database structure details, or library internal states to potential attackers.

---

## 3. Actionable Remediation Roadmap

To elevate WalFlow's backend to enterprise-grade production security, the following hardening roadmap is recommended:

### Phase 1: High-Priority Hardening (Immediate Release)
1. **Mandatory Production Secret Enforcement**:
   - Update `backend/auth.py` to raise a runtime `ValueError` or process exit if `WALFLOW_SECRET_KEY` is missing in production environments (`ENVIRONMENT=production`).
   - In development mode, auto-generate a random 32-byte secret key per server instance rather than relying on a hardcoded string fallback.
2. **Enforce WebSocket Authentication**:
   - Change `WALFLOW_REQUIRE_WS_AUTH` default value to `true` across all environments in `backend/main.py`.
   - Reject unauthenticated WebSocket handshakes unconditionally before accepting connections.

### Phase 2: Medium-Priority Improvements (Next Sprint)
3. **Password Policy Upgrade**:
   - Increase minimum password length from 4 to 8 characters in `UserRegisterSchema` / `auth.py`.
   - Add basic validation requiring at least one digit or symbol.
4. **JWT Lifespan Reduction & Revocation List**:
   - Reduce default access token lifetime from 7 days (10,080 minutes) to 60 minutes.
   - Implement an in-memory or Redis-backed JWT revocation list (blacklist) to invalidate tokens on explicit `/api/auth/logout`.
5. **Secure First-Admin Setup**:
   - Require explicit initial setup via dedicated `POST /api/auth/setup-admin` endpoint with setup tokens, rather than automatically granting admin privileges to the first user in `register_user`.

### Phase 3: Low-Priority & Defense-in-Depth (Future Updates)
6. **Sanitized Error Responses**:
   - Wrap internal exceptions in generic error responses (e.g. `"An unexpected error occurred during simulation processing"`) for client payloads while keeping full stack traces logged to server logs only.
7. **Rate Limiting**:
   - Implement rate limiting middleware (e.g. `slowapi` or FastAPI dependency) on `/api/auth/login` and `/ws/simulate` to prevent brute-force attacks and socket abuse.

---
*Report compiled by WalFlow Security QA Subagent (Worker M5).*
