# End-to-End Manual Testing Guide

This guide walks through step-by-step manual testing of **KisanDirect AI** across all supported roles and operational views: **Consumer**, **Farmer**, **Rider**, **Admin**, and **Hub Staff**.

All workflows described here reflect the actual routes, UI controls, and backend behaviors implemented in the platform.

---

## Prerequisites & Environment Setup

### 1. Backend Service
Ensure PostgreSQL and PostGIS are running, migrations are applied to `kisandirect`, and the backend server is active:
```powershell
cd backend
..\venv\Scripts\python.exe -m alembic upgrade head
cd ..
.\venv\Scripts\python.exe -m backend.run
```
*Health check:* Visit `http://127.0.0.1:8000/health` (should return `{"status":"ok"}`).  
*API documentation:* `http://127.0.0.1:8000/docs`.

### 2. Frontend Development Server
In a separate terminal:
```powershell
cd frontend
npm run dev
```
*Frontend URL:* `http://localhost:5173`.

### 3. Bootstrap Seed Data (Optional but Recommended)
To populate baseline hubs, crops, farmers, and users:
```powershell
python scripts/seed_data.py
```
To bootstrap an administrator account interactively:
```powershell
python scripts/create_admin.py
```

> [!NOTE]
> **Browser Session Isolation**: Testing multi-role interactions (e.g. Farmer submitting stock, Hub Staff receiving, Consumer purchasing, Rider delivering, Admin supervising) requires separate user sessions. Use **different browser profiles** or **incognito/private browsing windows** for each role to prevent overwriting session tokens in `localStorage`.

---

## Role & Permission Summary

| Role | Registration Method | Default State | Initial Route | Key Capabilities |
|---|---|---|---|---|
| **CONSUMER** | Public `/register` (Select "Consumer") | Active immediately | `/` (Marketplace) | Browse crops, nearby farmer map, cart, hub checkout, sandbox payment, live tracking with OTP, reviews. |
| **FARMER** | Public `/register` (Select "Farmer") | Active immediately | `/farmer/dashboard` | Manage crops, upload images, AI quality/price queries, submit stock delivery to hubs, manage orders. |
| **RIDER** | Public `/register` (Select "Delivery rider") | `PENDING_APPROVAL`, `OFFLINE` | `/rider/dashboard` | Awaits admin approval. Once approved: toggle online, share browser GPS, accept/decline offers, progress delivery (`PICKED_UP`, `OUT_FOR_DELIVERY`, `ARRIVED`), verify delivery OTP. |
| **HUB_STAFF** | **Admin creation only** (`/admin/hub-staff`) | Assigned to specific hub(s) | `/hub-staff/operations` | Receive farmer stock deliveries into hub inventory, start order packing, mark packing shipments ready for pickup. *(No public self-registration).* |
| **ADMIN** | Bootstrap script (`scripts/create_admin.py`) | Active | `/admin/dashboard` | System metrics, user activation, rider approval/suspension, hub creation/editing, hub staff account creation/assignments, shipment reassignment/cancellation, delivery OTP lockout reset. |

---

## Complete End-to-End Real Workflow (Happy Path)

### Step 1: Administrator Prepares Hub & Staff
1. **Admin Login**:
   - Navigate to `http://localhost:5173/admin/login`.
   - Log in with administrator credentials.
   - Redirects to `/admin/dashboard`.
2. **Verify or Create Hub**:
   - In sidebar, click **Hubs** (`/admin/hubs`).
   - If no active hub exists near your testing coordinates:
     - Click **Use current location** (or click on the map to place a pin).
     - Enter Hub Name (e.g. `Downtown Kisan Hub`), Address, Pincode, and Service Radius (default `8` km).
     - Click **Save Hub**. Verify it appears with `ACTIVE` badge.
3. **Provision Hub Staff Account**:
   - In sidebar, click **Hub staff** (`/admin/hub-staff`).
   - Under *Create hub staff account*, enter:
     - Email: `hubstaff1@kisan.direct`
     - Initial password: `Password123!`
     - Assign to hub: Select the active hub created/verified above.
   - Click **Create account**. Verify the staff member appears in the list with their assigned hub.

---

### Step 2: Farmer Lists Crop & Supplies Hub Stock
1. **Farmer Registration / Login**:
   - Open an incognito browser window. Navigate to `/register`.
   - Select account type **Farmer**, provide email (e.g. `farmer1@kisan.direct`) and password, click **Register**.
   - Log in at `/login`. Redirects to `/farmer/dashboard`.
2. **Add Crop Listing**:
   - In navbar, click **My Crops** (`/farmer/crops`), then click **+ Add New Crop** (`/farmer/crops/new`).
   - **Step 1 (Crop Details)**: Enter Crop Name (e.g. `Fresh Organic Spinach`), Category (`Vegetables`), Variety, Quantity (`100`), Unit (`kg`), Asking Price (`40.00`), Farm Location (e.g., `12.9716, 77.5946`), Description.
   - Click **Next: Upload Images** (optional: upload a crop image).
   - Advance through **AI Quality** and **AI Price** (honestly reports unavailable if models are not configured), then **Review** and click **Publish Listing**.
   - Verify listing appears active in `/farmer/crops`.
3. **Submit Stock Delivery to Hub**:
   - In navbar, click **Orders** (`/farmer/orders`).
   - Scroll to **Farmer-to-Hub Stock Delivery**.
   - Select your crop listing (`Fresh Organic Spinach`), select the target Hub, enter Quantity (`50`), and click **Submit Delivery**.
   - Verify the delivery record appears in the history table under status `PENDING`.

---

### Step 3: Hub Staff Receives Inventory
1. **Hub Staff Login**:
   - Open a third browser window/profile. Navigate to `/login`.
   - Enter credentials created by admin (`hubstaff1@kisan.direct` / `Password123!`).
   - Redirects to `/hub-staff/operations`.
2. **Receive Stock Delivery**:
   - Select the assigned hub from the dropdown if multiple.
   - In the **Incoming farmer stock deliveries** table, locate the pending delivery from `farmer1`.
   - Click **Receive delivery**.
   - Verify the button changes to *Saving...*, the table clears the incoming row, and hub inventory is incremented.

---

### Step 4: Admin Approves Delivery Rider
1. **Rider Registration**:
   - Open a fourth browser window/profile. Navigate to `/register`.
   - Select account type **Delivery rider**, enter display name (e.g. `Ravi Kumar`), email (`rider1@kisan.direct`), password.
   - Click **Register**, then log in at `/login`.
   - On `/rider/dashboard`, observe status banner: **Registration pending approval**. Rider cannot toggle online yet.
2. **Admin Approves Rider**:
   - In the Admin browser window, click **Riders** (`/admin/riders`).
   - Locate `Ravi Kumar` with status `PENDING APPROVAL`.
   - Enter an audit reason in the reason input (e.g. `Verified documents and onboarding`).
   - Click **Approve**. Verify status updates to `APPROVED`.
3. **Rider Goes Online & Shares Location**:
   - In the Rider window, refresh or observe `/rider/dashboard`. The pending banner disappears.
   - Click **Go online**.
   - Allow browser Geolocation permission when prompted.
   - Verify availability changes to `AVAILABLE` and location sharing is active.

---

### Step 5: Consumer Browses, Carts, and Checks Out
1. **Consumer Registration / Login**:
   - Open a fifth browser window/profile. Navigate to `/register`.
   - Select **Consumer**, enter credentials (`consumer1@kisan.direct`), register and log in.
   - Land on Marketplace (`/`).
2. **Add to Cart**:
   - Locate `Fresh Organic Spinach`. Click **Add to cart** (or open product detail at `/p/:id` and click *Add to cart*).
   - In navbar, click **Cart** (`/cart`). Verify item, quantity, and price.
3. **Hub Checkout**:
   - Click **Proceed to checkout** (`/checkout`).
   - Click **Use current location** (or allow browser location). The app queries `GET /api/v1/checkout/options` based on coordinates.
   - Verify the nearby active hub appears and is marked available.
   - Select a Delivery Slot (e.g. Standard 45–90 min delivery or scheduled window).
   - Enter a delivery address (minimum 5 characters, e.g. `Flat 402, Green Valley Apartments, MG Road`).
   - Click **Reserve & Place Order**.
   - On successful reservation, the test payment panel appears.
4. **Sandbox Payment**:
   - In the Sandbox Payment panel, select `TEST_SANDBOX` payment method (or COD).
   - Click **Pay ₹...**.
   - On success, the order transitions to `CONFIRMED` and reserves the hub stock permanently.
   - Click **Track order** or navigate to `/orders`.

---

### Step 6: Hub Staff Packs Order & Marks Ready
1. In the **Hub Staff** window (`/hub-staff/operations`):
   - Under **Orders to pack**, observe the consumer's new order.
   - Click **Start packing**. The order transitions to `PROCESSING` and creates a `PACKING` shipment.
   - Under **Packing shipments**, locate the shipment.
   - Click **Mark ready for pickup**.
   - The shipment transitions to `READY_FOR_PICKUP` and cascades order status to `SHIPPED`.

---

### Step 7: Rider Receives Offer, Transits, and Arrives
1. **Rider Receives Offer**:
   - In the **Rider** window (`/rider/dashboard`), the polling mechanism detects the nearby ready shipment.
   - An offer card appears showing Hub pickup address, delivery drop-off, and distance.
   - Click **Accept delivery offer**.
   - Shipment status becomes `RIDER_ASSIGNED`; Rider availability transitions to `BUSY`.
2. **Pickup & Transit**:
   - Click **Confirm pickup from hub**. Shipment transitions to `PICKED_UP`.
   - Click **Start delivery to customer**. Shipment transitions to `OUT_FOR_DELIVERY`.
   - At this moment, the server generates a cryptographically hashed 6-digit delivery OTP for the consumer.
   - Click **Mark arrived at destination**. Shipment transitions to `ARRIVED`.

---

### Step 8: Consumer Receives OTP & Tracks Delivery
1. In the **Consumer** window (`/orders` or `/orders/:id`):
   - The live tracking screen updates every 7 seconds via polling.
   - Map displays Hub pickup point, Consumer drop-off point, and live Rider position (while fresh within 30s).
   - Notice the prominent OTP display: **Delivery OTP: XXXXXX** (e.g. `482910`).
   - Event timeline shows: Placed $\to$ Confirmed $\to$ Packing $\to$ Ready $\to$ Assigned $\to$ Picked up $\to$ Out for delivery $\to$ Arrived.

---

### Step 9: OTP Verification & Order Completion
1. **Rider Submits OTP**:
   - In the **Rider** window (`/rider/dashboard`), enter the 6-digit OTP displayed on the consumer's screen into the OTP input field.
   - *(If COD was chosen, click "Record cash collected" first).*
   - Click **Verify OTP & Complete Delivery**.
   - Rider receives confirmation toast: *Delivery completed successfully!*
   - Active delivery clears, and Rider availability returns to `AVAILABLE`.
2. **Consumer Confirmation & Review**:
   - In the Consumer tracking window, status updates to **Delivered**.
   - Consumer clicks order completion / receives confirmation.
   - Scroll down to the **Reviews** link (`/p/:id`).
   - Click the link, submit a 5-star rating and comment (e.g. `Crisp and fresh farm spinach!`).
   - Verify the review is saved and displayed on the crop listing.

---

### Step 10: Admin Operational Audit & Metrics
1. In the **Admin** window:
   - Navigate to **Delivery operations** (`/admin/delivery`). Verify the shipment shows status `DELIVERED`, rider name `Ravi Kumar`, and drop-off timestamp.
   - Navigate to **Dashboard** (`/admin/dashboard`) and **Analytics** (`/admin/analytics`).
   - Verify that **Total orders**, **Completed orders**, and **Total sales / payment volume** reflect the completed transaction.
   - Verify **Active shipments** has returned to `0` and **Failed deliveries** is `0`.

---

## Negative-Path & Edge-Case Manual Checks

### 1. Consumer Order Cancellation
- **Steps**:
  1. As a Consumer, place an order through `/checkout` and complete payment.
  2. While the order is still `PENDING` or `CONFIRMED` (before packing starts), open Tracking at `/orders/:id`.
  3. Click **Cancel order**. Confirm the browser confirmation prompt.
- **Expected Result**:
  - Order transitions to `CANCELLED`.
  - For sandbox payments, payment status transitions to `REFUNDED`.
  - Stock hold/reservation is released back to hub inventory.
  - Tracking displays order cancelled; cancellation button disappears.

### 2. Farmer / Hub Staff Order Rejection
- **Steps**:
  1. Place an order containing a farmer's crop.
  2. As the Farmer (`/farmer/orders`) or assigned Hub Staff (`/hub-staff/operations`), locate the order before dispatch.
  3. Invoke order cancellation.
- **Expected Result**:
  - A cancellation reason is required.
  - Order transitions to `CANCELLED` with audit event recording actor and reason.
  - Shipment transitions to `CANCELLED`.

### 3. Last-Unit Stock Contention
- **Precondition**: Listing has only 2 kg in hub stock.
- **Steps**:
  1. Open two separate consumer sessions (Browser A and Browser B).
  2. Both add 2 kg of the crop to their cart.
  3. Both proceed to `/checkout` at the same time.
  4. Browser A clicks **Reserve & Place Order** first.
  5. Browser B immediately clicks **Reserve & Place Order**.
- **Expected Result**:
  - Browser A succeeds and reserves the 2 kg hold.
  - Browser B receives an error banner: *Selected items are no longer available in the requested quantity* (HTTP 409 Conflict).
  - Hub stock cannot be oversold.

### 4. Mixed-Hub Cart Prevention
- **Steps**:
  1. Hub A has Listing 1. Hub B has Listing 2.
  2. Attempt to check out with items that cannot be fulfilled by a single Kisan Hub within delivery radius.
- **Expected Result**:
  - Checkout options endpoint and UI restrict selection to a single hub. Multi-hub cart fulfillment is rejected.

### 5. Out-of-Area Checkout Rejection
- **Steps**:
  1. Add items to cart and go to `/checkout`.
  2. Simulate or enter coordinates far outside any active hub's service radius (e.g. coordinates in another state or country).
- **Expected Result**:
  - UI displays *No Kisan Hub currently serves your delivery location*.
  - Checkout order button remains disabled. Direct API submissions return HTTP 400/422.

### 6. OTP Lockout and Admin Reset
- **Steps**:
  1. Advance an order to `OUT_FOR_DELIVERY` / `ARRIVED`.
  2. In the Rider window, enter an **incorrect OTP** (e.g. `000000`) and submit.
  3. Repeat incorrect submissions up to `OTP_MAX_ATTEMPTS` (configured default: 5 attempts).
  4. On the 5th failed attempt, observe the lockout error message.
  5. Attempt to enter the **actual, correct OTP** in the rider screen.
- **Expected Result**:
  - The correct OTP is **still rejected** because the shipment is locked.
  - Delivery cannot proceed.
  - Open the Admin Delivery screen (`/admin/delivery`). Locate the shipment.
  - An amber **Reset OTP** button appears next to the locked shipment.
  - Enter an audit reason (e.g. `Customer forgot code and verified identity via phone call`) and click **Reset OTP**.
  - A new OTP is generated and delivered to the consumer's tracking screen; failed attempt counter resets to 0.
  - Rider enters the newly issued OTP and successfully completes delivery.

### 7. Cross-Consumer Tracking Privacy
- **Steps**:
  1. Log in as Consumer B.
  2. Attempt to open Consumer A's tracking page directly by navigating to `/orders/<order_id_of_consumer_a>`.
- **Expected Result**:
  - The API rejects the request with HTTP 403 / 404.
  - Tracking details, rider location, and consumer delivery OTP are never exposed to uninvolved users.

### 8. Rider Offer Race / Concurrency
> [!NOTE]
> *Multiple Riders / Emulation Check*:
> In a multi-rider environment where two riders are online near the hub, offers are issued sequentially to the nearest rider with a timeout (`RIDER_OFFER_TIMEOUT_SECONDS`). If Rider 1 declines or the offer expires, it advances to Rider 2. A rider who attempts to accept an expired or already-claimed offer receives an error; the database row lock prevents double-assignment.

---

## Limitations & Manual Testing Boundaries

1. **Payment Gateway**: KisanDirect AI uses a deterministic `TEST_SANDBOX` flow. Do not test real debit cards, credit cards, or UPI handles.
2. **SMS Delivery**: Delivery OTP is displayed in-app on the authenticated consumer's tracking page and in-app notifications. No external SMS gateway is configured.
3. **AI Models**: Crop quality assessment and fair price recommendation boundaries report `MODEL_UNAVAILABLE` when local model artifact files are not placed in the artifact path.
4. **GPS Emulation**: Browser Geolocation permissions must be granted for rider location polling and hub location pickers. In automated or headless environments, use Chrome DevTools Sensors to emulate GPS coordinates.

