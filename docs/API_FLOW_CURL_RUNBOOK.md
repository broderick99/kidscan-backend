# API Flow Curl Runbook

This runbook goes with [verify-api-flow.sh](/Users/wes/Documents/Kids%20Can/kidscan-be/scripts/verify-api-flow.sh).
Related wrappers:

- [verify-api-bootstrap.sh](/Users/wes/Documents/Kids%20Can/kidscan-be/scripts/verify-api-bootstrap.sh)
- [verify-api-post-billing.sh](/Users/wes/Documents/Kids%20Can/kidscan-be/scripts/verify-api-post-billing.sh)

## What It Verifies

The script issues sequential `curl` requests that exercise the API flow end to end:

1. teen signup or login
2. teen profile read and teen-code verification
3. optional teen referral creation
4. homeowner signup or login
5. homeowner profile update
6. homeowner home creation
7. billing status and pricing checks
8. service creation for a chosen paid plan
9. task creation
10. teen task completion
11. dashboard-facing reads for both teen and homeowner

## Important Constraints

- The script is side-effectful.
- It creates real users, homes, services, tasks, payments, and potentially Stripe subscriptions.
- Against prod, use only designated test accounts and safe addresses.
- If the homeowner account does not already have a valid payment method, the script creates a Stripe Checkout setup-session URL and exits with code `20`.
- Completing the Stripe Checkout page is still a manual step.

## Default Run

From [kidscan-be](/Users/wes/Documents/Kids%20Can/kidscan-be):

```bash
BASE_URL=https://your-api-host/api/v1 npm run verify:api-flow
```

This will:

- create a new teen
- create a new homeowner
- create a home
- stop early if billing is missing
- continue into service and task verification only when billing is valid

## Split Runs

Bootstrap only:

```bash
BASE_URL=https://your-api-host/api/v1 npm run verify:api-bootstrap
```

This creates or logs in the users, creates the home, checks billing, and if needed prints the Stripe setup-session URL.

Post-billing verification:

```bash
BASE_URL=https://your-api-host/api/v1 \
LOGIN_EXISTING_TEEN=1 \
LOGIN_EXISTING_HOMEOWNER=1 \
TEEN_EMAIL=teen@example.com \
TEEN_PASSWORD='Secret123!' \
HOMEOWNER_EMAIL=homeowner@example.com \
HOMEOWNER_PASSWORD='Secret123!' \
npm run verify:api-post-billing
```

This assumes the homeowner already has a valid saved payment method and then continues through service, task, payment, usage, and dashboard verification.

## Reusing Existing Accounts

If you already have a billed homeowner account and a known teen account:

```bash
BASE_URL=https://your-api-host/api/v1 \
LOGIN_EXISTING_TEEN=1 \
LOGIN_EXISTING_HOMEOWNER=1 \
TEEN_EMAIL=teen@example.com \
TEEN_PASSWORD='Secret123!' \
HOMEOWNER_EMAIL=homeowner@example.com \
HOMEOWNER_PASSWORD='Secret123!' \
npm run verify:api-flow
```

## Useful Inputs

- `PLAN_TYPE=single_can|double_can|triple_can`
- `PICKUP_DAYS=monday:1,thursday:2`
- `HOME_NAME=...`
- `ADDRESS_LINE1=...`
- `CITY=...`
- `STATE=...`
- `ZIP_CODE=...`
- `PHOTO_URL=https://...`
- `CREATE_REFERRAL=0|1`
- `HOMEOWNER_REFERRED_BY_TEEN=0|1`

## Recommended Prod Strategy

Use two passes:

1. Run against a homeowner without billing and capture the Checkout URL.
2. Complete billing manually in Stripe Checkout.
3. Rerun with `LOGIN_EXISTING_TEEN=1` and `LOGIN_EXISTING_HOMEOWNER=1` so the script performs the paid-plan and dashboard verification steps.
