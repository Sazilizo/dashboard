import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import useToast from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import WorkerBiometrics from "../components/biometrics/WorkerBiometrics";
import useOfflineTable from "../hooks/useOfflineTable";
import { getCachedImagesByEntity } from "../utils/imageCache";
import { cacheUserImages } from "../utils/proactiveImageCache";

const stageEnum = {
  credentials: "credentials",
  biometric: "biometric",
  choice: "choice",
  kiosk: "kiosk",
};

function useWorkerAttendance(workerId) {
  const filter = workerId ? { worker_id: workerId } : {};
  const { rows, addRow, updateRow, isOnline } = useOfflineTable(
    "worker_attendance_records",
    filter,
    "*",
    60,
    "id",
    "desc"
  );
  const today = new Date().toISOString().split("T")[0];
  const open = useMemo(
    () =>
      Array.isArray(rows)
        ? rows.find((r) => r.worker_id === workerId && r.date === today && !r.sign_out_time)
        : null,
    [rows, workerId, today]
  );
  return { rows, addRow, updateRow, isOnline, open, today };
}

export default function Kiosk() {
  const navigate = useNavigate();
  const { toasts, showToast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(stageEnum.credentials);
  const [profile, setProfile] = useState(null);
  const [worker, setWorker] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [cachedImg, setCachedImg] = useState(null);
  const [pendingPassword, setPendingPassword] = useState("");
  const [showPasswordGate, setShowPasswordGate] = useState(false);

  const workerId = profile?.worker_id || worker?.id || null;
  const { addRow, updateRow, open, isOnline } = useWorkerAttendance(workerId);

  useEffect(() => {
    return () => {
      if (cachedImg) URL.revokeObjectURL(cachedImg);
    };
  }, [cachedImg]);

  const loadPreview = async (entityId) => {
    try {
      const imgs = await getCachedImagesByEntity(entityId);
      if (imgs && imgs.length) {
        const first = imgs[0];
        const url = URL.createObjectURL(first.blob);
        setCachedImg(url);
      }
    } catch (e) {
      /* ignore */
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const email = form.email.trim();
      const password = form.password;
      const { data, error: signErr } = await api.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      const { data: { user } } = await api.auth.getUser();
      setAuthUser(user);

      const { data: prof } = await api
        .from("profiles")
        .select("id, worker_id, school_id, roles:role_id(name), first_name, last_name")
        .eq("auth_uid", user.id)
        .maybeSingle();

      if (!prof?.id) throw new Error("Profile not found for this account");
      setProfile(prof);
      setPendingPassword(password);
      cacheUserImages(prof.id).catch(() => {});
      loadPreview(prof.id).catch(() => {});

      if (prof.worker_id) {
        try {
          const { data: workerRow } = await api
            .from("workers")
            .select("id, name, last_name")
            .eq("id", prof.worker_id)
            .maybeSingle();
          if (workerRow) setWorker(workerRow);
        } catch (e) {
          /* ignore */
        }
      }

      setStage(stageEnum.biometric);
      setLoading(false);
    } catch (err) {
      setError(err?.message || "Login failed");
      setLoading(false);
    }
  };

  const markSignIn = async () => {
    if (!workerId) {
      showToast("No worker profile linked.", "error");
      return;
    }
    const nowIso = new Date().toISOString();
    const payload = {
      worker_id: workerId,
      school_id: profile?.school_id || null,
      date: nowIso.split("T")[0],
      sign_in_time: nowIso,
      description: "kiosk biometric sign-in",
      recorded_by: authUser?.id || null,
    };
    const res = await addRow(payload);
    if (res?.__error) {
      showToast("Sign-in queued offline.", "warning");
    } else {
      showToast(isOnline ? "Signed in." : "Sign-in cached offline.", isOnline ? "success" : "info");
    }
  };

  const markSignOut = async () => {
    if (!workerId) {
      showToast("No worker profile linked.", "error");
      return;
    }
    const nowIso = new Date().toISOString();
    if (open?.id) {
      let hours = null;
      try {
        if (open.sign_in_time) {
          const dur = new Date(nowIso) - new Date(open.sign_in_time);
          hours = Number((dur / (1000 * 60 * 60)).toFixed(2));
        }
      } catch (e) { /* ignore */ }
      const res = await updateRow(open.id, { sign_out_time: nowIso, hours, description: "kiosk biometric sign-out" });
      if (res?.__error) {
        showToast("Sign-out queued offline.", "warning");
      } else {
        showToast(isOnline ? "Signed out." : "Sign-out queued offline.", isOnline ? "success" : "info");
      }
    } else {
      const res = await addRow({
        worker_id: workerId,
        school_id: profile?.school_id || null,
        date: nowIso.split("T")[0],
        sign_out_time: nowIso,
        description: "kiosk biometric sign-out",
        recorded_by: authUser?.id || null,
      });
      if (res?.__error) {
        showToast("Sign-out queued offline.", "warning");
      } else {
        showToast(isOnline ? "Sign-out recorded." : "Sign-out queued offline.", isOnline ? "success" : "info");
      }
    }
  };

  const handleBiometricSuccess = () => {
    setStage(stageEnum.choice);
  };

  const proceedToKiosk = () => setStage(stageEnum.kiosk);

  const proceedToDashboard = () => setShowPasswordGate(true);

  const renderChoice = () => (
    <div className="biometric-modal-overlay">
      <div className="biometric-modal" style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>Choose an action</h3>
        <p style={{ color: "#475569", marginBottom: 12 }}>Face verified. What would you like to do?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="btn btn-primary" onClick={proceedToKiosk}>Proceed to sign in/out</button>
          <button className="btn btn-secondary" onClick={proceedToDashboard}>Proceed to dashboard</button>
        </div>
      </div>
    </div>
  );

  const renderPasswordGate = () => (
    <div className="biometric-modal-overlay">
      <div className="biometric-modal" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Confirm to open dashboard</h3>
        <p style={{ color: "#475569", marginBottom: 12 }}>Re-enter your password to continue.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: "0.9rem" }}>Password</label>
          <input
            type="password"
            value={pendingPassword}
            onChange={(e) => setPendingPassword(e.target.value)}
            style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={() => setShowPasswordGate(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  const email = form.email.trim();
                  const password = pendingPassword || form.password;
                  const { error: signErr } = await api.auth.signInWithPassword({ email, password });
                  if (signErr) throw signErr;
                  navigate("/dashboard", { replace: true });
                } catch (err) {
                  showToast(err?.message || "Password required to continue.", "error", 4000);
                }
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderKioskCard = () => {
    const fullName = `${worker?.name || profile?.first_name || ""} ${worker?.last_name || profile?.last_name || ""}`.trim();
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
          <div style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {cachedImg ? (
              <img src={cachedImg} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{fullName ? fullName[0] : "?"}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{fullName || "Worker"}</div>
            <div style={{ color: "#475569" }}>Worker ID: {workerId || "n/a"}</div>
            <div style={{ color: open ? "#059669" : "#dc2626", marginTop: 4 }}>
              Status: {open ? "Signed in" : "Signed out"}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              {!open && <button className="btn btn-primary" onClick={markSignIn}>Sign in</button>}
              {open && <button className="btn btn-secondary" onClick={markSignOut}>Sign out</button>}
              <button className="btn" onClick={proceedToDashboard}>Proceed to dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="login-container" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {stage === stageEnum.credentials && (
        <form className="login-box login-form" onSubmit={handleSubmit} style={{ maxWidth: 420, width: "100%" }}>
          <h2>Kiosk sign in/out</h2>
          <p style={{ color: "#475569", marginTop: -6 }}>Verify by password then face to continue.</p>
          <div>
            <label>Email:</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Password:</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          {error && <div style={{ color: "red" }}>{error}</div>}
          <button type="submit" disabled={loading}>{loading ? "Checking..." : "Continue"}</button>
        </form>
      )}

      {stage === stageEnum.biometric && profile && (
        <WorkerBiometrics
          profile={profile}
          requireMatch={true}
          onSuccess={handleBiometricSuccess}
          onCancel={() => { setStage(stageEnum.credentials); api.auth.signOut(); }}
        />
      )}

      {stage === stageEnum.choice && renderChoice()}

      {stage === stageEnum.kiosk && renderKioskCard()}

      {showPasswordGate && renderPasswordGate()}
    </div>
  );
}
