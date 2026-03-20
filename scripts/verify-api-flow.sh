#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Kids Can API flow verifier

This script exercises the main API workflow in sequence using curl:
1. teen signup/login
2. teen profile and teen-code lookup
3. optional teen referral creation
4. homeowner signup/login
5. homeowner profile update
6. homeowner home creation
7. billing status and pricing checks
8. manual Stripe setup-session handoff if billing is missing
9. service creation for a selected paid plan
10. task creation
11. teen task completion
12. dashboard-facing verification for teen and homeowner

Important:
- This script is side-effectful.
- If you point it at prod, use designated test accounts and addresses.
- A homeowner payment method is required before service creation.
- If billing is missing, the script prints a Stripe Checkout URL and exits with code 20.

Common usage:
  BASE_URL=https://api.example.com/api/v1 \
  npm run verify:api-flow

Reuse existing accounts:
  BASE_URL=https://api.example.com/api/v1 \
  LOGIN_EXISTING_TEEN=1 \
  LOGIN_EXISTING_HOMEOWNER=1 \
  TEEN_EMAIL=teen@example.com \
  TEEN_PASSWORD='Secret123!' \
  HOMEOWNER_EMAIL=homeowner@example.com \
  HOMEOWNER_PASSWORD='Secret123!' \
  npm run verify:api-flow
EOF
  exit 0
fi

for required in curl jq node; do
  if ! command -v "$required" >/dev/null 2>&1; then
    echo "Missing required command: $required" >&2
    exit 1
  fi
done

BASE_URL="${BASE_URL:-http://localhost:8080/api/v1}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d%H%M%S)}"
FLOW_PHASE="${FLOW_PHASE:-full}"
PLAN_TYPE="${PLAN_TYPE:-double_can}"
LOGIN_EXISTING_TEEN="${LOGIN_EXISTING_TEEN:-0}"
LOGIN_EXISTING_HOMEOWNER="${LOGIN_EXISTING_HOMEOWNER:-0}"
CREATE_REFERRAL="${CREATE_REFERRAL:-1}"
HOMEOWNER_REFERRED_BY_TEEN="${HOMEOWNER_REFERRED_BY_TEEN:-1}"
TEEN_PASSWORD="${TEEN_PASSWORD:-KidsCan123!}"
HOMEOWNER_PASSWORD="${HOMEOWNER_PASSWORD:-KidsCan123!}"
TEEN_EMAIL="${TEEN_EMAIL:-kidscan-teen-${RUN_ID}@example.com}"
HOMEOWNER_EMAIL="${HOMEOWNER_EMAIL:-kidscan-homeowner-${RUN_ID}@example.com}"
TEEN_FIRST_NAME="${TEEN_FIRST_NAME:-API}"
TEEN_LAST_NAME="${TEEN_LAST_NAME:-Teen${RUN_ID}}"
HOMEOWNER_FIRST_NAME="${HOMEOWNER_FIRST_NAME:-API}"
HOMEOWNER_LAST_NAME="${HOMEOWNER_LAST_NAME:-Homeowner${RUN_ID}}"
TEEN_PHONE="${TEEN_PHONE:-8085550101}"
HOMEOWNER_PHONE="${HOMEOWNER_PHONE:-8085550199}"
HOME_NAME="${HOME_NAME:-API Flow Home ${RUN_ID}}"
ADDRESS_LINE1="${ADDRESS_LINE1:-123 API Lane}"
ADDRESS_LINE2="${ADDRESS_LINE2:-}"
CITY="${CITY:-Honolulu}"
STATE="${STATE:-HI}"
ZIP_CODE="${ZIP_CODE:-96818}"
SPECIAL_INSTRUCTIONS="${SPECIAL_INSTRUCTIONS:-Side gate access}"
PHOTO_URL="${PHOTO_URL:-https://images.example.com/kidscan-api-proof.jpg}"
REFERRAL_EMAIL="${REFERRAL_EMAIL:-kidscan-referral-${RUN_ID}@example.com}"

default_pickup_days() {
  case "$PLAN_TYPE" in
    single_can) echo "monday:1" ;;
    double_can) echo "monday:1,thursday:2" ;;
    triple_can) echo "monday:1,wednesday:2,friday:3" ;;
    *)
      echo "Unsupported PLAN_TYPE: $PLAN_TYPE" >&2
      exit 1
      ;;
  esac
}

PICKUP_DAYS="${PICKUP_DAYS:-$(default_pickup_days)}"

log_step() {
  echo
  echo "==> $1"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

date_offset() {
  node -e "const d=new Date(); d.setUTCDate(d.getUTCDate()+Number(process.argv[1])); console.log(d.toISOString().slice(0,10));" "$1"
}

start_of_month() {
  node -e "const d=new Date(); d.setUTCDate(1); console.log(d.toISOString().slice(0,10));"
}

end_of_month() {
  node -e "const d=new Date(); d.setUTCMonth(d.getUTCMonth()+1,1); d.setUTCDate(d.getUTCDate()-1); console.log(d.toISOString().slice(0,10));"
}

plan_service_name() {
  case "$PLAN_TYPE" in
    single_can) echo "Trash Service - Single Can" ;;
    double_can) echo "Trash Service - Double Can" ;;
    triple_can) echo "Trash Service - Triple Can" ;;
    *)
      fail "Unsupported PLAN_TYPE: $PLAN_TYPE"
      ;;
  esac
}

request_json() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local tmp
  local status
  tmp="$(mktemp)"

  if [[ -n "$body" ]]; then
    status="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" \
      "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      ${token:+-H "Authorization: Bearer $token"} \
      --data "$body")"
  else
    status="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" \
      "$BASE_URL$path" \
      ${token:+-H "Authorization: Bearer $token"})"
  fi

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "HTTP ${status} for ${method} ${path}" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi

  cat "$tmp"
  rm -f "$tmp"
}

request_form() {
  local method="$1"
  local path="$2"
  local token="$3"
  shift 3
  local tmp
  local status
  tmp="$(mktemp)"

  status="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" \
    "$BASE_URL$path" \
    -H "Authorization: Bearer $token" \
    "$@")"

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "HTTP ${status} for ${method} ${path}" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi

  cat "$tmp"
  rm -f "$tmp"
}

jq_value() {
  local json="$1"
  local filter="$2"
  jq -r "$filter" <<<"$json"
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "${label}: expected '${expected}', got '${actual}'"
  fi
  echo "PASS: ${label} -> ${actual}"
}

assert_nonempty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    fail "${label}: expected non-empty value"
  fi
  echo "PASS: ${label} present"
}

assert_ge() {
  local actual="$1"
  local minimum="$2"
  local label="$3"
  if ! awk "BEGIN { exit !($actual >= $minimum) }"; then
    fail "${label}: expected >= ${minimum}, got ${actual}"
  fi
  echo "PASS: ${label} -> ${actual}"
}

build_pickup_days_json() {
  local payload='[]'
  local part day can
  IFS=',' read -r -a parts <<<"$PICKUP_DAYS"
  for part in "${parts[@]}"; do
    day="${part%%:*}"
    can="${part##*:}"
    payload="$(jq -c --arg day "$day" --argjson can "$can" '. + [{dayOfWeek:$day, canNumber:$can}]' <<<"$payload")"
  done
  printf '%s' "$payload"
}

register_user() {
  local role="$1"
  local email="$2"
  local password="$3"
  local first_name="$4"
  local last_name="$5"
  local referred_by="${6:-}"

  local body
  if [[ -n "$referred_by" ]]; then
    body="$(jq -nc \
      --arg email "$email" \
      --arg password "$password" \
      --arg role "$role" \
      --arg firstName "$first_name" \
      --arg lastName "$last_name" \
      --arg referredByTeenCode "$referred_by" \
      '{email:$email,password:$password,role:$role,firstName:$firstName,lastName:$lastName,referredByTeenCode:$referredByTeenCode}')"
  else
    body="$(jq -nc \
      --arg email "$email" \
      --arg password "$password" \
      --arg role "$role" \
      --arg firstName "$first_name" \
      --arg lastName "$last_name" \
      '{email:$email,password:$password,role:$role,firstName:$firstName,lastName:$lastName}')"
  fi

  request_json POST "/auth/register" "" "$body"
}

login_user() {
  local email="$1"
  local password="$2"
  local body
  body="$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')"
  request_json POST "/auth/login" "" "$body"
}

log_step "Teen auth"
if [[ "$LOGIN_EXISTING_TEEN" == "1" ]]; then
  teen_auth="$(login_user "$TEEN_EMAIL" "$TEEN_PASSWORD")"
else
  teen_auth="$(register_user "teen" "$TEEN_EMAIL" "$TEEN_PASSWORD" "$TEEN_FIRST_NAME" "$TEEN_LAST_NAME")"
fi

TEEN_TOKEN="$(jq_value "$teen_auth" '.access_token')"
TEEN_REFRESH_TOKEN="$(jq_value "$teen_auth" '.refresh_token')"
TEEN_ID="$(jq_value "$teen_auth" '.user.id')"
assert_nonempty "$TEEN_TOKEN" "Teen access token"
assert_nonempty "$TEEN_ID" "Teen user id"

log_step "Teen profile verification"
teen_user_me="$(request_json GET "/users/me" "$TEEN_TOKEN")"
assert_eq "$(jq_value "$teen_user_me" '.role')" "teen" "Teen role"

teen_profile="$(request_json GET "/profiles/me" "$TEEN_TOKEN")"
TEEN_CODE="$(jq_value "$teen_profile" '.teen_code // empty')"
if [[ -z "$TEEN_CODE" ]]; then
  teen_code_resp="$(request_json POST "/profiles/me/generate-teen-code" "$TEEN_TOKEN")"
  TEEN_CODE="$(jq_value "$teen_code_resp" '.teen_code // .teenCode // empty')"
fi
assert_nonempty "$TEEN_CODE" "Teen code"

teen_lookup="$(request_json GET "/profiles/teen-code/${TEEN_CODE}" "")"
assert_eq "$(jq_value "$teen_lookup" '.user_id')" "$TEEN_ID" "Teen code lookup user id"

if [[ "$CREATE_REFERRAL" == "1" ]]; then
  log_step "Teen referral coverage"
  referral_body="$(jq -nc --arg referredEmail "$REFERRAL_EMAIL" --argjson rewardAmount 50 '{referredEmail:$referredEmail,rewardAmount:$rewardAmount}')"
  referral_create="$(request_json POST "/referrals" "$TEEN_TOKEN" "$referral_body")"
  REFERRAL_ID="$(jq_value "$referral_create" '.id')"
  assert_nonempty "$REFERRAL_ID" "Referral id"
  teen_referrals="$(request_json GET "/referrals" "$TEEN_TOKEN")"
  assert_ge "$(jq_value "$teen_referrals" 'length')" "1" "Teen referrals count"
fi

log_step "Homeowner auth"
HOMEOWNER_REFERRED_CODE=""
if [[ "$HOMEOWNER_REFERRED_BY_TEEN" == "1" ]]; then
  HOMEOWNER_REFERRED_CODE="$TEEN_CODE"
fi

if [[ "$LOGIN_EXISTING_HOMEOWNER" == "1" ]]; then
  homeowner_auth="$(login_user "$HOMEOWNER_EMAIL" "$HOMEOWNER_PASSWORD")"
else
  homeowner_auth="$(register_user "homeowner" "$HOMEOWNER_EMAIL" "$HOMEOWNER_PASSWORD" "$HOMEOWNER_FIRST_NAME" "$HOMEOWNER_LAST_NAME" "$HOMEOWNER_REFERRED_CODE")"
fi

HOMEOWNER_TOKEN="$(jq_value "$homeowner_auth" '.access_token')"
HOMEOWNER_REFRESH_TOKEN="$(jq_value "$homeowner_auth" '.refresh_token')"
HOMEOWNER_ID="$(jq_value "$homeowner_auth" '.user.id')"
assert_nonempty "$HOMEOWNER_TOKEN" "Homeowner access token"
assert_nonempty "$HOMEOWNER_ID" "Homeowner user id"

log_step "Homeowner profile and home setup"
homeowner_user_me="$(request_json GET "/users/me" "$HOMEOWNER_TOKEN")"
assert_eq "$(jq_value "$homeowner_user_me" '.role')" "homeowner" "Homeowner role"

profile_update_body="$(jq -nc \
  --arg phone "$HOMEOWNER_PHONE" \
  --arg addressLine1 "$ADDRESS_LINE1" \
  --arg addressLine2 "$ADDRESS_LINE2" \
  --arg city "$CITY" \
  --arg state "$STATE" \
  --arg zipCode "$ZIP_CODE" \
  '{phone:$phone,addressLine1:$addressLine1,addressLine2:$addressLine2,city:$city,state:$state,zipCode:$zipCode}')"
request_json PATCH "/profiles/me" "$HOMEOWNER_TOKEN" "$profile_update_body" >/dev/null

create_home_body="$(jq -nc \
  --arg name "$HOME_NAME" \
  --arg addressLine1 "$ADDRESS_LINE1" \
  --arg addressLine2 "$ADDRESS_LINE2" \
  --arg city "$CITY" \
  --arg state "$STATE" \
  --arg zipCode "$ZIP_CODE" \
  --arg specialInstructions "$SPECIAL_INSTRUCTIONS" \
  '{name:$name,addressLine1:$addressLine1,addressLine2:$addressLine2,city:$city,state:$state,zipCode:$zipCode,specialInstructions:$specialInstructions}')"
home_create="$(request_json POST "/homes" "$HOMEOWNER_TOKEN" "$create_home_body")"
HOME_ID="$(jq_value "$home_create" '.id')"
assert_nonempty "$HOME_ID" "Home id"
assert_eq "$(jq_value "$home_create" '.homeowner_id')" "$HOMEOWNER_ID" "Homeowner owns created home"

log_step "Billing preflight"
pricing_json="$(request_json GET "/billing/pricing" "$HOMEOWNER_TOKEN")"
PRICE_PER_TASK="$(jq -r --arg plan "$PLAN_TYPE" '.[$plan].amount / 100' <<<"$pricing_json")"
assert_nonempty "$PRICE_PER_TASK" "Price per task for ${PLAN_TYPE}"

billing_status="$(request_json GET "/billing/status" "$HOMEOWNER_TOKEN")"
has_payment_method="$(jq_value "$billing_status" '.hasPaymentMethod')"

if [[ "$has_payment_method" != "true" ]]; then
  setup_session_body="$(jq -nc --argjson homeId "$HOME_ID" --arg planType "$PLAN_TYPE" '{homeId:$homeId,planType:$planType}')"
  setup_session="$(request_json POST "/billing/create-setup-session" "$HOMEOWNER_TOKEN" "$setup_session_body")"
  CHECKOUT_URL="$(jq_value "$setup_session" '.url')"
  echo
  echo "Billing is required before service creation."
  echo "Complete the Stripe Checkout flow, then rerun this script with:"
  echo "  LOGIN_EXISTING_TEEN=1 LOGIN_EXISTING_HOMEOWNER=1"
  echo
  echo "Checkout URL:"
  echo "  ${CHECKOUT_URL}"
  if [[ "$FLOW_PHASE" == "bootstrap" || "$FLOW_PHASE" == "full" ]]; then
    exit 20
  fi
  fail "FLOW_PHASE=${FLOW_PHASE} requires an account with a valid payment method"
fi

if [[ "$FLOW_PHASE" == "bootstrap" ]]; then
  echo
  echo "Bootstrap phase complete."
  echo "Run id:           ${RUN_ID}"
  echo "Teen email:       ${TEEN_EMAIL}"
  echo "Teen id/code:     ${TEEN_ID} / ${TEEN_CODE}"
  echo "Homeowner email:  ${HOMEOWNER_EMAIL}"
  echo "Home id:          ${HOME_ID}"
  echo "Billing status:   $(jq_value "$billing_status" '.subscriptionStatus // "no_subscription"')"
  exit 0
fi

log_step "Teen-homeowner linking and paid plan signup"
linked_teen="$(request_json GET "/profiles/teen-code/${TEEN_CODE}" "")"
assert_eq "$(jq_value "$linked_teen" '.user_id')" "$TEEN_ID" "Linked teen id"

SERVICE_NAME="$(plan_service_name)"
PICKUP_DAYS_JSON="$(build_pickup_days_json)"
START_DATE="$(date_offset 0)"

create_service_body="$(jq -nc \
  --argjson teenId "$TEEN_ID" \
  --argjson homeId "$HOME_ID" \
  --arg name "$SERVICE_NAME" \
  --arg frequency "weekly" \
  --argjson pricePerTask "$PRICE_PER_TASK" \
  --arg startDate "$START_DATE" \
  --argjson pickupDays "$PICKUP_DAYS_JSON" \
  '{teenId:$teenId,homeId:$homeId,name:$name,frequency:$frequency,pricePerTask:$pricePerTask,startDate:$startDate,pickupDays:$pickupDays}')"
service_create="$(request_json POST "/services" "$HOMEOWNER_TOKEN" "$create_service_body")"
SERVICE_ID="$(jq_value "$service_create" '.id')"
assert_nonempty "$SERVICE_ID" "Service id"

service_details="$(request_json GET "/services/${SERVICE_ID}" "$HOMEOWNER_TOKEN")"
assert_eq "$(jq_value "$service_details" '.teen_id')" "$TEEN_ID" "Service teen id"
assert_eq "$(jq_value "$service_details" '.home_id')" "$HOME_ID" "Service home id"

billing_after_service="$(request_json GET "/billing/status" "$HOMEOWNER_TOKEN")"
assert_nonempty "$(jq_value "$billing_after_service" '.subscriptionStatus // empty')" "Subscription status after service creation"

log_step "Task creation"
TASK_ONE_DATE="$(date_offset 1)"
TASK_TWO_DATE="$(date_offset 4)"

task_one_body="$(jq -nc --argjson serviceId "$SERVICE_ID" --arg scheduledDate "$TASK_ONE_DATE" --arg notes "API flow task 1" '{serviceId:$serviceId,scheduledDate:$scheduledDate,notes:$notes}')"
task_two_body="$(jq -nc --argjson serviceId "$SERVICE_ID" --arg scheduledDate "$TASK_TWO_DATE" --arg notes "API flow task 2" '{serviceId:$serviceId,scheduledDate:$scheduledDate,notes:$notes}')"

task_one="$(request_json POST "/tasks" "$HOMEOWNER_TOKEN" "$task_one_body")"
task_two="$(request_json POST "/tasks" "$HOMEOWNER_TOKEN" "$task_two_body")"
TASK_ONE_ID="$(jq_value "$task_one" '.id')"
TASK_TWO_ID="$(jq_value "$task_two" '.id')"
assert_nonempty "$TASK_ONE_ID" "Task one id"
assert_nonempty "$TASK_TWO_ID" "Task two id"

upcoming_before_completion="$(request_json GET "/services/${SERVICE_ID}/tasks/upcoming" "$HOMEOWNER_TOKEN")"
assert_ge "$(jq_value "$upcoming_before_completion" 'length')" "2" "Upcoming tasks before completion"

log_step "Teen dashboard-facing checks before task completion"
teen_services="$(request_json GET "/services/my-services" "$TEEN_TOKEN")"
assert_ge "$(jq_value "$teen_services" 'length')" "1" "Teen services count"

teen_upcoming="$(request_json GET "/tasks/upcoming?days=30" "$TEEN_TOKEN")"
assert_ge "$(jq_value "$teen_upcoming" 'length')" "2" "Teen upcoming tasks count"

MONTH_START="$(start_of_month)"
MONTH_END="$(end_of_month)"
teen_current_month="$(request_json GET "/tasks?startDate=${MONTH_START}&endDate=${MONTH_END}" "$TEEN_TOKEN")"
assert_ge "$(jq_value "$teen_current_month" 'length')" "2" "Teen tasks in current month"

teen_connect_status="$(request_json GET "/billing/connect/status" "$TEEN_TOKEN")"
assert_nonempty "$(jq_value "$teen_connect_status" '.hasConnectAccount')" "Teen connect status response"

log_step "Homeowner dashboard-facing checks before task completion"
homeowner_homes="$(request_json GET "/homes/my-homes" "$HOMEOWNER_TOKEN")"
assert_ge "$(jq_value "$homeowner_homes" 'length')" "1" "Homeowner homes count"

home_services="$(request_json GET "/homes/${HOME_ID}/services" "$HOMEOWNER_TOKEN")"
assert_ge "$(jq_value "$home_services" 'length')" "1" "Home services count"

usage_before_completion="$(request_json GET "/billing/usage/${HOME_ID}" "$HOMEOWNER_TOKEN")"
assert_eq "$(jq_value "$usage_before_completion" '.usage')" "0" "Usage before task completion"

log_step "Teen completes one task"
complete_task_response="$(request_form POST "/tasks/${TASK_ONE_ID}/complete" "$TEEN_TOKEN" \
  -F "notes=Completed by API flow ${RUN_ID}" \
  -F "photoUrl=${PHOTO_URL}")"
assert_eq "$(jq_value "$complete_task_response" '.status')" "completed" "Completed task status"

log_step "Post-completion verification"
completed_tasks_for_service="$(request_json GET "/services/${SERVICE_ID}/tasks/completed" "$HOMEOWNER_TOKEN")"
assert_ge "$(jq_value "$completed_tasks_for_service" 'length')" "1" "Completed service tasks count"

service_stats="$(request_json GET "/services/${SERVICE_ID}/stats" "$HOMEOWNER_TOKEN")"
assert_ge "$(jq_value "$service_stats" '.completed_tasks')" "1" "Service stats completed tasks"
assert_ge "$(jq_value "$service_stats" '.pending_tasks')" "1" "Service stats pending tasks"

teen_completed_this_month="$(request_json GET "/tasks?status=completed&startDate=${MONTH_START}&endDate=${MONTH_END}" "$TEEN_TOKEN")"
assert_ge "$(jq_value "$teen_completed_this_month" 'length')" "1" "Teen completed tasks this month"

teen_payment_summary="$(request_json GET "/payments/summary?startDate=${MONTH_START}&endDate=${MONTH_END}" "$TEEN_TOKEN")"
assert_ge "$(jq_value "$teen_payment_summary" '.pending_payments')" "1" "Teen pending payments"

teen_earnings="$(request_json GET "/earnings/current-period" "$TEEN_TOKEN")"
assert_ge "$(jq_value "$teen_earnings" '.pending_amount')" "0" "Teen pending earnings amount"

usage_after_completion="$(request_json GET "/billing/usage/${HOME_ID}" "$HOMEOWNER_TOKEN")"
assert_ge "$(jq_value "$usage_after_completion" '.usage')" "1" "Usage after task completion"

echo
echo "Flow verification complete."
echo "Run id:           ${RUN_ID}"
echo "Teen email:       ${TEEN_EMAIL}"
echo "Teen id/code:     ${TEEN_ID} / ${TEEN_CODE}"
echo "Homeowner email:  ${HOMEOWNER_EMAIL}"
echo "Home id:          ${HOME_ID}"
echo "Service id:       ${SERVICE_ID}"
echo "Tasks:            ${TASK_ONE_ID}, ${TASK_TWO_ID}"
