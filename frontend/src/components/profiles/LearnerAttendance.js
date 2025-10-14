import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import api from "../../api/client";
import "../../styles/LearnerAttendance.css";
import imageCompression from "browser-image-compression";

export default function LearnerAttendanceCalendar() {
  const { id } = useParams(); 
  const [attendance, setAttendance] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [status, setStatus] = useState("present");
  const [note, setNote] = useState("");

  const publicHolidays = [
    "2025-01-01","2025-03-21","2025-04-18","2025-04-21","2025-04-27",
    "2025-05-01","2025-06-16","2025-08-09","2025-09-24","2025-12-16",
    "2025-12-25","2025-12-26"
  ];

  const schoolHolidays = [
    "2025-01-15","2025-03-28","2025-04-08","2025-06-27",
    "2025-07-22","2025-10-03","2025-10-13","2025-12-10"
  ];

  // Fetch attendance and sessions, auto-create attendance from sessions
  useEffect(() => {
    const fetchAttendanceAndSessions = async () => {
      const { data: attData } = await api
        .from("attendance_records")
        .select("*")
        .eq("student_id", id);

      const { data: academicSessions } = await api
        .from("academic_sessions")
        .select("date, session_name")
        .eq("student_id", id);

      const { data: peSessions } = await api
        .from("pe_sessions")
        .select("date, session_name")
        .eq("student_id", id);

      let combinedAttendance = attData || [];

      // Merge sessions as attendance if missing
      const allSessions = [...(academicSessions || []), ...(peSessions || [])];
      for (const s of allSessions) {
        if (!combinedAttendance.find((a) => a.date === s.date)) {
          combinedAttendance.push({
            student_id: id,
            date: s.date,
            status: "present",
            note: s.session_name,
          });
        }
      }

      setAttendance(combinedAttendance);
    };

    fetchAttendanceAndSessions();
  }, [id]);

  const school_id = attendance.length > 0 ? attendance[0].school_id : null;
  const handleSaveAttendance = async () => {
    if (!selectedDate) return;

    const existing = attendance.find((a) => a.date === selectedDate);

    if (existing) {
      const { data, error } = await api
        .from("attendance_records")
        .update({ status, note })
        .eq("id", existing.id);

      if (!error && data) {
        setAttendance(
          attendance.map((a) =>
            a.date === selectedDate ? { ...a, status, note } : a
          )
        );
      }
    } else {
      const { data, error } = await api.from("attendance_records").insert([
        { "student_id": id,"school_id":school_id, "date": selectedDate, "status":status,"note": note },
      ]);

      if (!error && data) setAttendance([...attendance, ...data]);
    }

    setSelectedDate(null);
    setNote("");
  };
  const generateEvents = () => {
  const eventsMap = {};
  attendance.forEach((a) => (eventsMap[a.date] = a));

  // Restrict to current month only
    const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1); 
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);


    const events = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const day = d.getDay();

      if (!eventsMap[dateStr] && (day === 0 || day === 6)) continue;

      let title = "";
      let color = "";
      let tooltip = "";

      if (publicHolidays.includes(dateStr)) {
        title = "Public Holiday";
        color = "#f59e0b";
        tooltip = "Public Holiday";
      } else if (schoolHolidays.includes(dateStr)) {
        title = "School Holiday";
        color = "#3b82f6";
        tooltip = "School Holiday";
      } else if (eventsMap[dateStr]) {
        title =
          eventsMap[dateStr].note ||
          (eventsMap[dateStr].status === "present" ? "Present" : "Absent");
        color = eventsMap[dateStr].status === "present" ? "#10b981" : "#f87171";
        tooltip = `${eventsMap[dateStr].status} - ${
          eventsMap[dateStr].note || ""
        }`;
      }

      events.push({ title, date: dateStr, color, extendedProps: { tooltip } });
    }

    return events;
  };


  const handleCloseModal = () => {
    if (window.confirm("Are you sure you want to close? Unsaved changes will be lost.")) {
      setSelectedDate(null);
      setNote("");
    }
  };

  useEffect(()=>{
    console.log("data", )
  },[]);


  return (
    <>
      <div className="profile-learner-print">
          <button className="btn btn-primary" onClick={() => window.history.back()}>Back to Student</button>
          <button className="btn btn-secondary" onClick={() => window.print()}>Print Profile</button>
      </div>
      <div className="attendance-calendar-container">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          selectable={true}
          events={generateEvents()}
          eventContent={(arg) => (
            <div title={arg.event.extendedProps.tooltip}>{arg.event.title}</div>
          )}
          dateClick={(info) => {
            setSelectedDate(info.dateStr);
            const existing = attendance.find((a) => a.date === info.dateStr);
            setStatus(existing?.status || "present");
            setNote(existing?.note || "");
          }}
        />

        {selectedDate && (
          <div className="attendance-modal-overlay">
            <div className="attendance-modal">
              <div className="attendance-modal-header">
                <h2>Mark Attendance - {selectedDate}</h2>
                {/* <button className="close-btn" onClick={handleCloseModal}>
                  &times;
                </button> */}
              </div>

              <div className="attendance-modal-body">
                <div className="mb-2">
                  <label>
                    <input
                      type="radio"
                      checked={status === "present"}
                      onChange={() => setStatus("present")}
                    />{" "}
                    Present
                  </label>
                  <label className="ml-4">
                    <input
                      type="radio"
                      checked={status === "absent"}
                      onChange={() => setStatus("absent")}
                    />{" "}
                    Absent
                  </label>
                </div>
                <textarea
                  placeholder="Add a note or session name"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full border rounded p-2"
                />
              </div>

              <div className="attendance-modal-footer">
                <button className="cancel-btn" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSaveAttendance}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
