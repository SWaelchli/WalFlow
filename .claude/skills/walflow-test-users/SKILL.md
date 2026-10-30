---
name: walflow-test-users
description: Standard WalFlow test accounts (admin, two users, pipe manager) with their passwords, the shared test project, and how to create or reset them. Use before any test, audit or check that signs in to the running app (browser walkthrough, UX audit, lock or multi-user check, API call with a login), and whenever a second user is needed. Test environments only.
metadata:
  version: "1.0.0"
---

# WalFlow test users

Tests in the running app never use a real person's account. Sign out of whoever is signed in and sign in as one
of the test accounts below. These accounts exist only in local or test databases, so their passwords are public
by design, and using the admin account is allowed.

Automated tests do not need this: pytest points `DATABASE_PATH` at a temporary database and creates its own users
(see the `walflow-qa` skill), and Vitest mocks the API.

## Accounts

Password for all: `walflow-test-2026`

| Username | App role | Role in "WalFlow Test Team" | Use for |
|---|---|---|---|
| `test_admin` | admin | owner | Admin pages, user approval, project ownership |
| `test_alice` | user | member | Main user of a walkthrough |
| `test_bob` | user | member | Second user: locks, read-only view, conflicts |
| `test_pipes` | pipe_manager | member | Pipe class and catalogue management |

All four are members of the project **WalFlow Test Team**, so they see each other's drawings there. Create test
drawings in that project, not in a user's own projects.

## Create or reset

Run from the repo root with the backend venv. The script is idempotent: it creates missing accounts, and resets
the password, role and "approved" status of existing ones. It never touches other accounts.

```bash
.venv/Scripts/python .claude/skills/walflow-test-users/scripts/seed_test_users.py                   # create / reset
.venv/Scripts/python .claude/skills/walflow-test-users/scripts/seed_test_users.py --list            # show state
.venv/Scripts/python .claude/skills/walflow-test-users/scripts/seed_test_users.py --reset-drawings  # also empty the test project
```

- It writes to the database the backend uses (`DATABASE_PATH`, else `backend/walflow.db`); the running server
  sees the change at once, no restart needed.
- It refuses to run when `ENVIRONMENT=production` or `WALFLOW_SECRET_KEY` is set (marks of a deployed server).
  On a test server that has a secret key, pass `--allow-configured-env`.
- To add a test account, add a row to `TEST_USERS` in the script and to the table above.

Without shell access to the server (a hosted test environment), create accounts in the app instead: sign in as
the admin, have the account register on the sign-in page, approve it in the Admin Hub (Users tab), set its role, and add
it to the test project in the Project manager. Use the same names and password.

## Sign in for a test (browser)

Auth is a cookie per host, so **every tab on the same host is the same user**.

1. Run the seed script (above) so the accounts exist.
2. Note who is signed in (username next to the **Sign out** button in the navbar). Report it at the end; you
   cannot sign the user back in, because you do not know their password.
3. Click **Sign out** in the navbar, or in the page console: `await fetch('/api/auth/logout', {method: 'POST'})`
   and reload.
4. Sign in on the sign-in dialog with a test username and the password above.
5. After the test: sign out, and tell the user that they were signed out and need to sign in again.

### Two users at once

Use a different host for each user, so each has its own cookie:

| User | URL |
|---|---|
| First (`test_alice`) | `http://localhost:5173` |
| Second (`test_bob`) | `http://[::1]:5173` |

Vite listens on IPv6, so `http://127.0.0.1:5173` does not answer by default. A third user needs another host,
for example by starting Vite with `npm run dev -- --host` and using the machine's LAN address. Two tabs on the
same host are the same user (use that on purpose to test one user in two tabs).

## API calls as a test user

Keep a cookie jar per user:

```bash
curl -s -c alice.txt -X POST 'http://[::1]:5173/api/auth/login' -H 'Content-Type: application/json' \
  -d '{"username":"test_alice","password":"walflow-test-2026"}'
curl -s -b alice.txt 'http://[::1]:5173/api/projects'
curl -s -b alice.txt -X POST 'http://[::1]:5173/api/auth/logout'
```

Put cookie jars in the scratchpad, not the repo. Login is rate-limited to 10 per minute per client.

## Rules

- Never sign in with a real person's account, and never ask for or type the user's own password.
- Never use these accounts or this password on a production server.
- Leave test data in **WalFlow Test Team**. Clean up with `--reset-drawings` when a test needs an empty project.
