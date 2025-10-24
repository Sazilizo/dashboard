export default function SessionDistributionForm() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const { addRow } = useOfflineTable("academic_session_participants");

  const [students, setStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [studentMap, setStudentMap] = useState({});
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [activePhase, setActivePhase] = useState(null); // "start" | "end"
  const [pendingSignIns, setPendingSignIns] = useState({});
  const [selectedGrade, setSelectedGrade] = useState("");

  const gradeOptions = [
    "R1", "R2", "R3",
    ...Array.from({ length: 7 }, (_, i) => {
      const grade = i + 1;
      return ["A", "B", "C", "D"].map(s => `${grade}${s}`);
    }).flat()
  ];

  // Load students & sessions
  useEffect(() => {
    (async () => {
      const sRes = await api.from("students").select("*");
      setStudents(sRes.data || []);
      setStudentMap(Object.fromEntries((sRes.data || []).map((s) => [s.id, s])));
      setSelectedStudentIds((sRes.data || []).map((s) => s.id));

      const sesRes = await api.from("academic_sessions").select("*").order("created_at", { ascending: false });
      setSessions(sesRes.data || []);
    })();
  }, []);

  // Filter students by session category
  const filteredStudents = selectedSession
    ? students.filter((s) => {
        const session = sessions.find((sess) => sess.id === selectedSession);
        return session ? s.category === session.category : true;
      })
    : students;

  // Handle student sign-out
  const handleSignOut = async (recognizedIds) => {
    const now = new Date().toISOString();
    for (const studentId of recognizedIds) {
      const pending = pendingSignIns[studentId];
      if (!pending) continue;

      const durationHours = ((new Date(now) - new Date(pending.startTime)) / (1000 * 60 * 60)).toFixed(2);
      await addRow({
        id: pending.tempId,
        end_time: now,
        duration_hours: durationHours,
        _update: true,
        note: "biometric end",
        grade: selectedGrade || null
      });

      setPendingSignIns((prev) => {
        const copy = { ...prev };
        delete copy[studentId];
        return copy;
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex gap-2">
        <Link to="/dashboard/students" className="btn btn-primary">Back</Link>
        <Link to={`/dashboard/sessions/create`} className="btn btn-primary">Create Session</Link>
      </div>

      <FiltersPanel
        user={user}
        schools={schools}
        filters={filters}
        setFilters={setFilters}
        resource="students"
      />

      <h1 className="text-2xl font-bold">Distribute Session</h1>

      <select
        value={selectedSession}
        onChange={(e) => setSelectedSession(e.target.value)}
        className="w-full p-2 border rounded"
      >
        <option value="">-- Select a session --</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.session_name} ({s.date?.slice(0, 10)}) — {s.category}
          </option>
        ))}
      </select>

      <select
        value={selectedGrade}
        onChange={(e) => setSelectedGrade(e.target.value)}
        className="w-full p-2 border rounded mt-2"
      >
        <option value="">-- Select Grade (Optional) --</option>
        {gradeOptions.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>

      {filteredStudents.length > 0 && (
        <EntityMultiSelect
          label="Select Students"
          options={filteredStudents}
          value={selectedStudentIds.filter(id => filteredStudents.some(s => s.id === id))}
          onChange={setSelectedStudentIds}
        />
      )}

      {/* Start Session */}
      {selectedSession && !activePhase && (
        <button className="btn btn-success" onClick={() => setActivePhase("end")}>
          End Session
        </button>
      )}

      {/* End Session / Biometric Sign-Out */}
      {activePhase === "end" && (
        <BiometricsSignIn
          studentId={selectedStudentIds}
          schoolId={filteredStudents[0]?.school_id || null}
          bucketName="student-photos"
          folderName="faces"
          sessionType="academic_session_participants"
          onSignIn={handleSignOut}
        />
      )}
    </div>
  );
}
