// ICS calendar file generation for spa maintenance tasks

function pad(n) {
  return n.toString().padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function uid() {
  return `sparobot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeICS(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Generate a single ICS event
function makeEvent(title, startDate, durationMinutes, description, alarmMinutes = 15) {
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  return [
    'BEGIN:VEVENT',
    `UID:${uid()}`,
    `DTSTART:${formatDate(startDate)}`,
    `DTEND:${formatDate(endDate)}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `BEGIN:VALARM`,
    `TRIGGER:-PT${alarmMinutes}M`,
    `ACTION:DISPLAY`,
    `DESCRIPTION:${escapeICS(title)}`,
    `END:VALARM`,
    'END:VEVENT',
  ].join('\r\n');
}

// Generate an ICS file containing multiple events from corrections
// Each correction becomes a task spaced waitMinutes apart
export function generateICS(corrections, startTime = null) {
  const start = startTime || new Date(Date.now() + 30 * 60000); // default: 30 min from now
  let currentTime = new Date(start);

  const events = corrections.map((c, i) => {
    const title = `Spa: ${c.action}`;
    const description = [
      `Step ${i + 1}: ${c.parameter}`,
      `Chemical: ${c.chemical}`,
      `Amount: ${c.amount}`,
      `Notes: ${c.notes}`,
    ].join('\\n');

    const event = makeEvent(title, currentTime, c.waitMinutes, description);

    // Next task starts after this one's wait time
    currentTime = new Date(currentTime.getTime() + c.waitMinutes * 60000);

    return event;
  });

  // Add a final "Retest Water" event
  events.push(makeEvent(
    'Spa: Retest Water',
    currentTime,
    15,
    'All chemicals have been added. Retest your spa water to verify levels are in range.',
  ));

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SparoBot//Water Test//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return ics;
}

// Download the ICS file (triggers native calendar import on iOS)
export function downloadICS(corrections, startTime = null) {
  const ics = generateICS(corrections, startTime);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `spa-maintenance-${new Date().toISOString().slice(0, 10)}.ics`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
