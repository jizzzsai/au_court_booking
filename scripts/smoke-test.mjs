import assert from "node:assert/strict";

const api = process.env.API_URL ?? "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json();
  return { response, body };
}

const health = await request("/health");
assert.equal(health.response.status, 200);
assert.equal(health.body.status, "healthy");

const courts = await request("/courts?date=2026-09-18");
assert.equal(courts.response.status, 200);
assert.ok(courts.body.data.length >= 3);
assert.ok(courts.body.data[0].availableSlots.length > 0);

const login = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "student@au.edu", password: "Student123!" }),
});
assert.equal(login.response.status, 200);
const token = login.body.data.token;
const auth = { authorization: `Bearer ${token}` };

const bookingInput = {
  courtId: courts.body.data[0].id,
  startAt: "2026-09-18T10:00:00+07:00",
  endAt: "2026-09-18T11:00:00+07:00",
  purpose: "Local API smoke test",
};
const created = await request("/bookings", {
  method: "POST",
  headers: auth,
  body: JSON.stringify(bookingInput),
});
assert.equal(created.response.status, 201);

const overlap = await request("/bookings", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ ...bookingInput, startAt: "2026-09-18T10:30:00+07:00", endAt: "2026-09-18T11:30:00+07:00" }),
});
assert.equal(overlap.response.status, 409);

const mine = await request("/bookings/me", { headers: auth });
assert.equal(mine.response.status, 200);
assert.ok(mine.body.data.some((booking) => booking.id === created.body.data.id));

const cancelled = await request(`/bookings/${created.body.data.id}`, { method: "DELETE", headers: auth });
assert.equal(cancelled.response.status, 200);
assert.equal(cancelled.body.data.status, "CANCELLED");

const blockedPeer = await request("/peer/availability?date=2026-09-18", { headers: { "x-api-key": "wrong" } });
assert.equal(blockedPeer.response.status, 401);

const peer = await request("/peer/availability?date=2026-09-18", { headers: { "x-api-key": "local-peer-key" } });
assert.equal(peer.response.status, 200);
assert.ok(peer.body.data.length >= 3);

const staffLogin = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "staff@au.edu", password: "Student123!" }),
});
assert.equal(staffLogin.response.status, 200);
const staffAuth = { authorization: `Bearer ${staffLogin.body.data.token}` };
const allBookings = await request("/bookings", { headers: staffAuth });
assert.equal(allBookings.response.status, 200);
const maintenance = await request(`/courts/${courts.body.data[0].id}/status`, {
  method: "PATCH",
  headers: staffAuth,
  body: JSON.stringify({ status: "MAINTENANCE" }),
});
assert.equal(maintenance.response.status, 200);
await request(`/courts/${courts.body.data[0].id}/status`, {
  method: "PATCH",
  headers: staffAuth,
  body: JSON.stringify({ status: "AVAILABLE" }),
});

const adminLogin = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "admin@au.edu", password: "Student123!" }),
});
assert.equal(adminLogin.response.status, 200);
const adminAuth = { authorization: `Bearer ${adminLogin.body.data.token}` };
const users = await request("/admin/users", { headers: adminAuth });
assert.equal(users.response.status, 200);
assert.ok(users.body.data.length >= 3);
const selfRoleChange = await request(`/admin/users/${adminLogin.body.data.user.id}/role`, {
  method: "PATCH",
  headers: adminAuth,
  body: JSON.stringify({ role: "STUDENT" }),
});
assert.equal(selfRoleChange.response.status, 400);

console.log("Smoke test passed: student booking, conflicts, cancellation, staff controls, admin controls, and peer API.");
