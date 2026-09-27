"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Category = { id: number; name: string };
type Court = {
  id: number;
  name: string;
  capacity: number;
  status: "AVAILABLE" | "MAINTENANCE" | "CLOSED";
  category: Category;
  facility: { id: number; name: string; location: string; mapLink: string | null };
  availableSlots: string[];
};
type SessionUser = { id: number; fullName: string; email: string; role: string };
type Booking = {
  id: number;
  startAt: string;
  endAt: string;
  status: string;
  court: Court;
  user?: { id: number; fullName: string; email: string; role: string };
};
type ManagedUser = {
  id: number;
  studentId: string | null;
  fullName: string;
  email: string;
  role: "STUDENT" | "STAFF" | "ADMIN";
  active: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
const tones = ["blue", "gold", "green"];

function bangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload.data ?? payload;
}

export default function Home() {
  const [date, setDate] = useState(bangkokDate);
  const [categoryId, setCategoryId] = useState("all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState(DEMO_MODE ? "student@au.edu" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "Student123!" : "");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [managedBookings, setManagedBookings] = useState<Booking[]>([]);

  const loadCourts = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const query = new URLSearchParams({ date });
      if (categoryId !== "all") query.set("categoryId", categoryId);
      setCourts(await apiRequest(`/courts?${query}`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load courts");
    } finally {
      setLoading(false);
    }
  }, [categoryId, date]);

  const loadBookings = useCallback(async (authToken: string) => {
    const data = await apiRequest("/bookings/me", {
      headers: { authorization: `Bearer ${authToken}` },
    });
    setBookings(data);
  }, []);

  const loadManagedUsers = useCallback(async (authToken: string) => {
    const data = await apiRequest("/admin/users", {
      headers: { authorization: `Bearer ${authToken}` },
    });
    setManagedUsers(data);
  }, []);

  const loadManagedBookings = useCallback(async (authToken: string) => {
    const data = await apiRequest("/bookings", {
      headers: { authorization: `Bearer ${authToken}` },
    });
    setManagedBookings(data);
  }, []);

  useEffect(() => {
    apiRequest("/categories").then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // Initial and filter-driven loading intentionally synchronizes remote API state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCourts();
  }, [loadCourts]);

  const facilityCount = useMemo(() => new Set(courts.map((court) => court.facility.id)).size, [courts]);
  const availableCount = courts.filter((court) => court.availableSlots.length > 0).length;

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await loadCourts();
    document.querySelector("#availability")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      setUser(data.user);
      setLoginOpen(false);
      await loadBookings(data.token);
      if (data.user.role !== "STUDENT") await loadManagedBookings(data.token);
      if (data.user.role === "ADMIN") await loadManagedUsers(data.token);
      setNotice(`Welcome, ${data.user.fullName}. Choose a time to book.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Login failed");
    }
  }

  async function createBooking(court: Court, time: string) {
    if (!token) {
      setLoginOpen(true);
      setNotice("Sign in before booking a court.");
      return;
    }

    const start = new Date(`${date}T${time}:00+07:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    try {
      await apiRequest("/bookings", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courtId: court.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          purpose: "Student sports reservation",
        }),
      });
      setNotice(`${court.name} booked for ${time} on ${date}.`);
      await Promise.all([loadCourts(), loadBookings(token)]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Booking failed");
    }
  }

  async function cancelBooking(id: number) {
    try {
      await apiRequest(`/bookings/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      setNotice("Booking cancelled.");
      const refreshes = [loadBookings(token), loadCourts()];
      if (user?.role !== "STUDENT") refreshes.push(loadManagedBookings(token));
      await Promise.all(refreshes);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Cancellation failed");
    }
  }

  function signOut() {
    setToken("");
    setUser(null);
    setBookings([]);
    setManagedUsers([]);
    setManagedBookings([]);
    setNotice("Signed out.");
  }

  async function updateCourtStatus(court: Court) {
    const status = court.status === "AVAILABLE" ? "MAINTENANCE" : "AVAILABLE";
    try {
      await apiRequest(`/courts/${court.id}/status`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      setNotice(`${court.name} marked ${status.toLowerCase()}.`);
      await loadCourts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Court update failed");
    }
  }

  async function updateUserRole(id: number, role: ManagedUser["role"]) {
    try {
      await apiRequest(`/admin/users/${id}/role`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
      setNotice("User role updated.");
      await loadManagedUsers(token);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Role update failed");
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AU Campus Court home">
          <span className="brand-mark" aria-hidden="true">AU</span>
          <span><strong>Campus Court</strong><small>Sports facility booking</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#availability">Find a court</a>
          <a href="#bookings">My bookings</a>
          <a href="#support">Help</a>
        </nav>
        <button className="account-button" type="button" onClick={() => user ? signOut() : setLoginOpen(true)}>
          <span className="avatar">{user ? user.fullName.split(" ").slice(0, 2).map((part) => part[0]).join("") : "AU"}</span>
          <span className="account-copy">
            <strong>{user ? user.fullName : "Sign in"}</strong>
            <small>{user ? `${user.role.toLowerCase()} · Sign out` : "Student account"}</small>
          </span>
        </button>
      </header>

      {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Assumption University Sports</p>
          <h1>Book your court.<br />Keep your game moving.</h1>
          <p className="hero-intro">Check live availability, reserve a campus sports facility, and keep every booking in one place.</p>
          <div className="hero-meta" aria-label="Service highlights">
            <span><b>{courts.length || 5}</b> listed courts</span>
            <span><b>{facilityCount || 3}</b> campus facilities</span>
            <span><b>{availableCount}</b> available today</span>
          </div>
        </div>

        <form className="search-panel" onSubmit={handleSearch} aria-label="Search court availability">
          <div className="search-heading"><p>Quick availability</p><span>Bangkok time</span></div>
          <label>
            Sport
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="all">All sports</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="date-field">
            Date
            <input value={date} min={bangkokDate()} onChange={(event) => setDate(event.target.value)} type="date" />
          </label>
          <button className="primary-button" type="submit">Check available courts</button>
          <p className="search-note">Availability and bookings are now connected to the local MySQL database.</p>
        </form>
      </section>

      <section className="content-section" id="availability">
        <div className="section-heading">
          <div><p className="eyebrow">Availability for {date}</p><h2>Courts ready to book</h2></div>
          <span className="result-count">{loading ? "Checking…" : `${courts.length} courts found`}</span>
        </div>

        {loading ? (
          <div className="loading-state">Loading live court availability…</div>
        ) : courts.length === 0 ? (
          <div className="empty-state"><h3>No courts match this search</h3><p>Choose another sport or date and try again.</p></div>
        ) : (
          <div className="court-grid">
            {courts.map((court, index) => (
              <article className="court-card" key={court.id}>
                <div className={`court-visual ${tones[index % tones.length]}`}>
                  <span>{court.category.name}</span><div className="court-lines" aria-hidden="true" />
                </div>
                <div className="court-body">
                  <div className="court-title-row">
                    <div><p className="category">{court.category.name}</p><h3>{court.name}</h3></div>
                    <span className={`status ${court.status !== "AVAILABLE" ? "unavailable" : ""}`}><i /> {court.status === "AVAILABLE" ? "Open" : "Maintenance"}</span>
                  </div>
                  <p className="location">{court.facility.name} · Capacity {court.capacity}</p>
                  {court.facility.mapLink && <a className="map-link" href={court.facility.mapLink} target="_blank" rel="noreferrer">Open location in Google Maps ↗</a>}
                  <div className="slot-row" aria-label={`Available times for ${court.name}`}>
                    {court.availableSlots.length ? court.availableSlots.slice(0, 4).map((slot) => (
                      <button type="button" key={slot} onClick={() => createBooking(court, slot)}>{slot}</button>
                    )) : <span className="no-slots">No one-hour slots available</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="booking-section" id="bookings">
        <div className="section-heading booking-heading">
          <div><p className="eyebrow">Student dashboard</p><h2>My bookings</h2></div>
          {!user && <button className="secondary-button" type="button" onClick={() => setLoginOpen(true)}>Sign in to view bookings</button>}
        </div>
        {!user ? (
          <div className="booking-strip"><div><h2>Your reservations will appear here</h2><p>Sign in to view and manage your bookings.</p></div></div>
        ) : bookings.filter((booking) => booking.status !== "CANCELLED").length === 0 ? (
          <div className="booking-strip"><div><h2>No upcoming reservation</h2><p>Choose an available time above to create your first booking.</p></div><a className="secondary-button" href="#availability">Browse availability</a></div>
        ) : (
          <div className="booking-list">
            {bookings.filter((booking) => booking.status !== "CANCELLED").map((booking) => (
              <article key={booking.id} className="booking-row">
                <div className="booking-date"><strong>{new Date(booking.startAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Bangkok" })}</strong><span>{new Date(booking.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</span></div>
                <div><p>{booking.court.category.name}</p><h3>{booking.court.name}</h3><span>{booking.court.facility.name}</span></div>
                <button type="button" className="cancel-button" onClick={() => cancelBooking(booking.id)}>Cancel booking</button>
              </article>
            ))}
          </div>
        )}
      </section>

      {user && user.role !== "STUDENT" && (
        <section className="management-section" id="management">
          <div className="section-heading">
            <div><p className="eyebrow">Role based access</p><h2>{user.role === "ADMIN" ? "Administrator controls" : "Staff court controls"}</h2></div>
            <span className="role-badge">{user.role}</span>
          </div>
          <div className="management-grid">
            <article className="management-card">
              <h3>Court operating status</h3>
              <p>Mark courts unavailable during maintenance and reopen them when ready.</p>
              <div className="management-list">
                {courts.map((court) => (
                  <div key={court.id}>
                    <span><strong>{court.name}</strong><small>{court.facility.name} · {court.status}</small></span>
                    <button type="button" onClick={() => updateCourtStatus(court)}>{court.status === "AVAILABLE" ? "Set maintenance" : "Reopen court"}</button>
                  </div>
                ))}
              </div>
            </article>
            <article className="management-card">
              <h3>Reservation records</h3>
              <p>Review recent reservations and cancel a booking when operational action is required.</p>
              <div className="management-list booking-management-list">
                {managedBookings.length === 0 ? <span className="no-managed-records">No reservation records yet.</span> : managedBookings.slice(0, 8).map((booking) => (
                  <div key={booking.id}>
                    <span><strong>{booking.court.name}</strong><small>{booking.user?.fullName} · {new Date(booking.startAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })} · {booking.status}</small></span>
                    {booking.status !== "CANCELLED" && <button type="button" onClick={() => cancelBooking(booking.id)}>Cancel</button>}
                  </div>
                ))}
              </div>
            </article>
            {user.role === "ADMIN" && (
              <article className="management-card">
                <h3>User roles</h3>
                <p>Assign Student, Staff, and Administrator permissions.</p>
                <div className="management-list user-list">
                  {managedUsers.map((managedUser) => (
                    <div key={managedUser.id}>
                      <span><strong>{managedUser.fullName}</strong><small>{managedUser.email}</small></span>
                      <select value={managedUser.role} onChange={(event) => updateUserRole(managedUser.id, event.target.value as ManagedUser["role"])} aria-label={`Role for ${managedUser.fullName}`}>
                        <option value="STUDENT">Student</option><option value="STAFF">Staff</option><option value="ADMIN">Administrator</option>
                      </select>
                    </div>
                  ))}
                </div>
              </article>
            )}
          </div>
        </section>
      )}

      <footer id="support"><p><strong>AU Campus Court</strong></p><p>Need help? Contact the university sports office.</p></footer>

      {loginOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setLoginOpen(false); }}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <button className="modal-close" type="button" onClick={() => setLoginOpen(false)} aria-label="Close sign in">×</button>
            <p className="eyebrow">Account access</p>
            <h2 id="login-title">Student sign in</h2>
            <p className="modal-intro">{DEMO_MODE ? "Use a seeded demo account below." : "Sign in with an account provided by the court administrator."}</p>
            <form onSubmit={handleLogin}>
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              <button className="primary-button" type="submit">Sign in</button>
            </form>
            {DEMO_MODE && <div className="demo-credentials">
              <span>Demo accounts use password Student123!</span>
              <button type="button" onClick={() => { setEmail("student@au.edu"); setPassword("Student123!"); }}>student@au.edu</button>
              <button type="button" onClick={() => { setEmail("staff@au.edu"); setPassword("Student123!"); }}>staff@au.edu</button>
              <button type="button" onClick={() => { setEmail("admin@au.edu"); setPassword("Student123!"); }}>admin@au.edu</button>
            </div>}
          </section>
        </div>
      )}
    </main>
  );
}
