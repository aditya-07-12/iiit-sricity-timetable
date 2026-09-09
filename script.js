let studentData = null;
let timetableData = null;
let currentStudent = null;
let selectedDay = null;

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayShort = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat" };
const subjectNames = {
    CP: "Computer Programming",
    DLD: "Digital Logic Design",
    OCW: "Overview of Computer Workshop",
    OCWE: "Overview of Computer Workshop Extra Class",
    DSMA: "Discrete Structures & Matrix Algebra",
    FHVE: "Fundamental of Human Values & Ethics",
    EE: "Electrical Engineering",
    EDL: "Electronics & Digital Logic"
};

// These are the regular UG1 timetable boundaries visible in the supplied timetable.
const campusStart = 8 * 60 + 45;
const campusEnd = 18 * 60 + 30;
const usefulFreeSlotMinutes = 30;
const savedRollKey = "ug1-roll-number";

async function loadData() {
    try {
        const [studentResponse, timetableResponse] = await Promise.all([
            fetch("student.json"),
            fetch("timetable.json")
        ]);
        if (!studentResponse.ok || !timetableResponse.ok) throw new Error("Data files not found");
        studentData = await studentResponse.json();
        timetableData = await timetableResponse.json();
        document.getElementById("searchButton").disabled = false;
    } catch (error) {
        console.error(error);
        document.getElementById("studentInfo").innerHTML = `<div class="student">❌ Could not load timetable data. Make sure <b>student.json</b> and <b>timetable.json</b> are in the same folder.</div>`;
    }
}

function findTimetable() {
    if (!studentData || !timetableData) return alert("Data is still loading. Please try again.");
    const roll = document.getElementById("rollNumber").value.trim().toUpperCase();
    if (!roll) return alert("Please enter your roll number.");

    const student = studentData.students?.[roll];
    if (!student) {
        currentStudent = null;
        document.getElementById("studentInfo").innerHTML = `<div class="student">❌ Student not found.<br><br>Please check your roll number.</div>`;
        document.getElementById("dashboard").innerHTML = "";
        document.getElementById("timetable").innerHTML = "";
        document.getElementById("freeSlots").innerHTML = "";
        return;
    }

    currentStudent = student;
    localStorage.setItem(savedRollKey, roll);
    document.getElementById("changeRollButton").hidden = false;
    document.getElementById("studentInfo").innerHTML = `
        <div class="student">
            <h2>${escapeHtml(student.name)}</h2>
            <p><b>Roll No:</b> ${escapeHtml(roll)}</p>
            <p><b>Branch:</b> ${escapeHtml(student.branch)}</p>
        </div>`;

    renderDayButtons();
    selectedDay = getToday();
    showDay(selectedDay);
    renderDashboard();
    renderFreeSlots();
}

function getToday() {
    const jsDay = new Date().getDay();
    return jsDay >= 1 && jsDay <= 6 ? days[jsDay - 1] : "Monday";
}

function renderDayButtons() {
    document.getElementById("timetable").innerHTML = `
        <div class="section-heading"><h2>📚 Your Classes</h2></div>
        <div class="day-buttons" id="dayButtons"></div>
        <div id="dayClasses"></div>`;

    document.getElementById("dayButtons").innerHTML = days.map(day => `
        <button class="day-button" id="day-${day}" onclick="showDay('${day}')">${dayShort[day]}</button>
    `).join("");
}

function getStudentClasses(student, day) {
    const result = [];
    for (const [course, section] of Object.entries(student.courses || {})) {
        const courseData = timetableData?.[course];
        const classes = courseData?.[section];
        if (!Array.isArray(classes)) continue;

        classes.forEach(item => {
            if (item.day !== day) return;
            const baseName = subjectNames[classItem.subject] || classItem.subject;
            const rawSubject = String(item.subject || "").toLowerCase();
            const displaySubject = rawSubject.includes("lab") ? `${baseName} Lab` : baseName;
            result.push({ ...item, course, section, displaySubject });
        });
    }
    return result.sort((a, b) => convertTime(a.time) - convertTime(b.time));
}

function showDay(day) {
    if (!currentStudent) return;
    selectedDay = day;
    document.querySelectorAll(".day-button").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`day-${day}`)?.classList.add("active");

    const classes = getStudentClasses(currentStudent, day);
    const today = getToday();
    let upcomingUsed = false;
    let html = `<h3 class="day-title">${day}${day === today ? " · Today" : ""}</h3>`;

    if (!classes.length) {
        html += `<div class="empty">🎉 No classes scheduled for ${day}.</div>`;
        document.getElementById("dayClasses").innerHTML = html;
        renderDashboard();
        return;
    }

    classes.forEach(item => {
        let status = "";
        let statusClass = "";
        let extra = "";
        if (day === today && item.time !== "—") {
            const t = getClassTimes(item.time);
            const now = minutesNow();
            if (t && Number.isFinite(t.start) && Number.isFinite(t.end)) {
                if (now >= t.start && now < t.end) {
                    status = "🔴 RUNNING NOW";
                    statusClass = "running";
                    extra = `<div class="countdown">Ends in ${formatDuration(t.end - now)}</div>`;
                } else if (now < t.start && !upcomingUsed) {
                    status = "🟢 UPCOMING";
                    statusClass = "upcoming";
                    extra = `<div class="countdown">Starts in ${formatDuration(t.start - now)}</div>`;
                    upcomingUsed = true;
                } else if (now >= t.end) {
                    status = "✓ Completed";
                    statusClass = "completed";
                }
            }
        }

        html += `
            <div class="class-card ${statusClass}">
                <div class="class-top">
                    <div class="time">${escapeHtml(item.time)}</div>
                    ${status ? `<span class="class-status ${statusClass}">${status}</span>` : ""}
                </div>
                <div class="subject">${escapeHtml(item.displaySubject)}</div>
                <div class="room">📍 Room ${escapeHtml(item.room)}</div>
                <small>${escapeHtml(item.course)} · ${escapeHtml(item.section)}</small>
                ${extra}
            </div>`;
    });

    document.getElementById("dayClasses").innerHTML = html;
    renderDashboard();
}

function renderDashboard() {
    if (!currentStudent) return;
    const today = getToday();
    const classes = getStudentClasses(currentStudent, today);
    const now = minutesNow();
    let running = null;
    let next = null;
    let completed = 0;

    for (const item of classes) {
        const t = getClassTimes(item.time);
        if (!t) continue;
        if (now >= t.start && now < t.end) running = { item, t };
        else if (now >= t.end) completed++;
        else if (!next) next = { item, t };
    }

    const focus = running || next;
    let mainCard;
    if (running) {
        mainCard = `<div class="next-card"><div class="next-label">🔴 RUNNING NOW</div><div class="next-subject">${escapeHtml(running.item.displaySubject)}</div><div class="next-meta">${escapeHtml(running.item.time)} · 📍 Room ${escapeHtml(running.item.room)}</div><div class="countdown">Ends in ${formatDuration(running.t.end - now)}</div></div>`;
    } else if (next) {
        mainCard = `<div class="next-card"><div class="next-label">🟢 NEXT CLASS</div><div class="next-subject">${escapeHtml(next.item.displaySubject)}</div><div class="next-meta">${escapeHtml(next.item.time)} · 📍 Room ${escapeHtml(next.item.room)}</div><div class="countdown">Starts in ${formatDuration(next.t.start - now)}</div></div>`;
    } else {
        mainCard = `<div class="next-card"><div class="next-label">✅ TODAY</div><div class="next-subject">No more classes</div><div class="next-meta">You're done for today. 🎉</div></div>`;
    }

    document.getElementById("dashboard").innerHTML = `
        <div class="dashboard">
            ${mainCard}
            <div class="stats">
                <div class="stat"><div class="stat-number">${classes.length}</div><div class="stat-label">Classes today</div></div>
                <div class="stat"><div class="stat-number">${completed}</div><div class="stat-label">Completed</div></div>
            </div>
        </div>`;
}

function getAllUG1Classes(day) {
    const result = [];
    for (const [course, sections] of Object.entries(timetableData || {})) {
        if (!sections || typeof sections !== "object") continue;
        for (const [section, classes] of Object.entries(sections)) {
            if (!Array.isArray(classes)) continue;
            classes.forEach(item => {
                if (item.day === day && item.time !== "—") {
                    const t = getClassTimes(item.time);
                    if (t && Number.isFinite(t.start) && Number.isFinite(t.end)) result.push({ course, section, ...item, ...t });
                }
            });
        }
    }
    return result;
}

function getFreeSlots(day) {
    const occupied = getAllUG1Classes(day).sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    occupied.forEach(c => {
        const last = merged[merged.length - 1];
        if (!last || c.start > last.end) merged.push({ start: c.start, end: c.end });
        else last.end = Math.max(last.end, c.end);
    });

    let gaps = [];
    let cursor = campusStart;
    merged.forEach(block => {
        if (block.start > cursor && block.start - cursor >= usefulFreeSlotMinutes) gaps.push({ start: cursor, end: block.start });
cursor = Math.max(cursor, block.end);
});

if (campusEnd - cursor >= usefulFreeSlotMinutes) gaps.push({ start: cursor, end: campusEnd });

// Remove lunch break (1:00 PM - 2:00 PM)
gaps = gaps.filter(slot => {
    return !(slot.start < 14 * 60 && slot.end > 13 * 60);
});

return gaps;
}

function renderFreeSlots() {
    const all = [];
    // Saturday is excluded because FHVE has no fixed schedule yet.
    days.slice(0, 5).forEach(day => getFreeSlots(day).forEach(slot => all.push({ day, ...slot })));
    document.getElementById("freeSlots").innerHTML = `
        <div class="section-heading">
            <h2>🔎 Free UG1 Time</h2>
            <button class="free-button" onclick="renderFreeSlots()">Refresh</button>
        </div>
        <div class="free-note">These are gaps in the supplied UG1 timetable where no listed UG1 section has a class. Slots shorter than ${usefulFreeSlotMinutes} minutes are hidden. Saturday is excluded because FHVE has no fixed schedule yet. FHVE entries with unknown timing are not treated as occupied.</div>
        ${all.length ? all.map(slot => `
            <div class="free-card">
                <div class="free-day">${slot.day}</div>
                <div class="free-time">${formatClock(slot.start)} – ${formatClock(slot.end)}</div>
                <div class="free-duration">🟢 ${formatDuration(slot.end - slot.start)} completely free in the supplied timetable</div>
            </div>`).join("") : `<div class="empty">No free slots of ${usefulFreeSlotMinutes}+ minutes found.</div>`}`;
}

function getClassTimes(time) {
    if (!time || time === "—") return null;
    const parts = time.split(" - ");
    if (parts.length !== 2) return null;
    const start = convertSingleTime(parts[0]);
    const end = convertSingleTime(parts[1]);
    return { start, end };
}

function convertSingleTime(value) {
    const m = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return NaN;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + min;
}

function convertTime(time) {
    const t = getClassTimes(time);
    return t ? t.start : Infinity;
}

function minutesNow() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

function formatDuration(totalMinutes) {
    totalMinutes = Math.max(0, Math.floor(totalMinutes));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

function formatClock(minutes) {
    let h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

function applyTheme() {
    const dark = localStorage.getItem("ug1-dark-mode") === "1";
    document.body.classList.toggle("dark", dark);
    document.getElementById("themeToggle").textContent = dark ? "☀️" : "🌙";
}

document.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    document.getElementById("searchButton").addEventListener("click", findTimetable);
    document.getElementById("rollNumber").addEventListener("keydown", e => { if (e.key === "Enter") findTimetable(); });
    document.getElementById("themeToggle").addEventListener("click", () => {
        const next = !document.body.classList.contains("dark");
        localStorage.setItem("ug1-dark-mode", next ? "1" : "0");
        applyTheme();
    });
    document.getElementById("searchButton").disabled = true;

    // Remember the last roll number on this browser/device.
    const savedRoll = localStorage.getItem(savedRollKey);
    if (savedRoll) {
        document.getElementById("rollNumber").value = savedRoll;
    }

    document.getElementById("changeRollButton").addEventListener("click", () => {
        localStorage.removeItem(savedRollKey);
        currentStudent = null;
        document.getElementById("rollNumber").value = "";
        document.getElementById("rollNumber").focus();
        document.getElementById("changeRollButton").hidden = true;
        document.getElementById("studentInfo").innerHTML = "";
        document.getElementById("dashboard").innerHTML = "";
        document.getElementById("timetable").innerHTML = "";
        document.getElementById("freeSlots").innerHTML = "";
    });

    loadData().then(() => {
        if (savedRoll) findTimetable();
    });
});

setInterval(() => {
    if (!currentStudent) return;
    if (selectedDay === getToday()) showDay(selectedDay);
    renderDashboard();
}, 30000);

window.findTimetable = findTimetable;
window.showDay = showDay;
window.renderFreeSlots = renderFreeSlots;
